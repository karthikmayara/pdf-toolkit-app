import { WatermarkSettings } from '../types';

/**
 * Generates a high-res PNG blob of the watermark text
 * This ensures fonts look identical on PDF and Images
 */
const createWatermarkStamp = async (settings: WatermarkSettings, scaleMultiplier: number = 1): Promise<{ blob: Blob, width: number, height: number }> => {
  const canvas = document.createElement('canvas');
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error("Canvas context failed");

  const fontSize = settings.fontSize * scaleMultiplier;
  const fontStyle = `${settings.isItalic ? 'italic' : ''} ${settings.isBold ? 'bold' : ''} ${fontSize}px "${settings.fontFamily}"`.trim();
  
  ctx.font = fontStyle;
  const metrics = ctx.measureText(settings.text);
  
  // Add padding for rotation clipping
  const textWidth = metrics.width;
  const textHeight = fontSize * 1.5; // Approximate height
  
  // Calculate canvas size required to hold the rotated text
  const angleRad = (Math.abs(settings.rotation) * Math.PI) / 180;
  const canvasWidth = Math.abs(textWidth * Math.cos(angleRad)) + Math.abs(textHeight * Math.sin(angleRad)) + 50;
  const canvasHeight = Math.abs(textWidth * Math.sin(angleRad)) + Math.abs(textHeight * Math.cos(angleRad)) + 50;

  canvas.width = canvasWidth;
  canvas.height = canvasHeight;

  // Re-apply settings after resize
  ctx.font = fontStyle;
  ctx.fillStyle = settings.color;
  ctx.globalAlpha = settings.opacity;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';

  // Move to center, rotate, draw
  ctx.translate(canvasWidth / 2, canvasHeight / 2);
  ctx.rotate((settings.rotation * Math.PI) / 180);
  ctx.fillText(settings.text, 0, 0);

  return new Promise((resolve, reject) => {
    canvas.toBlob(blob => {
      if (blob) resolve({ blob, width: canvasWidth, height: canvasHeight });
      else reject("Failed to create watermark stamp");
    }, 'image/png');
  });
};

/**
 * Helper: Parse Page Range String (e.g. "1-3, 5") to array of 0-based indices
 */
const getTargetPages = (total: number, mode: WatermarkSettings['pageSelectMode'], rangeStr: string): Set<number> => {
  const targets = new Set<number>();
  
  if (mode === 'all') {
    for (let i = 0; i < total; i++) targets.add(i);
    return targets;
  }

  if (mode === 'odd') {
    for (let i = 0; i < total; i += 2) targets.add(i); // 0 (page 1), 2 (page 3)...
    return targets;
  }

  if (mode === 'even') {
    for (let i = 1; i < total; i += 2) targets.add(i); // 1 (page 2), 3 (page 4)...
    return targets;
  }

  if (mode === 'custom') {
    const parts = rangeStr.split(',');
    parts.forEach(part => {
      const trimmed = part.trim();
      if (trimmed.includes('-')) {
        const [start, end] = trimmed.split('-').map(Number);
        if (!isNaN(start) && !isNaN(end)) {
           // Clamp to valid range
           const s = Math.max(1, Math.min(start, total));
           const e = Math.max(1, Math.min(end, total));
           for (let i = Math.min(s, e); i <= Math.max(s, e); i++) {
             targets.add(i - 1); // Convert 1-based to 0-based
           }
        }
      } else {
        const p = Number(trimmed);
        if (!isNaN(p) && p >= 1 && p <= total) {
          targets.add(p - 1);
        }
      }
    });
  }

  return targets;
};

/**
 * Apply Watermark to PDF
 */
export const watermarkPDF = async (
  file: File, 
  settings: WatermarkSettings,
  onProgress: (p: number, s: string) => void
): Promise<Blob> => {
  const { PDFDocument } = window.PDFLib;
  
  onProgress(5, 'Loading PDF...');
  const arrayBuffer = await file.arrayBuffer();
  const pdfDoc = await PDFDocument.load(arrayBuffer);
  
  // Generate the watermark image once
  onProgress(15, 'Generating stamp...');
  // We scale up the watermark for PDF resolution quality
  const stamp = await createWatermarkStamp(settings, 3.0); 
  const stampBuffer = await stamp.blob.arrayBuffer();
  const embeddedImage = await pdfDoc.embedPng(stampBuffer);
  
  const pages = pdfDoc.getPages();
  const totalPages = pages.length;

  // Calculate target pages
  const targetIndices = getTargetPages(totalPages, settings.pageSelectMode, settings.pageRange);

  for (let i = 0; i < totalPages; i++) {
    // UI Responsiveness: Yield to event loop every 20 pages
    if (i % 20 === 0) await new Promise(r => setTimeout(r, 0));

    if (!targetIndices.has(i)) continue;

    const progress = 20 + Math.round((i / totalPages) * 75);
    onProgress(progress, `Stamping page ${i + 1} of ${totalPages}...`);
    
    const page = pages[i];
    const { width, height } = page.getSize();
    
    // Scale down the embedded image to match the visual size of the font on the PDF page
    // The stamp was generated at 3x scale.
    const drawWidth = stamp.width / 3;
    const drawHeight = stamp.height / 3;

    const positions = calculatePositions(settings.position, width, height, drawWidth, drawHeight);

    positions.forEach(pos => {
      page.drawImage(embeddedImage, {
        x: pos.x,
        y: pos.y,
        width: drawWidth,
        height: drawHeight,
      });
    });
  }

  onProgress(98, 'Finalizing PDF...');
  const pdfBytes = await pdfDoc.save();
  return new Blob([pdfBytes], { type: 'application/pdf' });
};

