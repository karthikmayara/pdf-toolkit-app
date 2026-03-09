export type DocumentTargetFormat =
  | 'application/pdf'
  | 'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
  | 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
  | 'application/vnd.openxmlformats-officedocument.presentationml.presentation';

export interface DocumentConversionItem {
  file: File;
  targetFormat: DocumentTargetFormat;
}

interface ConversionResult {
  blob: Blob;
  filename: string;
}

type DocumentFamily = 'pdf' | 'docx' | 'xlsx' | 'pptx' | 'unknown';

export const FORMAT_PRESETS: { label: string; value: DocumentTargetFormat }[] = [
  { label: 'To PDF', value: 'application/pdf' },
  { label: 'To Word', value: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document' },
  { label: 'To Excel', value: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' },
  { label: 'To PowerPoint', value: 'application/vnd.openxmlformats-officedocument.presentationml.presentation' },
];

/**
 * Human-readable reason for unsupported format pairs.
 */
export const getUnsupportedPairReason = (
  sourceMime: string,
  targetMime: DocumentTargetFormat
): string | null => {
  const source = getDocumentFamily(sourceMime);
  const target = getDocumentFamily(targetMime);

  if (source === 'unknown' || target === 'unknown') {
    return 'Unsupported file type. Use PDF, DOCX, XLSX, or PPTX.';
  }

  if (source === target) {
    return 'Source and target formats are the same. Choose a different target format.';
  }

  if (source !== 'pdf' && target !== 'pdf') {
    if (source === 'pptx' && target === 'xlsx') {
      return 'Direct PPTX → XLSX is not supported because slides are free-form while Excel requires table-like structure. Use PPTX → PDF, then PDF → XLSX.';
    }

    if (source === 'pptx' && target === 'docx') {
      return 'Direct PPTX → DOCX is not supported in this tool. Use PPTX → PDF, then PDF → DOCX.';
    }

    return 'Direct Office-to-Office conversion is not supported. Use PDF as a bridge (Office → PDF, then PDF → Office).';
  }

  return null;
};

export const getCapabilityRows = () => [
  { pair: 'PDF → DOCX', status: 'Supported', note: 'Heading inference is applied for cleaner structure.' },
  { pair: 'PDF → XLSX', status: 'Supported', note: 'Local column/table inference is applied where possible.' },
  { pair: 'PDF → PPTX', status: 'Supported', note: 'One slide per source page with extracted text.' },
  { pair: 'DOCX/XLSX/PPTX → PDF', status: 'Supported', note: 'Text-first conversion to PDF.' },
  { pair: 'Office → Office', status: 'Not Supported', note: 'Use PDF as an intermediate step.' },
] as const;

export const convertDocument = async (
  item: DocumentConversionItem,
  onProgress: (progress: number, step: string) => void
): Promise<ConversionResult> => {
  const pairIssue = getUnsupportedPairReason(item.file.type, item.targetFormat);
  if (pairIssue) throw new Error(pairIssue);

  return runWorkerConversion(item, onProgress);
};

const runWorkerConversion = (
  item: DocumentConversionItem,
  onProgress: (progress: number, step: string) => void
): Promise<ConversionResult> => {
  return new Promise((resolve, reject) => {
    const basePath = window.location.pathname.startsWith('/pdf-toolkit-app/') ? '/pdf-toolkit-app/' : '/';
    const worker = new Worker(`${basePath}documentWorker.js`);

    worker.onmessage = (event: MessageEvent) => {
      const { type, payload } = event.data || {};

      if (type === 'progress') {
        onProgress(payload.progress, payload.step);
        return;
      }

      if (type === 'done') {
        const blob = new Blob([payload.buffer], { type: payload.mimeType });
        resolve({ blob, filename: payload.filename });
        worker.terminate();
        return;
      }

      if (type === 'error') {
        reject(new Error(payload.message || 'Conversion failed.'));
        worker.terminate();
      }
    };

    worker.onerror = () => {
      reject(new Error('Conversion worker failed to start. Please refresh and try again.'));
      worker.terminate();
    };

    worker.postMessage({ type: 'convert', payload: item });
  });
};

const getDocumentFamily = (mime: string): DocumentFamily => {
  if (mime === 'application/pdf') return 'pdf';
  if (mime.includes('wordprocessingml')) return 'docx';
  if (mime.includes('spreadsheetml')) return 'xlsx';
  if (mime.includes('presentationml')) return 'pptx';
  return 'unknown';
};
