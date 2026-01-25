import { SupportedFormat } from '../types';

export interface OptimizationSettings {
  targetFormat: 'original' | SupportedFormat;
  quality: number; // 0.1 to 1.0
  maxWidth: number; // 0 for no resize
}

export interface OptimizedResult {
  blob: Blob;
  fileName: string;
  originalSize: number;
  compressedSize: number;
}

export type ItemStatusCallback = (index: number, status: 'processing' | 'done') => void;

// --- PREVIEW GENERATION ---
export const generatePreview = async (
  file: File,
  settings: OptimizationSettings
): Promise<{ previewUrl: string; width: number; height: number }> => {
  // Determine effective format for preview (to show transparency loss etc)
  let format = settings.targetFormat;
  if (format === 'original') {
    // We map original to specific types to handle transparency logic
    if (file.type === 'image/png') format = 'image/png';
    else if (file.type === 'image/webp') format = 'image/webp';
    else if (file.type === 'image/avif') format = 'image/avif';
    else format = 'image/jpeg';
  }

  // Cap preview size for performance (grid thumbnails don't need 4K)
  const THUMBNAIL_SIZE = 320; 

  if (typeof createImageBitmap !== 'undefined') {
    try {
       const bitmap = await createImageBitmap(file);
       const width = bitmap.width;
       const height = bitmap.height;
       
       const blob = await renderBitmapToBlob(bitmap, format as string, 0.7, THUMBNAIL_SIZE); // Low quality for preview speed
       return {
           previewUrl: URL.createObjectURL(blob),
           width,
           height
       };
    } catch (e) {
       console.warn('Preview generation fallback', e);
    }
  }

  // Fallback
  return new Promise((resolve, reject) => {
      const url = URL.createObjectURL(file);
      const img = new Image();
      img.onload = async () => {
          const width = img.width;
          const height = img.height;
          try {
             const blob = await renderBitmapToBlob(img, format as string, 0.7, THUMBNAIL_SIZE);
             resolve({
                 previewUrl: URL.createObjectURL(blob),
                 width,
                 height
             });
          } catch(e) {
             // If canvas fails, return original as fallback
             resolve({ previewUrl: url, width, height });
          } finally {
             if (url !== file.name) URL.revokeObjectURL(url); // Cleanup temp url if we made a new blob
          }
      };
      img.onerror = () => {
          reject(new Error("Failed to load image for preview"));
      };
      img.src = url;
  });
};

