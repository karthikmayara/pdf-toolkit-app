/** Shared helpers used by extractor/generator modules. */

export interface PageText {
  lines: string[];
  flatText: string;
}

export const renameExtension = (name: string, ext: string) => {
  const base = name.includes('.') ? name.slice(0, name.lastIndexOf('.')) : name;
  return `${base}.${ext}`;
};

export const throwIfAborted = (signal?: AbortSignal) => {
  if (signal?.aborted) {
    throw new Error('Conversion cancelled.');
  }
};

/**
 * Maps a unit-based sub-progress (current/total) to a normalized range.
 * Ensures monotonic values between start and end for deterministic UI updates.
 */
export const mapProgressRange = (
  current: number,
  total: number,
  start: number,
  end: number
): number => {
  if (total <= 0) return end;
  const ratio = Math.min(1, Math.max(0, current / total));
  return Math.round(start + ratio * (end - start));
};
