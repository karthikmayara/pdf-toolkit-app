/**
 * Service for OCR (Image to Text)
 */

export const SUPPORTED_LANGUAGES = [
  { code: 'eng', name: 'English', icon: '🇺🇸' },
  { code: 'tel', name: 'Telugu', icon: '🇮🇳' },
  { code: 'hin', name: 'Hindi', icon: '🇮🇳' },
  { code: 'spa', name: 'Spanish', icon: '🇪🇸' },
  { code: 'fra', name: 'French', icon: '🇫🇷' },
  { code: 'deu', name: 'German', icon: '🇩🇪' },
  { code: 'ita', name: 'Italian', icon: '🇮🇹' },
  { code: 'por', name: 'Portuguese', icon: '🇵🇹' },
  { code: 'rus', name: 'Russian', icon: '🇷🇺' },
  { code: 'chi_sim', name: 'Chinese (Simplified)', icon: '🇨🇳' },
  { code: 'jpn', name: 'Japanese', icon: '🇯🇵' },
  { code: 'ara', name: 'Arabic', icon: '🇸🇦' },
  { code: 'kor', name: 'Korean', icon: '🇰🇷' },
];

export interface PreprocessOptions {
    mode: 'grayscale' | 'binary'; // 'binary' is strict B&W (Thresholding)
    contrast: number; // 0-100
}

/**
 * Pre-processes an image to improve OCR accuracy
 */
export const preprocessImage = async (file: File, options: PreprocessOptions = { mode: 'grayscale', contrast: 30 }): Promise<Blob> => {
    return new Promise((resolve, reject) => {
        const img = new Image();
        const url = URL.createObjectURL(file);
        
        img.onload = () => {
            const canvas = document.createElement('canvas');
            const ctx = canvas.getContext('2d');
            
            if (!ctx) {
                URL.revokeObjectURL(url);
                resolve(file); // Fallback to original
                return;
            }

            // 1. Smart Resize (Cap at 2500px to balance speed/accuracy)
            // Indic languages (Telugu/Hindi) need high res, so we don't downscale too much.
            let width = img.width;
            let height = img.height;
            const MAX_DIMENSION = 2500; 

            if (width > MAX_DIMENSION || height > MAX_DIMENSION) {
                const ratio = Math.min(MAX_DIMENSION / width, MAX_DIMENSION / height);
                width *= ratio;
                height *= ratio;
            }

            canvas.width = width;
            canvas.height = height;
            ctx.drawImage(img, 0, 0, width, height);
            
            // 2. Pixel Manipulation
            const imageData = ctx.getImageData(0, 0, width, height);
            const data = imageData.data;
            
            // Contrast Factor
            const contrast = options.contrast; 
            const factor = (259 * (contrast + 255)) / (255 * (259 - contrast));

            // Threshold for Binary Mode (128 is mid-gray)
            const threshold = 128;

            for (let i = 0; i < data.length; i += 4) {
                // Luminance (Grayscale)
                const gray = data[i] * 0.299 + data[i + 1] * 0.587 + data[i + 2] * 0.114;
                
                // Apply Contrast
                let val = factor * (gray - 128) + 128;
                val = Math.max(0, Math.min(255, val));

                if (options.mode === 'binary') {
                    // Strict Thresholding (Black or White)
                    // This removes background images and faint noise completely
                    val = val < threshold ? 0 : 255;
                }

                data[i] = val;     // R
                data[i + 1] = val; // G
                data[i + 2] = val; // B
                // Alpha (data[i+3]) remains unchanged
            }
            
            ctx.putImageData(imageData, 0, 0);

            canvas.toBlob((blob) => {
                URL.revokeObjectURL(url);
                if (blob) resolve(blob);
                else resolve(file);
            }, 'image/png');
        };

        img.onerror = () => {
            URL.revokeObjectURL(url);
            reject(new Error("Failed to load image for processing"));
        };

        img.src = url;
    });
};

/**
 * Advanced Cleaning to remove OCR artifacts
 * - Removes lines/borders (_______, -------)
 * - Removes isolated special characters
 * - Fixes broken spacing
 */
const cleanupExtractedText = (text: string): string => {
    return text
        .split('\n')
        .map(line => {
            const trimmed = line.trim();
            
            // 1. Remove Lines/Borders (e.g., "_______", "-------", "======")
            if (/^[-_=—|*]{3,}$/.test(trimmed)) return '';

            // 2. Remove lines that are purely non-alphanumeric noise (e.g., "| ; .")
            // Allow currency symbols and brackets, but reject if ONLY symbols
            if (/^[\W\s]+$/.test(trimmed)) return '';

            // 3. Remove very short garbage lines with no vowels/numbers (often dust specks)
            if (trimmed.length < 3 && !/[a-zA-Z0-9\u0C00-\u0C7F]/.test(trimmed)) return ''; // \u0C00-\u0C7F is Telugu range

            return line;
        })
        .filter(line => line.trim().length > 0) // Remove empty lines created above
        .join('\n');
};

export interface OCRResult {
    text: string;
    confidence: number;
}

export const recognizeText = async (
  imageInput: File | Blob,
  language: string,
  onProgress: (progress: number, status: string) => void
): Promise<OCRResult> => {
  const Tesseract = window.Tesseract;
  
  if (!Tesseract) {
    throw new Error("OCR Library not loaded. Please check your connection.");
  }

  const imageUrl = URL.createObjectURL(imageInput);

  try {
    // Hybrid Language Mode: Combine target language with English
    // This allows Tesseract to switch between scripts, improving number/symbol accuracy significantly.
    const langMode = language === 'eng' ? 'eng' : `${language}+eng`;

    const worker = await Tesseract.createWorker(langMode, 1, {
        logger: (m: any) => {
            if (m.status === 'recognizing text') {
                onProgress(Math.round(m.progress * 100), 'Reading text...');
            } else if (m.status.includes('loading')) {
                onProgress(20, `Downloading language data... (${language})`);
            } else if (m.status.includes('initializing')) {
                onProgress(50, 'Initializing AI engine...');
            }
        }
    });

    onProgress(60, 'Scanning document...');
    
    // Perform OCR
    const result = await worker.recognize(imageUrl);
    
    onProgress(90, 'Filtering noise...');

    const CONFIDENCE_THRESHOLD = 50; 

    // Filter Paragraphs
    let totalConf = 0;
    let lineCount = 0;

    const validParagraphs = result.data.paragraphs.map((paragraph: any) => {
        const validLines = paragraph.lines
            .filter((line: any) => {
                // Confidence Check
                if (line.confidence > CONFIDENCE_THRESHOLD) {
                    totalConf += line.confidence;
                    lineCount++;
                    return true;
                }
                return false;
            })
            .map((line: any) => line.text)
            .join('\n');
        return validLines;
    }).filter((p: string) => p.trim().length > 0).join('\n\n');
    
    // Apply Advanced Regex Cleaning
    const finalText = cleanupExtractedText(validParagraphs);
    
    // Fallback if strict filtering removed everything
    const outputText = finalText.trim().length === 0 ? result.data.text : finalText;
    const avgConfidence = lineCount > 0 ? Math.round(totalConf / lineCount) : result.data.confidence;

    await worker.terminate();
    onProgress(100, 'Done');
    
    return {
        text: outputText,
        confidence: avgConfidence
    };

  } catch (e: any) {
    console.error("OCR Error", e);
    throw new Error("OCR Failed. " + (e.message || "Please check internet for language download."));
  } finally {
    URL.revokeObjectURL(imageUrl);
  }
};
