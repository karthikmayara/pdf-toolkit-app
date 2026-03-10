import { getPdfJs } from '../adapters/runtimeAdapters';
import { mapProgressRange, PageText, throwIfAborted } from '../common';
import { PdfTextItem, groupItemsIntoLines } from '../heuristics/lineGrouping';

export interface PdfExtractOptions {
  signal?: AbortSignal;
  onProgress?: (progress: number, step: string) => void;
  progressStart?: number;
  progressEnd?: number;
}

/** Extracts page-wise text lines from a PDF file. */
export const extractPdfPages = async (file: File, options: PdfExtractOptions = {}): Promise<PageText[]> => {
  const {
    signal,
    onProgress,
    progressStart = 10,
    progressEnd = 55,
  } = options;

  const pdfJs = getPdfJs();
  const buffer = await file.arrayBuffer();
  throwIfAborted(signal);

  const pdf = await pdfJs.getDocument({ data: buffer }).promise;
  const pages: PageText[] = [];

  onProgress?.(progressStart, `Extracting text from PDF (0/${pdf.numPages} pages)...`);

  for (let i = 1; i <= pdf.numPages; i++) {
    throwIfAborted(signal);
    const page = await pdf.getPage(i);
    const content = await page.getTextContent();
    const lines = groupItemsIntoLines((content.items || []) as PdfTextItem[]);

    pages.push({
      lines,
      flatText: lines.join('\n') || `(Page ${i} had no extractable text)`,
    });

    const mapped = mapProgressRange(i, pdf.numPages, progressStart, progressEnd);
    onProgress?.(mapped, `Extracting text from PDF (${i}/${pdf.numPages} pages)...`);
  }

  return pages;
};
