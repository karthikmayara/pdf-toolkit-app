export type DocumentTargetFormat =
  | 'application/pdf'
  | 'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
  | 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
  | 'application/vnd.openxmlformats-officedocument.presentationml.presentation';

export interface DocumentConversionItem {
  file: File;
  targetFormat: DocumentTargetFormat;
}

interface ConversionResult {
  blob: Blob;
  filename: string;
}

type DocumentFamily = 'pdf' | 'docx' | 'xlsx' | 'pptx' | 'unknown';

/**
 * Human-readable reason for unsupported format pairs.
 * The current tool intentionally supports PDF <-> Office flows.
 */
export const getUnsupportedPairReason = (
  sourceMime: string,
  targetMime: DocumentTargetFormat
): string | null => {
  const source = getDocumentFamily(sourceMime);
  const target = getDocumentFamily(targetMime);

  if (source === 'unknown' || target === 'unknown') {
    return 'Unsupported file type. Use PDF, DOCX, XLSX, or PPTX.';
  }

  if (source === target) {
    return 'Source and target formats are the same. Choose a different target format.';
  }

  // This tool supports only pairs that include PDF.
  if (source !== 'pdf' && target !== 'pdf') {
    if (source === 'pptx' && target === 'xlsx') {
      return 'Direct PPTX → XLSX is not supported because slides are free-form, while Excel requires tabular structure. Convert PPTX → PDF first, then PDF → XLSX.';
    }

    if (source === 'pptx' && target === 'docx') {
      return 'Direct PPTX → DOCX is not supported in this tool. Convert PPTX → PDF first, then PDF → DOCX.';
    }

    return 'Direct Office-to-Office conversion is not supported in this tool. Use PDF as a bridge (Office → PDF, then PDF → Office).';
  }

  return null;
};

/**
 * Conversion entry point for Office <-> PDF conversion.
 *
 * Notes:
 * - Browser-only implementation (no backend).
 * - Focuses on text/content extraction and regeneration.
 */
export const convertDocument = async (
  item: DocumentConversionItem,
  onProgress: (progress: number, step: string) => void
): Promise<ConversionResult> => {
  const pairIssue = getUnsupportedPairReason(item.file.type, item.targetFormat);
  if (pairIssue) {
    throw new Error(pairIssue);
  }

  const sourceType = item.file.type;

  if (sourceType === 'application/pdf') {
    onProgress(20, 'Extracting text from PDF...');
    const pagesText = await extractTextFromPdf(item.file);

    onProgress(60, 'Generating output document...');
    if (item.targetFormat.includes('wordprocessingml')) {
      const blob = await generateDocxFromPages(pagesText);
      return { blob, filename: renameExtension(item.file.name, 'docx') };
    }

    if (item.targetFormat.includes('spreadsheetml')) {
      const blob = await generateXlsxFromPages(pagesText);
      return { blob, filename: renameExtension(item.file.name, 'xlsx') };
    }

    if (item.targetFormat.includes('presentationml')) {
      const blob = await generatePptxFromPages(pagesText);
      return { blob, filename: renameExtension(item.file.name, 'pptx') };
    }
  }

  onProgress(25, 'Extracting text from source file...');
  const text = await extractTextFromOfficeFile(item.file);

  onProgress(60, 'Generating PDF...');
  const blob = await generatePdfFromText(text);
  return { blob, filename: renameExtension(item.file.name, 'pdf') };
};

const getDocumentFamily = (mime: string): DocumentFamily => {
  if (mime === 'application/pdf') return 'pdf';
  if (mime.includes('wordprocessingml')) return 'docx';
  if (mime.includes('spreadsheetml')) return 'xlsx';
  if (mime.includes('presentationml')) return 'pptx';
  return 'unknown';
};

const renameExtension = (name: string, ext: string) => {
  const base = name.includes('.') ? name.slice(0, name.lastIndexOf('.')) : name;
  return `${base}.${ext}`;
};

const extractTextFromPdf = async (file: File): Promise<string[]> => {
  if (!window.pdfjsLib) throw new Error('PDF.js is not loaded. Please check internet connection and refresh.');

  const buffer = await file.arrayBuffer();
  const pdf = await window.pdfjsLib.getDocument({ data: buffer }).promise;
  const pages: string[] = [];

  for (let i = 1; i <= pdf.numPages; i++) {
    const page = await pdf.getPage(i);
    const content = await page.getTextContent();
    const text = content.items.map((x: any) => x.str).join(' ').replace(/\s+/g, ' ').trim();
    pages.push(text || `(Page ${i} had no extractable text)`);
  }

  return pages;
};

const generateDocxFromPages = async (pages: string[]): Promise<Blob> => {
  if (!window.docx) throw new Error('DOCX library is not loaded. Please refresh with internet.');

  const doc = new window.docx.Document({
    sections: pages.map((pageText, index) => ({
      properties: {},
      children: [
        new window.docx.Paragraph({ children: [new window.docx.TextRun({ text: `Page ${index + 1}`, bold: true })] }),
        new window.docx.Paragraph({ text: pageText }),
      ]
    }))
  });

  return window.docx.Packer.toBlob(doc);
};

