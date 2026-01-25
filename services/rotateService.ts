/**
 * Rotates specific pages in a PDF or a single image.
 */

// Helper to normalize rotation to 0, 90, 180, 270
const normalizeAngle = (angle: number) => {
  let a = angle % 360;
  if (a < 0) a += 360;
  return a;
};

export const rotateDocument = async (
  file: File,
  rotations: Record<number, number>, // map of pageIndex -> degrees (additive)
  onProgress: (progress: number, step: string) => void
): Promise<Blob> => {
  
  // 1. Handle PDF
  if (file.type === 'application/pdf') {
    const { PDFDocument, degrees } = window.PDFLib;
    onProgress(10, 'Loading PDF...');
    const arrayBuffer = await file.arrayBuffer();
    const pdfDoc = await PDFDocument.load(arrayBuffer, { ignoreEncryption: true });
    const pages = pdfDoc.getPages();
    
    onProgress(30, 'Applying rotations...');
    
    
    Object.entries(rotations).forEach(([pageIdxStr, delta]) => {
      const pageIdx = parseInt(pageIdxStr);
      if (pageIdx >= 0 && pageIdx < pages.length) {
        const page = pages[pageIdx];
        const currentRotation = page.getRotation().angle;
        const newRotation = normalizeAngle(currentRotation + delta);
        page.setRotation(degrees(newRotation));
      }
    });

    onProgress(80, 'Saving PDF...');
    const pdfBytes = await pdfDoc.save();
    onProgress(100, 'Done');
    return new Blob([pdfBytes], { type: 'application/pdf' });
  } 
  
  // 2. Handle Image
  else if (file.type.startsWith('image/')) {
    onProgress(20, 'Processing Image...');
    
    // For single image, we check index 0
    const rotation = rotations[0] || 0;
    if (rotation === 0) return file; // No change

    return rotateSingleImage(file, rotation);
  }

  throw new Error("Unsupported file type");
};

const rotateSingleImage = async (file: File, rotation: number): Promise<Blob> => {
    const bitmap = await createImageBitmap(file);
    const canvas = document.createElement('canvas');
    const ctx = canvas.getContext('2d');
    if (!ctx) throw new Error("Canvas context failed");

    const angleInRad = (rotation * Math.PI) / 180;
    
    // Swap dimensions for 90/270
    if (Math.abs(rotation) % 180 !== 0) {
        canvas.width = bitmap.height;
        canvas.height = bitmap.width;
    } else {
        canvas.width = bitmap.width;
        canvas.height = bitmap.height;
    }

    // Translate to center and rotate
    ctx.translate(canvas.width / 2, canvas.height / 2);
    ctx.rotate(angleInRad);
    ctx.drawImage(bitmap, -bitmap.width / 2, -bitmap.height / 2);

    return new Promise((resolve, reject) => {
        canvas.toBlob(blob => {
            if (blob) resolve(blob);
            else reject("Encoding failed");
        }, file.type);
    });
};