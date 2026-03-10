import { PageText, renameExtension } from './common';
import {
  ConversionDependencies,
  ConversionResult,
  ConversionRunOptions,
  DocumentConversionItem,
} from './types';
import { detectDocumentFamily, getUnsupportedPairReason } from './validators';
import { extractDocxText } from './extractors/docx';
import { extractPdfPages } from './extractors/pdf';
import { extractPptxText } from './extractors/pptx';
import { extractXlsxText } from './extractors/xlsx';
import { generateDocxFromPages } from './generators/docx';
import { generatePdfFromText } from './generators/pdf';
import { generatePptxFromPages } from './generators/pptx';
import { generateXlsxFromPages } from './generators/xlsx';

const mainThreadExecutor: ConversionDependencies['execute'] = async <T>(task: () => Promise<T>) => task();

const makeDependencies = (options: ConversionRunOptions): ConversionDependencies => ({
  execute: options.executor || mainThreadExecutor,
});

const extractOfficeText = async (
  item: DocumentConversionItem,
  options: ConversionRunOptions,
  deps: ConversionDependencies
): Promise<string> => {
  const family = detectDocumentFamily(item.file.type, item.file.name);

  if (family === 'docx') {
    return deps.execute(() =>
      extractDocxText(item.file, {
        signal: options.signal,
        onProgress: options.onProgress,
        progressStart: 10,
        progressEnd: 55,
      })
    );
  }

  if (family === 'xlsx') {
    return deps.execute(() =>
      extractXlsxText(item.file, {
        signal: options.signal,
        onProgress: options.onProgress,
        progressStart: 10,
        progressEnd: 55,
      })
    );
  }

  if (family === 'pptx') {
    return deps.execute(() =>
      extractPptxText(item.file, {
        signal: options.signal,
        onProgress: options.onProgress,
        progressStart: 10,
        progressEnd: 55,
      })
    );
  }

  throw new Error('Unsupported office input. Use DOCX, XLSX or PPTX.');
};

const generateFromPdfPages = async (
  pages: PageText[],
  item: DocumentConversionItem,
  options: ConversionRunOptions,
  deps: ConversionDependencies
): Promise<ConversionResult> => {
  if (item.targetFormat.includes('wordprocessingml')) {
    const blob = await deps.execute(() =>
      generateDocxFromPages(pages, {
        signal: options.signal,
        onProgress: options.onProgress,
        progressStart: 60,
        progressEnd: 95,
      })
    );

    return { blob, filename: renameExtension(item.file.name, 'docx') };
  }

  if (item.targetFormat.includes('spreadsheetml')) {
    const blob = await deps.execute(() =>
      generateXlsxFromPages(pages, {
        signal: options.signal,
        onProgress: options.onProgress,
        progressStart: 60,
        progressEnd: 95,
      })
    );

    return { blob, filename: renameExtension(item.file.name, 'xlsx') };
  }

  const blob = await deps.execute(() =>
    generatePptxFromPages(pages, {
      signal: options.signal,
      onProgress: options.onProgress,
      progressStart: 60,
      progressEnd: 95,
    })
  );

  return { blob, filename: renameExtension(item.file.name, 'pptx') };
};

/**
 * Orchestrates the document conversion flow for supported pairs.
 * Extraction and generation steps are separated for clearer ownership and future workerization.
 */
export const runDocumentConversion = async (
  item: DocumentConversionItem,
  options: ConversionRunOptions
): Promise<ConversionResult> => {
  const pairIssue = getUnsupportedPairReason(item.file.type, item.targetFormat, item.file.name);
  if (pairIssue) throw new Error(pairIssue);

  const deps = makeDependencies(options);
  const sourceFamily = detectDocumentFamily(item.file.type, item.file.name);

  // Deterministic progress model:
  // - 0..10: preparation
  // - 10..55: extraction (page/sheet/slide aware)
  // - 60..95: generation (page aware where applicable)
  // - 100: completion
  options.onProgress(5, 'Preparing conversion...');

  if (sourceFamily === 'pdf') {
    const pages = await deps.execute(() =>
      extractPdfPages(item.file, {
        signal: options.signal,
        onProgress: options.onProgress,
        progressStart: 10,
        progressEnd: 55,
      })
    );

    const result = await generateFromPdfPages(pages, item, options, deps);
    options.onProgress(100, 'Completed!');
    return result;
  }

  // Office input path (DOCX/XLSX/PPTX) supports only conversion to PDF.
  if (item.targetFormat !== 'application/pdf') {
    throw new Error('Only Office → PDF is supported for Office source files. Use PDF as an intermediate for Office → Office.');
  }

  const text = await extractOfficeText(item, options, deps);

  const blob = await deps.execute(() =>
    generatePdfFromText(text, {
      signal: options.signal,
      onProgress: options.onProgress,
      progressStart: 60,
      progressEnd: 95,
    })
  );

  options.onProgress(100, 'Completed!');
  return {
    blob,
    filename: renameExtension(item.file.name, 'pdf'),
  };
};
