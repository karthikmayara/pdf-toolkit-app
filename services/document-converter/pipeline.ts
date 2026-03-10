import {
  getDocx,
  getJsZip,
  getMammoth,
  getPdfJs,
  getPdfLib,
  getPptxGen,
  getXlsx,
} from './adapters/runtimeAdapters';
import { inferExcelRows } from './heuristics/excelInference';
import { inferHeading } from './heuristics/headingInference';
import { groupItemsIntoLines, PdfTextItem } from './heuristics/lineGrouping';
import { wrapText } from './heuristics/textWrap';
import { ConversionResult, ConversionRunOptions, DocumentConversionItem } from './types';
import { detectDocumentFamily, getUnsupportedPairReason } from './validators';

interface PageText {
  lines: string[];
  flatText: string;
}

const renameExtension = (name: string, ext: string) => {
  const base = name.includes('.') ? name.slice(0, name.lastIndexOf('.')) : name;
  return `${base}.${ext}`;
};

const throwIfAborted = (signal?: AbortSignal) => {
  if (signal?.aborted) {
    throw new Error('Conversion cancelled.');
  }
};

const extractPdfPages = async (file: File, signal?: AbortSignal): Promise<PageText[]> => {
  const pdfJs = getPdfJs();
  const buffer = await file.arrayBuffer();
  throwIfAborted(signal);

  const pdf = await pdfJs.getDocument({ data: buffer }).promise;
  const pages: PageText[] = [];

  for (let i = 1; i <= pdf.numPages; i++) {
    throwIfAborted(signal);
    const page = await pdf.getPage(i);
    const content = await page.getTextContent();
    const lines = groupItemsIntoLines((content.items || []) as PdfTextItem[]);

    pages.push({
      lines,
      flatText: lines.join('\n') || `(Page ${i} had no extractable text)`,
    });
  }

  return pages;
};

const generateDocxFromPages = async (pages: PageText[], signal?: AbortSignal): Promise<Blob> => {
  const docx = getDocx();
  throwIfAborted(signal);

  const sections = pages.map((page, index) => {
    const sourceLines = page.lines.length ? page.lines : page.flatText.split(/\r?\n/);
    const children = [
      new docx.Paragraph({
        children: [new docx.TextRun({ text: `Page ${index + 1}`, bold: true })],
      }),
    ];

    sourceLines.forEach((line) => {
      children.push(
        new docx.Paragraph({
          heading: inferHeading(line) ? docx.HeadingLevel.HEADING_2 : undefined,
          children: [new docx.TextRun({ text: line })],
        })
      );
    });

    return { properties: {}, children };
  });

  const doc = new docx.Document({ sections });
  return docx.Packer.toBlob(doc);
};