const generateXlsxFromPages = async (pages: string[]): Promise<Blob> => {
  if (!window.XLSX) throw new Error('XLSX library is not loaded. Please refresh with internet.');

  const rows: string[][] = [['Page', 'Extracted Text']];
  pages.forEach((text, index) => rows.push([String(index + 1), text]));

  const wb = window.XLSX.utils.book_new();
  const ws = window.XLSX.utils.aoa_to_sheet(rows);
  window.XLSX.utils.book_append_sheet(wb, ws, 'PDF Text');

  const out = window.XLSX.write(wb, { bookType: 'xlsx', type: 'array' });
  return new Blob([out], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
};

const generatePptxFromPages = async (pages: string[]): Promise<Blob> => {
  if (!window.PptxGenJS) throw new Error('PPTX library is not loaded. Please refresh with internet.');

  const pptx = new window.PptxGenJS();
  pptx.layout = 'LAYOUT_WIDE';

  pages.forEach((text, index) => {
    const slide = pptx.addSlide();
    slide.addText(`Page ${index + 1}`, { x: 0.5, y: 0.3, w: 12, h: 0.5, bold: true, fontSize: 24 });
    slide.addText(text || '(No extractable text)', { x: 0.5, y: 1.1, w: 12, h: 5.5, fontSize: 14, breakLine: true });
  });

  const buffer = await pptx.write({ outputType: 'arraybuffer' });
  return new Blob([buffer], { type: 'application/vnd.openxmlformats-officedocument.presentationml.presentation' });
};

const extractTextFromOfficeFile = async (file: File): Promise<string> => {
  const buffer = await file.arrayBuffer();

  if (file.type.includes('wordprocessingml')) {
    if (!window.mammoth) throw new Error('Mammoth library is not loaded.');
    const result = await window.mammoth.extractRawText({ arrayBuffer: buffer });
    return result.value || 'No text found in DOCX file.';
  }

  if (file.type.includes('spreadsheetml')) {
    if (!window.XLSX) throw new Error('XLSX library is not loaded.');
    const wb = window.XLSX.read(buffer, { type: 'array' });
    return wb.SheetNames.map((sheetName: string) => {
      const csv = window.XLSX.utils.sheet_to_csv(wb.Sheets[sheetName]);
      return `Sheet: ${sheetName}\n${csv}`;
    }).join('\n\n');
  }

  if (file.type.includes('presentationml')) {
    if (!window.JSZip) throw new Error('JSZip library is not loaded.');
    const zip = await window.JSZip.loadAsync(buffer);

    const slidePaths = Object.keys(zip.files)
      .filter(path => /^ppt\/slides\/slide\d+\.xml$/.test(path))
      .sort((a, b) => Number(a.match(/slide(\d+)\.xml/)?.[1] || 0) - Number(b.match(/slide(\d+)\.xml/)?.[1] || 0));

    const textChunks: string[] = [];
    for (const path of slidePaths) {
      const xml = await zip.files[path].async('text');
      const matches = [...xml.matchAll(/<a:t>(.*?)<\/a:t>/g)].map(m => m[1]);
      textChunks.push(matches.join(' '));
    }

    return textChunks.join('\n\n') || 'No text found in PPTX file.';
  }

  throw new Error('Unsupported office input. Use DOCX, XLSX or PPTX.');
};

const generatePdfFromText = async (text: string): Promise<Blob> => {
  if (!window.PDFLib) throw new Error('PDF-Lib is not loaded. Please refresh with internet.');

  const { PDFDocument, StandardFonts, rgb } = window.PDFLib;
  const pdfDoc = await PDFDocument.create();
  const font = await pdfDoc.embedFont(StandardFonts.Helvetica);

  const pageSize = { width: 595, height: 842 };
  const margin = 40;
  const fontSize = 11;
  const lineHeight = 14;
  const maxWidth = pageSize.width - margin * 2;
  const maxLinesPerPage = Math.floor((pageSize.height - margin * 2) / lineHeight);
  const wrapped = wrapText(text || 'No text extracted from input file.', font, fontSize, maxWidth);

  for (let i = 0; i < wrapped.length; i += maxLinesPerPage) {
    const page = pdfDoc.addPage([pageSize.width, pageSize.height]);
    wrapped.slice(i, i + maxLinesPerPage).forEach((line, idx) => {
      page.drawText(line, { x: margin, y: pageSize.height - margin - idx * lineHeight, size: fontSize, font, color: rgb(0, 0, 0) });
    });
  }

  const bytes = await pdfDoc.save();
  return new Blob([bytes], { type: 'application/pdf' });
};

const wrapText = (text: string, font: any, fontSize: number, maxWidth: number): string[] => {
  const lines: string[] = [];

  text.split(/\r?\n/).forEach((paragraph) => {
    const words = paragraph.split(/\s+/).filter(Boolean);
    let current = '';

    words.forEach((word) => {
      const candidate = current ? `${current} ${word}` : word;
      if (font.widthOfTextAtSize(candidate, fontSize) <= maxWidth) current = candidate;
      else {
        if (current) lines.push(current);
        current = word;
      }
    });

    if (current) lines.push(current);
    if (words.length === 0) lines.push('');
  });

  return lines;
};
