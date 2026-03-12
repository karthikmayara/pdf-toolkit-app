import { PageLine } from '../common';

export const buildHeadingClassifier = (lines: PageLine[]) => {
  const uniqueSizes = [...new Set(lines.map((line) => Number(line.fontSize || 0)).filter((size) => size > 0))]
    .sort((a, b) => b - a);

  const h1Threshold = uniqueSizes[0] || Number.POSITIVE_INFINITY;
  const h2Threshold = uniqueSizes[1] || h1Threshold;

  return (line: PageLine): boolean => {
    const text = line.text.trim();
    if (!text) return false;

    const size = Number(line.fontSize || 0);
    if (size >= h1Threshold) return true;
    if (size >= h2Threshold && text.length <= 120) return true;

    const isNumbered = /^(\d+\.|[IVX]+\.)\s+/.test(text);
    const isCaps = text === text.toUpperCase() && text.length <= 80 && text.length > 4;
    return isNumbered || isCaps;
  };
};