const generateXlsxFromPages = async (pages: PageText[], signal?: AbortSignal): Promise<Blob> => {
  const xlsx = getXlsx();
  throwIfAborted(signal);

  const wb = xlsx.utils.book_new();

  pages.forEach((page, index) => {
    const rows = inferExcelRows(page.lines.length ? page.lines : [page.flatText]);
    const ws = xlsx.utils.aoa_to_sheet(rows);
    xlsx.utils.book_append_sheet(wb, ws, `Page_${index + 1}`);
  });

  const out = xlsx.write(wb, { bookType: 'xlsx', type: 'array' });
  return new Blob([out], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
};

const generatePptxFromPages = async (pages: PageText[], signal?: AbortSignal): Promise<Blob> => {
  const PptxGenJS = getPptxGen();
  throwIfAborted(signal);

  const pptx = new PptxGenJS();
  pptx.layout = 'LAYOUT_WIDE';

  pages.forEach((page, index) => {
    const slide = pptx.addSlide();
    slide.addText(`Page ${index + 1}`, { x: 0.5, y: 0.3, w: 12, h: 0.6, bold: true, fontSize: 24 });
    slide.addText(page.flatText || '(No extractable text)', {
      x: 0.5,
      y: 1.1,
      w: 12,
      h: 5.5,
      fontSize: 14,
      breakLine: true,
    });
  });

  const buffer = await pptx.write({ outputType: 'arraybuffer' });
  return new Blob([buffer], { type: 'application/vnd.openxmlformats-officedocument.presentationml.presentation' });
};

const extractTextFromOfficeFile = async (file: File, signal?: AbortSignal): Promise<string> => {
  const buffer = await file.arrayBuffer();
  throwIfAborted(signal);

  if (file.type.includes('wordprocessingml') || file.name.toLowerCase().endsWith('.docx')) {
    const mammoth = getMammoth();
    const result = await mammoth.extractRawText({ arrayBuffer: buffer });
    return result.value || 'No text found in DOCX file.';
  }

  if (file.type.includes('spreadsheetml') || file.name.toLowerCase().endsWith('.xlsx')) {
    const xlsx = getXlsx();
    const wb = xlsx.read(buffer, { type: 'array' });
    return wb.SheetNames.map((sheetName: string) => {
      const csv = xlsx.utils.sheet_to_csv(wb.Sheets[sheetName]);
      return `Sheet: ${sheetName}\n${csv}`;
    }).join('\n\n');
  }

  if (file.type.includes('presentationml') || file.name.toLowerCase().endsWith('.pptx')) {
    const JSZip = getJsZip();
    const zip = await JSZip.loadAsync(buffer);
    const slidePaths = Object.keys(zip.files)
      .filter((path) => /^ppt\/slides\/slide\d+\.xml$/.test(path))
      .sort((a, b) => Number(a.match(/slide(\d+)\.xml/)?.[1] || 0) - Number(b.match(/slide(\d+)\.xml/)?.[1] || 0));

    const chunks: string[] = [];
    for (const path of slidePaths) {
      throwIfAborted(signal);
      const xml = await zip.files[path].async('text');
      const matches = [...xml.matchAll(/<a:t>(.*?)<\/a:t>/g)].map((m) => m[1]);
      chunks.push(matches.join(' '));
    }

    return chunks.join('\n\n') || 'No text found in PPTX file.';
  }

  throw new Error('Unsupported office input. Use DOCX, XLSX or PPTX.');
};

const generatePdfFromText = async (text: string, signal?: AbortSignal): Promise<Blob> => {
  const pdfApi = getPdfLib();
  const { PDFDocument, StandardFonts, rgb } = pdfApi;

  const pdfDoc = await PDFDocument.create();
  const font = await pdfDoc.embedFont(StandardFonts.Helvetica);
  throwIfAborted(signal);

  const pageSize = { width: 595, height: 842 };
  const margin = 40;
  const fontSize = 11;
  const lineHeight = 14;
  const maxWidth = pageSize.width - margin * 2;
  const maxLines = Math.floor((pageSize.height - margin * 2) / lineHeight);
  const lines = wrapText(text || 'No text extracted from input file.', font, fontSize, maxWidth);

  for (let i = 0; i < lines.length; i += maxLines) {
    throwIfAborted(signal);
    const page = pdfDoc.addPage([pageSize.width, pageSize.height]);
    lines.slice(i, i + maxLines).forEach((line, idx) => {
      page.drawText(line, {
        x: margin,
        y: pageSize.height - margin - idx * lineHeight,
        size: fontSize,
        font,
        color: rgb(0, 0, 0),
      });
    });
  }

  const bytes = await pdfDoc.save();
  return new Blob([bytes], { type: 'application/pdf' });
};

/**
 * Orchestrates the document conversion flow for supported pairs.
 * Centralizing orchestration here allows cancellation and future worker execution.
 */
export const runDocumentConversion = async (
  item: DocumentConversionItem,
  options: ConversionRunOptions
): Promise<ConversionResult> => {
  const { onProgress, signal } = options;
  const pairIssue = getUnsupportedPairReason(item.file.type, item.targetFormat, item.file.name);
  if (pairIssue) throw new Error(pairIssue);

  const sourceFamily = detectDocumentFamily(item.file.type, item.file.name);

  if (sourceFamily === 'pdf') {
    onProgress(20, 'Extracting text from PDF...');
    const pages = await extractPdfPages(item.file, signal);

    onProgress(60, 'Generating output document...');
    if (item.targetFormat.includes('wordprocessingml')) {
      return {
        blob: await generateDocxFromPages(pages, signal),
        filename: renameExtension(item.file.name, 'docx'),
      };
    }

    if (item.targetFormat.includes('spreadsheetml')) {
      return {
        blob: await generateXlsxFromPages(pages, signal),
        filename: renameExtension(item.file.name, 'xlsx'),
      };
    }

    return {
      blob: await generatePptxFromPages(pages, signal),
      filename: renameExtension(item.file.name, 'pptx'),
    };
  }

  // Office input path (DOCX/XLSX/PPTX) supports only conversion to PDF.
  if (item.targetFormat !== 'application/pdf') {
    throw new Error('Only Office → PDF is supported for Office source files. Use PDF as an intermediate for Office → Office.');
  }

  onProgress(25, 'Extracting text from source file...');
  const text = await extractTextFromOfficeFile(item.file, signal);

  onProgress(60, 'Generating PDF...');
  return {
    blob: await generatePdfFromText(text, signal),
    filename: renameExtension(item.file.name, 'pdf'),
  };
};
