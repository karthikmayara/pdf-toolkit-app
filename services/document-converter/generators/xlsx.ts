import { getXlsx } from '../adapters/runtimeAdapters';
import { mapProgressRange, PageText, throwIfAborted } from '../common';
import { inferExcelRows } from '../heuristics/excelInference';

export interface PageGenerateOptions {
  signal?: AbortSignal;
  onProgress?: (progress: number, step: string) => void;
  progressStart?: number;
  progressEnd?: number;
}

/** Generates XLSX output from extracted page text. */
export const generateXlsxFromPages = async (pages: PageText[], options: PageGenerateOptions = {}): Promise<Blob> => {
  const { signal, onProgress, progressStart = 60, progressEnd = 95 } = options;

  const xlsx = getXlsx();
  throwIfAborted(signal);

  const wb = xlsx.utils.book_new();
  onProgress?.(progressStart, `Generating XLSX (0/${pages.length} pages)...`);

  pages.forEach((page, index) => {
    const rows = inferExcelRows(page.lines.length ? page.lines : [page.flatText]);
    const ws = xlsx.utils.aoa_to_sheet(rows);
    xlsx.utils.book_append_sheet(wb, ws, `Page_${index + 1}`);

    const mapped = mapProgressRange(index + 1, pages.length || 1, progressStart, progressEnd);
    onProgress?.(mapped, `Generating XLSX (${index + 1}/${pages.length} pages)...`);
  });

  const out = xlsx.write(wb, { bookType: 'xlsx', type: 'array' });
  return new Blob([out], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
};
