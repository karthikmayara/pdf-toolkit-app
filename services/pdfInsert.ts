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
  sourceType: 'pdf' | 'image' | 'blank';
  useBlankPage: boolean;
}

interface ContainRect {
  x: number;
  y: number;
  width: number;
  height: number;
  scale: number;
}

const getInsertIndex = (insertMode: InsertPageOptions['insertMode'], insertAt: number) => {
  if (insertMode === 'before') {
    return Math.max(0, insertAt - 1);
  }
  return Math.max(0, insertAt);
};

const getContainRect = (imgW: number, imgH: number, pageW: number, pageH: number): ContainRect => {
  const scale = Math.min(pageW / imgW, pageH / imgH);
  const width = imgW * scale;
  const height = imgH * scale;
  const x = (pageW - width) / 2;
  const y = (pageH - height) / 2;
  return { x, y, width, height, scale };
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
  if (basePageCount === 0) {
    throw new Error('Base PDF has no pages.');
  }

  const insertAt = Math.min(Math.max(options.insertAt, 1), basePageCount);
  const insertIndex = getInsertIndex(options.insertMode, insertAt);
  const referencePage = baseDoc.getPage(Math.min(insertAt - 1, basePageCount - 1));
  const { width: pageWidth, height: pageHeight } = referencePage.getSize();

  if (options.useBlankPage || options.sourceType === 'blank') {
    onProgress(40, 'Creating blank page...');
    baseDoc.insertPage(insertIndex, [pageWidth, pageHeight]);
  } else if (options.sourceType === 'image') {
    if (!insertFile) {
      throw new Error('Insert image is missing.');
    }

    onProgress(30, 'Embedding image...');
    const imageBytes = await insertFile.arrayBuffer();
    const isPng = insertFile.type === 'image/png';
    const isJpg = insertFile.type === 'image/jpeg';

    if (!isPng && !isJpg) {
      throw new Error('Only JPG and PNG images are supported.');
    }

    const embeddedImage = isPng
      ? await baseDoc.embedPng(imageBytes)
      : await baseDoc.embedJpg(imageBytes);

    const { width: imgW, height: imgH } = embeddedImage.scale(1);
    const { x, y, width, height } = getContainRect(imgW, imgH, pageWidth, pageHeight);

    onProgress(60, 'Placing image...');
    const page = baseDoc.insertPage(insertIndex, [pageWidth, pageHeight]);
    page.drawImage(embeddedImage, { x, y, width, height });
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
