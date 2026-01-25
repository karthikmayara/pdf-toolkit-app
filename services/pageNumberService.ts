import { PageNumberSettings } from '../types';

export const addPageNumbers = async (
  file: File,
  settings: PageNumberSettings,
  onProgress: (progress: number, step: string) => void
): Promise<Blob> => {
  const { PDFDocument, StandardFonts, rgb } = window.PDFLib;

  onProgress(5, 'Loading document...');
  const arrayBuffer = await file.arrayBuffer();
  
  let pdfDoc;
  try {
      pdfDoc = await PDFDocument.load(arrayBuffer, { ignoreEncryption: true });
  } catch (e: any) {
      if (e.message && e.message.includes('Password')) {
           throw new Error("This PDF is password protected. Please unlock it first.");
      }
      throw new Error("Failed to load PDF. It might be corrupted.");
  }

  const helveticaFont = await pdfDoc.embedFont(StandardFonts.Helvetica);
  const pages = pdfDoc.getPages();
  const totalPages = pages.length;

  // Safeguard check
  if (totalPages === 0) throw new Error("Document is empty.");

  const BATCH_SIZE = 50; // Process in chunks to prevent UI freeze
  
  // Calculate starting index
  // If skipFirst is true, we start processing at index 1 (page 2)
  // But logical numbering depends on startFrom.
  // Usually if skipping cover, page 2 becomes "2" or "1"?
  // Standard behavior: Page 2 is "2", but visually printed on page 2.
  // Unless user sets startFrom.
  
  for (let i = 0; i < totalPages; i++) {
    // Skip cover page if requested
    if (settings.skipFirst && i === 0) continue;

    // Batching to prevent browser hang on 2000+ pages
    if (i % BATCH_SIZE === 0) {
        const progress = 10 + Math.round((i / totalPages) * 80);
        onProgress(progress, `Numbering page ${i + 1} of ${totalPages}...`);
        await new Promise(r => setTimeout(r, 0));
    }

    const page = pages[i];
    const { width, height } = page.getSize();
    
    // Determine the text to print
    // Logical number: (i + 1) if normal.
    // If we want to restart numbering after cover, the user should adjust 'startFrom'.
    // Here we strictly follow: printedNumber = (i + 1) - (offset if any) + (startFrom - 1)
    // Actually simplicity is best: The number printed corresponds to the PDF page index + 1, adjusted by startFrom diff.
    // If startFrom is 1, page 1 is "1".
    // If startFrom is 5, page 1 is "5".
    const pageNum = i + settings.startFrom; 
    
    let text = `${pageNum}`;
    if (settings.format === 'page-n') text = `Page ${pageNum}`;
    if (settings.format === 'n-of-total') text = `${pageNum} of ${totalPages + settings.startFrom - 1}`; // Adjust total if offset? simplified to doc length.
    if (settings.format === 'page-n-of-total') text = `Page ${pageNum} of ${totalPages + settings.startFrom - 1}`;
    
    // Measure text width to center it
    const textWidth = helveticaFont.widthOfTextAtSize(text, settings.fontSize);
    const textHeight = helveticaFont.heightAtSize(settings.fontSize);

    // Calculate Coordinates
    let x = 0;
    let y = 0;
    const margin = settings.margin;

    // X-Axis
    if (settings.position.includes('left')) {
        x = margin;
    } else if (settings.position.includes('right')) {
        x = width - margin - textWidth;
    } else { // center
        x = (width / 2) - (textWidth / 2);
    }

    // Y-Axis (0 is bottom in PDF)
    if (settings.position.includes('top')) {
        y = height - margin - textHeight;
    } else { // bottom
        y = margin;
    }

    page.drawText(text, {
        x,
        y,
        size: settings.fontSize,
        font: helveticaFont,
        color: rgb(0, 0, 0),
    });
  }

  onProgress(95, 'Saving document...');
  const pdfBytes = await pdfDoc.save();

  onProgress(100, 'Done');
  return new Blob([pdfBytes], { type: 'application/pdf' });
};
