
import React, { useState, useRef, useEffect } from 'react';
import { CompressionMode, CompressionSettings, ProcessStatus } from '../types';
import { compressPDF } from '../services/pdfCompression';

// Helper for formatting bytes
const formatBytes = (bytes: number, decimals = 2) => {
  if (bytes === 0) return '0 Bytes';
  const k = 1024;
  const dm = decimals < 0 ? 0 : decimals;
  const sizes = ['Bytes', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(dm)) + ' ' + sizes[i];
};

type PresetType = 'extreme' | 'recommended' | 'lossless' | 'custom';

// --- SUB-COMPONENT: COMPARISON SLIDER ---
const ComparisonSlider = ({ original, compressed }: { original: string, compressed: string }) => {
    const [sliderPosition, setSliderPosition] = useState(50);
    const [isDragging, setIsDragging] = useState(false);
    const containerRef = useRef<HTMLDivElement>(null);
  
    const handleMove = (clientX: number) => {
      if (!containerRef.current) return;
      const rect = containerRef.current.getBoundingClientRect();
      const x = clientX - rect.left;
      const pos = Math.max(0, Math.min(100, (x / rect.width) * 100));
      setSliderPosition(pos);
    };
  
    const onMouseMove = (e: React.MouseEvent) => {
      if (isDragging) handleMove(e.clientX);
    };
  
    const onTouchMove = (e: React.TouchEvent) => {
      if (isDragging) handleMove(e.touches[0].clientX);
    };
  
    const handleInteractionStart = (clientX: number) => {
        setIsDragging(true);
        handleMove(clientX);
    };

    useEffect(() => {
        const stopDrag = () => setIsDragging(false);
        window.addEventListener('mouseup', stopDrag);
        window.addEventListener('touchend', stopDrag);
        return () => {
            window.removeEventListener('mouseup', stopDrag);
            window.removeEventListener('touchend', stopDrag);
        };
    }, []);
  
    return (
      <div 
        ref={containerRef}
        className="relative w-full aspect-[3/4] sm:aspect-[4/3] max-h-[500px] select-none group cursor-ew-resize overflow-hidden rounded-xl border border-slate-200 dark:border-slate-700 shadow-sm bg-slate-100 dark:bg-slate-900"
        onMouseDown={(e) => handleInteractionStart(e.clientX)}
        onTouchStart={(e) => handleInteractionStart(e.touches[0].clientX)}
        onMouseMove={onMouseMove}
        onTouchMove={onTouchMove}
      >
        {/* Compressed Image (Background) */}
        <img 
            src={compressed} 
            className="absolute inset-0 w-full h-full object-contain pointer-events-none select-none" 
            alt="Compressed"
        />
        <div className="absolute top-4 right-4 bg-black/60 backdrop-blur-sm text-white text-[10px] font-bold px-2 py-1 rounded pointer-events-none">
            COMPRESSED
        </div>
        
        {/* Original Image (Foreground, Clipped) */}
        <div 
          className="absolute inset-0 pointer-events-none select-none"
          style={{ clipPath: `inset(0 ${100 - sliderPosition}% 0 0)` }}
        >
          <img 
            src={original} 
            className="absolute inset-0 w-full h-full object-contain" 
            alt="Original"
          />
          <div className="absolute top-4 left-4 bg-indigo-600/90 backdrop-blur-sm text-white text-[10px] font-bold px-2 py-1 rounded">
             ORIGINAL
          </div>
        </div>
  
        {/* Slider Handle */}
        <div 
            className="absolute top-0 bottom-0 w-1 bg-white cursor-ew-resize shadow-[0_0_10px_rgba(0,0,0,0.5)] z-10" 
            style={{ left: `${sliderPosition}%` }}
        >
          <div className="absolute top-1/2 -translate-y-1/2 -translate-x-1/2 w-8 h-8 bg-white rounded-full shadow-xl flex items-center justify-center text-slate-400 border border-slate-200">
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M8 9l4-4 4 4m0 6l-4 4-4-4"></path></svg>
          </div>
        </div>
      </div>
    );
};