export const optimizeImages = async (
  files: File[], 
  settings: OptimizationSettings,
  onProgress: (progress: number, currentFile: string) => void,
  onItemStatus?: ItemStatusCallback
): Promise<{ 
  blob: Blob; 
  filename: string; 
  stats: { original: number, compressed: number };
  details: OptimizedResult[]; 
}> => {
  
  if (files.length === 0) throw new Error("No files provided");

  const JSZip = window.JSZip;
  const results: OptimizedResult[] = [];
  let totalOriginalSize = 0;
  let totalCompressedSize = 0;

  for (let i = 0; i < files.length; i++) {
    const file = files[i];
    
    if(onItemStatus) onItemStatus(i, 'processing');

    // Calculate progress (0-90%)
    const progress = Math.round((i / files.length) * 90);
    onProgress(progress, `Compressing ${file.name}...`);

    try {
      // Determine output format
      let format = settings.targetFormat;
      if (format === 'original') {
        if (file.type === 'image/png') format = 'image/png';
        else if (file.type === 'image/webp') format = 'image/webp';
        else if (file.type === 'image/avif') format = 'image/avif';
        else format = 'image/jpeg';
      }

      const compressedBlob = await compressSingleImage(file, format as string, settings.quality, settings.maxWidth);
      
      // Determine extension from the ACTUAL blob type
      // (This handles the case where we requested AVIF but got WebP/PNG fallback)
      let ext = 'bin';
      if (compressedBlob.type === 'image/jpeg') ext = 'jpg';
      else if (compressedBlob.type === 'image/png') ext = 'png';
      else if (compressedBlob.type === 'image/webp') ext = 'webp';
      else if (compressedBlob.type === 'image/avif') ext = 'avif';
      else ext = format.split('/')[1] || 'bin';

      const baseName = file.name.substring(0, file.name.lastIndexOf('.')) || file.name;
      
      const fileName = `${baseName}_optimized.${ext}`;

      results.push({
        blob: compressedBlob,
        fileName: fileName,
        originalSize: file.size,
        compressedSize: compressedBlob.size
      });
      
      totalOriginalSize += file.size;
      totalCompressedSize += compressedBlob.size;

      if(onItemStatus) onItemStatus(i, 'done');

      // Small pause to keep UI responsive
      await new Promise(r => setTimeout(r, 10));

    } catch (e) {
      console.warn(`Failed to optimize ${file.name}`, e);
      // Skip failed items but don't break the loop
      if(onItemStatus) onItemStatus(i, 'done'); // Mark done even if failed to clear spinner
    }
  }

  onProgress(95, 'Packing files...');

  // Single file result
  if (results.length === 1) {
    onProgress(100, 'Done');
    return {
      blob: results[0].blob,
      filename: results[0].fileName,
      stats: { original: totalOriginalSize, compressed: totalCompressedSize },
      details: results
    };
  }

  // ZIP result
  const zip = new JSZip();
  results.forEach(res => {
     zip.file(res.fileName, res.blob);
  });
  
  const content = await zip.generateAsync({ type: "blob" });
  onProgress(100, 'Done');

  return {
    blob: content,
    filename: `optimized_images_${results.length}_files.zip`,
    stats: { original: totalOriginalSize, compressed: totalCompressedSize },
    details: results
  };
};

const compressSingleImage = async (
  file: File, 
  format: string, 
  quality: number, 
  maxWidth: number
): Promise<Blob> => {
  
  // Use createImageBitmap for performance if available
  if (typeof createImageBitmap !== 'undefined') {
    try {
      const bitmap = await createImageBitmap(file);
      return await renderBitmapToBlob(bitmap, format, quality, maxWidth);
    } catch (e) {
      console.warn("createImageBitmap failed, falling back", e);
    }
  }

  // Fallback to Image tag
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = async () => {
      try {
        const blob = await renderBitmapToBlob(img, format, quality, maxWidth);
        resolve(blob);
      } catch (e) {
        reject(e);
      } finally {
        URL.revokeObjectURL(url);
      }
    };
    img.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error("Image load failed"));
    };
    img.src = url;
  });
};

const renderBitmapToBlob = async (
  source: ImageBitmap | HTMLImageElement,
  format: string,
  quality: number,
  maxWidth: number
): Promise<Blob> => {
  const canvas = document.createElement('canvas');
  let width = source.width;
  let height = source.height;

  // Resize logic
  if (maxWidth > 0 && width > maxWidth) {
    const scale = maxWidth / width;
    width = maxWidth;
    height = Math.round(height * scale);
  }

  canvas.width = width;
  canvas.height = height;

  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error("Canvas context failed");

  // Handle transparency for JPEG
  if (format === 'image/jpeg') {
    ctx.fillStyle = '#FFFFFF';
    ctx.fillRect(0, 0, width, height);
  }

  ctx.drawImage(source, 0, 0, width, height);

  if (source instanceof ImageBitmap) source.close();

  return new Promise((resolve, reject) => {
    // Inner function to handle retries (fallback)
    const exportBlob = (fmt: string) => {
        canvas.toBlob((blob) => {
            if (blob) {
                // FALLBACK CHECK:
                // If we requested AVIF but got PNG, the browser doesn't support encoding AVIF.
                // We should fallback to WebP to ensure compression happens.
                if (fmt === 'image/avif' && blob.type === 'image/png') {
                    console.warn("AVIF encoding not supported, falling back to WebP");
                    exportBlob('image/webp');
                    return;
                }
                resolve(blob);
            } else {
                reject(new Error("Encoding failed"));
            }
        }, fmt, quality);
    };

    exportBlob(format);
  });
};