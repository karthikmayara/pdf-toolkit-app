import { getMammoth } from '../adapters/runtimeAdapters';
import { throwIfAborted } from '../common';

export interface OfficeExtractOptions {
  signal?: AbortSignal;
  onProgress?: (progress: number, step: string) => void;
  progressStart?: number;
  progressEnd?: number;
}

const normalizeDocxHtml = (html: string): string => {
  if (!html.trim()) return '';

  let normalized = html;
  normalized = normalized.replace(/<\/?(strong|b)>/gi, '**');
  normalized = normalized.replace(/<\/?(em|i)>/gi, '_');
  normalized = normalized.replace(/<li>/gi, '• ');
  normalized = normalized.replace(/<\/li>/gi, '\n');
  normalized = normalized.replace(/<\/?p>/gi, '\n');
  normalized = normalized.replace(/<br\s*\/?>/gi, '\n');
  normalized = normalized.replace(/<[^>]+>/g, '');
  normalized = normalized.replace(/&nbsp;/gi, ' ');
  normalized = normalized.replace(/&amp;/gi, '&');
  normalized = normalized.replace(/&lt;/gi, '<');
  normalized = normalized.replace(/&gt;/gi, '>');
  normalized = normalized.replace(/\n{3,}/g, '\n\n');

  return normalized.trim();
};

/** Extracts text/structure from DOCX input via Mammoth HTML conversion. */
export const extractDocxText = async (file: File, options: OfficeExtractOptions = {}): Promise<string> => {
  const { signal, onProgress, progressStart = 10, progressEnd = 55 } = options;

  onProgress?.(progressStart, 'Extracting content from DOCX...');
  const mammoth = getMammoth();
  const buffer = await file.arrayBuffer();
  throwIfAborted(signal);

  const result = await mammoth.convertToHtml({ arrayBuffer: buffer });
  throwIfAborted(signal);
  onProgress?.(progressEnd, 'Extracting content from DOCX (complete).');

  return normalizeDocxHtml(result.value || '') || 'No text found in DOCX file.';
};
