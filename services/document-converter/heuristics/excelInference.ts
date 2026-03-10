const splitLineAsColumns = (line: string): string[] => {
  if (line.includes('\t')) return line.split('\t').map((x) => x.trim());
  if (line.includes(',')) return line.split(',').map((x) => x.trim());

  const spaced = line.split(/\s{2,}/).map((x) => x.trim()).filter(Boolean);
  if (spaced.length > 1) return spaced;

  return [line.trim()];
};

export const inferExcelRows = (lines: string[]): string[][] => {
  const rows: string[][] = [];

  lines.forEach((line) => {
    const cols = splitLineAsColumns(line).filter(Boolean);
    if (cols.length) rows.push(cols);
  });

  if (!rows.length) return [['No extractable table/text found']];

  const maxCols = Math.max(...rows.map((row) => row.length));
  return rows.map((row) => {
    const padded = [...row];
    while (padded.length < maxCols) padded.push('');
    return padded;
  });
};
