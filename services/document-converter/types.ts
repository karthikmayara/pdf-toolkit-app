export type DocumentTargetFormat =
  | 'application/pdf'
  | 'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
  | 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
  | 'application/vnd.openxmlformats-officedocument.presentationml.presentation';

export type DocumentFamily = 'pdf' | 'docx' | 'xlsx' | 'pptx' | 'unknown';

export interface DocumentConversionItem {
  file: File;
  targetFormat: DocumentTargetFormat;
}

export interface ConversionResult {
  blob: Blob;
  filename: string;
}

export interface ConversionRunOptions {
  onProgress: (progress: number, step: string) => void;
  signal?: AbortSignal;
}
