
import { SupportedFormat } from '../types';

interface ProcessedFile {
    blob: Blob;
    name: string;
}

export interface ConversionItem {
    id?: string; // Optional ID to map back to UI
    file: File;
    targetFormat: SupportedFormat;
}

export type ItemStatusCallback = (index: number, status: 'processing' | 'done') => void;

/**
 * Main Conversion Function
 */
export const convertFile = async (
  items: ConversionItem[], 
  settings: { quality: number; mergeToPdf: boolean },
  onProgress: (progress: number, step: string) => void,
  onItemStatus?: ItemStatusCallback
): Promise<{ blob: Blob; filename: string }> => {
  
  if (items.length === 0) throw new Error("No files selected");

  // We need to map the original indices to handle tracking correctly.
  const indexedItems = items.map((item, idx) => ({ ...item, originalIndex: idx }));

  const pdfTargets = indexedItems.filter(i => i.targetFormat === 'application/pdf');
  const otherTargets = indexedItems.filter(i => i.targetFormat !== 'application/pdf');

  let itemsToMerge: typeof indexedItems = [];
  let itemsIndividual: typeof indexedItems = [...otherTargets];

  const shouldMerge = settings.mergeToPdf && pdfTargets.length > 1;

  if (shouldMerge) {
      const imagesToMerge = pdfTargets.filter(i => i.file.type !== 'application/pdf');
      const pdfsToPassthrough = pdfTargets.filter(i => i.file.type === 'application/pdf');
      
      if (imagesToMerge.length > 1) {
          itemsToMerge = imagesToMerge;
          itemsIndividual = [...itemsIndividual, ...pdfsToPassthrough];
      } else {
          itemsIndividual = [...itemsIndividual, ...pdfTargets];
      }
  } else {
      itemsIndividual = [...itemsIndividual, ...pdfTargets];
  }

  const results: ProcessedFile[] = [];
  
  if (!window.JSZip) {
      throw new Error("Compression library not loaded. Check internet connection.");
  }
  const JSZip = window.JSZip;

  onProgress(5, 'Initializing...');

  // 1. Process Merge
  if (itemsToMerge.length > 0) {
      onProgress(10, `Merging ${itemsToMerge.length} images to PDF...`);
      
      const mergedBlob = await convertImagesToPDF(
          itemsToMerge.map(i => i.file), 
          (p, s, idxInMerge) => {
             onProgress(10 + Math.round(p * 0.4), s);
             if (idxInMerge !== undefined && onItemStatus) {
                 const originalIdx = itemsToMerge[idxInMerge].originalIndex;
                 onItemStatus(originalIdx, 'processing');
             }
          },
          (idxInMerge) => {
              if (onItemStatus) {
                  const originalIdx = itemsToMerge[idxInMerge].originalIndex;
                  onItemStatus(originalIdx, 'done');
              }
          }
      );
      results.push({
          blob: mergedBlob,
          name: 'merged_images.pdf'
      });
  }

  // 2. Process Individuals
  for (let i = 0; i < itemsIndividual.length; i++) {
      const item = itemsIndividual[i];
      const { file, targetFormat, originalIndex } = item;
      
      if (onItemStatus) onItemStatus(originalIndex, 'processing');

      const startP = itemsToMerge.length > 0 ? 50 : 5;
      const range = itemsToMerge.length > 0 ? 40 : 85;
      const progressBase = startP + Math.round((i / itemsIndividual.length) * range);
      
      if (file.type === 'application/pdf') {
          // Extract pages from PDF
          onProgress(progressBase, `Processing PDF ${file.name}...`);
          const pdfImages = await extractImagesFromPDF(file, targetFormat, settings.quality, (p) => {});
          results.push(...pdfImages);
      } else {
          // Convert Image
          onProgress(progressBase, `Converting ${file.name}...`);
          
          let blob: Blob;
          if (targetFormat === 'application/pdf') {
             blob = await convertImagesToPDF([file], () => {});
          } else {
             blob = await convertImageToImage(file, targetFormat, settings.quality);
          }
          
          // Detect actual extension based on output blob (handles fallback)
          let ext = 'bin';
          if (blob.type === 'image/jpeg') ext = 'jpg';
          else if (blob.type === 'image/png') ext = 'png';
          else if (blob.type === 'image/webp') ext = 'webp';
          else if (blob.type === 'image/avif') ext = 'avif';
          else if (blob.type === 'application/pdf') ext = 'pdf';
          
          results.push({
              blob,
              name: `${file.name.split('.')[0]}.${ext}`
          });
      }
      
      if (onItemStatus) onItemStatus(originalIndex, 'done');
      await new Promise(r => setTimeout(r, 0));
  }

  // --- Finalize Output ---
  onProgress(95, 'Finalizing...');

  if (results.length === 0) throw new Error("No files processed.");

  // If single result, return file
  if (results.length === 1) {
      onProgress(100, 'Done');
      return {
          blob: results[0].blob,
          filename: results[0].name
      };
  }

  // If multiple results, return ZIP
  onProgress(98, 'Zipping files...');
  const zip = new JSZip();
  const nameCounts: Record<string, number> = {};
  
  results.forEach(res => {
      let fileName = res.name;
      if (nameCounts[fileName]) {
          const extParts = fileName.split('.');
          const ext = extParts.pop();
          const base = extParts.join('.');
          fileName = `${base}_${nameCounts[fileName]}.${ext}`;
          nameCounts[res.name]++; 
      } else {
          nameCounts[fileName] = 1;
      }
      zip.file(fileName, res.blob);
  });

  const content = await zip.generateAsync({ type: "blob" });
  onProgress(100, 'Done');
  
  return {
      blob: content,
      filename: 'converted_files.zip'
  };
};

