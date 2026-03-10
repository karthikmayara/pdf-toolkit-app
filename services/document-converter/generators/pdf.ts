import { getPdfLib } from '../adapters/runtimeAdapters';
import { mapProgressRange, throwIfAborted } from '../common';
import { wrapText } from '../heuristics/textWrap';

export interface PdfGenerateOptions {
  signal?: AbortSignal;
  onProgress?: (progress: number, step: string) => void;
  progressStart?: number;
  progressEnd?: number;
}

/** Generates a PDF document from plain text with wrapped lines. */
export const generatePdfFromText = async (text: string, options: PdfGenerateOptions = {}): Promise<Blob> => {
  const { signal, onProgress, progressStart = 60, progressEnd = 95 } = options;

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
  const totalPages = Math.max(1, Math.ceil(lines.length / maxLines));

  onProgress?.(progressStart, `Generating PDF (0/${totalPages} pages)...`);

  let pageCount = 0;
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

    pageCount += 1;
    const mapped = mapProgressRange(pageCount, totalPages, progressStart, progressEnd);
    onProgress?.(mapped, `Generating PDF (${pageCount}/${totalPages} pages)...`);
  }

  const bytes = await pdfDoc.save();
  return new Blob([bytes], { type: 'application/pdf' });
};
