/**
 * Service for PDF Insert Operations
 */

export interface InsertResult {
  blob: Blob;
}

export interface InsertPageOptions {
  insertMode: 'before' | 'after';
  insertAt: number; // 1-based page number in base PDF
  sourcePage: number; // 1-based page number in insert PDF
  useBlankPage: boolean;
}

const getInsertIndex = (insertMode: InsertPageOptions['insertMode'], insertAt: number) => {
  if (insertMode === 'before') {
    return Math.max(0, insertAt - 1);
  }
  return Math.max(0, insertAt);
};

export const insertPageIntoPDF = async (
  baseFile: File,
  insertFile: File | null,
  options: InsertPageOptions,
  onProgress: (progress: number, step: string) => void
): Promise<InsertResult> => {
  if (!window.PDFLib) {
    throw new Error('PDF libraries not loaded. Please check your internet connection.');
  }

  const { PDFDocument } = window.PDFLib;

  onProgress(5, 'Loading base PDF...');
  const baseBuffer = await baseFile.arrayBuffer();
  const baseDoc = await PDFDocument.load(baseBuffer, { ignoreEncryption: true });
  const basePageCount = baseDoc.getPageCount();

  const insertAt = Math.min(Math.max(options.insertAt, 1), basePageCount);
  const insertIndex = getInsertIndex(options.insertMode, insertAt);

  if (options.useBlankPage) {
    onProgress(40, 'Creating blank page...');
    const firstPage = baseDoc.getPage(0);
    const { width, height } = firstPage.getSize();
    baseDoc.insertPage(insertIndex, [width, height]);
  } else {
    if (!insertFile) {
      throw new Error('Insert PDF is missing.');
    }

    onProgress(30, 'Loading insert PDF...');
    const insertBuffer = await insertFile.arrayBuffer();
    const insertDoc = await PDFDocument.load(insertBuffer, { ignoreEncryption: true });
    const insertPageCount = insertDoc.getPageCount();

    const sourceIndex = Math.min(Math.max(options.sourcePage, 1), insertPageCount) - 1;

    onProgress(60, 'Copying page...');
    const [page] = await baseDoc.copyPages(insertDoc, [sourceIndex]);
    baseDoc.insertPage(insertIndex, page);
  }

  onProgress(90, 'Saving document...');
  const pdfBytes = await baseDoc.save();

  onProgress(100, 'Done');
  return {
    blob: new Blob([pdfBytes], { type: 'application/pdf' })
  };
};
