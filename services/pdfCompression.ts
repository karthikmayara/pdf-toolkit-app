import { CompressionMode, CompressionSettings } from '../types';
import { extractTextPositions } from './ocrService';

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

  const { PDFDocument, StandardFonts, rgb } = window.PDFLib;
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
    
    // Copying pages in batches
    const batchSize = 50;
    for (let i = 0; i < indices.length; i += batchSize) {
        const batch = indices.slice(i, i + batchSize);
        const copiedPages = await newDoc.copyPages(pdfDoc, batch);
        copiedPages.forEach(p => newDoc.addPage(p));
        
        const copyProgress = 60 + Math.round((i / indices.length) * 20);
        onProgress(copyProgress, `Optimizing page ${i+1} of ${indices.length}...`);
        
        await new Promise(r => setTimeout(r, 0));
    }

    onProgress(85, 'Finalizing streams...');
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
      
      const srcArrayBuffer = await file.arrayBuffer();
      let srcPdfDoc: any;
      try {
        srcPdfDoc = await PDFDocument.load(srcArrayBuffer, { ignoreEncryption: true });
      } catch(e) {
        throw new Error("Failed to load source PDF structure.");
      }

      loadingTask = pdfjs.getDocument(fileUrl);
      const pdf = await loadingTask.promise;
      const totalPages = pdf.numPages;

      const newPdfDoc = await PDFDocument.create();
      
      // Pre-embed invisible font for OCR
      let ocrFont: any;
      if (settings.enableOCR) {
          ocrFont = await newPdfDoc.embedFont(StandardFonts.Helvetica);
      }

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
      const ctx = canvas.getContext('2d', { willReadFrequently: true, alpha: false });

      if (!ctx) throw new Error('Failed to create canvas context - Device memory may be low');

      const MAX_CANVAS_DIM = 4000; 

      for (let i = 1; i <= totalPages; i++) {
        const progress = Math.round(((i - 1) / totalPages) * 100);
        
        let preservePage = false;
        let page: any = null;
        let vectorCopySuccess = false;

        try {
            page = await pdf.getPage(i);
            
            // Text Density Analysis (Used for both Smart Hybrid & Adaptive Resolution)
            const textContent = await page.getTextContent();
            const textLen = textContent.items.reduce((acc: number, item: any) => acc + (item.str || '').length, 0);

            // PHASE 2: Smart Hybrid Detection
            if (settings.autoDetectText) {
                try {
                    const opList = await page.getOperatorList();
                    const fnArray = (opList && opList.fn) ? opList.fn : [];
                    
                    let vectorOps = 0;
                    let imageOps = 0;
                    
                    const OPS = pdfjs.OPS;
                    const drawingCmds = new Set([
                        OPS.moveTo, OPS.lineTo, OPS.curveTo, OPS.curveTo2, OPS.curveTo3,
                        OPS.rectangle, OPS.stroke, OPS.fill, OPS.eoFill
                    ]);
                    const imageCmds = new Set([
                        OPS.paintImageXObject, OPS.paintInlineImageXObject, OPS.paintImageMaskXObject
                    ]);

                    for(let k=0; k < fnArray.length; k++) {
                        const fn = fnArray[k];
                        if (drawingCmds.has(fn)) vectorOps++;
                        if (imageCmds.has(fn)) imageOps++;
                    }

                    // Scoring Algorithm
                    let score = 0;
                    if (textLen > 300) score += 50;      
                    else if (textLen > 50) score += 20;  
                    if (vectorOps > 50) score += 100;    
                    else if (vectorOps > 10) score += 20;

                    if (imageOps === 0) {
                        score += 200; 
                    } else {
                        if (textLen > 100 && vectorOps < 5) score -= 60; 
                        if (textLen < 50 && vectorOps < 10) score -= 100;
                    }
                    preservePage = score > 0;

                } catch (detectionError) {
                    console.warn(`Smart detection failed for page ${i}, defaulting to preserve.`, detectionError);
                    preservePage = true; 
                }
            }

            if (preservePage) {
                try {
                    if (i - 1 >= srcPdfDoc.getPageCount()) throw new Error("Page index out of bounds");
                    onProgress(progress, `Page ${i}: High detail detected - Preserving structure...`);
                    const [copiedPage] = await newPdfDoc.copyPages(srcPdfDoc, [i - 1]);
                    newPdfDoc.addPage(copiedPage);
                    vectorCopySuccess = true;
                } catch (copyError) {
                    console.warn(`Smart Mode: Failed to copy page ${i} structurally. Falling back to rasterization.`, copyError);
                    vectorCopySuccess = false;
                }
            } 
            
            if (!preservePage || !vectorCopySuccess) {
                onProgress(progress, `Page ${i}: Compressing content...`);
                
                const unscaledViewport = page.getViewport({ scale: 1.0 });
                const maxDim = Math.max(unscaledViewport.width, unscaledViewport.height);
                
                // FEATURE 2: Adaptive Resolution (Smart Scaling)
                // If the user hasn't explicitly set a resolution (e.g. they left default), 
                // or if we are in auto mode, we can tweak it based on content density.
                let targetMaxDim = settings.maxResolution || 2000;
                
                // If page has a lot of small text (high density), boost resolution for readability
                if (textLen > 1000) {
                    targetMaxDim = Math.max(targetMaxDim, 2500); 
                } 
                // If page is mostly empty or simple image with no text, we can go lower
                else if (textLen < 50) {
                    targetMaxDim = Math.min(targetMaxDim, 1500);
                }

                let scale = targetMaxDim / maxDim;
                scale = Math.min(scale, 4.0); 
                scale = Math.max(scale, 0.5);
                
                let scaledViewport = page.getViewport({ scale });

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

                // Pixel Manipulation Loop (Combines Grayscale + Background Cleaning)
                if (settings.grayscale || settings.cleanBackground) {
                    const imgData = ctx.getImageData(0, 0, canvas.width, canvas.height);
                    const data = imgData.data;
                    for (let j = 0; j < data.length; j += 4) {
                        let r = data[j];
                        let g = data[j + 1];
                        let b = data[j + 2];

                        // FEATURE 1: Background Cleaning (White Point)
                        // Force light gray pixels to pure white for better compression
                        if (settings.cleanBackground) {
                            if (r > 230 && g > 230 && b > 230) {
                                r = 255; g = 255; b = 255;
                            }
                        }

                        if (settings.grayscale) {
                            const avg = (r * 0.299 + g * 0.587 + b * 0.114);
                            data[j] = avg; 
                            data[j + 1] = avg; 
                            data[j + 2] = avg; 
                        } else {
                            data[j] = r; data[j+1] = g; data[j+2] = b;
                        }
                    }
                    ctx.putImageData(imgData, 0, 0);
                }

                const blob = await new Promise<Blob | null>((resolve) => {
                    canvas.toBlob((b) => resolve(b), 'image/jpeg', settings.quality);
                });

                if (!blob) throw new Error(`Failed to encode page ${i}`);

                // FEATURE 3: OCR Re-injection (Invisible Text Layer)
                let textPositions: any[] = [];
                if (settings.enableOCR && window.Tesseract) {
                    onProgress(progress, `Page ${i}: Indexing text (OCR)...`);
                    // We extract text positions from the generated image so coordinates align
                    textPositions = await extractTextPositions(blob);
                }

                const arrayBufferImg = await blob.arrayBuffer();
                const embeddedImage = await newPdfDoc.embedJpg(arrayBufferImg);

                // Create page matching compressed dimensions
                const newPage = newPdfDoc.addPage([scaledViewport.width, scaledViewport.height]);
                
                // Draw Image Background
                newPage.drawImage(embeddedImage, {
                    x: 0,
                    y: 0,
                    width: scaledViewport.width,
                    height: scaledViewport.height,
                });
                
                // Draw Invisible Text Overlay
                if (textPositions.length > 0 && ocrFont) {
                    const pageHeight = scaledViewport.height;
                    
                    textPositions.forEach((word) => {
                        const { text, bbox } = word;
                        // Tesseract bbox: x0, y0, x1, y1 (Pixels from Top-Left)
                        // PDF-Lib: x, y (Points from Bottom-Left)
                        
                        const w = bbox.x1 - bbox.x0;
                        const h = bbox.y1 - bbox.y0;
                        
                        // Font Size calculation: height of the bounding box
                        const fontSize = h;
                        
                        // Y Calculation: PDF Y is inverted.
                        // Top of word in Image = bbox.y0
                        // Bottom of word in Image = bbox.y1
                        // We want text baseline. 
                        const pdfY = pageHeight - bbox.y1;

                        newPage.drawText(text, {
                            x: bbox.x0,
                            y: pdfY,
                            size: fontSize,
                            font: ocrFont,
                            color: rgb(0, 0, 0),
                            opacity: 0, // INVISIBLE INK
                        });
                    });
                }
                
                ctx.clearRect(0,0, canvas.width, canvas.height);
                canvas.width = 1; canvas.height = 1;
            }

        } catch (pageError: any) {
             console.error(`Error processing page ${i}`, pageError);
             throw new Error(`Failed to process page ${i}: ${pageError.message || 'Unknown error'}`);
        } finally {
             if (page && page.cleanup) page.cleanup();
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
        loadingTask.destroy().catch(() => {});
      }
    }
  }

  throw new Error('Invalid compression mode');
};