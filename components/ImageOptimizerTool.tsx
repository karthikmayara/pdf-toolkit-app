
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
        setTimeout(() => {
            resultsRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
        }, 100);
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
    <div className="max-w-7xl mx-auto animate-fade-in pb-12 px-4 sm:px-6">
      
      {/* Main Container */}
      <div className="bg-[#0f172a] text-white rounded-[2rem] shadow-2xl overflow-hidden min-h-[600px] flex flex-col md:flex-row relative">
        
        {/* Close/Reset Button */}
        {items.length > 0 && !status.isProcessing && (
            <button 
                onClick={resetState}
                className="absolute top-4 right-4 z-50 w-10 h-10 bg-white/10 hover:bg-white/20 rounded-full flex items-center justify-center backdrop-blur-md transition-all"
                title="Close / Reset"
            >
                <svg className="w-5 h-5 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M6 18L18 6M6 6l12 12"></path></svg>
            </button>
        )}

        {/* LEFT COLUMN: IMAGE GRID / DROPZONE */}
        <div 
            className={`
                relative md:w-1/2 min-h-[300px] md:min-h-full transition-all duration-500 overflow-hidden flex flex-col
                ${items.length === 0 ? 'bg-gradient-to-br from-indigo-900 to-[#0f172a] items-center justify-center' : 'bg-black/20'}
            `}
            onDragOver={(e) => { e.preventDefault(); setIsDragging(true); }}
            onDragLeave={(e) => { e.preventDefault(); setIsDragging(false); }}
            onDrop={handleDrop}
            onClick={() => items.length === 0 && fileInputRef.current?.click()}
        >
            {items.length === 0 ? (
                <div className={`text-center p-8 cursor-pointer transition-transform duration-300 ${isDragging ? 'scale-105' : ''}`}>
                    <div className="w-32 h-32 bg-indigo-500/20 rounded-full flex items-center justify-center mx-auto mb-6 backdrop-blur-sm border border-indigo-500/30">
                        <svg className="w-12 h-12 text-indigo-400" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z"></path></svg>
                    </div>
                    <h3 className="text-2xl font-bold tracking-tight mb-2">Upload Images</h3>
                    <p className="text-indigo-200/60 text-sm font-medium uppercase tracking-widest">JPG, PNG, WEBP, AVIF</p>
                </div>
            ) : (
                <div className="p-6 h-full overflow-y-auto custom-scrollbar">
                    {unsupportedFiles.length > 0 && (
                        <div className="mb-4 p-3 bg-red-500/20 border border-red-500/50 rounded-xl text-center">
                            <p className="text-red-200 text-xs font-bold">Skipped {unsupportedFiles.length} unsupported files</p>
                        </div>
                    )}

                    <div className="grid grid-cols-2 lg:grid-cols-3 gap-3 pb-20">
                        {items.map((item, index) => (
                            <div 
                                key={item.id}
                                className={`
                                    relative group bg-[#1e293b] rounded-xl overflow-hidden transition-all duration-300
                                    ${item.status === 'processing' ? 'ring-2 ring-indigo-500' : ''}
                                    ${item.status === 'done' ? 'ring-2 ring-green-500' : 'hover:-translate-y-1 hover:shadow-xl'}
                                `}
                            >
                                {/* Thumbnail */}
                                <div className="relative aspect-square bg-black/40 w-full flex items-center justify-center overflow-hidden">
                                    {item.previewUrl ? (
                                        <img src={item.previewUrl} className="w-full h-full object-cover opacity-80 group-hover:opacity-100 transition-opacity" />
                                    ) : (
                                        <div className="w-6 h-6 border-2 border-indigo-500 border-t-transparent rounded-full animate-spin"></div>
                                    )}
                                    
                                    {/* Overlays */}
                                    {item.status === 'processing' && (
                                        <div className="absolute inset-0 bg-black/60 flex items-center justify-center">
                                            <div className="w-6 h-6 border-2 border-indigo-500 border-t-transparent rounded-full animate-spin"></div>
                                        </div>
                                    )}
                                    {item.status === 'done' && (
                                        <div className="absolute inset-0 bg-green-500/20 flex items-center justify-center">
                                            <div className="bg-green-500 text-white rounded-full p-1 shadow-lg animate-pop">
                                                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="3" d="M5 13l4 4L19 7"></path></svg>
                                            </div>
                                        </div>
                                    )}
                                </div>

                                {/* Remove Button */}
                                <button 
                                    onClick={() => removeItem(index)}
                                    disabled={status.isProcessing}
                                    className="absolute top-1 right-1 w-6 h-6 bg-red-500/90 hover:bg-red-500 text-white rounded-full flex items-center justify-center opacity-0 group-hover:opacity-100 transition-all duration-200 backdrop-blur-sm shadow-lg disabled:hidden"
                                >
                                    <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M6 18L18 6M6 6l12 12"></path></svg>
                                </button>

                                {/* Dimensions Badge */}
                                {item.dimensions && (
                                    <div className="absolute bottom-0 left-0 right-0 bg-black/60 backdrop-blur-[2px] p-1 text-center">
                                        <p className="text-[9px] text-white font-mono">{item.dimensions}</p>
                                    </div>
                                )}
                            </div>
                        ))}

                        {/* Add More Tile */}
                        {!status.resultBlob && !status.isProcessing && (
                            <div 
                                onClick={() => fileInputRef.current?.click()}
                                className="aspect-square border-2 border-dashed border-white/10 rounded-xl flex flex-col items-center justify-center cursor-pointer hover:border-indigo-500/50 hover:bg-white/5 transition-all group"
                            >
                                <span className="text-3xl text-white/30 group-hover:text-indigo-400 mb-2">+</span>
                                <span className="text-[10px] font-bold uppercase text-white/30 tracking-widest">Add</span>
                            </div>
                        )}
                    </div>
                </div>
            )}
            
            {items.length > 0 && isDragging && (
                <div className="absolute inset-0 bg-indigo-900/80 backdrop-blur-sm z-50 flex items-center justify-center">
                    <h3 className="text-2xl font-bold text-white animate-bounce">Drop to Add</h3>
                </div>
            )}
        </div>

        {/* RIGHT COLUMN: CONTROLS */}
        <div className="md:w-1/2 p-8 md:p-12 flex flex-col justify-center relative bg-[#0f172a] z-10 border-t md:border-t-0 md:border-l border-white/5">
            
            {/* Header */}
            <div className="mb-8 shrink-0">
                <div className="flex items-center gap-3 mb-2 text-indigo-400 font-bold text-xs tracking-[0.2em] uppercase">
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z"></path></svg>
                    Web Optimizer
                </div>
                <h2 className="text-5xl font-black text-white leading-[0.9] tracking-tighter">
                    OPTIMIZE <br/> IMAGES
                </h2>
            </div>

            {!status.resultBlob ? (
                /* SETTINGS VIEW */
                <div className={`space-y-8 animate-fade-in ${status.isProcessing ? 'opacity-50 pointer-events-none' : ''}`}>
                    {items.length > 0 && (
                        <>
                            {/* Summary */}
                            <div className="flex justify-between items-center bg-[#1e293b] p-4 rounded-xl border border-white/5">
                                <div>
                                    <p className="text-[10px] font-bold uppercase text-slate-500 mb-1 tracking-wider">Total Images</p>
                                    <p className="text-lg font-mono font-bold text-white">{items.length}</p>
                                </div>
                                <div className="text-right">
                                    <p className="text-[10px] font-bold uppercase text-slate-500 mb-1 tracking-wider">Total Size</p>
                                    <p className="text-lg font-mono font-bold text-indigo-400">{formatBytes(totalOriginalSize)}</p>
                                </div>
                            </div>

                            {/* Format */}
                            <div>
                                <label className="text-[10px] font-bold uppercase text-slate-500 mb-3 block tracking-wider">Output Format</label>
                                <div className="grid grid-cols-5 gap-2">
                                    {[
                                      {val: 'original', label: 'Orig'}, 
                                      {val: 'image/jpeg', label: 'JPG'}, 
                                      {val: 'image/png', label: 'PNG'}, 
                                      {val: 'image/webp', label: 'WEBP'},
                                      {val: 'image/avif', label: 'AVIF'}
                                    ].map((opt) => (
                                       <button
                                         key={opt.val}
                                         onClick={() => setSettings(s => ({ ...s, targetFormat: opt.val as any }))}
                                         className={`py-2 px-1 text-[10px] font-bold uppercase tracking-wider rounded-lg border transition-all
                                            ${settings.targetFormat === opt.val 
                                              ? 'bg-indigo-600 text-white border-indigo-500 shadow-md' 
                                              : 'bg-transparent text-slate-500 border-slate-700 hover:border-slate-500 hover:text-white'}`}
                                       >
                                         {opt.label}
                                       </button>
                                    ))}
                                </div>
                                {settings.targetFormat === 'image/avif' && <p className="text-[9px] text-indigo-400 mt-2 font-bold tracking-wide">✨ AVIF offers best compression.</p>}
                            </div>

                            {/* Sliders */}
                            <div className="space-y-6">
                                {/* Quality */}
                                <div>
                                    <div className="flex justify-between text-[10px] font-bold uppercase text-slate-500 mb-2 tracking-wider">
                                        <span>Quality</span>
                                        <span className="text-indigo-400">{Math.round(settings.quality * 100)}%</span>
                                    </div>
                                    <input 
                                        type="range" min="10" max="100" 
                                        value={settings.quality * 100}
                                        onChange={(e) => setSettings(s => ({...s, quality: Number(e.target.value)/100}))}
                                        className="w-full h-1.5 bg-[#1e293b] rounded-full appearance-none cursor-pointer accent-indigo-500 hover:accent-indigo-400"
                                    />
                                </div>

                                {/* Resize */}
                                <div>
                                    <div className="flex justify-between text-[10px] font-bold uppercase text-slate-500 mb-2 tracking-wider">
                                        <span>Resize Max Width</span>
                                        <span className="text-white">{settings.maxWidth === 0 ? 'Original' : `${settings.maxWidth}px`}</span>
                                    </div>
                                    <select 
                                       value={settings.maxWidth}
                                       onChange={(e) => setSettings(s => ({...s, maxWidth: Number(e.target.value)}))}
                                       className="w-full bg-[#1e293b] text-white text-xs font-bold p-3 rounded-xl border border-white/10 focus:border-indigo-500 outline-none cursor-pointer"
                                    >
                                        <option value="0">No Resize</option>
                                        <option value="1920">1920px (Full HD)</option>
                                        <option value="1280">1280px (HD)</option>
                                        <option value="800">800px (Web)</option>
                                        <option value="500">500px (Thumb)</option>
                                    </select>
                                </div>
                            </div>

                            {/* Progress */}
                            {status.isProcessing && (
                                <div className="space-y-2">
                                    <div className="flex justify-between text-[10px] font-bold uppercase text-indigo-300 tracking-wider">
                                        <span className="animate-pulse">{status.currentStep}</span>
                                        <span>{status.progress}%</span>
                                    </div>
                                    <div className="h-1 bg-slate-800 rounded-full overflow-hidden">
                                        <div className="h-full bg-indigo-500 transition-all duration-300" style={{ width: `${status.progress}%` }}></div>
                                    </div>
                                </div>
                            )}

                            {/* Error */}
                            {status.error && (
                                <p className="text-red-400 text-xs font-bold bg-red-500/10 p-3 rounded-lg border border-red-500/20">{status.error}</p>
                            )}

                            {/* Action Button */}
                            {!status.isProcessing && (
                                <button 
                                    onClick={handleStart}
                                    className="w-full py-4 bg-gradient-to-r from-indigo-600 to-indigo-500 hover:from-indigo-500 hover:to-indigo-400 text-white rounded-xl font-bold uppercase tracking-widest text-xs transition-all shadow-lg shadow-indigo-900/20 flex items-center justify-center gap-2 group"
                                >
                                    <span>Compress Images</span>
                                    <svg className="w-4 h-4 transition-transform group-hover:translate-x-1" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M13 10V3L4 14h7v7l9-11h-7z"></path></svg>
                                </button>
                            )}
                        </>
                    )}
                    
                    {!items.length && (
                        <div className="text-slate-500 text-sm font-medium italic opacity-50">
                            Add images to the left panel to begin.
                        </div>
                    )}
                </div>
            ) : (
                /* RESULT VIEW */
                <div ref={resultsRef} className="flex flex-col h-full animate-fade-in space-y-6">
                    
                    {/* Summary Card */}
                    <div className="flex items-center justify-between bg-[#1e293b] p-6 rounded-xl border border-white/5">
                        <div>
                            <p className="text-[10px] font-bold uppercase text-slate-500 mb-1 tracking-wider">Saved</p>
                            <p className="text-3xl font-black text-green-400">{savingsPercent}%</p>
                        </div>
                        <div className="text-right">
                            <p className="text-xs font-mono text-slate-400 line-through decoration-red-500/50 mb-1">{formatBytes(status.originalSize || 0)}</p>
                            <p className="text-xl font-mono font-bold text-white">{formatBytes(status.compressedSize || 0)}</p>
                        </div>
                    </div>

                    {/* Detailed List */}
                    <div className="flex-1 bg-black/20 rounded-xl border border-white/5 overflow-hidden flex flex-col min-h-0">
                        <div className="px-4 py-3 bg-[#1e293b] border-b border-white/5 flex justify-between items-center shrink-0">
                            <span className="text-[10px] font-bold uppercase text-slate-400 tracking-wider">File List</span>
                            <span className="text-[10px] bg-white/10 px-2 py-0.5 rounded-full text-white">{detailedResults.length}</span>
                        </div>
                        <div className="flex-1 overflow-y-auto custom-scrollbar p-2 space-y-2">
                            {detailedResults.map((res, i) => (
                                <div key={i} className="flex items-center justify-between bg-[#1e293b]/50 p-3 rounded-lg hover:bg-[#1e293b] transition-colors group">
                                    <div className="flex items-center gap-3 min-w-0">
                                        <div className="w-8 h-8 rounded bg-black/30 flex items-center justify-center text-lg">🖼️</div>
                                        <div className="min-w-0">
                                            <div className="text-xs font-bold text-slate-200 truncate" title={res.fileName}>{res.fileName}</div>
                                            <div className="text-[10px] text-slate-500">{formatBytes(res.compressedSize)}</div>
                                        </div>
                                    </div>
                                    <div className="flex gap-2 shrink-0 opacity-50 group-hover:opacity-100 transition-opacity">
                                        <button onClick={() => openCompare(res)} className="p-1.5 hover:bg-white/10 rounded text-slate-400 hover:text-white" title="Compare">
                                            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z"></path></svg>
                                        </button>
                                        <button onClick={() => downloadSingleResult(res)} className="p-1.5 hover:bg-white/10 rounded text-indigo-400 hover:text-indigo-300" title="Download">
                                            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4"></path></svg>
                                        </button>
                                    </div>
                                </div>
                            ))}
                        </div>
                    </div>

                    {/* Actions */}
                    <div className="flex gap-4 pt-2 shrink-0">
                        <button 
                            onClick={handleDownload}
                            className="flex-1 py-4 bg-white text-[#0f172a] rounded-xl font-bold uppercase tracking-widest text-xs hover:bg-indigo-400 hover:text-white transition-colors shadow-lg flex items-center justify-center gap-2"
                        >
                            <span>Download All</span>
                            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4"></path></svg>
                        </button>
                        <button 
                            onClick={handleBackToOptions}
                            className="px-6 py-4 bg-transparent border border-slate-700 text-white rounded-xl font-bold uppercase tracking-widest text-xs hover:border-white transition-colors"
                        >
                            Back
                        </button>
                    </div>
                </div>
            )}
        </div>
      </div>
      
      {/* Comparison Modal */}
      {compareItem && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-md p-4 animate-fade-in" onClick={closeCompare}>
              <div className="bg-[#1e293b] border border-white/10 rounded-2xl w-full max-w-4xl h-[80vh] flex flex-col overflow-hidden shadow-2xl relative" onClick={e => e.stopPropagation()}>
                  <div className="p-4 border-b border-white/10 flex justify-between items-center bg-[#0f172a]">
                      <h3 className="font-bold text-white truncate max-w-[80%] text-sm tracking-wide">{compareItem.filename}</h3>
                      <button onClick={closeCompare} className="p-2 hover:bg-white/10 rounded-full transition-colors text-slate-400 hover:text-white">
                          <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M6 18L18 6M6 6l12 12"></path></svg>
                      </button>
                  </div>
                  <div className="flex-1 p-4 bg-black/20 flex items-center justify-center relative">
                      <div className="w-full h-full max-w-3xl max-h-[600px] shadow-2xl rounded-lg overflow-hidden border border-white/5">
                          <ComparisonSlider original={compareItem.original} compressed={compareItem.compressed} />
                      </div>
                  </div>
                  <div className="p-3 bg-[#0f172a] text-center text-[10px] text-slate-500 uppercase font-bold tracking-widest">
                      Drag slider to compare quality
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