// --- MAIN COMPONENT ---
const CompressTool: React.FC = () => {
  const [file, setFile] = useState<File | null>(null);
  const [thumbnailUrl, setThumbnailUrl] = useState<string | null>(null);
  const [compressedThumbnailUrl, setCompressedThumbnailUrl] = useState<string | null>(null);
  
  const [status, setStatus] = useState<ProcessStatus>({ isProcessing: false, currentStep: '', progress: 0 });
  const [isDragging, setIsDragging] = useState(false);
  const [activePreset, setActivePreset] = useState<PresetType>('recommended');
  const [showAdvanced, setShowAdvanced] = useState(false);
  
  const [settings, setSettings] = useState<CompressionSettings>({
    mode: CompressionMode.IMAGE, 
    quality: 0.8,
    maxResolution: 2000, 
    grayscale: false,
    flattenForms: false,
    preserveMetadata: false,
  });

  const fileInputRef = useRef<HTMLInputElement>(null);
  const resultsRef = useRef<HTMLDivElement>(null);

  // Scroll to results
  useEffect(() => {
    if (status.resultBlob && resultsRef.current) {
        // Small delay to allow render
        setTimeout(() => {
            resultsRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
        }, 100);
    }
  }, [status.resultBlob]);

  // Generate Thumbnail when file changes
  useEffect(() => {
    if (!file) {
        setThumbnailUrl(null);
        return;
    }

    let active = true;
    let loadingTask: any = null;
    const objectUrl = URL.createObjectURL(file);

    const generateThumb = async () => {
        if (!window.pdfjsLib) return;
        try {
            const pdfjs = window.pdfjsLib;
            loadingTask = pdfjs.getDocument(objectUrl);
            const pdf = await loadingTask.promise;
            if (!active) return;

            const page = await pdf.getPage(1);
            const viewport = page.getViewport({ scale: 1.0 }); // decent quality for slider
            const canvas = document.createElement('canvas');
            const ctx = canvas.getContext('2d');
            if (ctx) {
                canvas.width = viewport.width;
                canvas.height = viewport.height;
                await page.render({ canvasContext: ctx, viewport }).promise;
                if (active) setThumbnailUrl(canvas.toDataURL());
            }
        } catch (e) {
            console.warn("Thumb failed", e);
        }
    };
    generateThumb();

    return () => {
        active = false;
        if (loadingTask && loadingTask.destroy) loadingTask.destroy().catch(() => {});
        URL.revokeObjectURL(objectUrl);
    };
  }, [file]);

  // Generate Compressed Thumbnail when result ready
  useEffect(() => {
      if (!status.resultBlob) {
          setCompressedThumbnailUrl(null);
          return;
      }

      let active = true;
      let loadingTask: any = null;
      const objectUrl = URL.createObjectURL(status.resultBlob);
      
      const generateCompressedThumb = async () => {
        if (!window.pdfjsLib) return;
        try {
            const pdfjs = window.pdfjsLib;
            loadingTask = pdfjs.getDocument(objectUrl);
            const pdf = await loadingTask.promise;
            if (!active) return;

            const page = await pdf.getPage(1);
            const viewport = page.getViewport({ scale: 1.0 });
            const canvas = document.createElement('canvas');
            const ctx = canvas.getContext('2d');
            if (ctx) {
                canvas.width = viewport.width;
                canvas.height = viewport.height;
                await page.render({ canvasContext: ctx, viewport }).promise;
                if (active) setCompressedThumbnailUrl(canvas.toDataURL());
            }
        } catch (e) {
            console.warn("Result thumb failed", e);
        }
      };
      generateCompressedThumb();

      return () => {
          active = false;
          if (loadingTask && loadingTask.destroy) loadingTask.destroy().catch(() => {});
          URL.revokeObjectURL(objectUrl);
      };
  }, [status.resultBlob]);

  const resetState = () => {
    setFile(null);
    setThumbnailUrl(null);
    setCompressedThumbnailUrl(null);
    setStatus({ isProcessing: false, currentStep: '', progress: 0, resultBlob: undefined, error: undefined });
    setActivePreset('recommended');
    applyPreset('recommended');
  };

  const handleBackToOptions = () => {
    setStatus(prev => ({ 
        ...prev, 
        resultBlob: undefined, 
        resultFileName: undefined, 
        compressedSize: undefined, 
        error: undefined
    }));
    setCompressedThumbnailUrl(null);
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
      setFile(e.target.files[0]);
      setStatus({ isProcessing: false, currentStep: '', progress: 0 }); 
      setActivePreset('recommended');
      applyPreset('recommended');
    }
  };

  const handleDragOver = (e: React.DragEvent) => { e.preventDefault(); setIsDragging(true); };
  const handleDragLeave = (e: React.DragEvent) => { e.preventDefault(); setIsDragging(false); };
  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
    if (e.dataTransfer.files && e.dataTransfer.files[0]?.type === 'application/pdf') {
        setFile(e.dataTransfer.files[0]);
        setActivePreset('recommended');
        applyPreset('recommended');
    } else {
        alert('Please upload a PDF file.');
    }
  };

  const applyPreset = (type: PresetType) => {
    setActivePreset(type);
    if (type === 'extreme') {
        setSettings(s => ({ ...s, mode: CompressionMode.IMAGE, quality: 0.6, maxResolution: 1200, grayscale: false }));
    } else if (type === 'recommended') {
        setSettings(s => ({ ...s, mode: CompressionMode.IMAGE, quality: 0.8, maxResolution: 2000, grayscale: false }));
    } else if (type === 'lossless') {
        setSettings(s => ({ ...s, mode: CompressionMode.STRUCTURE, quality: 1.0, maxResolution: 5000, grayscale: false }));
    }
  };

  const handleStart = async () => {
    if (!file) return;

    setStatus({ 
        isProcessing: true, 
        currentStep: 'Starting engine...', 
        progress: 0,
        originalSize: file.size 
    });

    try {
      const resultBlob = await compressPDF(file, settings, (progress, step) => {
        setStatus(prev => ({ ...prev, progress, currentStep: step }));
      });

      setStatus({
        isProcessing: false,
        currentStep: 'Completed!',
        progress: 100,
        resultBlob,
        originalSize: file.size,
        compressedSize: resultBlob.size
      });
    } catch (error: any) {
      console.error(error);
      setStatus(prev => ({ 
        ...prev, 
        isProcessing: false, 
        error: error.message || 'Compression failed.' 
      }));
    }
  };

  const handleDownload = () => {
    if (!status.resultBlob || !file) return;
    const url = URL.createObjectURL(status.resultBlob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `compressed_${file.name}`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  const handleFileChangeClick = () => {
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
      fileInputRef.current.click();
    }
  };

  const savingsPercent = status.originalSize && status.compressedSize 
    ? Math.round(((status.originalSize - status.compressedSize) / status.originalSize) * 100) 
    : 0;

  const isSavingsNegative = savingsPercent < 0;

  return (
    <div className="max-w-4xl mx-auto animate-fade-in pb-12">
      <div className="bg-white dark:bg-slate-800 rounded-3xl shadow-xl overflow-hidden border border-slate-100 dark:border-slate-700 transition-colors duration-300">
        
        {/* Header */}
        <div className="bg-gradient-to-r from-indigo-600 to-blue-600 p-8 text-white text-center">
          <h2 className="text-3xl font-bold mb-2">Compress PDF</h2>
          <p className="opacity-90">Reduce file size intelligently while maintaining quality.</p>
        </div>

        <div className="p-4 sm:p-8">
          
          {/* 1. Upload Section */}
          {!file && (
            <div 
              onClick={() => fileInputRef.current?.click()}
              onDragOver={handleDragOver}
              onDragLeave={handleDragLeave}
              onDrop={handleDrop}
              className={`
                border-4 border-dashed rounded-3xl p-12 sm:p-20 text-center cursor-pointer transition-all duration-200 group
                ${isDragging 
                  ? 'border-indigo-500 bg-indigo-50 dark:bg-slate-700 scale-[1.01]' 
                  : 'border-slate-200 dark:border-slate-600 hover:border-indigo-400 dark:hover:border-indigo-500 hover:bg-slate-50 dark:hover:bg-slate-700/50'}
              `}
            >
              <div className="w-24 h-24 bg-indigo-100 dark:bg-slate-700 rounded-full flex items-center justify-center mx-auto mb-6 group-hover:scale-110 transition-transform text-indigo-600 dark:text-indigo-400">
                  <svg className="w-10 h-10" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19 14l-7 7m0 0l-7-7m7 7V3"></path></svg>
              </div>
              <h3 className="text-2xl font-bold text-slate-700 dark:text-slate-200 mb-2">
                {isDragging ? 'Drop file now' : 'Select PDF File'}
              </h3>
              <p className="text-slate-500 dark:text-slate-400">Drag and drop or click to upload</p>
            </div>
          )}

          {/* 2. Configuration & Process */}
          {file && !status.resultBlob && (
            <div className={`space-y-8 animate-fade-in ${status.isProcessing ? 'pointer-events-none opacity-60' : ''}`}>
              
              {/* File Info Bar */}
              <div className="flex items-center gap-4 bg-slate-50 dark:bg-slate-900/50 p-4 rounded-2xl border border-slate-200 dark:border-slate-700">
                <div className="w-12 h-16 bg-white dark:bg-slate-800 rounded-lg shadow-sm border border-slate-200 dark:border-slate-600 flex items-center justify-center shrink-0">
                    <span className="text-2xl">📄</span>
                </div>
                <div className="flex-1 min-w-0">
                    <h3 className="font-bold text-slate-800 dark:text-slate-200 truncate">{file.name}</h3>
                    <p className="text-xs text-slate-500 dark:text-slate-400 font-mono">{formatBytes(file.size)}</p>
                </div>
                <button 
                    onClick={resetState}
                    className="p-2 text-slate-400 hover:text-red-500 hover:bg-red-50 dark:hover:bg-red-900/20 rounded-xl transition-colors"
                    title="Remove file"
                >
                    <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M6 18L18 6M6 6l12 12"></path></svg>
                </button>
              </div>

              {/* Presets Grid */}
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                 {[
                    { id: 'extreme', icon: '📉', label: 'Extreme', desc: 'Max reduction, low quality', color: 'orange' },
                    { id: 'recommended', icon: '✨', label: 'Recommended', desc: 'Balanced size & quality', color: 'indigo' },
                    { id: 'lossless', icon: '💎', label: 'Lossless', desc: 'Original quality, less savings', color: 'green' }
                 ].map((preset) => (
                     <button 
                        key={preset.id}
                        onClick={() => applyPreset(preset.id as PresetType)}
                        className={`relative p-5 rounded-2xl border-2 text-left transition-all hover:scale-[1.02] active:scale-[0.98] flex flex-col h-full
                            ${activePreset === preset.id 
                              ? `border-${preset.color}-500 bg-${preset.color}-50 dark:bg-${preset.color}-900/20 ring-1 ring-${preset.color}-500 shadow-md` 
                              : 'border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 hover:border-slate-300 dark:hover:border-slate-600'}`}
                     >
                         <div className="text-3xl mb-3">{preset.icon}</div>
                         <h4 className={`font-bold ${activePreset === preset.id ? `text-${preset.color}-700 dark:text-${preset.color}-300` : 'text-slate-800 dark:text-white'}`}>
                             {preset.label}
                         </h4>
                         <p className="text-xs text-slate-500 dark:text-slate-400 mt-1 leading-snug">
                            {preset.desc}
                         </p>
                         {activePreset === preset.id && (
                             <div className={`absolute top-4 right-4 w-3 h-3 rounded-full bg-${preset.color}-500 shadow-sm`} />
                         )}
                     </button>
                 ))}
              </div>

               {/* Advanced Settings */}
               <div className="border-t border-slate-200 dark:border-slate-700 pt-6">
                   <button 
                     onClick={() => setShowAdvanced(!showAdvanced)}
                     className="flex items-center gap-2 text-xs font-bold text-slate-500 dark:text-slate-400 hover:text-indigo-500 transition-colors mx-auto"
                   >
                       {showAdvanced ? 'Hide Custom Options' : 'Show Custom Options'}
                       <svg className={`w-4 h-4 transition-transform ${showAdvanced ? 'rotate-180' : ''}`} fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19 9l-7 7-7-7"></path></svg>
                   </button>

                   <div className={`overflow-hidden transition-all duration-300 ease-in-out ${showAdvanced ? 'max-h-96 opacity-100 mt-6' : 'max-h-0 opacity-0'}`}>
                        <div className="bg-slate-50 dark:bg-slate-900/50 p-6 rounded-2xl space-y-6 border border-slate-200 dark:border-slate-700">
                            
                            <div className="flex gap-4">
                                <label className="flex items-center gap-2 cursor-pointer p-3 bg-white dark:bg-slate-800 rounded-xl border border-slate-200 dark:border-slate-700 flex-1">
                                    <input type="radio" checked={settings.mode === CompressionMode.STRUCTURE} onChange={() => { setSettings(s => ({...s, mode: CompressionMode.STRUCTURE})); setActivePreset('custom'); }} className="text-indigo-600 focus:ring-indigo-500" />
                                    <span className="text-sm font-bold text-slate-700 dark:text-slate-200">Structure Only</span>
                                </label>
                                <label className="flex items-center gap-2 cursor-pointer p-3 bg-white dark:bg-slate-800 rounded-xl border border-slate-200 dark:border-slate-700 flex-1">
                                    <input type="radio" checked={settings.mode === CompressionMode.IMAGE} onChange={() => { setSettings(s => ({...s, mode: CompressionMode.IMAGE})); setActivePreset('custom'); }} className="text-indigo-600 focus:ring-indigo-500" />
                                    <span className="text-sm font-bold text-slate-700 dark:text-slate-200">Image Compress</span>
                                </label>
                            </div>

                            {settings.mode === CompressionMode.IMAGE && (
                                <div className="space-y-6">
                                    <div>
                                        <div className="flex justify-between text-xs font-bold uppercase text-slate-500 mb-2">
                                            <span>Image Quality</span>
                                            <span>{Math.round(settings.quality * 100)}%</span>
                                        </div>
                                        <input 
                                            type="range" min="10" max="100" 
                                            value={settings.quality * 100}
                                            onChange={(e) => { setSettings(s => ({ ...s, quality: Number(e.target.value) / 100 })); setActivePreset('custom'); }}
                                            className="w-full h-2 bg-slate-200 dark:bg-slate-700 rounded-lg appearance-none cursor-pointer accent-indigo-600"
                                        />
                                    </div>
                                    <div>
                                        <div className="flex justify-between text-xs font-bold uppercase text-slate-500 mb-2">
                                            <span>Max Resolution</span>
                                            <span>{settings.maxResolution}px</span>
                                        </div>
                                        <input 
                                            type="range" min="500" max="3000" step="100"
                                            value={settings.maxResolution}
                                            onChange={(e) => { setSettings(s => ({ ...s, maxResolution: Number(e.target.value) })); setActivePreset('custom'); }}
                                            className="w-full h-2 bg-slate-200 dark:bg-slate-700 rounded-lg appearance-none cursor-pointer accent-indigo-600"
                                        />
                                    </div>
                                    <div className="flex flex-col sm:flex-row gap-4">
                                        <label className="flex items-center gap-3 cursor-pointer">
                                            <input type="checkbox" checked={settings.grayscale} onChange={(e) => { setSettings(s => ({...s, grayscale: e.target.checked})); setActivePreset('custom'); }} className="rounded text-indigo-600 focus:ring-indigo-500 w-5 h-5" />
                                            <span className="text-sm font-medium text-slate-700 dark:text-slate-300">Convert to Grayscale</span>
                                        </label>
                                        <label className="flex items-center gap-3 cursor-pointer">
                                            <input type="checkbox" checked={settings.preserveMetadata} onChange={(e) => { setSettings(s => ({...s, preserveMetadata: e.target.checked})); setActivePreset('custom'); }} className="rounded text-indigo-600 focus:ring-indigo-500 w-5 h-5" />
                                            <span className="text-sm font-medium text-slate-700 dark:text-slate-300">Preserve Metadata</span>
                                        </label>
                                    </div>
                                </div>
                            )}
                        </div>
                   </div>
               </div>

              {/* Progress Indicator (Centered & Large) */}
              {status.isProcessing && (
                <div className="flex flex-col items-center justify-center py-8">
                    <div className="relative w-20 h-20 mb-4">
                        <div className="absolute inset-0 border-4 border-indigo-100 dark:border-slate-700 rounded-full"></div>
                        <div className="absolute inset-0 border-4 border-indigo-600 border-t-transparent rounded-full animate-spin"></div>
                    </div>
                    <h3 className="text-xl font-bold text-indigo-600 dark:text-indigo-400 animate-pulse">{status.progress}%</h3>
                    <p className="text-sm font-medium text-slate-500 dark:text-slate-400 mt-2">{status.currentStep}</p>
                </div>
              )}

              {/* Error Message */}
              {status.error && (
                <div className="bg-red-50 dark:bg-red-900/30 text-red-600 dark:text-red-300 p-4 rounded-xl border border-red-200 dark:border-red-800 text-sm font-bold flex items-center gap-3">
                  <svg className="w-6 h-6 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"></path></svg>
                  {status.error}
                </div>
              )}

              {/* Main Action Button */}
              {!status.isProcessing && (
                  <button
                    onClick={handleStart}
                    className="w-full py-4 bg-indigo-600 hover:bg-indigo-700 dark:bg-indigo-600 dark:hover:bg-indigo-500 text-white rounded-2xl font-bold text-lg shadow-lg shadow-indigo-200 dark:shadow-none transition-all active:scale-[0.98] flex items-center justify-center gap-3"
                  >
                    Compress PDF Now
                    <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M13 10V3L4 14h7v7l9-11h-7z"></path></svg>
                  </button>
              )}
            </div>
          )}

          {/* 3. Results */}
          {status.resultBlob && (
             <div ref={resultsRef} className="animate-fade-in-up">
                
                {/* Result Header */}
                <div className="text-center mb-8">
                    <div className="inline-flex items-center justify-center w-16 h-16 bg-green-100 dark:bg-green-900/30 text-green-600 dark:text-green-400 rounded-full mb-4">
                        <svg className="w-8 h-8" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M5 13l4 4L19 7"></path></svg>
                    </div>
                    <h2 className="text-2xl font-bold text-slate-800 dark:text-white">Compression Complete!</h2>
                </div>
                
                {/* Stats Bar */}
                <div className="bg-slate-50 dark:bg-slate-800 rounded-xl border border-slate-200 dark:border-slate-700 p-4 sm:p-6 mb-8 flex flex-col sm:flex-row justify-between items-center gap-4 shadow-sm">
                    <div className="text-center sm:text-left">
                         <p className="text-xs font-bold text-slate-400 uppercase tracking-wider mb-1">Original Size</p>
                         <p className="text-lg font-bold text-slate-500 line-through decoration-red-400">{formatBytes(status.originalSize || 0)}</p>
                    </div>
                    <div className="text-slate-300 dark:text-slate-600 rotate-90 sm:rotate-0">
                        <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M17 8l4 4m0 0l-4 4m4-4H3"></path></svg>
                    </div>
                    <div className="text-center sm:text-right">
                         <p className="text-xs font-bold text-indigo-500 uppercase tracking-wider mb-1">New Size</p>
                         <p className="text-2xl font-black text-indigo-600 dark:text-indigo-400">{formatBytes(status.compressedSize || status.resultBlob.size)}</p>
                    </div>
                    <div className={`px-4 py-2 rounded-lg font-bold text-sm ${isSavingsNegative ? 'bg-orange-100 text-orange-700' : 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-300'}`}>
                        {isSavingsNegative ? 'Larger (+)' : `-${savingsPercent}% Saved`}
                    </div>
                </div>

                {/* Comparison Slider */}
                {compressedThumbnailUrl && thumbnailUrl && (
                    <div className="mb-8">
                        <div className="flex justify-between items-end mb-3 px-1">
                            <h4 className="text-sm font-bold uppercase text-slate-500 dark:text-slate-400 tracking-wider">Quality Check</h4>
                            <span className="text-[10px] text-slate-400">Drag slider to compare</span>
                        </div>
                        <ComparisonSlider original={thumbnailUrl} compressed={compressedThumbnailUrl} />
                    </div>
                )}

                {/* Actions */}
                <div className="flex flex-col sm:flex-row gap-4 justify-center">
                  <button 
                    onClick={handleDownload}
                    className="flex-1 px-8 py-4 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl font-bold shadow-lg shadow-indigo-200 dark:shadow-none transition-all hover:scale-[1.02] active:scale-95 flex items-center justify-center gap-2"
                  >
                    <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4"></path></svg>
                    Download PDF
                  </button>
                  <button 
                    onClick={handleBackToOptions}
                    className="flex-1 px-8 py-4 bg-white dark:bg-slate-700 text-slate-700 dark:text-slate-200 border border-slate-200 dark:border-slate-600 rounded-xl font-bold hover:bg-slate-50 dark:hover:bg-slate-600 transition-all"
                  >
                    Adjust Settings
                  </button>
                  <button 
                    onClick={resetState}
                    className="px-6 py-4 text-slate-500 hover:text-slate-700 dark:text-slate-400 dark:hover:text-slate-200 font-bold transition-colors"
                  >
                    Start Over
                  </button>
                </div>
             </div>
          )}
        </div>
      </div>

      <input 
        ref={fileInputRef}
        type="file" 
        accept=".pdf" 
        onChange={handleFileChange} 
        className="hidden" 
      />
    </div>
  );
};

export default CompressTool;
