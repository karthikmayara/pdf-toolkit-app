/* eslint-disable no-restricted-globals */
// Dedicated worker for document conversion to keep the UI thread responsive.

self.importScripts('https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.min.js');
self.importScripts('https://unpkg.com/docx@8.5.0/build/index.umd.js');
self.importScripts('https://cdn.jsdelivr.net/npm/xlsx@0.18.5/dist/xlsx.full.min.js');
self.importScripts('https://cdn.jsdelivr.net/npm/pptxgenjs@3.12.0/dist/pptxgen.bundle.js');
self.importScripts('https://cdn.jsdelivr.net/npm/mammoth@1.8.0/mammoth.browser.min.js');
self.importScripts('https://cdnjs.cloudflare.com/ajax/libs/jszip/3.10.1/jszip.min.js');
self.importScripts('https://unpkg.com/pdf-lib@1.17.1/dist/pdf-lib.min.js');

if (self.pdfjsLib?.GlobalWorkerOptions) {
  self.pdfjsLib.GlobalWorkerOptions.workerSrc = 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js';
}

self.onmessage = async (event) => {
  const { type, payload } = event.data || {};

  if (type !== 'convert') return;

  try {
    const { file, targetFormat } = payload;
    const result = await convertDocument(file, targetFormat, (progress, step) => {
      self.postMessage({ type: 'progress', payload: { progress, step } });
    });

    const buffer = await result.blob.arrayBuffer();
    self.postMessage({ type: 'done', payload: { filename: result.filename, mimeType: result.blob.type, buffer } }, [buffer]);
  } catch (error) {
    self.postMessage({ type: 'error', payload: { message: error?.message || 'Conversion failed.' } });
  }
};

async function convertDocument(file, targetFormat, onProgress) {
  const sourceType = file.type;

  if (sourceType === 'application/pdf') {
    onProgress(20, 'Extracting text structure from PDF...');
    const pages = await extractPdfPages(file);

    onProgress(60, 'Generating output document...');
    if (targetFormat.includes('wordprocessingml')) {
      const blob = await generateDocxFromPages(pages);
      return { blob, filename: renameExtension(file.name, 'docx') };
    }

    if (targetFormat.includes('spreadsheetml')) {
      const blob = await generateXlsxFromPages(pages);
      return { blob, filename: renameExtension(file.name, 'xlsx') };
    }

    if (targetFormat.includes('presentationml')) {
      const blob = await generatePptxFromPages(pages);
      return { blob, filename: renameExtension(file.name, 'pptx') };
    }
  }

  onProgress(25, 'Extracting text from source file...');
  const text = await extractTextFromOfficeFile(file);

  onProgress(60, 'Generating PDF...');
  const blob = await generatePdfFromText(text);
  return { blob, filename: renameExtension(file.name, 'pdf') };
}

function renameExtension(name, ext) {
  const base = name.includes('.') ? name.slice(0, name.lastIndexOf('.')) : name;
  return `${base}.${ext}`;
}

async function extractPdfPages(file) {
  const buffer = await file.arrayBuffer();
  const pdf = await self.pdfjsLib.getDocument({ data: buffer }).promise;
  const pages = [];

  for (let i = 1; i <= pdf.numPages; i++) {
    const page = await pdf.getPage(i);
    const content = await page.getTextContent();
    const rows = groupItemsIntoLines(content.items || []);
    pages.push({ lines: rows, flatText: rows.join('\n') || `(Page ${i} had no extractable text)` });
  }

  return pages;
}

function groupItemsIntoLines(items) {
  const sorted = [...items].sort((a, b) => {
    const ay = Number(a.transform?.[5] || 0);
    const by = Number(b.transform?.[5] || 0);
    if (Math.abs(by - ay) > 2) return by - ay;
    const ax = Number(a.transform?.[4] || 0);
    const bx = Number(b.transform?.[4] || 0);
    return ax - bx;
  });

  const lines = [];
  let currentY = null;
  let currentLine = [];

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
}

function inferWordBlocks(lines) {
  return lines.map((line) => {
    const isNumberedHeading = /^(\d+\.|[IVX]+\.)\s+/.test(line);
    const isCapsHeading = line === line.toUpperCase() && line.length <= 80 && line.length > 4;
    const isShortHeading = line.length <= 60 && !/[.!?]$/.test(line);
    const isHeading = isNumberedHeading || isCapsHeading || isShortHeading;
    return { text: line, isHeading };
  });
}

