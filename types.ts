// Global types for CDN loaded libraries
declare global {
  interface Window {
    pdfjsLib: any;
    PDFLib: any;
    JSZip: any;
    Tesseract: any;
  }
}

export enum CompressionMode {
  STRUCTURE = 'structure',
  IMAGE = 'image',
}

export interface CompressionSettings {
  mode: CompressionMode;
  quality: number; // 0.1 to 1.0
  maxResolution: number; // Max width/height in pixels
  grayscale: boolean;
  flattenForms: boolean; // Option to flatten interactive forms
  preserveMetadata: boolean; // Option to keep title, author, etc.
  autoDetectText?: boolean; // Phase 2: Hybrid Compression (Skip rasterization for text pages)
  cleanBackground?: boolean; // New: Force near-white pixels to pure white
  enableOCR?: boolean; // New: Inject invisible text layer
}

export interface ProcessStatus {
  isProcessing: boolean;
  currentStep: string;
  progress: number; // 0 to 100
  error?: string;
  resultBlob?: Blob;
  originalSize?: number;
  compressedSize?: number;
  resultFileName?: string; // New: handle naming for converter
  mergeErrors?: string[]; // New: list of files that failed during merge
}

// Converter Types
export type SupportedFormat = 'image/jpeg' | 'image/png' | 'image/webp' | 'image/avif' | 'application/pdf';

export interface ConversionSettings {
  targetFormat: SupportedFormat;
  quality: number; // 0.1 to 1.0 (for JPEG/WEBP)
}

// Watermark Types
export interface WatermarkSettings {
  text: string;
  color: string;
  fontSize: number;
  opacity: number; // 0 to 1
  rotation: number; // -180 to 180
  position: 'center' | 'top-left' | 'top-center' | 'top-right' | 'middle-left' | 'middle-right' | 'bottom-left' | 'bottom-center' | 'bottom-right' | 'tiled';
  fontFamily: string;
  isBold: boolean;
  isItalic: boolean;
  // Page Selection
  pageSelectMode: 'all' | 'odd' | 'even' | 'custom';
  pageRange: string; // e.g. "1-5, 8, 11-13"
}

// Split Types
export interface SplitSettings {
  mode: 'extract' | 'remove'; // Extract = Keep selected, Remove = Delete selected
  selectedPages: Set<number>; // 0-based indices
}

// Page Number Types
export type PageNumberPosition = 'top-left' | 'top-center' | 'top-right' | 'bottom-left' | 'bottom-center' | 'bottom-right';

export interface PageNumberSettings {
  position: PageNumberPosition;
  margin: number; // Points from edge
  fontSize: number;
  format: 'n' | 'page-n' | 'n-of-total' | 'page-n-of-total'; // Template style
  startFrom: number; // Logical number to start counting from (usually 1)
  skipFirst: boolean; // Common requirement: don't number the cover page
}

// OCR Types
export interface OCRSettings {
  language: string;
}