// --- Helpers ---

const convertImageToImage = async (file: File, format: SupportedFormat, quality: number): Promise<Blob> => {
    if (format === 'application/pdf') throw new Error("Use convertImagesToPDF for PDF target");

    if (typeof createImageBitmap !== 'undefined') {
        try {
            const bitmap = await createImageBitmap(file);
            const canvas = document.createElement('canvas');
            canvas.width = bitmap.width;
            canvas.height = bitmap.height;
            const ctx = canvas.getContext('2d');
            
            if (!ctx) {
                bitmap.close();
                throw new Error('Canvas context failed');
            }
            
            if (format === 'image/jpeg') {
                ctx.fillStyle = '#FFFFFF';
                ctx.fillRect(0, 0, canvas.width, canvas.height);
            }
            
            ctx.drawImage(bitmap, 0, 0);
            bitmap.close(); 
            
            return new Promise((resolve, reject) => {
                const exportBlob = (fmt: string) => {
                    canvas.toBlob((blob) => {
                        if(blob) {
                            // Fallback check: If requested AVIF but got PNG -> fallback to WebP
                            if (fmt === 'image/avif' && blob.type === 'image/png') {
                                exportBlob('image/webp');
                                return;
                            }
                            resolve(blob);
                        } else reject('Encoding failed');
                    }, fmt, quality);
                };
                exportBlob(format);
            });
        } catch (e) {
            console.warn('createImageBitmap failed, falling back to Image element', e);
        }
    }

    return new Promise((resolve, reject) => {
        const url = URL.createObjectURL(file);
        const img = new Image();
        img.onload = () => {
            const canvas = document.createElement('canvas');
            canvas.width = img.width;
            canvas.height = img.height;
            const ctx = canvas.getContext('2d');
            if(!ctx) { 
                URL.revokeObjectURL(url);
                reject('Canvas context failed'); 
                return; 
            }
            
            if (format === 'image/jpeg') {
                ctx.fillStyle = '#FFFFFF';
                ctx.fillRect(0, 0, canvas.width, canvas.height);
            }
            
            ctx.drawImage(img, 0, 0);
            URL.revokeObjectURL(url);
            
            const exportBlob = (fmt: string) => {
                canvas.toBlob((blob) => {
                    if(blob) {
                         if (fmt === 'image/avif' && blob.type === 'image/png') {
                            exportBlob('image/webp');
                            return;
                        }
                        resolve(blob);
                    } else reject('Conversion failed');
                }, fmt, quality);
            };
            exportBlob(format);
        };
        img.onerror = () => {
            URL.revokeObjectURL(url);
            reject('Image load failed');
        };
        img.src = url;
    });
};

