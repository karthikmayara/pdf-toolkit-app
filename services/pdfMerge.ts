/**
 * Service for PDF Merging Operations
 */

// Helper to get page count without full parsing
export const getPageCount = async (file: File): Promise<number> => {
  const pdfjs = window.pdfjsLib;
  const url = URL.createObjectURL(file);
  try {
    const loadingTask = pdfjs.getDocument(url);
    const pdf = await loadingTask.promise;
    return pdf.numPages;
  } catch (e) {
    console.error("Failed to count pages", e);
    return 0;
  } finally {
    URL.revokeObjectURL(url);
  }
};

export interface MergeResult {
  blob: Blob;
  errors: string[];
}

export const mergePDFs = async (
  files: File[],
  onProgress: (progress: number, step: string) => void
): Promise<MergeResult> => {
  const { PDFDocument } = window.PDFLib;
  
  onProgress(5, 'Initializing PDF engine...');
  const mergedPdf = await PDFDocument.create();
  
  const totalFiles = files.length;
  const errors: string[] = [];
  let successCount = 0;

  for (let i = 0; i < totalFiles; i++) {
    const file = files[i];
    const progress = Math.round(((i) / totalFiles) * 80) + 10; // 10% to 90%
    onProgress(progress, `Processing file ${i + 1} of ${totalFiles}: ${file.name}`);

    try {
      const arrayBuffer = await file.arrayBuffer();
      // Try to load the document
      const pdf = await PDFDocument.load(arrayBuffer, { ignoreEncryption: true }); // Attempt to load, will throw if truly encrypted/password locked
      
      const copiedPages = await mergedPdf.copyPages(pdf, pdf.getPageIndices());
      
      if (copiedPages.length === 0) {
        throw new Error("No pages found in document");
      }

      copiedPages.forEach((page: any) => mergedPdf.addPage(page));
      successCount++;
      
      // Garbage collection pause for large merges
      if (i % 3 === 0) await new Promise(r => setTimeout(r, 10));

    } catch (error: any) {
      console.error(`Error merging file ${file.name}:`, error);
      let msg = `${file.name}: Failed to process.`;
      
      // Attempt to identify password error
      if (error.message && error.message.toLowerCase().includes('password')) {
        msg = `${file.name}: Password protected. Please unlock first.`;
      } else if (error.message && error.message.toLowerCase().includes('encrypt')) {
        msg = `${file.name}: Encrypted document.`;
      } else if (error.message) {
         msg = `${file.name}: ${error.message}`;
      }
      
      errors.push(msg);
    }
  }

  if (successCount === 0) {
    throw new Error("Failed to merge any files. All selected files were corrupted or password protected.");
  }

  onProgress(95, 'Finalizing merged document...');
  const mergedBytes = await mergedPdf.save();
  
  onProgress(100, 'Done');
  return {
    blob: new Blob([mergedBytes], { type: 'application/pdf' }),
    errors
  };
};