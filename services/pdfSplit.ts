
/**
 * Service for PDF Splitting Operations
 */

// Helper: Convert "1-5, 8" string to Set of 0-based indices
export const parsePageRange = (rangeStr: string, totalPages: number): Set<number> => {
  const result = new Set<number>();
  const parts = rangeStr.split(',');
  
  parts.forEach(part => {
    const trimmed = part.trim();
    if (trimmed.includes('-')) {
      const [start, end] = trimmed.split('-').map(n => parseInt(n, 10));
      if (!isNaN(start) && !isNaN(end)) {
        // Clamp and handle reverse ranges (5-1)
        const s = Math.max(1, Math.min(start, totalPages));
        const e = Math.max(1, Math.min(end, totalPages));
        const low = Math.min(s, e);
        const high = Math.max(s, e);
        
        for (let i = low; i <= high; i++) {
          result.add(i - 1);
        }
      }
    } else {
      const p = parseInt(trimmed, 10);
      if (!isNaN(p) && p >= 1 && p <= totalPages) {
        result.add(p - 1);
      }
    }
  });
  return result;
};

// Helper: Convert Set of 0-based indices to "1-3, 5" string
export const rangeSetToString = (set: Set<number>): string => {
  const sorted = Array.from(set).map(i => i + 1).sort((a, b) => a - b);
  if (sorted.length === 0) return '';

  const ranges: string[] = [];
  let rangeStart = sorted[0];
  let prev = sorted[0];

  for (let i = 1; i < sorted.length; i++) {
    const curr = sorted[i];
    if (curr !== prev + 1) {
      // Range break
      if (rangeStart === prev) ranges.push(`${rangeStart}`);
      else ranges.push(`${rangeStart}-${prev}`);
      rangeStart = curr;
    }
    prev = curr;
  }

  // Final range
  if (rangeStart === prev) ranges.push(`${rangeStart}`);
  else ranges.push(`${rangeStart}-${prev}`);

  return ranges.join(', ');
};

export const splitPDF = async (
  file: File,
  pagesToKeep: Set<number>, // 0-based indices of pages to INCUDE in result
  onProgress: (progress: number, step: string) => void
): Promise<Blob> => {
  if (!window.PDFLib) {
    throw new Error("PDF libraries not loaded. Please check your internet connection.");
  }

  const { PDFDocument } = window.PDFLib;
  
  if (pagesToKeep.size === 0) throw new Error("No pages selected to keep.");

  onProgress(10, 'Loading PDF...');
  const arrayBuffer = await file.arrayBuffer();
  
  // Load original
  const srcDoc = await PDFDocument.load(arrayBuffer);
  const totalPages = srcDoc.getPageCount();

  // Validate indices
  const validIndices = Array.from(pagesToKeep)
    .filter(i => i >= 0 && i < totalPages)
    .sort((a, b) => a - b);

  if (validIndices.length === 0) throw new Error("Invalid page selection.");

  onProgress(30, 'Creating new document...');
  const newDoc = await PDFDocument.create();

  // Copy metadata
  newDoc.setCreator('PDF Toolkit Pro');
  newDoc.setProducer('PDF Toolkit Pro');

  onProgress(50, `Extracting ${validIndices.length} pages...`);
  
  // Copy pages in batches to prevent UI freeze if selecting 1000 pages
  const batchSize = 50;
  const copiedPages = [];
  
  for (let i = 0; i < validIndices.length; i += batchSize) {
     const batch = validIndices.slice(i, i + batchSize);
     const pages = await newDoc.copyPages(srcDoc, batch);
     pages.forEach(p => newDoc.addPage(p));
     
     // Yield to UI
     await new Promise(r => setTimeout(r, 0));
  }

  onProgress(90, 'Saving file...');
  const pdfBytes = await newDoc.save();

  onProgress(100, 'Done');
  return new Blob([pdfBytes], { type: 'application/pdf' });
};

// Render thumbnail for UI (Low Quality for Speed)
export const renderThumbnail = async (file: File, pageIndex: number): Promise<string> => {
    // Note: Implementation intentionally minimal for logic separation
    return ""; 
};
