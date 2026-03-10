interface WidthMeasuringFont {
  widthOfTextAtSize: (text: string, size: number) => number;
}

export const wrapText = (
  text: string,
  font: WidthMeasuringFont,
  fontSize: number,
  maxWidth: number
): string[] => {
  const lines: string[] = [];

  text.split(/\r?\n/).forEach((paragraph) => {
    const words = paragraph.split(/\s+/).filter(Boolean);
    let current = '';

    words.forEach((word) => {
      const candidate = current ? `${current} ${word}` : word;
      if (font.widthOfTextAtSize(candidate, fontSize) <= maxWidth) {
        current = candidate;
      } else {
        if (current) lines.push(current);
        current = word;
      }
    });

    if (current) lines.push(current);
    if (!words.length) lines.push('');
  });

  return lines;
};
