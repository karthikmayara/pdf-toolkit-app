import { getDocx } from '../adapters/runtimeAdapters';
import { mapProgressRange, PageText, throwIfAborted } from '../common';
import { inferHeading } from '../heuristics/headingInference';

export interface PageGenerateOptions {
  signal?: AbortSignal;
  onProgress?: (progress: number, step: string) => void;
  progressStart?: number;
  progressEnd?: number;
}

/** Generates DOCX output from extracted page text. */
export const generateDocxFromPages = async (pages: PageText[], options: PageGenerateOptions = {}): Promise<Blob> => {
  const { signal, onProgress, progressStart = 60, progressEnd = 95 } = options;

  const docx = getDocx();
  throwIfAborted(signal);

  onProgress?.(progressStart, `Generating DOCX (0/${pages.length} pages)...`);

  const sections = pages.map((page, index) => {
    const sourceLines = page.lines.length ? page.lines : page.flatText.split(/\r?\n/);
    const children = [
      new docx.Paragraph({
        children: [new docx.TextRun({ text: `Page ${index + 1}`, bold: true })],
      }),
    ];

    sourceLines.forEach((line) => {
      children.push(
        new docx.Paragraph({
          heading: inferHeading(line) ? docx.HeadingLevel.HEADING_2 : undefined,
          children: [new docx.TextRun({ text: line })],
        })
      );
    });

    const mapped = mapProgressRange(index + 1, pages.length || 1, progressStart, progressEnd);
    onProgress?.(mapped, `Generating DOCX (${index + 1}/${pages.length} pages)...`);

    return { properties: {}, children };
  });

  const doc = new docx.Document({ sections });
  return docx.Packer.toBlob(doc);
};
