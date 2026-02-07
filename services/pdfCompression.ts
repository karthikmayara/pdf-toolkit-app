import { CompressionMode, CompressionSettings } from '../types';
import { extractTextPositions } from './ocrService';

/**
 * Helper: Deduplicate Assets (The "Logo Fix")
 * Scans the document for identical XObjects (images) and makes them point to a single reference.
 */
const deduplicateAssets = async (pdfDoc: any, onProgress: (p: number, s: string) => void) => {
    const { PDFName, PDFDict, PDFStream, PDFRawStream } = window.PDFLib;
    
    // Map of "Signature" -> First PDFRef found
    const uniqueAssets = new Map<string, any>(); 
    let duplicatesFound = 0;

    const pages = pdfDoc.getPages();
    const totalSteps = pages.length;

    for (let i = 0; i < pages.length; i++) {
        const page = pages[i];
        
        // 1. Get Resources Dictionary
        // We use 'node' to access the low-level PDF object
        const resources = page.node.Resources();
        if (!resources || !(resources instanceof PDFDict)) continue;

        // 2. Get XObject Dictionary (Images, Forms)
        const xObjects = resources.get(PDFName.of('XObject'));
        if (!xObjects || !(xObjects instanceof PDFDict)) continue;

        const keys = xObjects.keys(); // Array of PDFName

        for (const key of keys) {
            const ref = xObjects.get(key); // This gives us the Reference (e.g., "10 0 R")
            
            // We need to lookup the actual object to check its properties
            const obj = pdfDoc.context.lookup(ref);
            
            // We only care about Streams (Images/Forms)
            if (obj instanceof PDFStream || obj instanceof PDFRawStream) {
                
                // 3. Generate a Signature
                // Reading the full byte array of every image is too slow for the browser.
                // We use a Heuristic Signature: Length + Subtype + Filter.
                // This is extremely effective for machine-generated PDFs (Word, PowerPoint) where
                // the same image is inserted multiple times with identical encoding parameters.
                
                let length = 0;
                // Try to get length from dict
                const lenEntry = obj.dict.get(PDFName.of('Length'));
                if (lenEntry) {
                    const lenVal = pdfDoc.context.lookup(lenEntry);
                    if (typeof lenVal?.value === 'number') length = lenVal.value;
                }

                // If we can't determine length, we skip to be safe.
                if (length > 0) {
                    const subtype = obj.dict.get(PDFName.of('Subtype'))?.toString() || 'Unknown';
                    const filter = obj.dict.get(PDFName.of('Filter'))?.toString() || 'None';
                    
                    // Signature: "Image_45021_DCTDecode"
                    const signature = `${subtype}_${length}_${filter}`;

                    if (uniqueAssets.has(signature)) {
                        // 4. Duplicate Found!
                        const existingRef = uniqueAssets.get(signature);
                        
                        // Check if we are already pointing to the master ref
                        if (ref !== existingRef) {
                            // Remap: Tell this page to use the existing reference instead of the duplicate
                            xObjects.set(key, existingRef);
                            duplicatesFound++;
                        }
                    } else {
                        // First time seeing this asset, mark it as the master
                        uniqueAssets.set(signature, ref);
                    }
                }
            }
        }
        
        if (i % 20 === 0) {
             onProgress(60 + Math.round((i / totalSteps) * 20), `Deduplicating assets (Found ${duplicatesFound})...`);
             await new Promise(r => setTimeout(r, 0));
        }
    }
    
    if (duplicatesFound > 0) {
        console.log(`[Lossless] Removed ${duplicatesFound} duplicate assets.`);
    }
};

type TimedResult<T> = {
  timedOut: boolean;
  value?: T;
};

const withTimeout = async <T>(promise: Promise<T>, timeoutMs: number): Promise<TimedResult<T>> => {
  let timeoutId: number | undefined;
  const timeoutPromise = new Promise<TimedResult<T>>((resolve) => {
    timeoutId = window.setTimeout(() => resolve({ timedOut: true }), timeoutMs);
  });

  const result = await Promise.race([
    promise.then((value) => ({ timedOut: false, value })),
    timeoutPromise
  ]);

  if (timeoutId) window.clearTimeout(timeoutId);
  return result;
};

const analyzePageContent = async (
  page: any,
  pdfjs: any,
  opts: { timeoutMs: number; runOpList: boolean }
) => {
  const { timeoutMs, runOpList } = opts;
  let textLen = 0;
  let textItems = 0;
  let vectorOps = 0;
  let imageOps = 0;
  let analysisTimedOut = false;

  const textResult = await withTimeout(page.getTextContent(), timeoutMs);
  if (textResult.timedOut) {
    analysisTimedOut = true;
  } else if (textResult.value) {
    textItems = textResult.value.items.length;
    textLen = textResult.value.items.reduce((acc: number, item: any) => acc + (item.str || '').length, 0);
  }

  if (runOpList) {
    const opResult = await withTimeout(page.getOperatorList(), timeoutMs);
    if (opResult.timedOut) {
      analysisTimedOut = true;
    } else if (opResult.value) {
      const fnArray = opResult.value.fnArray || opResult.value.fn || [];
      const OPS = pdfjs.OPS;
      const drawingCmds = new Set([
        OPS.moveTo, OPS.lineTo, OPS.curveTo, OPS.curveTo2, OPS.curveTo3,
        OPS.rectangle, OPS.stroke, OPS.fill, OPS.eoFill
      ]);
      const imageCmds = new Set([
        OPS.paintImageXObject, OPS.paintInlineImageXObject, OPS.paintImageMaskXObject
      ]);

      for (let k = 0; k < fnArray.length; k++) {
        const fn = fnArray[k];
        if (drawingCmds.has(fn)) vectorOps++;
        if (imageCmds.has(fn)) imageOps++;
      }
    }
  }

  return { textLen, textItems, vectorOps, imageOps, analysisTimedOut };
};

