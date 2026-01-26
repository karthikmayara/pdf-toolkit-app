
import React, { useState, useRef, useMemo, useEffect } from 'react';
import { ProcessStatus, SupportedFormat } from '../types';
import { convertFile, ConversionItem } from '../services/imageConversion';

// Helper for formatting bytes
const formatBytes = (bytes: number, decimals = 2) => {
  if (bytes === 0) return '0 Bytes';
  const k = 1024;
  const dm = decimals < 0 ? 0 : decimals;
  const sizes = ['Bytes', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(dm)) + ' ' + sizes[i];
};

interface ToolSettings {
    quality: number;
    mergeToPdf: boolean;
}

// Extended Item type to hold preview URLs and status
// Explicitly including file and targetFormat to avoid missing property errors
interface ExtendedConversionItem {
    id: string;
    file: File;
    targetFormat: SupportedFormat;
    previewUrl?: string;
    status: 'idle' | 'processing' | 'done';
}

const SUPPORTED_TYPES = ['image/jpeg', 'image/png', 'image/webp', 'application/pdf'];

const ImageConverterTool: React.FC = () => {
  const [items, setItems] = useState<ExtendedConversionItem[]>([]);
  const [status, setStatus] = useState<ProcessStatus>({ isProcessing: false, currentStep: '', progress: 0 });
  const [isDragging, setIsDragging] = useState(false);
  const [draggedItemIndex, setDraggedItemIndex] = useState<number | null>(null);
  
  const [unsupportedFiles, setUnsupportedFiles] = useState<string[]>([]);
  
  const [settings, setSettings] = useState<ToolSettings>({
    quality: 0.9,
    mergeToPdf: false
  });

  const fileInputRef = useRef<HTMLInputElement>(null);
  const resultsRef = useRef<HTMLDivElement>(null);

  // Auto-scroll to results when done
  useEffect(() => {
    if (status.resultBlob && resultsRef.current) {
        resultsRef.current.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }
  }, [status.resultBlob]);

  const resetState = () => {
    // Revoke old previews
    items.forEach(i => i.previewUrl && URL.revokeObjectURL(i.previewUrl));
    setItems([]);
    setStatus({ isProcessing: false, currentStep: '', progress: 0, resultBlob: undefined, error: undefined });
    setUnsupportedFiles([]);
  };

  const handleBackToOptions = () => {
    setStatus(prev => ({ 
        ...prev, 
        resultBlob: undefined, 
        resultFileName: undefined, 
        compressedSize: undefined,
        error: undefined
    }));
    // Reset individual statuses
    setItems(prev => prev.map(i => ({ ...i, status: 'idle' })));
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files.length > 0) {
      addFiles(Array.from(e.target.files));
      setStatus({ isProcessing: false, currentStep: '', progress: 0 });
    }
  };

  const handleDragOver = (e: React.DragEvent) => { e.preventDefault(); setIsDragging(true); };
  const handleDragLeave = (e: React.DragEvent) => { e.preventDefault(); setIsDragging(false); };
  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
    if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
      addFiles(Array.from(e.dataTransfer.files));
      setStatus({ isProcessing: false, currentStep: '', progress: 0 });
    }
  };

  const addFiles = (newFiles: File[]) => {
    const validFiles: File[] = [];
    const invalidNames: string[] = [];

    newFiles.forEach(f => {
        if (SUPPORTED_TYPES.includes(f.type)) {
            validFiles.push(f);
        } else {
            invalidNames.push(f.name);
        }
    });

    if (invalidNames.length > 0) {
        setUnsupportedFiles(prev => [...prev, ...invalidNames]);
        // Auto-hide warning after 8 seconds
        setTimeout(() => setUnsupportedFiles([]), 8000);
    }

    const defaultFormat: SupportedFormat = 'image/jpeg';
    const newItems: ExtendedConversionItem[] = validFiles.map(f => {
        let previewUrl: string | undefined = undefined;
        // Create preview immediately for images
        if (f.type.startsWith('image/')) {
            previewUrl = URL.createObjectURL(f);
        }
        
        return {
            id: Math.random().toString(36).substr(2, 9),
            file: f,
            targetFormat: f.type === 'application/pdf' ? 'image/jpeg' : defaultFormat,
            previewUrl,
            status: 'idle'
        };
    });
    setItems(prev => [...prev, ...newItems]);
  };

  const removeFile = (index: number) => {
      const newItems = [...items];
      const removed = newItems.splice(index, 1);
      if (removed[0].previewUrl) URL.revokeObjectURL(removed[0].previewUrl);
      setItems(newItems);
      if(status.resultBlob) {
          setStatus(prev => ({ ...prev, resultBlob: undefined }));
      }
  };

  const updateItemFormat = (index: number, format: SupportedFormat) => {
      setItems(prev => {
          const next = [...prev];
          next[index] = { ...next[index], targetFormat: format };
          return next;
      });
  };

  const setAllFormats = (format: SupportedFormat) => {
      setItems(prev => prev.map(item => ({ ...item, targetFormat: format })));
      // If setting all to PDF, default to merging
      if (format === 'application/pdf') {
          setSettings(s => ({ ...s, mergeToPdf: true }));
      } else {
          setSettings(s => ({ ...s, mergeToPdf: false }));
      }
  };

  // Drag Sorting Logic
  const onDragStart = (e: React.DragEvent, index: number) => {
    setDraggedItemIndex(index);
    e.dataTransfer.effectAllowed = "move";
  };

  const onDragEnter = (e: React.DragEvent, index: number) => {
    e.preventDefault();
    if (draggedItemIndex === null || draggedItemIndex === index) return;
    
    const newItems = [...items];
    const draggedItem = newItems[draggedItemIndex];
    newItems.splice(draggedItemIndex, 1);
    newItems.splice(index, 0, draggedItem);
    
    setDraggedItemIndex(index);
    setItems(newItems);
  };

  const onDragEnd = () => {
    setDraggedItemIndex(null);
  };


  const handleStart = async () => {
    if (items.length === 0) return;

    const totalSize = items.reduce((acc, i) => acc + i.file.size, 0);

    // Reset status
    setItems(prev => prev.map(i => ({...i, status: 'idle'})));

    setStatus({ 
        isProcessing: true, 
        currentStep: 'Starting...', 
        progress: 0,
        originalSize: totalSize 
    });

    try {
      // Clean unnecessary props before sending to service
      const cleanItems = items.map(i => ({ file: i.file, targetFormat: i.targetFormat })) as unknown as ConversionItem[];
      
      const { blob, filename } = await convertFile(
          cleanItems, 
          settings, 
          (progress, step) => {
             setStatus(prev => ({ ...prev, progress, currentStep: step }));
          },
          (index, itemStatus) => {
             setItems(prev => {
                 const newArr = [...prev];
                 if (newArr[index]) {
                     newArr[index] = { ...newArr[index], status: itemStatus };
                 }
                 return newArr;
             });
          }
      );

      setStatus({
        isProcessing: false,
        currentStep: 'Completed!',
        progress: 100,
        resultBlob: blob,
        resultFileName: filename,
        originalSize: totalSize,
        compressedSize: blob.size
      });
    } catch (error: any) {
      console.error(error);
      setStatus(prev => ({ 
        ...prev, 
        isProcessing: false, 
        error: error.message || 'Conversion failed.' 
      }));
    }
  };

  const handleDownload = () => {
    if (!status.resultBlob || items.length === 0) return;
    const url = URL.createObjectURL(status.resultBlob);
    const a = document.createElement('a');
    a.href = url;
    a.download = status.resultFileName || `converted_${items[0].file.name}`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  const handleAddMoreClick = () => {
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
      fileInputRef.current.click();
    }
  };

  // Determine available output formats based on input
  const totalOriginalSize = useMemo(() => items.reduce((acc, i) => acc + i.file.size, 0), [items]);
  const pdfTargetsCount = items.filter(i => i.targetFormat === 'application/pdf').length;
  const showMergeOption = pdfTargetsCount > 1;

  const availableFormats: {value: SupportedFormat, label: string}[] = [
    { value: 'application/pdf', label: 'PDF Document' },
    { value: 'image/jpeg', label: 'JPG Image' },
    { value: 'image/png', label: 'PNG Image' },
    { value: 'image/webp', label: 'WEBP Image' },
  ];

  return (
    <div className="max-w-4xl mx-auto animate-fade-in">
      <div className="bg-white dark:bg-slate-800 rounded-2xl shadow-xl overflow-hidden border border-slate-100 dark:border-slate-700 transition-colors duration-300">
        
        {/* Header */}
        <div className="bg-gradient-to-r from-secondary-500 to-emerald-600 p-8 text-white text-center">
          <h2 className="text-3xl font-bold mb-2">Image Converter</h2>
          <p className="opacity-90">Convert images to PDF, or PDF to images.</p>
        </div>

        <div className="p-4 sm:p-8">
          
          {/* Unsupported File Warning */}
          {unsupportedFiles.length > 0 && (
             <div className="mb-6 p-4 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-xl flex items-start gap-3 animate-fade-in">
                 <div className="text-2xl">⚠️</div>
                 <div>
                     <h4 className="font-bold text-red-700 dark:text-red-300">Unsupported Files Detected</h4>
                     <p className="text-sm text-red-600 dark:text-red-400 mt-1">
                         The following files could not be added: {unsupportedFiles.slice(0,3).join(', ')} {unsupportedFiles.length > 3 ? `and ${unsupportedFiles.length - 3} more` : ''}.
                     </p>
                     <p className="text-xs font-bold text-red-500 mt-2 uppercase">Supported Formats: JPG, PNG, WEBP, PDF</p>
                 </div>
                 <button onClick={() => setUnsupportedFiles([])} className="ml-auto text-red-400 hover:text-red-600">✕</button>
             </div>
          )}

          {/* Upload Section */}
          {items.length === 0 && (
            <div 
              onClick={() => fileInputRef.current?.click()}
              onDragOver={handleDragOver}
              onDragLeave={handleDragLeave}
              onDrop={handleDrop}
              className={`
                border-4 border-dashed rounded-xl p-12 text-center cursor-pointer transition-all duration-200 group
                ${isDragging 
                  ? 'border-secondary-500 bg-secondary-50 dark:bg-slate-700 scale-102' 
                  : 'border-slate-200 dark:border-slate-600 hover:border-secondary-400 dark:hover:border-secondary-500 hover:bg-slate-50 dark:hover:bg-slate-700/50'}
              `}
            >
              <div className="text-6xl mb-4 group-hover:scale-110 transition-transform duration-300">🖼️</div>
              <h3 className="text-xl font-bold text-slate-700 dark:text-slate-200 mb-2">
                {isDragging ? 'Drop files here!' : 'Drop Images or PDF here'}
              </h3>
              <p className="text-slate-500 dark:text-slate-400">Supports JPG, PNG, WEBP, PDF</p>
            </div>
          )}

          {/* Config & List Section */}
          {items.length > 0 && !status.resultBlob && (
            <div className={`space-y-8 animate-fade-in`}>
              
              {/* File List */}
              <div className={`bg-slate-50 dark:bg-slate-700/50 rounded-lg border border-slate-200 dark:border-slate-600 overflow-hidden`}>
                  <div className="p-4 bg-slate-100 dark:bg-slate-700 border-b border-slate-200 dark:border-slate-600 flex justify-between items-center">
                      <span className="font-bold text-slate-700 dark:text-slate-200">{items.length} File{items.length > 1 ? 's' : ''} Selected</span>
                      <div className="flex gap-2">
                        <button 
                            onClick={resetState} 
                            disabled={status.isProcessing}
                            className="text-xs text-red-500 hover:text-red-700 font-bold uppercase disabled:opacity-50 disabled:cursor-not-allowed"
                        >
                            Clear All
                        </button>
                        <button 
                            onClick={handleAddMoreClick} 
                            disabled={status.isProcessing}
                            className="text-xs text-secondary-600 hover:text-secondary-500 font-bold uppercase ml-3 disabled:opacity-50 disabled:cursor-not-allowed"
                        >
                            + Add More
                        </button>
                      </div>
                  </div>
                  
                  {/* Grid View for Files */}
                  <div className="max-h-96 overflow-y-auto custom-scrollbar p-3">
                      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-3">
                        {items.map((item, idx) => (
                            <div 
                                key={item.id} 
                                draggable={!status.isProcessing}
                                onDragStart={(e) => onDragStart(e, idx)}
                                onDragEnter={(e) => onDragEnter(e, idx)}
                                onDragEnd={onDragEnd}
                                className={`
                                    relative group bg-white dark:bg-slate-800 rounded-lg border shadow-sm p-2 flex flex-col gap-2 transition-all
                                    ${draggedItemIndex === idx ? 'opacity-50 border-secondary-500 scale-95' : 'border-slate-200 dark:border-slate-600 hover:border-secondary-300 dark:hover:border-secondary-500'}
                                    ${item.status === 'processing' ? 'ring-2 ring-secondary-400' : ''}
                                    ${item.status === 'done' ? 'ring-2 ring-green-500 border-green-500' : ''}
                                `}
                            >
                                {/* Drag Handle / Number */}
                                <div className="absolute top-2 left-2 z-10 bg-black/50 text-white text-xs rounded px-1.5 py-0.5 cursor-grab active:cursor-grabbing">
                                    {idx + 1}
                                </div>

                                {/* Thumbnail Preview */}
                                <div className="aspect-square bg-slate-100 dark:bg-slate-900 rounded-md overflow-hidden flex items-center justify-center relative">
                                    {item.previewUrl ? (
                                        <img 
                                          src={item.previewUrl} 
                                          alt="preview" 
                                          loading="lazy" 
                                          decoding="async"
                                          className={`w-full h-full object-cover transition-opacity ${item.status === 'processing' ? 'opacity-50' : ''}`}
                                        />
                                    ) : (
                                        <span className="text-3xl opacity-50">{item.file.type === 'application/pdf' ? '📑' : '🖼️'}</span>
                                    )}
                                    {/* Overlay for PDF indication */}
                                    {item.file.type === 'application/pdf' && (
                                        <div className="absolute bottom-0 w-full bg-red-600 text-white text-[10px] text-center font-bold py-0.5">PDF</div>
                                    )}

                                    {/* Processing / Done Overlays */}
                                    {item.status === 'processing' && (
                                        <div className="absolute inset-0 flex items-center justify-center bg-black/30 backdrop-blur-sm">
                                            <div className="w-8 h-8 border-4 border-white border-t-transparent rounded-full animate-spin"></div>
                                        </div>
                                    )}
                                    {item.status === 'done' && (
                                        <div className="absolute inset-0 flex items-center justify-center bg-green-500/20 backdrop-blur-[1px]">
                                            <div className="bg-green-500 text-white rounded-full p-1 shadow-lg animate-fade-in-up">
                                               <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="3" d="M5 13l4 4L19 7"></path></svg>
                                            </div>
                                        </div>
                                    )}
                                </div>

                                {/* Details */}
                                <div className="min-w-0">
                                    <p className="text-xs font-medium text-slate-700 dark:text-slate-200 truncate" title={item.file.name}>{item.file.name}</p>
                                    <p className="text-[10px] text-slate-500">{formatBytes(item.file.size)}</p>
                                </div>
                                
                                {/* Format Selector */}
                                <select 
                                    value={item.targetFormat}
                                    onChange={(e) => updateItemFormat(idx, e.target.value as SupportedFormat)}
                                    disabled={status.isProcessing}
                                    className="w-full text-xs p-1 rounded border border-slate-300 dark:border-slate-600 bg-slate-50 dark:bg-slate-700 text-slate-700 dark:text-slate-200 focus:outline-none"
                                >
                                    <option value="image/jpeg">JPG</option>
                                    <option value="image/png">PNG</option>
                                    <option value="image/webp">WEBP</option>
                                    <option value="application/pdf">PDF</option>
                                </select>

                                {/* Remove Button */}
                                <button 
                                    onClick={() => removeFile(idx)}
                                    disabled={status.isProcessing}
                                    className="absolute -top-2 -right-2 bg-red-500 text-white rounded-full p-1 shadow-md opacity-0 group-hover:opacity-100 transition-opacity disabled:hidden"
                                >
                                    <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M6 18L18 6M6 6l12 12"></path></svg>
                                </button>
                            </div>
                        ))}
                      </div>
                  </div>
                  <div className="p-2 text-right bg-slate-50 dark:bg-slate-700/30 text-xs text-slate-500">
                      Drag images to reorder • Total Size: {formatBytes(totalOriginalSize)}
                  </div>
              </div>

              <div className={`grid grid-cols-1 gap-8 ${status.isProcessing ? 'opacity-50 pointer-events-none' : ''}`}>
                <div>
                   <label className="block text-sm font-bold text-slate-700 dark:text-slate-300 uppercase tracking-wide mb-3">Convert All To</label>
                   <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                     {availableFormats.map((fmt) => (
                       <button 
                         key={fmt.value}
                         onClick={() => setAllFormats(fmt.value)}
                         disabled={status.isProcessing} 
                         className={`py-3 px-2 text-sm font-bold border-2 rounded-xl transition-all disabled:cursor-not-allowed
                           ${items.every(i => i.targetFormat === fmt.value)
                             ? 'border-secondary-500 bg-secondary-50 dark:bg-slate-700 dark:border-secondary-500 text-secondary-700 dark:text-white' 
                             : 'border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-400 hover:border-secondary-300'}`}
                       >
                         {fmt.label}
                       </button>
                     ))}
                   </div>
                </div>

                {/* Merge Option (Visible if > 1 PDF target) */}
                <div className={`transition-all duration-300 overflow-hidden ${showMergeOption ? 'max-h-24 opacity-100' : 'max-h-0 opacity-0'}`}>
                    <div className="flex items-center gap-3 p-4 bg-slate-50 dark:bg-slate-700/50 border border-slate-200 dark:border-slate-600 rounded-xl">
                        <div className="relative flex items-center">
                            <input 
                              type="checkbox" 
                              id="mergePdf"
                              checked={settings.mergeToPdf}
                              onChange={(e) => setSettings(s => ({...s, mergeToPdf: e.target.checked}))}
                              disabled={status.isProcessing}
                              className="peer h-6 w-6 cursor-pointer appearance-none rounded-md border border-slate-300 checked:border-secondary-500 checked:bg-secondary-500 transition-all"
                            />
                             <svg className="pointer-events-none absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 w-4 h-4 text-white opacity-0 peer-checked:opacity-100 transition-opacity" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="3" d="M5 13l4 4L19 7"></path></svg>
                        </div>
                        
                        <div>
                          <label htmlFor="mergePdf" className="block text-sm font-bold text-slate-700 dark:text-slate-200 cursor-pointer">Merge output into a single PDF?</label>
                          <p className="text-xs text-slate-500 dark:text-slate-400">Combine all files destined for PDF into one document based on the grid order.</p>
                        </div>
                    </div>
                </div>

                {/* Quality Slider (Only if at least one item is non-PDF and non-PNG) */}
                {items.some(i => i.targetFormat === 'image/jpeg' || i.targetFormat === 'image/webp') && (
                   <div className="animate-fade-in">
                     <div className="flex justify-between text-sm mb-2 text-slate-700 dark:text-slate-300">
                       <span className="font-bold uppercase tracking-wide">Image Quality</span>
                       <span className="font-mono bg-slate-100 dark:bg-slate-700 px-2 py-0.5 rounded">{Math.round(settings.quality * 100)}%</span>
                     </div>
                     <input 
                       type="range" min="10" max="100" 
                       value={settings.quality * 100}
                       disabled={status.isProcessing}
                       onChange={(e) => setSettings(s => ({ ...s, quality: Number(e.target.value) / 100 }))}
                       className="w-full h-2 bg-slate-200 dark:bg-slate-700 rounded-lg appearance-none cursor-pointer accent-secondary-600 disabled:cursor-not-allowed"
                     />
                   </div>
                )}
              </div>

              {/* Error */}
              {status.error && (
                <div className="bg-red-50 dark:bg-red-900/30 text-red-700 dark:text-red-300 p-4 rounded-lg border border-red-200 dark:border-red-800 text-sm font-medium">
                  {status.error}
                </div>
              )}

              {/* Progress */}
              {status.isProcessing && (
                <div className="space-y-2">
                  <div className="flex justify-between text-xs font-bold uppercase text-slate-500 dark:text-slate-400 tracking-wider">
                    <span className="animate-pulse">{status.currentStep}</span>
                    <span>{status.progress}%</span>
                  </div>
                  <div className="h-4 bg-slate-100 dark:bg-slate-700 rounded-full overflow-hidden">
                    <div 
                      className="h-full bg-secondary-500 transition-all duration-300 ease-out" 
                      style={{ width: `${status.progress}%` }}
                    ></div>
                  </div>
                </div>
              )}

              {/* Action */}
              <button
                onClick={handleStart}
                disabled={status.isProcessing}
                className="w-full py-4 bg-secondary-500 hover:bg-secondary-600 dark:bg-secondary-600 dark:hover:bg-secondary-500 disabled:bg-slate-300 dark:disabled:bg-slate-700 disabled:cursor-not-allowed text-white rounded-xl font-bold text-lg shadow-lg shadow-secondary-200 dark:shadow-none transition-all active:scale-[0.99]"
              >
                {status.isProcessing ? 'Converting...' : `Convert ${items.length} File${items.length > 1 ? 's' : ''}`}
              </button>
            </div>
          )}

          {/* Results */}
          {status.resultBlob && (
             <div ref={resultsRef} className="text-center animate-fade-in-up">
                <div className="inline-flex items-center justify-center w-20 h-20 bg-emerald-100 dark:bg-emerald-900/30 text-emerald-600 dark:text-emerald-400 rounded-full mb-6">
                  <svg className="w-10 h-10" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M5 13l4 4L19 7"></path></svg>
                </div>
                <h3 className="text-2xl font-bold text-slate-800 dark:text-white mb-2">Conversion Ready!</h3>
                <p className="text-slate-500 dark:text-slate-400 mb-6">{status.resultFileName}</p>
                
                {/* Size Comparison */}
                <div className="flex justify-center items-center gap-8 mb-8 animate-fade-in">
                  <div className="text-right">
                    <p className="text-xs text-slate-500 dark:text-slate-400 uppercase font-bold tracking-wide">Original</p>
                    <p className="text-xl font-mono text-slate-700 dark:text-slate-300 line-through">{formatBytes(status.originalSize || 0)}</p>
                  </div>
                  <div className="text-slate-300 dark:text-slate-600 text-2xl">→</div>
                  <div className="text-left">
                    <p className="text-xs text-slate-500 dark:text-slate-400 uppercase font-bold tracking-wide">Result</p>
                    <p className="text-xl font-mono text-secondary-600 dark:text-secondary-400 font-bold">{formatBytes(status.compressedSize || status.resultBlob.size)}</p>
                  </div>
                </div>

                <div className="flex flex-col sm:flex-row gap-4 justify-center">
                  <button 
                    onClick={handleDownload}
                    className="px-8 py-4 bg-secondary-600 hover:bg-secondary-700 text-white rounded-xl font-bold shadow-lg shadow-secondary-200 dark:shadow-none transition-all hover:scale-105 active:scale-95 flex items-center justify-center gap-2"
                  >
                    <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4"></path></svg>
                    Download File
                  </button>
                  <button 
                    onClick={handleBackToOptions}
                    className="px-8 py-4 bg-slate-100 dark:bg-slate-700 text-slate-700 dark:text-slate-200 rounded-xl font-bold hover:bg-slate-200 dark:hover:bg-slate-600 transition-all"
                  >
                    Edit Settings
                  </button>
                  <button 
                    onClick={resetState}
                    className="px-8 py-4 bg-white dark:bg-transparent border border-slate-200 dark:border-slate-600 text-slate-700 dark:text-slate-200 rounded-xl font-bold hover:bg-slate-50 dark:hover:bg-slate-700 transition-all"
                  >
                    Convert New
                  </button>
                </div>
             </div>
          )}
        </div>
      </div>

      <input 
        ref={fileInputRef}
        type="file" 
        accept="image/jpeg,image/png,image/webp,application/pdf" 
        multiple 
        onChange={handleFileChange} 
        className="hidden" 
      />
    </div>
  );
};

export default ImageConverterTool;