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

  // 1. Mode Switch: Structure Optimization (Lossless)
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

    // Dead Object Removal / Garbage Collection
    // Strategy: Create a brand new document and copy pages. 
    // This leaves behind unreferenced objects (garbage) from the original file's stream.
    onProgress(40, 'Re-packing document structure...');
    const newDoc = await PDFDocument.create();

    // Copy Metadata
    if (settings.preserveMetadata) {
       newDoc.setTitle(pdfDoc.getTitle() || '');
       newDoc.setAuthor(pdfDoc.getAuthor() || '');
       newDoc.setSubject(pdfDoc.getSubject() || '');
       newDoc.setKeywords(pdfDoc.getKeywords() || []);
       newDoc.setProducer(pdfDoc.getProducer() || '');
       newDoc.setCreator(pdfDoc.getCreator() || '');
    } else {
       newDoc.setProducer('PDF Toolkit Pro');
       newDoc.setCreator('PDF Toolkit Pro');
    }

    if (settings.flattenForms) {
      onProgress(50, 'Flattening form fields...');
      try {
        const form = pdfDoc.getForm();
        if (form.getFields().length > 0) {
          form.flatten();
        }
      } catch (e) {
        console.warn('Form flattening skipped:', e);
      }
    }

    onProgress(60, 'Copying pages & removing waste...');
    const indices = pdfDoc.getPageIndices();
    
    // Copying pages in batches to avoid UI freeze on large docs
    const batchSize = 50;
    for (let i = 0; i < indices.length; i += batchSize) {
        const batch = indices.slice(i, i + batchSize);
        const copiedPages = await newDoc.copyPages(pdfDoc, batch);
        copiedPages.forEach(p => newDoc.addPage(p));
        
        // Update progress roughly based on page copy
        const copyProgress = 60 + Math.round((i / indices.length) * 20);
        onProgress(copyProgress, `Optimizing page ${i+1} of ${indices.length}...`);
        
        // Yield to event loop
        await new Promise(r => setTimeout(r, 0));
    }

    onProgress(85, 'Finalizing streams...');
    // Save with Object Streams enabled for maximum structural compression
    const compressedBytes = await newDoc.save({
      useObjectStreams: true,
      addDefaultPage: false,
      objectsPerTick: 50,
    });
    
    onProgress(100, 'Done');
    return new Blob([compressedBytes], { type: 'application/pdf' });
  }

  // 2. Mode Switch: Image Re-compression (Force Image & Hybrid)
  if (settings.mode === CompressionMode.IMAGE) {
    const fileUrl = URL.createObjectURL(file);
    let loadingTask: any = null;

    try {
      onProgress(5, 'Initializing Compression Engine...');
      
      // Load Source Document (for copying vector pages in Hybrid mode)
      const srcArrayBuffer = await file.arrayBuffer();
      let srcPdfDoc: any;
      try {
        srcPdfDoc = await PDFDocument.load(srcArrayBuffer, { ignoreEncryption: true });
      } catch(e) {
        throw new Error("Failed to load source PDF structure.");
      }

      // Load PDF.js (for rendering/analyzing)
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
          }
        } catch (e) {}
      } else {
        newPdfDoc.setProducer('PDF Toolkit Pro');
        newPdfDoc.setCreator('PDF Toolkit Pro');
      }
      
      const canvas = document.createElement('canvas');
      // Fix: typo in willReadFrequently property
      const ctx = canvas.getContext('2d', { willReadFrequently: true, alpha: false });

      if (!ctx) throw new Error('Failed to create canvas context - Device memory may be low');

      const MAX_CANVAS_DIM = 4000; // Increased to support higher resolution requests

      for (let i = 1; i <= totalPages; i++) {
        const progress = Math.round(((i - 1) / totalPages) * 100);
        
        let preservePage = false;
        let page: any = null;
        let vectorCopySuccess = false;

        try {
            page = await pdf.getPage(i);
            
            // PHASE 2: Smart Hybrid Detection
            if (settings.autoDetectText) {
                try {
                    // 1. Get Operator List (Safety Checked)
                    const opList = await page.getOperatorList();
                    const fnArray = (opList && opList.fn) ? opList.fn : [];
                    
                    // 2. Analyze Content Metrics
                    const textContent = await page.getTextContent();
                    const textLen = textContent.items.reduce((acc: number, item: any) => acc + (item.str || '').length, 0);
                    
                    let vectorOps = 0;
                    let imageOps = 0;
                    
                    // Define PDF.js Op Codes
                    const OPS = pdfjs.OPS;
                    
                    // Heuristic: Identify vector drawing commands
                    const drawingCmds = new Set([
                        OPS.moveTo, OPS.lineTo, OPS.curveTo, OPS.curveTo2, OPS.curveTo3,
                        OPS.rectangle, OPS.stroke, OPS.fill, OPS.eoFill
                    ]);
                    
                    // Heuristic: Identify image commands
                    const imageCmds = new Set([
                        OPS.paintImageXObject, OPS.paintInlineImageXObject, OPS.paintImageMaskXObject
                    ]);

                    for(let k=0; k < fnArray.length; k++) {
                        const fn = fnArray[k];
                        if (drawingCmds.has(fn)) vectorOps++;
                        if (imageCmds.has(fn)) imageOps++;
                    }

                    // 3. Scoring Algorithm
                    // Positive Score (> 0) = Preserve (Structure)
                    // Negative/Zero Score (<= 0) = Compress (Image)
                    let score = 0;

                    // A. Text Presence
                    if (textLen > 300) score += 50;       // Significant text content
                    else if (textLen > 50) score += 20;   // Moderate text
                    
                    // B. Vector Complexity (Blueprints, Charts, Tables)
                    // If a page has many lines/curves, rasterizing it makes it look fuzzy.
                    if (vectorOps > 50) score += 100;     // Complex vector art
                    else if (vectorOps > 10) score += 20; // Simple lines/tables
                    
                    // C. Image Presence
                    if (imageOps === 0) {
                        score += 200; // Pure vector/text page. Always preserve to save space/quality.
                    } else {
                        // Images exist. Check context.
                        
                        // Scenario: Scanned Document with OCR (Hidden Text)
                        // Traits: Lots of text, Image present, Very low vector complexity (no lines/boxes drawn)
                        // Action: We WANT to rasterize this to compress the background scan.
                        if (textLen > 100 && vectorOps < 5) {
                            score -= 60; // Penalize to force compression
                        }
                        
                        // Scenario: Photo / Scan without text
                        if (textLen < 50 && vectorOps < 10) {
                            score -= 100;
                        }
                    }
                    
                    // Decision
                    preservePage = score > 0;
                    
                    // console.log(`Page ${i} Score: ${score} (Text: ${textLen}, Vectors: ${vectorOps}, Images: ${imageOps}) -> ${preservePage ? 'Preserve' : 'Rasterize'}`);

                } catch (detectionError) {
                    console.warn(`Smart detection failed for page ${i}, defaulting to preserve.`, detectionError);
                    preservePage = true; // Fallback to safe mode (preserve structure)
                }
            }

            if (preservePage) {
                // STRATEGY A: Preserve Vector Page (Smart Mode)
                try {
                    // Safety check for bounds
                    if (i - 1 >= srcPdfDoc.getPageCount()) {
                         throw new Error("Page index out of bounds in source doc");
                    }
                    onProgress(progress, `Page ${i}: High detail detected - Preserving structure...`);
                    const [copiedPage] = await newPdfDoc.copyPages(srcPdfDoc, [i - 1]);
                    newPdfDoc.addPage(copiedPage);
                    vectorCopySuccess = true;
                } catch (copyError) {
                    console.warn(`Smart Mode: Failed to copy page ${i} structurally. Falling back to rasterization.`, copyError);
                    vectorCopySuccess = false;
                    // Proceed to Strategy B block below...
                }
            } 
            
            if (!preservePage || !vectorCopySuccess) {
                // STRATEGY B: Rasterize & Compress (Scans/Images/Force Image Mode OR Fallback)
                onProgress(progress, `Page ${i}: Compressing content...`);
                
                const unscaledViewport = page.getViewport({ scale: 1.0 });
                const maxDim = Math.max(unscaledViewport.width, unscaledViewport.height);
                
                // Adaptive Resolution Scaling
                const targetMaxDim = settings.maxResolution || 2000;
                let scale = targetMaxDim / maxDim;
                
                // Safety clamp
                scale = Math.min(scale, 4.0); // Don't supersample too much
                scale = Math.max(scale, 0.5); // Don't downsample to pixelation
                
                let scaledViewport = page.getViewport({ scale });

                // Double check hardware limits
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

                // Fill white background (handles transparent PDFs)
                ctx.fillStyle = '#ffffff';
                ctx.fillRect(0, 0, canvas.width, canvas.height);

                await page.render({
                    canvasContext: ctx,
                    viewport: scaledViewport,
                }).promise;

                // Grayscale Conversion (Pixel Manipulation)
                if (settings.grayscale) {
                    const imgData = ctx.getImageData(0, 0, canvas.width, canvas.height);
                    const data = imgData.data;
                    for (let j = 0; j < data.length; j += 4) {
                        // Standard luminance formula
                        const avg = (data[j] * 0.299 + data[j + 1] * 0.587 + data[j + 2] * 0.114);
                        data[j] = avg; 
                        data[j + 1] = avg; 
                        data[j + 2] = avg; 
                        // Alpha data[j+3] remains
                    }
                    ctx.putImageData(imgData, 0, 0);
                }

                // Encode to JPEG
                const blob = await new Promise<Blob | null>((resolve) => {
                    canvas.toBlob((b) => resolve(b), 'image/jpeg', settings.quality);
                });

                if (!blob) throw new Error(`Failed to encode page ${i}`);

                const arrayBufferImg = await blob.arrayBuffer();
                const embeddedImage = await newPdfDoc.embedJpg(arrayBufferImg);

                // Add page matching the compressed image dimensions
                const newPage = newPdfDoc.addPage([scaledViewport.width, scaledViewport.height]);
                newPage.drawImage(embeddedImage, {
                    x: 0,
                    y: 0,
                    width: scaledViewport.width,
                    height: scaledViewport.height,
                });
                
                // Cleanup canvas
                ctx.clearRect(0,0, canvas.width, canvas.height);
                canvas.width = 1; canvas.height = 1;
            }

        } catch (pageError: any) {
             console.error(`Error processing page ${i}`, pageError);
             throw new Error(`Failed to process page ${i}: ${pageError.message || 'Unknown error'}`);
        } finally {
             if (page && page.cleanup) page.cleanup();
        }

        // Pause for GC/UI
        if (i % 3 === 0) await new Promise(r => setTimeout(r, 10));
      }

      onProgress(95, 'Finalizing PDF...');
      const pdfBytes = await newPdfDoc.save();
      
      onProgress(100, 'Done');
      return new Blob([pdfBytes], { type: 'application/pdf' });

    } finally {
      URL.revokeObjectURL(fileUrl);
      if (loadingTask && loadingTask.destroy) {
        loadingTask.destroy().catch(() => {});
      }
    }
  }

  throw new Error('Invalid compression mode');
};