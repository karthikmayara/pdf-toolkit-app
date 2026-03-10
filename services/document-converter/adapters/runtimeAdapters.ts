/**
 * Typed runtime accessors for CDN-injected libraries.
 * These helpers centralize existence checks so conversion modules remain cleaner.
 */

export interface PdfJsLib {
  getDocument: (params: { data: ArrayBuffer }) => { promise: Promise<any> };
}

export interface PdfLibApi {
  PDFDocument: { create: () => Promise<any> };
  StandardFonts: { Helvetica: string };
  rgb: (r: number, g: number, b: number) => any;
}

export interface XlsxApi {
  utils: {
    book_new: () => any;
    aoa_to_sheet: (rows: string[][]) => any;
    book_append_sheet: (wb: any, ws: any, name: string) => void;
    sheet_to_csv: (sheet: any) => string;
  };
  write: (wb: any, opts: { bookType: string; type: string }) => ArrayBuffer;
  read: (data: ArrayBuffer, opts: { type: string }) => { SheetNames: string[]; Sheets: Record<string, any> };
}

export const getPdfJs = (): PdfJsLib => {
  if (!window.pdfjsLib) throw new Error('PDF.js is not loaded. Please check internet connection and refresh.');
  return window.pdfjsLib as PdfJsLib;
};

export const getPdfLib = (): PdfLibApi => {
  if (!window.PDFLib) throw new Error('PDF-Lib is not loaded. Please refresh with internet.');
  return window.PDFLib as PdfLibApi;
};

export const getXlsx = (): XlsxApi => {
  if (!window.XLSX) throw new Error('XLSX library is not loaded. Please refresh with internet.');
  return window.XLSX as XlsxApi;
};

export const getDocx = (): any => {
  if (!window.docx) throw new Error('DOCX library is not loaded. Please refresh with internet.');
  return window.docx;
};

export const getPptxGen = (): any => {
  if (!window.PptxGenJS) throw new Error('PPTX library is not loaded. Please refresh with internet.');
  return window.PptxGenJS;
};

export const getMammoth = (): any => {
  if (!window.mammoth) throw new Error('Mammoth library is not loaded.');
  return window.mammoth;
};

export const getJsZip = (): any => {
  if (!window.JSZip) throw new Error('JSZip library is not loaded.');
  return window.JSZip;
};