const convertImagesToPDF = async (
    files: File[], 
    onProgress: (p: number, s: string, idx?: number) => void,
    onItemDone?: (idx: number) => void
): Promise<Blob> => {
    if (!window.PDFLib) {
        throw new Error("PDF libraries not loaded. Check connection.");
    }
    const { PDFDocument } = window.PDFLib;
    const pdfDoc = await PDFDocument.create();
    
    for (let i = 0; i < files.length; i++) {
        const file = files[i];
        if (files.length > 1) {
            const progress = Math.round(((i) / files.length) * 100);
            onProgress(progress, `Processing image ${i + 1}/${files.length}...`, i);
        }

        const imageBytes = await file.arrayBuffer();
        let image;
        
        if (file.type === 'image/jpeg') {
            image = await pdfDoc.embedJpg(imageBytes);
        } else if (file.type === 'image/png') {
            image = await pdfDoc.embedPng(imageBytes);
        } else {
            // Convert other formats (webp, etc) to png first
            const pngBlob = await convertImageToImage(file, 'image/png', 1.0);
            const pngBytes = await pngBlob.arrayBuffer();
            image = await pdfDoc.embedPng(pngBytes);
        }

        const page = pdfDoc.addPage([image.width, image.height]);
        page.drawImage(image, {
            x: 0,
            y: 0,
            width: image.width,
            height: image.height,
        });

        if(onItemDone) onItemDone(i);

        if (files.length > 5 && i % 3 === 0) await new Promise(r => setTimeout(r, 0));
    }

    const pdfBytes = await pdfDoc.save();
    return new Blob([pdfBytes], { type: 'application/pdf' });
};

// Returns array of {blob, name}
const extractImagesFromPDF = async (
    file: File, 
    format: SupportedFormat, 
    quality: number,
    onProgress: (p: number) => void
): Promise<ProcessedFile[]> => {
    if (!window.pdfjsLib) {
        throw new Error("PDF libraries not loaded. Check connection.");
    }
    const pdfjs = window.pdfjsLib;
    
    if (format === 'application/pdf') {
        return [{ blob: file, name: file.name }];
    }

    const fileUrl = URL.createObjectURL(file);
    const results: ProcessedFile[] = [];

    try {
        const loadingTask = pdfjs.getDocument(fileUrl);
        const pdf = await loadingTask.promise;
        const totalPages = pdf.numPages;
        const baseName = file.name.split('.')[0];

        for (let i = 1; i <= totalPages; i++) {
            onProgress((i/totalPages) * 100);
            const blob = await renderPageToBlob(pdf, i, format, quality);
            
            // Detect extension from output blob
            let ext = 'bin';
            if (blob.type === 'image/jpeg') ext = 'jpg';
            else if (blob.type === 'image/png') ext = 'png';
            else if (blob.type === 'image/webp') ext = 'webp';
            else if (blob.type === 'image/avif') ext = 'avif';

            results.push({
                blob,
                name: totalPages === 1 ? `${baseName}.${ext}` : `${baseName}_page_${i}.${ext}`
            });
            
            if (i % 5 === 0) await new Promise(r => setTimeout(r, 0));
        }
    } finally {
        URL.revokeObjectURL(fileUrl);
    }
    
    return results;
};

const renderPageToBlob = async (pdf: any, pageNum: number, format: string, quality: number): Promise<Blob> => {
    const page = await pdf.getPage(pageNum);
    
    // SCALE CALCULATION FOR 300 DPI
    const TARGET_DPI = 300;
    const STANDARD_DPI = 72;
    const targetScale = TARGET_DPI / STANDARD_DPI; // ~4.17
    
    let viewport = page.getViewport({ scale: targetScale }); 
    
    const MAX_DIMENSION = 4096;
    if (viewport.width > MAX_DIMENSION || viewport.height > MAX_DIMENSION) {
        const ratio = Math.min(MAX_DIMENSION / viewport.width, MAX_DIMENSION / viewport.height);
        viewport = page.getViewport({ scale: targetScale * ratio });
    }

    const canvas = document.createElement('canvas');
    canvas.width = viewport.width;
    canvas.height = viewport.height;
    
    const ctx = canvas.getContext('2d');
    if (!ctx) throw new Error('Canvas context failed');
    
    if (format === 'image/jpeg') {
        ctx.fillStyle = '#FFFFFF';
        ctx.fillRect(0, 0, canvas.width, canvas.height);
    }
    
    await page.render({ canvasContext: ctx, viewport }).promise;
    page.cleanup();

    return new Promise((resolve, reject) => {
        const exportBlob = (fmt: string) => {
            canvas.toBlob((blob) => {
                if(blob) {
                    if (fmt === 'image/avif' && blob.type === 'image/png') {
                        exportBlob('image/webp');
                        return;
                    }
                    resolve(blob);
                } else reject('Page render failed');
                
                // Clean up heavy canvas memory
                if (canvas.width > 1) {
                    canvas.width = 1;
                    canvas.height = 1;
                }
            }, fmt, quality);
        };
        exportBlob(format);
    });
};
