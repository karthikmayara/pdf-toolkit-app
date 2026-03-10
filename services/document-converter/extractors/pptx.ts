import { getJsZip } from '../adapters/runtimeAdapters';
import { mapProgressRange, throwIfAborted } from '../common';

export interface OfficeExtractOptions {
  signal?: AbortSignal;
  onProgress?: (progress: number, step: string) => void;
  progressStart?: number;
  progressEnd?: number;
}

/** Extracts slide text from PPTX XML slide documents. */
export const extractPptxText = async (file: File, options: OfficeExtractOptions = {}): Promise<string> => {
  const { signal, onProgress, progressStart = 10, progressEnd = 55 } = options;

  const JSZip = getJsZip();
  const buffer = await file.arrayBuffer();
  throwIfAborted(signal);

  const zip = await JSZip.loadAsync(buffer);
  const slidePaths = Object.keys(zip.files)
    .filter((path) => /^ppt\/slides\/slide\d+\.xml$/.test(path))
    .sort((a, b) => Number(a.match(/slide(\d+)\.xml/)?.[1] || 0) - Number(b.match(/slide(\d+)\.xml/)?.[1] || 0));

  onProgress?.(progressStart, `Extracting text from PPTX (0/${slidePaths.length} slides)...`);

  const chunks: string[] = [];
  for (let i = 0; i < slidePaths.length; i++) {
    throwIfAborted(signal);
    const xml = await zip.files[slidePaths[i]].async('text');
    const matches = [...xml.matchAll(/<a:t>(.*?)<\/a:t>/g)].map((m) => m[1]);
    chunks.push(matches.join(' '));

    const mapped = mapProgressRange(i + 1, slidePaths.length || 1, progressStart, progressEnd);
    onProgress?.(mapped, `Extracting text from PPTX (${i + 1}/${slidePaths.length} slides)...`);
  }

  return chunks.join('\n\n') || 'No text found in PPTX file.';
};
