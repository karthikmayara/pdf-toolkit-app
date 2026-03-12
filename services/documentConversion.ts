import { runDocumentConversion } from './document-converter/pipeline';
import { ConversionExecutor, DocumentConversionItem, DocumentTargetFormat } from './document-converter/types';
import { getUnsupportedPairReason as getUnsupportedPairReasonInternal } from './document-converter/validators';

export type { DocumentTargetFormat, DocumentConversionItem };

export const FORMAT_PRESETS: { label: string; value: DocumentTargetFormat }[] = [
  { label: 'To PDF', value: 'application/pdf' },
  { label: 'To Word', value: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document' },
  { label: 'To Excel', value: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' },
  { label: 'To PowerPoint', value: 'application/vnd.openxmlformats-officedocument.presentationml.presentation' },
];

export const getCapabilityRows = () => [
  { pair: 'PDF → DOCX', status: 'Supported', note: 'Basic text extraction with size-based heading inference.' },
  { pair: 'PDF → XLSX', status: 'Supported', note: 'Local column/table inference is applied where possible.' },
  { pair: 'PDF → PPTX', status: 'Supported', note: 'One slide per source page with extracted text.' },
  { pair: 'DOCX/XLSX/PPTX → PDF', status: 'Supported', note: 'DOCX keeps basic paragraph/list structure via HTML extraction.' },
  { pair: 'Office → Office', status: 'Supported', note: 'Uses an automatic Office → PDF → Office bridge.' },
] as const;

export const getUnsupportedPairReason = (sourceMime: string, targetMime: DocumentTargetFormat, sourceName?: string): string | null => {
  return getUnsupportedPairReasonInternal(sourceMime, targetMime, sourceName);
};

export const convertDocument = async (
  item: DocumentConversionItem,
  onProgress: (progress: number, step: string) => void,
  signal?: AbortSignal,
  executor?: ConversionExecutor
) => {
  return runDocumentConversion(item, { onProgress, signal, executor });
};
