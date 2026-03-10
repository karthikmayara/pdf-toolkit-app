import { getXlsx } from '../adapters/runtimeAdapters';
import { mapProgressRange, throwIfAborted } from '../common';

export interface OfficeExtractOptions {
  signal?: AbortSignal;
  onProgress?: (progress: number, step: string) => void;
  progressStart?: number;
  progressEnd?: number;
}

/** Extracts sheet text (CSV representation) from XLSX input. */
export const extractXlsxText = async (file: File, options: OfficeExtractOptions = {}): Promise<string> => {
  const { signal, onProgress, progressStart = 10, progressEnd = 55 } = options;

  const xlsx = getXlsx();
  const buffer = await file.arrayBuffer();
  throwIfAborted(signal);

  const wb = xlsx.read(buffer, { type: 'array' });
  const total = wb.SheetNames.length;
  onProgress?.(progressStart, `Extracting text from XLSX (0/${total} sheets)...`);

  const chunks: string[] = [];
  wb.SheetNames.forEach((sheetName: string, index: number) => {
    const csv = xlsx.utils.sheet_to_csv(wb.Sheets[sheetName]);
    chunks.push(`Sheet: ${sheetName}\n${csv}`);

    const mapped = mapProgressRange(index + 1, total || 1, progressStart, progressEnd);
    onProgress?.(mapped, `Extracting text from XLSX (${index + 1}/${total} sheets)...`);
  });

  return chunks.join('\n\n');
};
