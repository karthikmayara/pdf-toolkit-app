export const inferHeading = (line: string): boolean => {
  const isNumbered = /^(\d+\.|[IVX]+\.)\s+/.test(line);
  const isCaps = line === line.toUpperCase() && line.length <= 80 && line.length > 4;
  const isShort = line.length <= 60 && !/[.!?]$/.test(line);
  return isNumbered || isCaps || isShort;
};
