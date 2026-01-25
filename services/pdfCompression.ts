import { CompressionMode, CompressionSettings } from '../types';

/**
 * Main Compression Function
 */
export const compressPDF = async (
  file: File,
  settings: CompressionSettings,
  onProgress: (progress: number, step: string) => void
): Promise<Blob> => {
  
  // Library Safety Check
  if (!window.PDFLib || !window.pdfjsLib) {
    throw new Error("PDF libraries are not loaded. Please check your internet connection or wait for the app to initialize.");
  }

  const { PDFDocument } = window.PDFLib;
  const pdfjs = window.pdfjsLib;

  // 1. Mode Switch: Structure Optimization
  // This mode requires the full array buffer to parse the document structure
  if (settings.mode === CompressionMode.STRUCTURE) {
    onProgress(10, 'Loading file into memory...');
    let arrayBuffer;
    try {
        arrayBuffer = await file.arrayBuffer();
    } catch (e) {
        throw new Error("Failed to read file. It might be too large for browser memory.");
    }
    
    onProgress(30, 'Analyzing structure...');
    let pdfDoc;
    try {
        pdfDoc = await PDFDocument.load(arrayBuffer, { ignoreEncryption: true });
    } catch (e: any) {
        if (e.message && e.message.includes('Password')) {
             throw new Error("This PDF is password protected. Please remove the password first.");
        }
        throw new Error("Failed to parse PDF. The file might be corrupted.");
    }
    
    // Logic: If preserveMetadata is FALSE, we must explicitly clear it.
    // If TRUE, we leave it alone (it is preserved by default in load/save).
    if (!settings.preserveMetadata) {
       pdfDoc.setTitle('');
       pdfDoc.setAuthor('');
       pdfDoc.setSubject('');
       pdfDoc.setKeywords([]);
       pdfDoc.setProducer('PDF Toolkit Pro');
       pdfDoc.setCreator('PDF Toolkit Pro');
    }

    // Optional: Flatten Forms
    if (settings.flattenForms) {
      onProgress(40, 'Flattening form fields...');
      try {
        const form = pdfDoc.getForm();
        // Only attempt flatten if fields exist to avoid errors on non-form PDFs
        if (form.getFields().length > 0) {
          form.flatten();
        }
      } catch (e) {
        // Continue silently if no form infrastructure exists
        console.warn('Form flattening skipped:', e);
      }
    }

    onProgress(60, 'Optimizing object streams...');
    // Save with aggressive object stream compression
    const compressedBytes = await pdfDoc.save({
      useObjectStreams: true,
      addDefaultPage: false,
      objectsPerTick: 50, // Keep UI responsive
    });
    
    onProgress(100, 'Done');
    return new Blob([compressedBytes], { type: 'application/pdf' });
  }

  // 2. Mode Switch: Image Re-compression (The Heavy Lifter)
  if (settings.mode === CompressionMode.IMAGE) {
    // Create a temporary URL for the file
    const fileUrl = URL.createObjectURL(file);
    let loadingTask: any = null;

    try {
      onProgress(5, 'Initializing PDF engine...');
      loadingTask = pdfjs.getDocument(fileUrl);
      const pdf = await loadingTask.promise;
      const totalPages = pdf.numPages;

      // Create new PDF
      const newPdfDoc = await PDFDocument.create();

      // METADATA PRESERVATION
      if (settings.preserveMetadata) {
        onProgress(8, 'Copying metadata...');
        try {
          const { info } = await pdf.getMetadata().catch(() => ({ info: null }));
          if (info) {
            if (info.Title) newPdfDoc.setTitle(info.Title);
            if (info.Author) newPdfDoc.setAuthor(info.Author);
            if (info.Subject) newPdfDoc.setSubject(info.Subject);
            if (info.Creator) newPdfDoc.setCreator(info.Creator);
            if (info.Producer) newPdfDoc.setProducer(info.Producer);
            if (info.Keywords && typeof info.Keywords === 'string') {
                newPdfDoc.setKeywords(info.Keywords.split(/[;,]/).map((k: string) => k.trim()));
            }
          }
        } catch (e) {
          console.warn('Metadata extraction failed, continuing...', e);
        }
      } else {
        newPdfDoc.setProducer('PDF Toolkit Pro');
        newPdfDoc.setCreator('PDF Toolkit Pro');
      }
      
      // Memory optimization: Reuse a single canvas
      const canvas = document.createElement('canvas');
      // alpha: false significantly speeds up rendering and reduces memory for non-transparent content
      const ctx = canvas.getContext('2d', { willReadFrequently: true, alpha: false });

      if (!ctx) throw new Error('Failed to create canvas context');

      for (let i = 1; i <= totalPages; i++) {
        const progress = Math.round(((i - 1) / totalPages) * 100);
        onProgress(progress, `Compressing page ${i} of ${totalPages}...`);

        let page: any = null;
        try {
            page = await pdf.getPage(i);
            
            // --- IMPROVED SCALING LOGIC FOR TEXT CLARITY ---
            // 1. Get the base dimensions (usually 72 DPI points)
            const unscaledViewport = page.getViewport({ scale: 1.0 });
            
            // 2. Determine the largest dimension of the page
            const maxDim = Math.max(unscaledViewport.width, unscaledViewport.height);
            
            // 3. Calculate scale to MATCH the target resolution.
            // This ensures small PDFs are upscaled to be readable, and huge PDFs are downscaled.
            // We limit scale to avoid browser crashes on extreme resolutions (e.g. max scale 5.0)
            let scale = settings.maxResolution / maxDim;
            scale = Math.min(scale, 4.0); // Cap at 4x to prevent canvas OOM
            scale = Math.max(scale, 0.5); // Minimum scale
            
            const scaledViewport = page.getViewport({ scale });

            // Resize canvas
            canvas.width = scaledViewport.width;
            canvas.height = scaledViewport.height;

            // Fill white background first (PDFs with transparency turn black otherwise)
            ctx.fillStyle = '#ffffff';
            ctx.fillRect(0, 0, canvas.width, canvas.height);

            // Render PDF page to canvas
            await page.render({
            canvasContext: ctx,
            viewport: scaledViewport,
            }).promise;

            // Optional: Grayscale filter (Using luminance formula for better readability)
            if (settings.grayscale) {
            const imgData = ctx.getImageData(0, 0, canvas.width, canvas.height);
            const data = imgData.data;
            for (let j = 0; j < data.length; j += 4) {
                // Standard luminance: 0.299R + 0.587G + 0.114B
                const avg = (data[j] * 0.299 + data[j + 1] * 0.587 + data[j + 2] * 0.114);
                data[j] = avg;     // R
                data[j + 1] = avg; // G
                data[j + 2] = avg; // B
            }
            ctx.putImageData(imgData, 0, 0);
            }

            // Convert Canvas to JPEG Blob
            const blob = await new Promise<Blob | null>((resolve) => {
            canvas.toBlob(
                (b) => resolve(b),
                'image/jpeg',
                settings.quality // 0.1 - 1.0
            );
            });

            if (!blob) throw new Error(`Failed to compress page ${i}`);

            // Embed JPEG into new PDF
            const arrayBufferImg = await blob.arrayBuffer();
            const embeddedImage = await newPdfDoc.embedJpg(arrayBufferImg);

            // Add page to new PDF with original aspect ratio
            // Note: We use the scaled viewport dimensions for the page size to ensure 100% zoom looks correct
            const newPage = newPdfDoc.addPage([scaledViewport.width, scaledViewport.height]);
            newPage.drawImage(embeddedImage, {
            x: 0,
            y: 0,
            width: scaledViewport.width,
            height: scaledViewport.height,
            });

        } catch (pageError) {
             console.error(`Error processing page ${i}`, pageError);
             throw new Error(`Failed to process page ${i}. The file might be corrupted or too complex.`);
        } finally {
             // CRITICAL: Cleanup memory
             if (page && page.cleanup) page.cleanup();
             
             // Clear canvas to help browser release texture memory
             ctx.clearRect(0,0, canvas.width, canvas.height);
             // Shrink canvas to free GPU memory
             canvas.width = 1; 
             canvas.height = 1;
        }

        // Pause to let UI breathe and GC run
        if (i % 5 === 0) await new Promise(r => setTimeout(r, 10));
      }

      onProgress(95, 'Finalizing PDF...');
      const pdfBytes = await newPdfDoc.save();
      
      onProgress(100, 'Done');
      return new Blob([pdfBytes], { type: 'application/pdf' });

    } finally {
      // Clean up the URL object to prevent memory leaks
      URL.revokeObjectURL(fileUrl);
      if (loadingTask && loadingTask.destroy) {
        loadingTask.destroy();
      }
    }
  }

  throw new Error('Invalid compression mode');
};