import { runDocumentConversion } from './document-converter/pipeline';
import { DocumentConversionItem, DocumentTargetFormat } from './document-converter/types';
import { getUnsupportedPairReason as getUnsupportedPairReasonInternal } from './document-converter/validators';

export type { DocumentTargetFormat, DocumentConversionItem };

export const FORMAT_PRESETS: { label: string; value: DocumentTargetFormat }[] = [
  { label: 'To PDF', value: 'application/pdf' },
  { label: 'To Word', value: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document' },
  { label: 'To Excel', value: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' },
  { label: 'To PowerPoint', value: 'application/vnd.openxmlformats-officedocument.presentationml.presentation' },
];

export const getCapabilityRows = () => [
  { pair: 'PDF → DOCX', status: 'Supported', note: 'Heading inference is applied for cleaner structure.' },
  { pair: 'PDF → XLSX', status: 'Supported', note: 'Local column/table inference is applied where possible.' },
  { pair: 'PDF → PPTX', status: 'Supported', note: 'One slide per source page with extracted text.' },
  { pair: 'DOCX/XLSX/PPTX → PDF', status: 'Supported', note: 'Text-first conversion to PDF.' },
  { pair: 'Office → Office', status: 'Not Supported', note: 'Use PDF as an intermediate step.' },
] as const;

export const getUnsupportedPairReason = (sourceMime: string, targetMime: DocumentTargetFormat, sourceName?: string): string | null => {
  return getUnsupportedPairReasonInternal(sourceMime, targetMime, sourceName);
};

export const convertDocument = async (
  item: DocumentConversionItem,
  onProgress: (progress: number, step: string) => void,
  signal?: AbortSignal
) => {
  return runDocumentConversion(item, { onProgress, signal });
};