/**
 * Apply Watermark to Image
 */
export const watermarkImage = async (
  file: File,
  settings: WatermarkSettings,
  onProgress: (p: number, s: string) => void
): Promise<{ blob: Blob, filename: string }> => {
  
  onProgress(20, 'Loading image...');
  
  // Use ImageBitmap for efficiency
  let bitmap: ImageBitmap;
  if (typeof createImageBitmap !== 'undefined') {
      bitmap = await createImageBitmap(file);
  } else {
      // Fallback
      throw new Error("Browser not supported for image manipulation");
  }

  const canvas = document.createElement('canvas');
  canvas.width = bitmap.width;
  canvas.height = bitmap.height;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error("Canvas context failed");

  // Draw original image
  ctx.drawImage(bitmap, 0, 0);

  onProgress(40, 'Generating stamp...');
  
  const responsiveScale = 1 + (canvas.width / 2000);
  const stamp = await createWatermarkStamp(settings, responsiveScale);
  
  const stampImg = await createImageBitmap(stamp.blob);
  
  const positions = calculatePositions(
      settings.position, 
      canvas.width, 
      canvas.height, 
      stamp.width, 
      stamp.height
  );

  onProgress(60, 'Applying watermark...');
  positions.forEach(pos => {
      ctx.drawImage(stampImg, pos.x, pos.y, stamp.width, stamp.height);
  });
  
  onProgress(90, 'Encoding image...');
  
  // Determine output format (keep original if possible, else PNG)
  let type = file.type;
  if (type === 'image/svg+xml') type = 'image/png'; // Can't save back to SVG

  return new Promise((resolve, reject) => {
      canvas.toBlob(blob => {
          if (blob) {
              const ext = type.split('/')[1];
              resolve({ blob, filename: `watermarked_${file.name.split('.')[0]}.${ext}` });
          }
          else reject("Encoding failed");
      }, type, 0.9);
  });
};

/**
 * Helper to calculate X/Y coordinates based on position setting
 * Returns array of positions (single item or multiple for tiled)
 */
const calculatePositions = (
    pos: WatermarkSettings['position'], 
    pageW: number, 
    pageH: number, 
    imgW: number, 
    imgH: number
): {x: number, y: number}[] => {
    
    const padding = 20;
    const centerX = (pageW - imgW) / 2;
    const centerY = (pageH - imgH) / 2;
    const left = padding;
    const right = pageW - imgW - padding;
    const top = pageH - imgH - padding; // PDF y=0 is bottom
    const bottom = padding; // PDF y=0 is bottom
    
    // NOTE: This logic assumes PDF coordinates (0,0 is bottom-left)
    // If we are processing Image (0,0 is top-left), the Y values need inversion logic in the caller
    // OR, simpler: We standardize on Top-Left origin logic here, and the PDF caller flips the Y.
    
    const yTop = padding;
    const yMid = (pageH - imgH) / 2;
    const yBot = pageH - imgH - padding;

    switch (pos) {
        case 'top-left': return [{ x: left, y: yTop }];
        case 'top-center': return [{ x: centerX, y: yTop }];
        case 'top-right': return [{ x: right, y: yTop }];
        
        case 'middle-left': return [{ x: left, y: yMid }];
        case 'center': return [{ x: centerX, y: yMid }];
        case 'middle-right': return [{ x: right, y: yMid }];
        
        case 'bottom-left': return [{ x: left, y: yBot }];
        case 'bottom-center': return [{ x: centerX, y: yBot }];
        case 'bottom-right': return [{ x: right, y: yBot }];
        
        case 'tiled':
            const results = [];
            const cols = 3;
            const rows = 4;
            const xGap = (pageW - (imgW * cols)) / (cols + 1);
            const yGap = (pageH - (imgH * rows)) / (rows + 1);
            
            for(let r=0; r<rows; r++) {
                for(let c=0; c<cols; c++) {
                    results.push({
                        x: xGap + c * (imgW + xGap),
                        y: yGap + r * (imgH + yGap)
                    });
                }
            }
            return results;
            
        default: return [{ x: centerX, y: centerY }];
    }
};

/**
 * PDF Coordinate flipper helper
 */
export const getPDFCoordinates = (
    pos: WatermarkSettings['position'], 
    pageW: number, 
    pageH: number, 
    imgW: number, 
    imgH: number
) => {
    // Get Top-Left based coordinates
    const coords = calculatePositions(pos, pageW, pageH, imgW, imgH);
    
    // Convert Y for PDF (where 0 is bottom)
    // Canvas Y=20 (top) becomes PDF Y = Height - 20 - ImgHeight
    return coords.map(c => ({
        x: c.x,
        y: pageH - c.y - imgH
    }));
};
