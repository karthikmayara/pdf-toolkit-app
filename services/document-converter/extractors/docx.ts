import { getMammoth } from '../adapters/runtimeAdapters';
import { throwIfAborted } from '../common';

export interface OfficeExtractOptions {
  signal?: AbortSignal;
  onProgress?: (progress: number, step: string) => void;
  progressStart?: number;
  progressEnd?: number;
}

/** Extracts plain text from DOCX input. */
export const extractDocxText = async (file: File, options: OfficeExtractOptions = {}): Promise<string> => {
  const { signal, onProgress, progressStart = 10, progressEnd = 55 } = options;

  onProgress?.(progressStart, 'Extracting text from DOCX...');
  const mammoth = getMammoth();
  const buffer = await file.arrayBuffer();
  throwIfAborted(signal);

  const result = await mammoth.extractRawText({ arrayBuffer: buffer });
  throwIfAborted(signal);
  onProgress?.(progressEnd, 'Extracting text from DOCX (complete).');

  return result.value || 'No text found in DOCX file.';
};