async function generateDocxFromPages(pages) {
  const sections = pages.map((page, pageIndex) => {
    const blocks = inferWordBlocks(page.lines.length ? page.lines : page.flatText.split(/\r?\n/));

    const children = [
      new self.docx.Paragraph({
        children: [new self.docx.TextRun({ text: `Page ${pageIndex + 1}`, bold: true })],
      }),
    ];

    blocks.forEach((block) => {
      children.push(new self.docx.Paragraph({
        heading: block.isHeading ? self.docx.HeadingLevel.HEADING_2 : undefined,
        children: [new self.docx.TextRun({ text: block.text })],
      }));
    });

    return { properties: {}, children };
  });

  const doc = new self.docx.Document({ sections });
  return self.docx.Packer.toBlob(doc);
}

function splitLineAsColumns(line) {
  if (line.includes('\t')) return line.split('\t').map((x) => x.trim());
  if (line.includes(',')) return line.split(',').map((x) => x.trim());

  const multiSpaceParts = line.split(/\s{2,}/).map((x) => x.trim()).filter(Boolean);
  if (multiSpaceParts.length > 1) return multiSpaceParts;

  return [line.trim()];
}

function inferExcelRows(lines) {
  const rows = [];

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
}

async function generateXlsxFromPages(pages) {
  const wb = self.XLSX.utils.book_new();

  pages.forEach((page, index) => {
    const rows = inferExcelRows(page.lines.length ? page.lines : [page.flatText]);
    const ws = self.XLSX.utils.aoa_to_sheet(rows);
    self.XLSX.utils.book_append_sheet(wb, ws, `Page_${index + 1}`);
  });

  const out = self.XLSX.write(wb, { bookType: 'xlsx', type: 'array' });
  return new Blob([out], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
}

async function generatePptxFromPages(pages) {
  const pptx = new self.PptxGenJS();
  pptx.layout = 'LAYOUT_WIDE';

  pages.forEach((page, index) => {
    const slide = pptx.addSlide();
    slide.addText(`Page ${index + 1}`, { x: 0.5, y: 0.3, w: 12, h: 0.6, bold: true, fontSize: 24 });
    slide.addText(page.flatText || '(No extractable text)', { x: 0.5, y: 1.1, w: 12, h: 5.5, fontSize: 14, breakLine: true });
  });

  const buffer = await pptx.write({ outputType: 'arraybuffer' });
  return new Blob([buffer], { type: 'application/vnd.openxmlformats-officedocument.presentationml.presentation' });
}

async function extractTextFromOfficeFile(file) {
  const buffer = await file.arrayBuffer();

  if (file.type.includes('wordprocessingml')) {
    const result = await self.mammoth.extractRawText({ arrayBuffer: buffer });
    return result.value || 'No text found in DOCX file.';
  }

  if (file.type.includes('spreadsheetml')) {
    const wb = self.XLSX.read(buffer, { type: 'array' });
    return wb.SheetNames.map((name) => {
      const csv = self.XLSX.utils.sheet_to_csv(wb.Sheets[name]);
      return `Sheet: ${name}\n${csv}`;
    }).join('\n\n');
  }

  if (file.type.includes('presentationml')) {
    const zip = await self.JSZip.loadAsync(buffer);
    const slidePaths = Object.keys(zip.files)
      .filter((path) => /^ppt\/slides\/slide\d+\.xml$/.test(path))
      .sort((a, b) => Number(a.match(/slide(\d+)\.xml/)?.[1] || 0) - Number(b.match(/slide(\d+)\.xml/)?.[1] || 0));

    const chunks = [];
    for (const path of slidePaths) {
      const xml = await zip.files[path].async('text');
      const matches = [...xml.matchAll(/<a:t>(.*?)<\/a:t>/g)].map((m) => m[1]);
      chunks.push(matches.join(' '));
    }

    return chunks.join('\n\n') || 'No text found in PPTX file.';
  }

  throw new Error('Unsupported office input. Use DOCX, XLSX or PPTX.');
}

async function generatePdfFromText(text) {
  const { PDFDocument, StandardFonts, rgb } = self.PDFLib;
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
      page.drawText(line, { x: margin, y: pageSize.height - margin - idx * lineHeight, size: fontSize, font, color: rgb(0, 0, 0) });
    });
  }

  const bytes = await pdfDoc.save();
  return new Blob([bytes], { type: 'application/pdf' });
}

function wrapText(text, font, fontSize, maxWidth) {
  const lines = [];

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
}
