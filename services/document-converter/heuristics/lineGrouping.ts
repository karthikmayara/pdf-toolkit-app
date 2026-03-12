export interface PdfTextItem {
  str?: string;
  transform?: number[];
}

export interface GroupedPdfLine {
  text: string;
  fontSize: number;
}

const getItemFontSize = (item: PdfTextItem) => {
  const scaleX = Number(item.transform?.[0] || 0);
  const scaleY = Number(item.transform?.[3] || 0);
  return Math.max(Math.abs(scaleX), Math.abs(scaleY), 0);
};

export const groupItemsIntoLines = (items: PdfTextItem[]): GroupedPdfLine[] => {
  const sorted = [...items].sort((a, b) => {
    const ay = Number(a.transform?.[5] || 0);
    const by = Number(b.transform?.[5] || 0);
    if (Math.abs(by - ay) > 2) return by - ay;
    const ax = Number(a.transform?.[4] || 0);
    const bx = Number(b.transform?.[4] || 0);
    return ax - bx;
  });

  const lines: GroupedPdfLine[] = [];
  let currentY: number | null = null;
  let currentLine: string[] = [];
  let currentFontSizes: number[] = [];

  const flushCurrentLine = () => {
    if (!currentLine.length) return;
    const text = currentLine.join(' ').replace(/\s+/g, ' ').trim();
    if (!text) return;

    const validSizes = currentFontSizes.filter((size) => size > 0);
    const avgFontSize = validSizes.length
      ? validSizes.reduce((sum, size) => sum + size, 0) / validSizes.length
      : 0;

    lines.push({ text, fontSize: avgFontSize });
  };

  sorted.forEach((item) => {
    const y = Number(item.transform?.[5] || 0);
    const text = String(item.str || '').trim();
    if (!text) return;

    if (currentY === null || Math.abs(currentY - y) <= 2) {
      currentY = currentY === null ? y : currentY;
      currentLine.push(text);
      currentFontSizes.push(getItemFontSize(item));
      return;
    }

    flushCurrentLine();
    currentY = y;
    currentLine = [text];
    currentFontSizes = [getItemFontSize(item)];
  });

  flushCurrentLine();
  return lines;
};