const yieldToMain = async (useIdle: boolean) => {
  if (useIdle && 'requestIdleCallback' in window) {
    await new Promise<void>((resolve) => {
      (window as any).requestIdleCallback(() => resolve(), { timeout: 50 });
    });
    return;
  }
  await new Promise(r => setTimeout(r, 0));
};

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
    
    onProgress(20, 'Parsing structure...');
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
    // We create a brand new document and copy pages into it.
    // This leaves behind any orphaned objects (deleted pages, unused fonts) from the old file.
    onProgress(30, 'Re-packing document tree...');
    const newDoc = await PDFDocument.create();

    // Copy Metadata (Optional stripping)
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

    onProgress(50, 'Migrating pages...');
    const indices = pdfDoc.getPageIndices();
    
    // Copying pages in batches
    const batchSize = 50;
    for (let i = 0; i < indices.length; i += batchSize) {
        const batch = indices.slice(i, i + batchSize);
        const copiedPages = await newDoc.copyPages(pdfDoc, batch);
        copiedPages.forEach(p => newDoc.addPage(p));
        await new Promise(r => setTimeout(r, 0));
    }

    // FEATURE: Asset Deduplication
    // Now that we have a clean tree, we scan for duplicate images (Logos, Icons) 
    // and merge their references.
    await deduplicateAssets(newDoc, onProgress);

    onProgress(90, 'Compressing streams...');
    const compressedBytes = await newDoc.save({
      useObjectStreams: true, // "Vacuum seal" the objects
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
    const largePdfMode = settings.largePdfMode ?? false;
    const performanceMode = settings.performanceMode ?? false;
    const analysisTimeoutMs = settings.analysisTimeoutMs ?? (largePdfMode ? 250 : 800);
    const analysisBatchSize = settings.analysisBatchSize ?? (largePdfMode ? 2 : 3);
    const yieldEvery = performanceMode ? 1 : analysisBatchSize;

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
            
            const runOpList = !largePdfMode || i % 3 === 0;
            const { textLen, textItems, vectorOps, imageOps, analysisTimedOut } = await analyzePageContent(page, pdfjs, {
                timeoutMs: analysisTimeoutMs,
                runOpList
            });

            // PHASE 2: Smart Hybrid Detection
            if (settings.autoDetectText) {
                try {
                    // Scoring Algorithm
                    let score = 0;
                    if (textLen > 300) score += 50;      
                    else if (textLen > 50) score += 20;  
                    if (vectorOps > 50) score += 100;    
                    else if (vectorOps > 10) score += 20;

                    if (imageOps === 0) {
                        score += 200; 
                    } else {
                        score -= Math.min(imageOps, 10) * 12;
                        if (textLen > 100 && vectorOps < 5) score -= 60; 
                        if (textLen < 50 && vectorOps < 10) score -= 100;
                        if (textItems > 80 && imageOps < 2) score += 30;
                        if (textItems < 10 && imageOps > 2) score -= 80;
                    }
                    if (analysisTimedOut && largePdfMode) score += 10;
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
                let targetMaxDim = settings.maxResolution || 2000;
                if (performanceMode) {
                    targetMaxDim = Math.min(targetMaxDim, 1800);
                }
                
                if (textLen > 1000) {
                    targetMaxDim = Math.max(targetMaxDim, 2500); 
                } else if (textLen < 50) {
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

                // Pixel Manipulation Loop
                if (settings.grayscale || settings.cleanBackground) {
                    const imgData = ctx.getImageData(0, 0, canvas.width, canvas.height);
                    const data = imgData.data;
                    for (let j = 0; j < data.length; j += 4) {
                        let r = data[j];
                        let g = data[j + 1];
                        let b = data[j + 2];

                        // FEATURE 1: Background Cleaning
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

                // FEATURE 3: OCR Re-injection
                let textPositions: any[] = [];
                if (settings.enableOCR && window.Tesseract) {
                    onProgress(progress, `Page ${i}: Indexing text (OCR)...`);
                    textPositions = await extractTextPositions(blob);
                }

                const arrayBufferImg = await blob.arrayBuffer();
                const embeddedImage = await newPdfDoc.embedJpg(arrayBufferImg);

                const newPage = newPdfDoc.addPage([scaledViewport.width, scaledViewport.height]);
                
                newPage.drawImage(embeddedImage, {
                    x: 0,
                    y: 0,
                    width: scaledViewport.width,
                    height: scaledViewport.height,
                });
                
                if (textPositions.length > 0 && ocrFont) {
                    const pageHeight = scaledViewport.height;
                    
                    textPositions.forEach((word) => {
                        const { text, bbox } = word;
                        const w = bbox.x1 - bbox.x0;
                        const h = bbox.y1 - bbox.y0;
                        const fontSize = h;
                        const pdfY = pageHeight - bbox.y1;

                        newPage.drawText(text, {
                            x: bbox.x0,
                            y: pdfY,
                            size: fontSize,
                            font: ocrFont,
                            color: rgb(0, 0, 0),
                            opacity: 0, 
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

        if (i % yieldEvery === 0) await yieldToMain(performanceMode);
      }

      onProgress(95, 'Finalizing PDF...');
      if (settings.autoDetectText) {
        await deduplicateAssets(newPdfDoc, onProgress);
      }
      const pdfBytes = await newPdfDoc.save({
        useObjectStreams: true,
        objectsPerTick: 50
      });
      
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
