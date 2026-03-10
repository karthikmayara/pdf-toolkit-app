import { getPptxGen } from '../adapters/runtimeAdapters';
import { mapProgressRange, PageText, throwIfAborted } from '../common';

export interface PageGenerateOptions {
  signal?: AbortSignal;
  onProgress?: (progress: number, step: string) => void;
  progressStart?: number;
  progressEnd?: number;
}

/** Generates PPTX output from extracted page text. */
export const generatePptxFromPages = async (pages: PageText[], options: PageGenerateOptions = {}): Promise<Blob> => {
  const { signal, onProgress, progressStart = 60, progressEnd = 95 } = options;

  const PptxGenJS = getPptxGen();
  throwIfAborted(signal);

  const pptx = new PptxGenJS();
  pptx.layout = 'LAYOUT_WIDE';

  onProgress?.(progressStart, `Generating PPTX (0/${pages.length} pages)...`);

  pages.forEach((page, index) => {
    const slide = pptx.addSlide();
    slide.addText(`Page ${index + 1}`, { x: 0.5, y: 0.3, w: 12, h: 0.6, bold: true, fontSize: 24 });
    slide.addText(page.flatText || '(No extractable text)', {
      x: 0.5,
      y: 1.1,
      w: 12,
      h: 5.5,
      fontSize: 14,
      breakLine: true,
    });

    const mapped = mapProgressRange(index + 1, pages.length || 1, progressStart, progressEnd);
    onProgress?.(mapped, `Generating PPTX (${index + 1}/${pages.length} pages)...`);
  });

  const buffer = await pptx.write({ outputType: 'arraybuffer' });
  return new Blob([buffer], { type: 'application/vnd.openxmlformats-officedocument.presentationml.presentation' });
};
