export interface PdfTextItem {
  str?: string;
  transform?: number[];
}

export const groupItemsIntoLines = (items: PdfTextItem[]): string[] => {
  const sorted = [...items].sort((a, b) => {
    const ay = Number(a.transform?.[5] || 0);
    const by = Number(b.transform?.[5] || 0);
    if (Math.abs(by - ay) > 2) return by - ay;
    const ax = Number(a.transform?.[4] || 0);
    const bx = Number(b.transform?.[4] || 0);
    return ax - bx;
  });

  const lines: string[] = [];
  let currentY: number | null = null;
  let currentLine: string[] = [];

  sorted.forEach((item) => {
    const y = Number(item.transform?.[5] || 0);
    const text = String(item.str || '').trim();
    if (!text) return;

    if (currentY === null || Math.abs(currentY - y) <= 2) {
      currentY = currentY === null ? y : currentY;
      currentLine.push(text);
      return;
    }

    lines.push(currentLine.join(' ').replace(/\s+/g, ' ').trim());
    currentY = y;
    currentLine = [text];
  });

  if (currentLine.length) lines.push(currentLine.join(' ').replace(/\s+/g, ' ').trim());
  return lines.filter(Boolean);
};
