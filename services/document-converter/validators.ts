import { DocumentFamily, DocumentTargetFormat } from './types';

const EXT_TO_FAMILY: Record<string, DocumentFamily> = {
  pdf: 'pdf',
  docx: 'docx',
  xlsx: 'xlsx',
  pptx: 'pptx',
};

const getExtension = (name?: string): string | null => {
  if (!name || !name.includes('.')) return null;
  return name.slice(name.lastIndexOf('.') + 1).toLowerCase();
};

/**
 * Detects source/target family by MIME first and then falls back to filename extension.
 * This improves compatibility for environments that provide empty or inconsistent MIME types.
 */
export const detectDocumentFamily = (mime?: string, fileName?: string): DocumentFamily => {
  const normalizedMime = (mime || '').toLowerCase();

  if (normalizedMime === 'application/pdf') return 'pdf';
  if (normalizedMime.includes('wordprocessingml')) return 'docx';
  if (normalizedMime.includes('spreadsheetml')) return 'xlsx';
  if (normalizedMime.includes('presentationml')) return 'pptx';

  const ext = getExtension(fileName);
  return (ext && EXT_TO_FAMILY[ext]) || 'unknown';
};

export const getUnsupportedPairReason = (
  sourceMime: string,
  targetMime: DocumentTargetFormat,
  sourceName?: string
): string | null => {
  const source = detectDocumentFamily(sourceMime, sourceName);
  const target = detectDocumentFamily(targetMime);

  if (source === 'unknown' || target === 'unknown') {
    return 'Unsupported file type. Use PDF, DOCX, XLSX, or PPTX.';
  }

  if (source === target) {
    return 'Source and target formats are the same. Choose a different target format.';
  }

  // The converter intentionally supports only pairs that include PDF.
  if (source !== 'pdf' && target !== 'pdf') {
    if (source === 'pptx' && target === 'xlsx') {
      return 'Direct PPTX → XLSX is not supported because slides are free-form while Excel expects tabular structure. Use PPTX → PDF, then PDF → XLSX.';
    }

    if (source === 'pptx' && target === 'docx') {
      return 'Direct PPTX → DOCX is not supported in this tool. Use PPTX → PDF, then PDF → DOCX.';
    }

    return 'Direct Office-to-Office conversion is not supported. Use PDF as a bridge (Office → PDF, then PDF → Office).';
  }

  return null;
};
