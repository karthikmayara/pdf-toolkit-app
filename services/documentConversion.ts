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

export const FORMAT_PRESETS: { label: string; value: DocumentTargetFormat }[] = [
  { label: 'To PDF', value: 'application/pdf' },
  { label: 'To Word', value: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document' },
  { label: 'To Excel', value: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' },
  { label: 'To PowerPoint', value: 'application/vnd.openxmlformats-officedocument.presentationml.presentation' },
];

export const getCapabilityRows = () => [
  { pair: 'PDF → DOCX', status: 'Supported', note: 'Heading inference is applied for cleaner structure.' },
  { pair: 'PDF → XLSX', status: 'Supported', note: 'Local column/table inference is applied where possible.' },
  { pair: 'PDF → PPTX', status: 'Supported', note: 'One slide per source page with extracted text.' },
  { pair: 'DOCX/XLSX/PPTX → PDF', status: 'Supported', note: 'Text-first conversion to PDF.' },
  { pair: 'Office → Office', status: 'Not Supported', note: 'Use PDF as an intermediate step.' },
] as const;

export const getUnsupportedPairReason = (sourceMime: string, targetMime: DocumentTargetFormat): string | null => {
  const source = getDocumentFamily(sourceMime);
  const target = getDocumentFamily(targetMime);

  if (source === 'unknown' || target === 'unknown') {
    return 'Unsupported file type. Use PDF, DOCX, XLSX, or PPTX.';
  }

  if (source === target) {
    return 'Source and target formats are the same. Choose a different target format.';
  }

  // The converter intentionally supports only pairs that include PDF.
  if (source !== 'pdf' && target !== 'pdf') {
    if (source === 'pptx' && target === 'xlsx') {
      return 'Direct PPTX → XLSX is not supported because slides are free-form while Excel expects tabular structure. Use PPTX → PDF, then PDF → XLSX.';
    }

    if (source === 'pptx' && target === 'docx') {
      return 'Direct PPTX → DOCX is not supported in this tool. Use PPTX → PDF, then PDF → DOCX.';
    }

    return 'Direct Office-to-Office conversion is not supported. Use PDF as a bridge (Office → PDF, then PDF → Office).';
  }

  return null;
};

export const convertDocument = async (
  item: DocumentConversionItem,
  onProgress: (progress: number, step: string) => void
): Promise<ConversionResult> => {
  const pairIssue = getUnsupportedPairReason(item.file.type, item.targetFormat);
  if (pairIssue) throw new Error(pairIssue);

  const sourceFamily = getDocumentFamily(item.file.type);

  if (sourceFamily === 'pdf') {
    onProgress(20, 'Extracting text from PDF...');
    const pages = await extractPdfPages(item.file);

    onProgress(60, 'Generating output document...');
    if (item.targetFormat.includes('wordprocessingml')) {
      return {
        blob: await generateDocxFromPages(pages),
        filename: renameExtension(item.file.name, 'docx'),
      };
    }

    if (item.targetFormat.includes('spreadsheetml')) {
      return {
        blob: await generateXlsxFromPages(pages),
        filename: renameExtension(item.file.name, 'xlsx'),
      };
    }

    return {
      blob: await generatePptxFromPages(pages),
      filename: renameExtension(item.file.name, 'pptx'),
    };
  }

  // Office input path (DOCX/XLSX/PPTX) supports only conversion to PDF.
  if (item.targetFormat !== 'application/pdf') {
    throw new Error('Only Office → PDF is supported for Office source files. Use PDF as an intermediate for Office → Office.');
  }

  onProgress(25, 'Extracting text from source file...');
  const text = await extractTextFromOfficeFile(item.file);

  onProgress(60, 'Generating PDF...');
  return {
    blob: await generatePdfFromText(text),
    filename: renameExtension(item.file.name, 'pdf'),
  };
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

const extractPdfPages = async (file: File): Promise<{ lines: string[]; flatText: string }[]> => {
  if (!window.pdfjsLib) throw new Error('PDF.js is not loaded. Please check internet connection and refresh.');

  const buffer = await file.arrayBuffer();
  const pdf = await window.pdfjsLib.getDocument({ data: buffer }).promise;
  const pages: { lines: string[]; flatText: string }[] = [];

  for (let i = 1; i <= pdf.numPages; i++) {
    const page = await pdf.getPage(i);
    const content = await page.getTextContent();
    const lines = groupItemsIntoLines(content.items || []);
    pages.push({
      lines,
      flatText: lines.join('\n') || `(Page ${i} had no extractable text)`,
    });
  }

  return pages;
};

const groupItemsIntoLines = (items: any[]): string[] => {
  const sorted = [...items].sort((a, b) => {
    const ay = Number(a.transform?.[5] || 0);
    const by = Number(b.transform?.[5] || 0);
    if (Math.abs(by - ay) > 2) return by - ay;
    const ax = Number(a.transform?.[4] || 0);
    const bx = Number(b.transform?.[4] || 0);
    return ax - bx;
  });

  const lines: string[] = [];
  let currentY: number | null = null;
  let currentLine: string[] = [];

  sorted.forEach((item) => {
    const y = Number(item.transform?.[5] || 0);
    const text = String(item.str || '').trim();
    if (!text) return;

    if (currentY === null || Math.abs(currentY - y) <= 2) {
      currentY = currentY === null ? y : currentY;
      currentLine.push(text);
      return;
    }

    lines.push(currentLine.join(' ').replace(/\s+/g, ' ').trim());
    currentY = y;
    currentLine = [text];
  });

  if (currentLine.length) lines.push(currentLine.join(' ').replace(/\s+/g, ' ').trim());
  return lines.filter(Boolean);
};

const inferHeading = (line: string): boolean => {
  const isNumbered = /^(\d+\.|[IVX]+\.)\s+/.test(line);
  const isCaps = line === line.toUpperCase() && line.length <= 80 && line.length > 4;
  const isShort = line.length <= 60 && !/[.!?]$/.test(line);
  return isNumbered || isCaps || isShort;
};

const generateDocxFromPages = async (pages: { lines: string[]; flatText: string }[]): Promise<Blob> => {
  if (!window.docx) throw new Error('DOCX library is not loaded. Please refresh with internet.');

  const sections = pages.map((page, index) => {
    const sourceLines = page.lines.length ? page.lines : page.flatText.split(/\r?\n/);
    const children = [
      new window.docx.Paragraph({
        children: [new window.docx.TextRun({ text: `Page ${index + 1}`, bold: true })],
      }),
    ];

    sourceLines.forEach((line) => {
      children.push(
        new window.docx.Paragraph({
          heading: inferHeading(line) ? window.docx.HeadingLevel.HEADING_2 : undefined,
          children: [new window.docx.TextRun({ text: line })],
        })
      );
    });

    return { properties: {}, children };
  });

  const doc = new window.docx.Document({ sections });
  return window.docx.Packer.toBlob(doc);
};

const splitLineAsColumns = (line: string): string[] => {
  if (line.includes('\t')) return line.split('\t').map((x) => x.trim());
  if (line.includes(',')) return line.split(',').map((x) => x.trim());

  const spaced = line.split(/\s{2,}/).map((x) => x.trim()).filter(Boolean);
  if (spaced.length > 1) return spaced;

  return [line.trim()];
};

const inferExcelRows = (lines: string[]): string[][] => {
  const rows: string[][] = [];

  lines.forEach((line) => {
    const cols = splitLineAsColumns(line).filter(Boolean);
    if (cols.length) rows.push(cols);
  });

  if (!rows.length) return [['No extractable table/text found']];

  const maxCols = Math.max(...rows.map((row) => row.length));
  return rows.map((row) => {
    const padded = [...row];
    while (padded.length < maxCols) padded.push('');
    return padded;
  });
};

const generateXlsxFromPages = async (pages: { lines: string[]; flatText: string }[]): Promise<Blob> => {
  if (!window.XLSX) throw new Error('XLSX library is not loaded. Please refresh with internet.');

  const wb = window.XLSX.utils.book_new();

  pages.forEach((page, index) => {
    const rows = inferExcelRows(page.lines.length ? page.lines : [page.flatText]);
    const ws = window.XLSX.utils.aoa_to_sheet(rows);
    window.XLSX.utils.book_append_sheet(wb, ws, `Page_${index + 1}`);
  });

  const out = window.XLSX.write(wb, { bookType: 'xlsx', type: 'array' });
  return new Blob([out], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
};

const generatePptxFromPages = async (pages: { lines: string[]; flatText: string }[]): Promise<Blob> => {
  if (!window.PptxGenJS) throw new Error('PPTX library is not loaded. Please refresh with internet.');

  const pptx = new window.PptxGenJS();
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
      .filter((path) => /^ppt\/slides\/slide\d+\.xml$/.test(path))
      .sort((a, b) => Number(a.match(/slide(\d+)\.xml/)?.[1] || 0) - Number(b.match(/slide(\d+)\.xml/)?.[1] || 0));

    const chunks: string[] = [];
    for (const path of slidePaths) {
      const xml = await zip.files[path].async('text');
      const matches = [...xml.matchAll(/<a:t>(.*?)<\/a:t>/g)].map((m) => m[1]);
      chunks.push(matches.join(' '));
    }

    return chunks.join('\n\n') || 'No text found in PPTX file.';
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
  const maxLines = Math.floor((pageSize.height - margin * 2) / lineHeight);
  const lines = wrapText(text || 'No text extracted from input file.', font, fontSize, maxWidth);

  for (let i = 0; i < lines.length; i += maxLines) {
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

const wrapText = (text: string, font: any, fontSize: number, maxWidth: number): string[] => {
  const lines: string[] = [];

  text.split(/\r?\n/).forEach((paragraph) => {
    const words = paragraph.split(/\s+/).filter(Boolean);
    let current = '';

    words.forEach((word) => {
      const candidate = current ? `${current} ${word}` : word;
      if (font.widthOfTextAtSize(candidate, fontSize) <= maxWidth) {
        current = candidate;
      } else {
        if (current) lines.push(current);
        current = word;
      }
    });

    if (current) lines.push(current);
    if (!words.length) lines.push('');
  });

  return lines;
};
