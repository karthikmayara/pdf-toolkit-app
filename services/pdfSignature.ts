/**
 * Service to handle PDF rendering for the Signature Tool
 * and embedding the final signature into the PDF
 */

export interface RenderedPage {
  blob: Blob;
  width: number;
  height: number;
  originalWidth: number; // PDF point width
  originalHeight: number; // PDF point height
}

export interface SignaturePlacement {
  pageIndex: number;
  x: number; // Percentage 0-100
  y: number; // Percentage 0-100
  w: number; // Percentage 0-100
  h: number; // Percentage 0-100
}

// 1. Render a specific page of a PDF to a High-Res Image for the UI
export const renderPdfPage = async (file: File, pageIndex: number, password?: string): Promise<RenderedPage> => {
  const pdfjs = window.pdfjsLib;
  const url = URL.createObjectURL(file);

  try {
    // Pass password if provided
    const loadingTask = pdfjs.getDocument({ url, password });
    const pdf = await loadingTask.promise;
    const page = await pdf.getPage(pageIndex + 1); // PDF.js is 1-indexed

    const viewport = page.getViewport({ scale: 2.0 }); // 2x scale for sharp rendering on canvas
    
    const canvas = document.createElement('canvas');
    canvas.width = viewport.width;
    canvas.height = viewport.height;
    
    const ctx = canvas.getContext('2d');
    if (!ctx) throw new Error("Canvas context failed");

    await page.render({ canvasContext: ctx, viewport }).promise;

    return new Promise((resolve, reject) => {
        canvas.toBlob((blob) => {
            if (!blob) return reject("Failed to render page");
            
            // Get original dimensions for coordinate mapping
            const originalViewport = page.getViewport({ scale: 1.0 });
            
            resolve({
                blob,
                width: viewport.width,
                height: viewport.height,
                originalWidth: originalViewport.width,
                originalHeight: originalViewport.height
            });
        }, 'image/jpeg', 0.8);
    });

  } catch (error: any) {
    if (error.name === 'PasswordException') {
      throw new Error('PASSWORD_REQUIRED');
    }
    throw error;
  } finally {
    URL.revokeObjectURL(url);
  }
};

// 2. Embed the Signature Images into the PDF (Bulk Operation)
export const embedSignatures = async (
  file: File,
  signatureBlob: Blob,
  placements: SignaturePlacement[],
  password?: string
): Promise<Blob> => {
  const { PDFDocument } = window.PDFLib;
  
  const arrayBuffer = await file.arrayBuffer();
  
  // Load with password if necessary, handle encryption gracefully
  let pdfDoc;
  try {
      pdfDoc = await PDFDocument.load(arrayBuffer, { password, ignoreEncryption: !password });
  } catch (e) {
      // If load fails and we have a password, try again or throw
      if (!password) throw new Error('PASSWORD_REQUIRED');
      throw e;
  }
  
  const signatureBuffer = await signatureBlob.arrayBuffer();
  const signatureImage = await pdfDoc.embedPng(signatureBuffer); // We assume signature is always PNG (transparency)

  const pages = pdfDoc.getPages();

  for (const p of placements) {
     if (p.pageIndex >= pages.length) continue;
     
     const page = pages[p.pageIndex];
     const { width: pageWidth, height: pageHeight } = page.getSize();
     
     // Convert percentages to PDF points
     const x = (p.x / 100) * pageWidth;
     const yTop = (p.y / 100) * pageHeight; // Distance from top
     const w = (p.w / 100) * pageWidth;
     
     // Calculate Height based on aspect ratio of the placement box
     // Note: The UI maintains aspect ratio, so we can calculate height from percentage relative to page or maintain source image aspect.
     // In SignTool, 'h' is percentage of PAGE HEIGHT.
     const h = (p.h / 100) * pageHeight;

     // PDF Coordinate System: (0,0) is bottom-left.
     // We need to calculate y from bottom.
     // y = height - (yFromTop + heightOfImage)
     const y = pageHeight - yTop - h;

     page.drawImage(signatureImage, {
       x: x,
       y: y,
       width: w,
       height: h,
     });
  }

  const pdfBytes = await pdfDoc.save();
  return new Blob([pdfBytes], { type: 'application/pdf' });
};

// Helper to get total pages
export const getPdfPageCount = async (file: File, password?: string): Promise<number> => {
   const pdfjs = window.pdfjsLib;
   const url = URL.createObjectURL(file);
   try {
     const loadingTask = pdfjs.getDocument({ url, password });
     const pdf = await loadingTask.promise;
     return pdf.numPages;
   } catch (error: any) {
     if (error.name === 'PasswordException') throw new Error('PASSWORD_REQUIRED');
     throw error;
   } finally {
     URL.revokeObjectURL(url);
   }
};