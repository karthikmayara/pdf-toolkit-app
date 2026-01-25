
import React, { useState, useRef, useMemo, useEffect } from 'react';
import { ProcessStatus, SupportedFormat } from '../types';
import { optimizeImages, OptimizationSettings, OptimizedResult, generatePreview } from '../services/imageOptimizer';
import { ComparisonSlider } from './ComparisonSlider';

// Helper for formatting bytes
const formatBytes = (bytes: number, decimals = 2) => {
  if (bytes === 0) return '0 Bytes';
  const k = 1024;
  const dm = decimals < 0 ? 0 : decimals;
  const sizes = ['Bytes', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(dm)) + ' ' + sizes[i];
};

interface OptimizerItem {
  id: string;
  file: File;
  previewUrl: string; 
  status: 'idle' | 'processing' | 'done';
  dimensions?: string; 
}

const SUPPORTED_TYPES = ['image/jpeg', 'image/png', 'image/webp', 'image/avif'];

const ImageOptimizerTool: React.FC = () => {
  const [items, setItems] = useState<OptimizerItem[]>([]);
  const [status, setStatus] = useState<ProcessStatus>({ isProcessing: false, currentStep: '', progress: 0 });
  const [detailedResults, setDetailedResults] = useState<OptimizedResult[]>([]);
  const [isDragging, setIsDragging] = useState(false);
  const [unsupportedFiles, setUnsupportedFiles] = useState<string[]>([]);
  
  // Compare Modal State
  const [compareItem, setCompareItem] = useState<{ original: string, compressed: string, filename: string } | null>(null);

  const [settings, setSettings] = useState<OptimizationSettings>({
    targetFormat: 'original',
    quality: 0.8,
    maxWidth: 0 
  });

  const fileInputRef = useRef<HTMLInputElement>(null);
  const resultsRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (status.resultBlob && resultsRef.current) {
        resultsRef.current.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }
  }, [status.resultBlob]);

  useEffect(() => {
      return () => {
          items.forEach(i => {
              if (i.previewUrl) URL.revokeObjectURL(i.previewUrl);
          });
      };
  }, []);

  const resetState = () => {
    items.forEach(i => URL.revokeObjectURL(i.previewUrl));
    setItems([]);
    setDetailedResults([]);
    setStatus({ isProcessing: false, currentStep: '', progress: 0, resultBlob: undefined, error: undefined });
    setUnsupportedFiles([]);
    setCompareItem(null);
  };

  const handleBackToOptions = () => {
    setStatus(prev => ({ 
        ...prev, 
        resultBlob: undefined, 
        resultFileName: undefined, 
        compressedSize: undefined, 
        error: undefined
    }));
    setDetailedResults([]);
    setItems(prev => prev.map(i => ({...i, status: 'idle'})));
  };

  const addFiles = async (newFiles: File[]) => {
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
        setTimeout(() => setUnsupportedFiles([]), 8000);
    }
    
    if (validFiles.length === 0) return;

    const newItems: OptimizerItem[] = validFiles.map(f => ({
        id: Math.random().toString(36).substr(2, 9),
        file: f,
        previewUrl: '', 
        status: 'processing' 
    }));
    
    setItems(prev => [...prev, ...newItems]);
    setStatus({ isProcessing: false, currentStep: '', progress: 0 });

    processPreviews(newItems, settings);
  };

  const processPreviews = async (targetItems: OptimizerItem[], currentSettings: OptimizationSettings) => {
      for (const item of targetItems) {
         try {
             const { previewUrl, width, height } = await generatePreview(item.file, currentSettings);
             setItems(prev => prev.map(i => {
                 if (i.id === item.id) {
                     if (i.previewUrl) URL.revokeObjectURL(i.previewUrl);
                     return { 
                         ...i, 
                         previewUrl, 
                         dimensions: `${width} x ${height}`,
                         status: 'idle'
                     };
                 }
                 return i;
             }));
             await new Promise(r => setTimeout(r, 10));
         } catch (e) {
             console.error("Preview failed for", item.file.name, e);
             setItems(prev => prev.map(i => i.id === item.id ? { ...i, status: 'idle' } : i));
         }
      }
  };

  useEffect(() => {
      if (items.length === 0) return;
      if (status.isProcessing) return;
      const timer = setTimeout(() => {
          processPreviews(items, settings);
      }, 500);
      return () => clearTimeout(timer);
  }, [settings.targetFormat]); 

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files.length > 0) {
      addFiles(Array.from(e.target.files));
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
    if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
      addFiles(Array.from(e.dataTransfer.files));
    }
  };

  const removeItem = (index: number) => {
    const newItems = [...items];
    const removed = newItems.splice(index, 1);
    URL.revokeObjectURL(removed[0].previewUrl);
    setItems(newItems);
  };

  const handleStart = async () => {
    if (items.length === 0) return;

    const totalOriginal = items.reduce((acc, i) => acc + i.file.size, 0);

    setItems(prev => prev.map(i => ({...i, status: 'idle'})));
    setDetailedResults([]);

    setStatus({ 
        isProcessing: true, 
        currentStep: 'Starting...', 
        progress: 0,
        originalSize: totalOriginal 
    });

    try {
      const result = await optimizeImages(
        items.map(i => i.file), 
        settings, 
        (progress, currentFile) => {
           setStatus(prev => ({ ...prev, progress, currentStep: currentFile }));
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

      setDetailedResults(result.details);

      setStatus({
        isProcessing: false,
        currentStep: 'Completed!',
        progress: 100,
        resultBlob: result.blob,
        resultFileName: result.filename,
        originalSize: result.stats.original,
        compressedSize: result.stats.compressed
      });
    } catch (error: any) {
      console.error(error);
      setStatus(prev => ({ 
        ...prev, 
        isProcessing: false, 
        error: error.message || 'Optimization failed.' 
      }));
    }
  };

  const handleDownload = () => {
    if (!status.resultBlob) return;
    const url = URL.createObjectURL(status.resultBlob);
    const a = document.createElement('a');
    a.href = url;
    a.download = status.resultFileName || 'optimized_images.zip';
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  const downloadSingleResult = (res: OptimizedResult) => {
     const url = URL.createObjectURL(res.blob);
     const a = document.createElement('a');
     a.href = url;
     a.download = res.fileName;
     document.body.appendChild(a);
     a.click();
     document.body.removeChild(a);
     URL.revokeObjectURL(url);
  };

  const openCompare = (res: OptimizedResult) => {
      // Find original file. 
      // We rely on size matching because names might change, but robust enough for this session.
      const originalItem = items.find(i => i.file.size === res.originalSize);
      
      if (originalItem) {
          const originalUrl = URL.createObjectURL(originalItem.file);
          const compressedUrl = URL.createObjectURL(res.blob);
          setCompareItem({
              original: originalUrl,
              compressed: compressedUrl,
              filename: res.fileName
          });
      } else {
          alert("Original file not found for comparison.");
      }
  };

  const closeCompare = () => {
      if (compareItem) {
          URL.revokeObjectURL(compareItem.original);
          URL.revokeObjectURL(compareItem.compressed);
      }
      setCompareItem(null);
  };

  const totalOriginalSize = useMemo(() => items.reduce((acc, i) => acc + i.file.size, 0), [items]);
  const savingsPercent = status.originalSize && status.compressedSize 
    ? Math.round(((status.originalSize - status.compressedSize) / status.originalSize) * 100) 
    : 0;

  return (
    <div className="max-w-4xl mx-auto animate-fade-in">
      <div className="bg-white dark:bg-slate-800 rounded-2xl shadow-xl overflow-hidden border border-slate-100 dark:border-slate-700 transition-colors duration-300">
        
        {/* Header */}
        <div className="bg-gradient-to-r from-blue-500 to-cyan-500 p-8 text-white text-center">
          <h2 className="text-3xl font-bold mb-2">Image Compressor</h2>
          <p className="opacity-90">Reduce image size efficiently while maintaining quality.</p>
        </div>

        <div className="p-4 sm:p-8">
          
          {/* Unsupported File Warning */}
          {unsupportedFiles.length > 0 && (
             <div className="mb-6 p-4 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-xl flex items-start gap-3 animate-fade-in">
                 <div className="text-2xl">⚠️</div>
                 <div>
                     <h4 className="font-bold text-red-700 dark:text-red-300">Unsupported Files Detected</h4>
                     <p className="text-sm text-red-600 dark:text-red-400 mt-1">
                         The following files were skipped: {unsupportedFiles.slice(0,3).join(', ')} {unsupportedFiles.length > 3 ? `and ${unsupportedFiles.length - 3} more` : ''}.
                     </p>
                     <p className="text-xs font-bold text-red-500 mt-2 uppercase">Supported Formats: JPG, PNG, WEBP, AVIF</p>
                 </div>
                 <button onClick={() => setUnsupportedFiles([])} className="ml-auto text-red-400 hover:text-red-600">✕</button>
             </div>
          )}

          {/* 1. Upload Section */}
          {items.length === 0 && (
            <div 
              onClick={() => fileInputRef.current?.click()}
              onDragOver={(e) => { e.preventDefault(); setIsDragging(true); }}
              onDragLeave={(e) => { e.preventDefault(); setIsDragging(false); }}
              onDrop={handleDrop}
              className={`
                border-4 border-dashed rounded-xl p-12 text-center cursor-pointer transition-all duration-200 group
                ${isDragging 
                  ? 'border-blue-500 bg-blue-50 dark:bg-slate-700 scale-102' 
                  : 'border-slate-200 dark:border-slate-600 hover:border-blue-400 dark:hover:border-blue-500 hover:bg-slate-50 dark:hover:bg-slate-700/50'}
              `}
            >
              <div className="text-6xl mb-4 group-hover:scale-110 transition-transform duration-300">📉</div>
              <h3 className="text-xl font-bold text-slate-700 dark:text-slate-200 mb-2">
                {isDragging ? 'Drop images here!' : 'Drop JPG, PNG, WEBP, AVIF'}
              </h3>
              <p className="text-slate-500 dark:text-slate-400">Bulk processing supported</p>
            </div>
          )}

          {/* 2. Main Interface */}
          {items.length > 0 && !status.resultBlob && (
             <div className={`space-y-8 animate-fade-in`}>
               
               {/* Toolbar */}
               <div className="flex flex-col sm:flex-row justify-between items-center bg-slate-50 dark:bg-slate-700/50 p-4 rounded-lg border border-slate-200 dark:border-slate-600 gap-4">
                  <div className="text-left">
                     <span className="font-bold text-slate-700 dark:text-slate-200 text-lg">{items.length} Images</span>
                     <p className="text-xs text-slate-500 dark:text-slate-400">Total Size: {formatBytes(totalOriginalSize)}</p>
                  </div>
                  <div className="flex gap-2 w-full sm:w-auto">
                    <button 
                        onClick={resetState} 
                        className="flex-1 sm:flex-none px-4 py-2 text-red-500 hover:bg-red-50 dark:hover:bg-red-900/20 rounded-lg font-bold text-sm transition-colors"
                        disabled={status.isProcessing}
                    >
                        Clear All
                    </button>
                    <button 
                        onClick={() => fileInputRef.current?.click()} 
                        className="flex-1 sm:flex-none px-4 py-2 bg-white dark:bg-slate-600 border border-slate-200 dark:border-slate-500 text-blue-600 dark:text-blue-300 hover:bg-blue-50 dark:hover:bg-slate-500 rounded-lg font-bold text-sm transition-colors"
                        disabled={status.isProcessing}
                    >
                        + Add More
                    </button>
                  </div>
               </div>

               {/* Grid Preview */}
               <div className="grid grid-cols-3 sm:grid-cols-4 md:grid-cols-6 gap-2">
                  {items.map((item, idx) => (
                      <div 
                        key={item.id} 
                        className={`
                          relative aspect-square bg-slate-100 dark:bg-slate-900 rounded-lg overflow-hidden group border border-slate-200 dark:border-slate-700
                          ${item.status === 'processing' ? 'ring-2 ring-blue-400' : ''}
                          ${item.status === 'done' ? 'ring-2 ring-green-500 border-green-500' : ''}
                        `}
                      >
                          {item.previewUrl ? (
                            <img 
                              src={item.previewUrl} 
                              alt="preview" 
                              loading="lazy"
                              decoding="async"
                              className={`w-full h-full object-cover transition-opacity ${item.status === 'processing' ? 'opacity-50' : 'opacity-100'}`} 
                            />
                          ) : (
                            <div className="w-full h-full flex items-center justify-center text-slate-300">
                               <div className="w-8 h-8 border-4 border-blue-400 border-t-transparent rounded-full animate-spin"></div>
                            </div>
                          )}
                          
                          {item.dimensions && item.status !== 'processing' && (
                             <div className="absolute bottom-0 left-0 right-0 bg-black/60 backdrop-blur-[2px] p-1">
                                <p className="text-[9px] text-white text-center font-mono truncate">{item.dimensions}</p>
                             </div>
                          )}
                          
                          {item.status === 'processing' && item.previewUrl && (
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

                          <button 
                             onClick={() => removeItem(idx)}
                             disabled={status.isProcessing}
                             className="absolute top-1 right-1 bg-red-500 text-white rounded-full p-0.5 opacity-0 group-hover:opacity-100 transition-opacity disabled:hidden"
                          >
                             <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M6 18L18 6M6 6l12 12"></path></svg>
                          </button>
                      </div>
                  ))}
               </div>

               {/* Settings */}
               <div className={`bg-slate-50 dark:bg-slate-700/30 p-6 rounded-xl border border-slate-100 dark:border-slate-700 space-y-6 ${status.isProcessing ? 'opacity-50 pointer-events-none' : ''}`}>
                  
                  {/* Format */}
                  <div>
                    <label className="block text-sm font-bold text-slate-700 dark:text-slate-300 mb-2 uppercase tracking-wide">Output Format</label>
                    <div className="grid grid-cols-2 sm:grid-cols-5 gap-2">
                        {[
                          {val: 'original', label: 'Original'}, 
                          {val: 'image/jpeg', label: 'JPG'}, 
                          {val: 'image/png', label: 'PNG'}, 
                          {val: 'image/webp', label: 'WEBP'},
                          {val: 'image/avif', label: 'AVIF'}
                        ].map((opt) => (
                           <button
                             key={opt.val}
                             onClick={() => setSettings(s => ({ ...s, targetFormat: opt.val as any }))}
                             className={`py-2 px-1 sm:px-3 text-xs sm:text-sm font-bold rounded-lg border-2 transition-all
                                ${settings.targetFormat === opt.val 
                                  ? 'border-blue-500 bg-blue-50 dark:bg-slate-700 text-blue-700 dark:text-blue-300' 
                                  : 'border-transparent bg-white dark:bg-slate-800 text-slate-600 dark:text-slate-400 hover:border-slate-200'}`}
                           >
                             {opt.label}
                           </button>
                        ))}
                    </div>
                    {/* AVIF Promo Badge */}
                    {settings.targetFormat === 'image/avif' && (
                        <p className="text-xs text-blue-600 dark:text-blue-400 mt-2 font-medium animate-fade-in">
                           ✨ AVIF offers the best compression (up to 50% smaller than JPEG).
                        </p>
                    )}
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-8">
                      {/* Quality */}
                      <div>
                        <div className="flex justify-between mb-2">
                           <label className="text-sm font-bold text-slate-700 dark:text-slate-300 uppercase tracking-wide">Compression Level</label>
                           <span className="text-xs font-mono bg-blue-100 dark:bg-blue-900/40 text-blue-700 dark:text-blue-300 px-2 py-0.5 rounded">
                             {Math.round(settings.quality * 100)}%
                           </span>
                        </div>
                        <input 
                           type="range" min="10" max="100" 
                           value={settings.quality * 100}
                           onChange={(e) => setSettings(s => ({...s, quality: Number(e.target.value)/100}))}
                           className="w-full h-2 bg-slate-200 dark:bg-slate-600 rounded-lg appearance-none cursor-pointer accent-blue-500"
                        />
                        <div className="flex justify-between text-[10px] text-slate-400 mt-1 uppercase font-bold">
                            <span>Smallest Size</span>
                            <span>Best Quality</span>
                        </div>
                      </div>

                      {/* Resize */}
                      <div>
                        <div className="flex justify-between mb-2">
                           <label className="text-sm font-bold text-slate-700 dark:text-slate-300 uppercase tracking-wide">Max Width (Resize)</label>
                           <span className="text-xs font-mono text-slate-500">
                             {settings.maxWidth === 0 ? 'Original Dimensions' : `${settings.maxWidth}px`}
                           </span>
                        </div>
                        <select 
                           value={settings.maxWidth}
                           onChange={(e) => setSettings(s => ({...s, maxWidth: Number(e.target.value)}))}
                           className="w-full p-2.5 rounded-lg bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-600 text-slate-700 dark:text-slate-200 text-sm font-bold focus:ring-2 focus:ring-blue-500 outline-none"
                        >
                            <option value="0">No Resize (Keep Original)</option>
                            <option value="1920">1920px (Full HD)</option>
                            <option value="1280">1280px (HD)</option>
                            <option value="800">800px (Web Friendly)</option>
                            <option value="500">500px (Thumbnail)</option>
                        </select>
                      </div>
                  </div>
               </div>

               {/* Process Button */}
               <button
                  onClick={handleStart}
                  disabled={status.isProcessing}
                  className="w-full py-4 bg-blue-600 hover:bg-blue-700 text-white rounded-xl font-bold text-lg shadow-lg shadow-blue-200 dark:shadow-none transition-all active:scale-[0.99] disabled:bg-slate-300 disabled:cursor-not-allowed"
               >
                  {status.isProcessing ? 'Compressing Images...' : `Compress ${items.length} Images`}
               </button>

               {/* Progress Bar */}
               {status.isProcessing && (
                <div className="space-y-2">
                  <div className="flex justify-between text-xs font-bold uppercase text-slate-500 dark:text-slate-400 tracking-wider">
                    <span className="animate-pulse">{status.currentStep}</span>
                    <span>{status.progress}%</span>
                  </div>
                  <div className="h-4 bg-slate-100 dark:bg-slate-700 rounded-full overflow-hidden">
                    <div 
                      className="h-full bg-blue-500 transition-all duration-300 ease-out" 
                      style={{ width: `${status.progress}%` }}
                    ></div>
                  </div>
                </div>
              )}
             </div>
          )}

          {/* 3. Results */}
          {status.resultBlob && (
             <div ref={resultsRef} className="animate-fade-in-up">
                
                {/* Main Summary Card */}
                <div className="text-center mb-8">
                    <div className="inline-block mb-6">
                        <div className="flex items-center gap-2 bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-300 px-6 py-2 rounded-full border border-green-200 dark:border-green-800">
                            <span className="text-2xl font-bold">↓ {savingsPercent}%</span>
                            <span className="text-sm font-medium uppercase tracking-wide">Total Reduction</span>
                        </div>
                    </div>

                    <div className="bg-slate-50 dark:bg-slate-800/50 rounded-2xl p-6 border border-slate-100 dark:border-slate-700 max-w-lg mx-auto">
                        <div className="grid grid-cols-2 divide-x divide-slate-200 dark:divide-slate-600">
                            <div className="px-4">
                                <p className="text-xs text-slate-500 dark:text-slate-400 uppercase font-bold tracking-wide mb-1">Original Size</p>
                                <p className="text-xl sm:text-2xl font-mono text-slate-700 dark:text-slate-300">{formatBytes(status.originalSize || 0)}</p>
                            </div>
                            <div className="px-4">
                                <p className="text-xs text-slate-500 dark:text-slate-400 uppercase font-bold tracking-wide mb-1">Optimized Size</p>
                                <p className="text-xl sm:text-2xl font-mono text-blue-600 dark:text-blue-400 font-bold">{formatBytes(status.compressedSize || 0)}</p>
                            </div>
                        </div>
                    </div>
                </div>
                
                {/* Detailed Breakdown List */}
                <div className="mb-8 bg-white dark:bg-slate-800 rounded-xl border border-slate-200 dark:border-slate-700 overflow-hidden shadow-sm">
                   <div className="bg-slate-50 dark:bg-slate-700/50 px-4 py-3 border-b border-slate-200 dark:border-slate-700 font-bold text-sm text-slate-700 dark:text-slate-200 flex justify-between items-center">
                      <span>Detailed Results</span>
                      <span className="text-xs bg-slate-200 dark:bg-slate-600 px-2 py-0.5 rounded-full">{detailedResults.length} Files</span>
                   </div>
                   <div className="max-h-80 overflow-y-auto custom-scrollbar">
                      {detailedResults.map((res, i) => {
                         const saved = Math.max(0, res.originalSize - res.compressedSize);
                         const percent = Math.round((saved / res.originalSize) * 100);
                         return (
                            <div key={i} className="flex items-center gap-4 p-4 border-b border-slate-100 dark:border-slate-700/50 last:border-0 hover:bg-slate-50 dark:hover:bg-slate-700/30 transition-colors">
                                <div className="w-10 h-10 bg-slate-100 dark:bg-slate-900 rounded flex items-center justify-center text-xl shrink-0">
                                   🖼️
                                </div>
                                <div className="min-w-0 flex-1">
                                   <p className="text-sm font-bold text-slate-700 dark:text-slate-200 truncate" title={res.fileName}>{res.fileName}</p>
                                   <div className="flex items-center gap-2 text-xs text-slate-500 dark:text-slate-400">
                                      <span className="line-through opacity-70">{formatBytes(res.originalSize, 0)}</span>
                                      <span>→</span>
                                      <span className="font-bold text-slate-700 dark:text-slate-300">{formatBytes(res.compressedSize, 0)}</span>
                                   </div>
                                </div>
                                <div className="text-right shrink-0 flex items-center gap-2">
                                   <div className="text-xs font-bold text-green-600 dark:text-green-400 mr-2">-{percent}%</div>
                                   
                                   {/* Compare Button */}
                                   <button 
                                      onClick={() => openCompare(res)}
                                      className="p-1.5 text-slate-500 hover:text-blue-500 dark:text-slate-400 dark:hover:text-blue-300 border border-slate-200 dark:border-slate-600 rounded hover:bg-white dark:hover:bg-slate-700 transition-all"
                                      title="Compare"
                                   >
                                      <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z"></path></svg>
                                   </button>

                                   <button 
                                      onClick={() => downloadSingleResult(res)}
                                      className="p-1.5 text-blue-500 hover:text-blue-600 dark:text-blue-400 dark:hover:text-blue-300 border border-blue-200 dark:border-blue-900 rounded hover:bg-blue-50 dark:hover:bg-blue-900/30 transition-all"
                                      title="Download"
                                   >
                                      <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4"></path></svg>
                                   </button>
                                </div>
                            </div>
                         )
                      })}
                   </div>
                </div>

                {/* Main Actions */}
                <div className="flex flex-col sm:flex-row gap-4 justify-center">
                  <button 
                    onClick={handleDownload}
                    className="px-8 py-4 bg-blue-600 hover:bg-blue-700 text-white rounded-xl font-bold shadow-lg shadow-blue-200 dark:shadow-none transition-all hover:scale-105 active:scale-95 flex items-center justify-center gap-2"
                  >
                    <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4"></path></svg>
                    Download All {items.length > 1 ? '(ZIP)' : ''}
                  </button>
                  <button 
                    onClick={handleBackToOptions}
                    className="px-8 py-4 bg-slate-100 dark:bg-slate-700 text-slate-700 dark:text-slate-200 rounded-xl font-bold hover:bg-slate-200 dark:hover:bg-slate-600 transition-all"
                  >
                    Adjust Quality
                  </button>
                  <button 
                    onClick={resetState}
                    className="px-8 py-4 bg-white dark:bg-transparent border border-slate-200 dark:border-slate-600 text-slate-700 dark:text-slate-200 rounded-xl font-bold hover:bg-slate-50 dark:hover:bg-slate-700 transition-all"
                  >
                    Start Over
                  </button>
                </div>
             </div>
          )}

        </div>
      </div>
      
      {/* Comparison Modal */}
      {compareItem && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm p-4 animate-fade-in" onClick={closeCompare}>
              <div className="bg-white dark:bg-slate-900 rounded-2xl w-full max-w-4xl h-[80vh] flex flex-col overflow-hidden shadow-2xl relative" onClick={e => e.stopPropagation()}>
                  <div className="p-4 border-b border-slate-200 dark:border-slate-800 flex justify-between items-center bg-slate-50 dark:bg-slate-900">
                      <h3 className="font-bold text-slate-800 dark:text-white truncate max-w-[80%]">{compareItem.filename}</h3>
                      <button onClick={closeCompare} className="p-2 hover:bg-slate-200 dark:hover:bg-slate-800 rounded-full transition-colors">
                          <svg className="w-5 h-5 text-slate-500" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M6 18L18 6M6 6l12 12"></path></svg>
                      </button>
                  </div>
                  <div className="flex-1 p-4 bg-slate-100 dark:bg-slate-950 flex items-center justify-center">
                      <div className="w-full h-full max-w-3xl max-h-[600px]">
                          <ComparisonSlider original={compareItem.original} compressed={compareItem.compressed} />
                      </div>
                  </div>
                  <div className="p-3 bg-slate-50 dark:bg-slate-900 text-center text-xs text-slate-500 dark:text-slate-400">
                      Drag slider to check visual quality
                  </div>
              </div>
          </div>
      )}

      <input 
        ref={fileInputRef}
        type="file" 
        accept="image/jpeg,image/png,image/webp,image/avif" 
        multiple 
        onChange={handleFileChange} 
        className="hidden" 
      />
    </div>
  );
};

export default ImageOptimizerTool;
