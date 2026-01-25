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
    throw new Error("PDF libraries are not loaded. Please wait a moment or check your connection.");
  }

  const { PDFDocument } = window.PDFLib;
  const pdfjs = window.pdfjsLib;

  // 1. Mode Switch: Structure Optimization
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
    
    if (!settings.preserveMetadata) {
       pdfDoc.setTitle('');
       pdfDoc.setAuthor('');
       pdfDoc.setSubject('');
       pdfDoc.setKeywords([]);
       pdfDoc.setProducer('PDF Toolkit Pro');
       pdfDoc.setCreator('PDF Toolkit Pro');
    }

    if (settings.flattenForms) {
      onProgress(40, 'Flattening form fields...');
      try {
        const form = pdfDoc.getForm();
        if (form.getFields().length > 0) {
          form.flatten();
        }
      } catch (e) {
        console.warn('Form flattening skipped:', e);
      }
    }

    onProgress(60, 'Optimizing object streams...');
    const compressedBytes = await pdfDoc.save({
      useObjectStreams: true,
      addDefaultPage: false,
      objectsPerTick: 50,
    });
    
    onProgress(100, 'Done');
    return new Blob([compressedBytes], { type: 'application/pdf' });
  }

  // 2. Mode Switch: Image Re-compression (The Heavy Lifter)
  if (settings.mode === CompressionMode.IMAGE) {
    const fileUrl = URL.createObjectURL(file);
    let loadingTask: any = null;

    try {
      onProgress(5, 'Initializing PDF engine...');
      loadingTask = pdfjs.getDocument(fileUrl);
      const pdf = await loadingTask.promise;
      const totalPages = pdf.numPages;

      const newPdfDoc = await PDFDocument.create();

      if (settings.preserveMetadata) {
        onProgress(8, 'Copying metadata...');
        try {
          const { info } = await pdf.getMetadata().catch(() => ({ info: null }));
          if (info) {
            if (info.Title) newPdfDoc.setTitle(info.Title);
            if (info.Author) newPdfDoc.setAuthor(info.Author);
            // Copy other fields if needed
          }
        } catch (e) {}
      } else {
        newPdfDoc.setProducer('PDF Toolkit Pro');
        newPdfDoc.setCreator('PDF Toolkit Pro');
      }
      
      const canvas = document.createElement('canvas');
      const ctx = canvas.getContext('2d', { willReadFrequently: true, alpha: false });

      if (!ctx) throw new Error('Failed to create canvas context');

      // CRASH PREVENTION: Max canvas dimension
      // iOS Mobile Safari limit is often 4096px or 16MP total. 
      const MAX_CANVAS_DIM = 4000; 

      for (let i = 1; i <= totalPages; i++) {
        const progress = Math.round(((i - 1) / totalPages) * 100);
        onProgress(progress, `Compressing page ${i} of ${totalPages}...`);

        let page: any = null;
        try {
            page = await pdf.getPage(i);
            const unscaledViewport = page.getViewport({ scale: 1.0 });
            const maxDim = Math.max(unscaledViewport.width, unscaledViewport.height);
            
            // Calculate scale
            let scale = settings.maxResolution / maxDim;
            scale = Math.min(scale, 4.0);
            scale = Math.max(scale, 0.2); // Allow smaller scale for huge maps
            
            let scaledViewport = page.getViewport({ scale });

            // SAFETY CHECK: If dimensions exceed browser limits, clamp them down
            if (scaledViewport.width > MAX_CANVAS_DIM || scaledViewport.height > MAX_CANVAS_DIM) {
                const clampScale = Math.min(
                    MAX_CANVAS_DIM / scaledViewport.width,
                    MAX_CANVAS_DIM / scaledViewport.height
                );
                scale = scale * clampScale;
                scaledViewport = page.getViewport({ scale });
            }

            canvas.width = Math.floor(scaledViewport.width);
            canvas.height = Math.floor(scaledViewport.height);

            ctx.fillStyle = '#ffffff';
            ctx.fillRect(0, 0, canvas.width, canvas.height);

            await page.render({
                canvasContext: ctx,
                viewport: scaledViewport,
            }).promise;

            if (settings.grayscale) {
                const imgData = ctx.getImageData(0, 0, canvas.width, canvas.height);
                const data = imgData.data;
                for (let j = 0; j < data.length; j += 4) {
                    const avg = (data[j] * 0.299 + data[j + 1] * 0.587 + data[j + 2] * 0.114);
                    data[j] = avg; 
                    data[j + 1] = avg; 
                    data[j + 2] = avg; 
                }
                ctx.putImageData(imgData, 0, 0);
            }

            const blob = await new Promise<Blob | null>((resolve) => {
                canvas.toBlob((b) => resolve(b), 'image/jpeg', settings.quality);
            });

            if (!blob) throw new Error(`Failed to encode page ${i}`);

            const arrayBufferImg = await blob.arrayBuffer();
            const embeddedImage = await newPdfDoc.embedJpg(arrayBufferImg);

            const newPage = newPdfDoc.addPage([scaledViewport.width, scaledViewport.height]);
            newPage.drawImage(embeddedImage, {
                x: 0,
                y: 0,
                width: scaledViewport.width,
                height: scaledViewport.height,
            });

        } catch (pageError) {
             console.error(`Error processing page ${i}`, pageError);
             throw new Error(`Failed to compress page ${i}. Try lowering the resolution or quality.`);
        } finally {
             if (page && page.cleanup) page.cleanup();
             
             // Aggressive memory cleanup
             ctx.clearRect(0,0, canvas.width, canvas.height);
             canvas.width = 1; 
             canvas.height = 1;
        }

        if (i % 3 === 0) await new Promise(r => setTimeout(r, 10));
      }

      onProgress(95, 'Finalizing PDF...');
      const pdfBytes = await newPdfDoc.save();
      
      onProgress(100, 'Done');
      return new Blob([pdfBytes], { type: 'application/pdf' });

    } finally {
      URL.revokeObjectURL(fileUrl);
      if (loadingTask && loadingTask.destroy) {
        loadingTask.destroy();
      }
    }
  }

  throw new Error('Invalid compression mode');
};