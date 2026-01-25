
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

const CompressTool: React.FC = () => {
  const [file, setFile] = useState<File | null>(null);
  const [thumbnailUrl, setThumbnailUrl] = useState<string | null>(null);
  const [compressedThumbnailUrl, setCompressedThumbnailUrl] = useState<string | null>(null);
  const [showOriginalInComparison, setShowOriginalInComparison] = useState(false);
  
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

  useEffect(() => {
    if (status.resultBlob && resultsRef.current) {
        resultsRef.current.scrollIntoView({ behavior: 'smooth' });
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
        // Safety check for library
        if (!window.pdfjsLib) {
            console.warn("PDF.js library not loaded yet.");
            return;
        }

        try {
            const pdfjs = window.pdfjsLib;
            loadingTask = pdfjs.getDocument(objectUrl);
            const pdf = await loadingTask.promise;
            
            if (!active) return;

            const page = await pdf.getPage(1);
            const viewport = page.getViewport({ scale: 0.5 }); // Small scale for thumbnail
            
            const canvas = document.createElement('canvas');
            const ctx = canvas.getContext('2d');
            
            if (ctx) {
                canvas.width = viewport.width;
                canvas.height = viewport.height;
                await page.render({ canvasContext: ctx, viewport }).promise;
                
                if (active) {
                    setThumbnailUrl(canvas.toDataURL());
                }
            }
        } catch (e) {
            if (active) console.warn("Thumbnail generation failed", e);
        }
    };

    generateThumb();

    // CLEANUP FUNCTION
    return () => {
        active = false;
        if (loadingTask && loadingTask.destroy) {
            loadingTask.destroy().catch(() => {}); // Prevent unhandled promise rejection during destroy
        }
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
            const viewport = page.getViewport({ scale: 0.5 });
            
            const canvas = document.createElement('canvas');
            const ctx = canvas.getContext('2d');
            
            if (ctx) {
                canvas.width = viewport.width;
                canvas.height = viewport.height;
                await page.render({ canvasContext: ctx, viewport }).promise;
                
                if (active) {
                    setCompressedThumbnailUrl(canvas.toDataURL());
                }
            }
        } catch (e) {
            if (active) console.warn("Result thumbnail generation failed", e);
        }
      };

      generateCompressedThumb();

      return () => {
          active = false;
          if (loadingTask && loadingTask.destroy) {
              loadingTask.destroy().catch(() => {});
          }
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
      // Reset to default settings
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
    // Custom leaves settings alone
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
        error: error.message || 'Compression failed. The file might be corrupted or too large.' 
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
                border-4 border-dashed rounded-3xl p-12 sm:p-16 text-center cursor-pointer transition-all duration-200 group
                ${isDragging 
                  ? 'border-indigo-500 bg-indigo-50 dark:bg-slate-700 scale-[1.02]' 
                  : 'border-slate-200 dark:border-slate-600 hover:border-indigo-400 dark:hover:border-indigo-500 hover:bg-slate-50 dark:hover:bg-slate-700/50'}
              `}
            >
              <div className="w-24 h-24 bg-indigo-100 dark:bg-slate-700 rounded-full flex items-center justify-center mx-auto mb-6 group-hover:scale-110 transition-transform text-indigo-600 dark:text-indigo-400">
                  <svg className="w-10 h-10" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19 14l-7 7m0 0l-7-7m7 7V3"></path></svg>
              </div>
              <h3 className="text-2xl font-bold text-slate-700 dark:text-slate-200 mb-2">
                {isDragging ? 'Drop file now' : 'Select PDF File'}
              </h3>
              <p className="text-slate-500 dark:text-slate-400">or drag and drop here</p>
            </div>
          )}

          {/* 2. Configuration & Process */}
          {file && !status.resultBlob && (
            <div className={`space-y-8 animate-fade-in ${status.isProcessing ? 'pointer-events-none opacity-60' : ''}`}>
              
              {/* File Info Bar with Thumbnail */}
              <div className="flex flex-col sm:flex-row items-center gap-4 bg-slate-50 dark:bg-slate-900/50 p-4 rounded-2xl border border-slate-200 dark:border-slate-700">
                <div className="w-16 h-20 bg-slate-200 dark:bg-slate-800 rounded-lg shadow-sm shrink-0 overflow-hidden flex items-center justify-center">
                    {thumbnailUrl ? (
                        <img src={thumbnailUrl} alt="Preview" className="w-full h-full object-cover opacity-80" />
                    ) : (
                        <span className="text-2xl">📄</span>
                    )}
                </div>
                
                <div className="flex-1 text-center sm:text-left min-w-0">
                    <h3 className="font-bold text-slate-800 dark:text-slate-200 truncate">{file.name}</h3>
                    <p className="text-sm text-slate-500 dark:text-slate-400 font-mono">{formatBytes(file.size)}</p>
                </div>

                <div className="flex gap-2 w-full sm:w-auto">
                   <button 
                    onClick={handleFileChangeClick}
                    className="flex-1 sm:flex-none px-4 py-2 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-600 text-slate-600 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-700 font-bold text-xs rounded-xl transition-colors"
                  >
                    Change
                  </button>
                  <button 
                    onClick={resetState}
                    className="flex-1 sm:flex-none p-2 text-red-500 hover:bg-red-50 dark:hover:bg-red-900/20 rounded-xl transition-colors border border-transparent"
                    title="Remove file"
                  >
                    <svg className="w-5 h-5 mx-auto" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"></path></svg>
                  </button>
                </div>
              </div>

              {/* Compression Levels - New Grid Layout */}
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                 
                 {/* Extreme */}
                 <button 
                    onClick={() => applyPreset('extreme')}
                    className={`relative p-5 rounded-2xl border-2 text-left transition-all hover:scale-[1.02] active:scale-[0.98]
                        ${activePreset === 'extreme' 
                          ? 'border-orange-500 bg-orange-50 dark:bg-orange-900/20 ring-1 ring-orange-500' 
                          : 'border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 hover:border-orange-300'}`}
                 >
                     <div className="mb-3">
                         <span className={`text-xs font-black uppercase tracking-wider px-2 py-1 rounded-md ${activePreset === 'extreme' ? 'bg-orange-200 text-orange-800 dark:bg-orange-800 dark:text-orange-100' : 'bg-slate-100 dark:bg-slate-700 text-slate-500'}`}>
                             Smallest Size
                         </span>
                     </div>
                     <div className="text-3xl mb-1">📉</div>
                     <h4 className="font-bold text-slate-800 dark:text-white">Extreme</h4>
                     <p className="text-xs text-slate-500 dark:text-slate-400 mt-1 leading-snug">
                        Low quality, maximum reduction. Best for drafts.
                     </p>
                 </button>

                 {/* Recommended */}
                 <button 
                    onClick={() => applyPreset('recommended')}
                    className={`relative p-5 rounded-2xl border-2 text-left transition-all hover:scale-[1.02] active:scale-[0.98]
                        ${activePreset === 'recommended' 
                          ? 'border-indigo-500 bg-indigo-50 dark:bg-indigo-900/20 ring-1 ring-indigo-500 shadow-md' 
                          : 'border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 hover:border-indigo-300'}`}
                 >
                     <div className="mb-3">
                         <span className={`text-xs font-black uppercase tracking-wider px-2 py-1 rounded-md ${activePreset === 'recommended' ? 'bg-indigo-200 text-indigo-800 dark:bg-indigo-800 dark:text-indigo-100' : 'bg-slate-100 dark:bg-slate-700 text-slate-500'}`}>
                             Best Choice
                         </span>
                     </div>
                     <div className="text-3xl mb-1">✨</div>
                     <h4 className="font-bold text-slate-800 dark:text-white">Recommended</h4>
                     <p className="text-xs text-slate-500 dark:text-slate-400 mt-1 leading-snug">
                        Good quality, good compression. Best for sharing.
                     </p>
                 </button>

                 {/* Lossless */}
                 <button 
                    onClick={() => applyPreset('lossless')}
                    className={`relative p-5 rounded-2xl border-2 text-left transition-all hover:scale-[1.02] active:scale-[0.98]
                        ${activePreset === 'lossless' 
                          ? 'border-green-500 bg-green-50 dark:bg-green-900/20 ring-1 ring-green-500' 
                          : 'border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 hover:border-green-300'}`}
                 >
                     <div className="mb-3">
                         <span className={`text-xs font-black uppercase tracking-wider px-2 py-1 rounded-md ${activePreset === 'lossless' ? 'bg-green-200 text-green-800 dark:bg-green-800 dark:text-green-100' : 'bg-slate-100 dark:bg-slate-700 text-slate-500'}`}>
                             Top Quality
                         </span>
                     </div>
                     <div className="text-3xl mb-1">💎</div>
                     <h4 className="font-bold text-slate-800 dark:text-white">Lossless</h4>
                     <p className="text-xs text-slate-500 dark:text-slate-400 mt-1 leading-snug">
                        Optimizes structure only. No visual quality loss.
                     </p>
                 </button>
              </div>

               {/* Advanced Settings Toggle */}
               <div className="border-t border-slate-200 dark:border-slate-700 pt-4">
                   <button 
                     onClick={() => setShowAdvanced(!showAdvanced)}
                     className="flex items-center gap-2 text-xs font-bold text-slate-500 dark:text-slate-400 hover:text-indigo-500 transition-colors mx-auto"
                   >
                       {showAdvanced ? 'Hide Advanced Options' : 'Show Advanced Options (Custom)'}
                       <svg className={`w-4 h-4 transition-transform ${showAdvanced ? 'rotate-180' : ''}`} fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19 9l-7 7-7-7"></path></svg>
                   </button>

                   {/* Advanced Panel */}
                   <div className={`overflow-hidden transition-all duration-300 ease-in-out ${showAdvanced ? 'max-h-96 opacity-100 mt-4' : 'max-h-0 opacity-0'}`}>
                        <div className="bg-slate-50 dark:bg-slate-900/50 p-6 rounded-2xl space-y-6 border border-slate-200 dark:border-slate-700">
                            
                            <div className="flex gap-4 mb-4">
                                <label className="flex items-center gap-2 cursor-pointer">
                                    <input type="radio" checked={settings.mode === CompressionMode.STRUCTURE} onChange={() => { setSettings(s => ({...s, mode: CompressionMode.STRUCTURE})); setActivePreset('custom'); }} className="text-indigo-600 focus:ring-indigo-500" />
                                    <span className="text-sm font-bold text-slate-700 dark:text-slate-200">Structure Mode</span>
                                </label>
                                <label className="flex items-center gap-2 cursor-pointer">
                                    <input type="radio" checked={settings.mode === CompressionMode.IMAGE} onChange={() => { setSettings(s => ({...s, mode: CompressionMode.IMAGE})); setActivePreset('custom'); }} className="text-indigo-600 focus:ring-indigo-500" />
                                    <span className="text-sm font-bold text-slate-700 dark:text-slate-200">Image Mode</span>
                                </label>
                            </div>

                            {settings.mode === CompressionMode.IMAGE && (
                                <div className="space-y-4">
                                    <div>
                                        <div className="flex justify-between text-xs font-bold uppercase text-slate-500 mb-1">
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
                                        <div className="flex justify-between text-xs font-bold uppercase text-slate-500 mb-1">
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
                                    <label className="flex items-center gap-3 mt-2">
                                        <input type="checkbox" checked={settings.grayscale} onChange={(e) => { setSettings(s => ({...s, grayscale: e.target.checked})); setActivePreset('custom'); }} className="rounded text-indigo-600 focus:ring-indigo-500" />
                                        <span className="text-sm font-medium text-slate-700 dark:text-slate-300">Convert to Grayscale</span>
                                    </label>
                                </div>
                            )}
                            
                            <label className="flex items-center gap-3">
                                <input type="checkbox" checked={settings.preserveMetadata} onChange={(e) => { setSettings(s => ({...s, preserveMetadata: e.target.checked})); setActivePreset('custom'); }} className="rounded text-indigo-600 focus:ring-indigo-500" />
                                <span className="text-sm font-medium text-slate-700 dark:text-slate-300">Preserve Metadata (Author, Title)</span>
                            </label>
                        </div>
                   </div>
               </div>

              {/* Progress Bar with Spinner */}
              {status.isProcessing && (
                <div className="space-y-2">
                  <div className="flex justify-between text-xs font-bold uppercase text-slate-500 dark:text-slate-400 tracking-wider">
                    <span className="flex items-center gap-2">
                        <div className="w-2 h-2 bg-indigo-500 rounded-full animate-ping"></div>
                        {status.currentStep}
                    </span>
                    <span>{status.progress}%</span>
                  </div>
                  <div className="h-4 bg-slate-100 dark:bg-slate-700 rounded-full overflow-hidden shadow-inner">
                    <div 
                      className="h-full bg-indigo-500 transition-all duration-300 ease-out relative" 
                      style={{ width: `${status.progress}%` }}
                    >
                       <div className="absolute inset-0 bg-white/20 animate-[spin-slow_2s_linear_infinite]" style={{backgroundImage: 'linear-gradient(45deg,rgba(255,255,255,.15) 25%,transparent 25%,transparent 50%,rgba(255,255,255,.15) 50%,rgba(255,255,255,.15) 75%,transparent 75%,transparent)', backgroundSize: '1rem 1rem'}}></div>
                    </div>
                  </div>
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
              <button
                onClick={handleStart}
                disabled={status.isProcessing}
                className="w-full py-4 bg-indigo-600 hover:bg-indigo-700 dark:bg-indigo-600 dark:hover:bg-indigo-500 disabled:bg-slate-300 dark:disabled:bg-slate-700 disabled:cursor-not-allowed text-white rounded-2xl font-bold text-lg shadow-lg shadow-indigo-200 dark:shadow-none transition-all active:scale-[0.98] flex items-center justify-center gap-3"
              >
                {status.isProcessing ? 'Compressing...' : 'Compress PDF'}
                {!status.isProcessing && <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M13 10V3L4 14h7v7l9-11h-7z"></path></svg>}
              </button>
            </div>
          )}

          {/* 3. Results */}
          {status.resultBlob && (
             <div ref={resultsRef} className="text-center animate-fade-in-up">
                
                {/* Result Header */}
                <div className="inline-block mb-8">
                    <div className="bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-300 px-6 py-2 rounded-full border border-green-200 dark:border-green-800 flex items-center gap-2 shadow-sm">
                        <span className="text-xl">🎉</span>
                        <span className="font-bold">Ready to Download</span>
                    </div>
                </div>
                
                {/* Stats Card - Redesigned */}
                <div className="bg-white dark:bg-slate-900 rounded-2xl p-6 md:p-8 border border-slate-100 dark:border-slate-700 max-w-lg mx-auto mb-8 shadow-sm">
                    <div className="flex items-center justify-between gap-4 mb-2">
                        <div className="text-left">
                             <p className="text-xs font-bold text-slate-400 uppercase tracking-wider mb-1">Before</p>
                             <p className="text-lg font-bold text-slate-500 line-through decoration-red-400">{formatBytes(status.originalSize || 0)}</p>
                        </div>
                        <div className="text-slate-300 dark:text-slate-600">
                            <svg className="w-8 h-8" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M17 8l4 4m0 0l-4 4m4-4H3"></path></svg>
                        </div>
                        <div className="text-right">
                             <p className="text-xs font-bold text-indigo-500 uppercase tracking-wider mb-1">After</p>
                             <p className="text-2xl font-black text-indigo-600 dark:text-indigo-400">{formatBytes(status.compressedSize || status.resultBlob.size)}</p>
                        </div>
                    </div>
                    
                    <div className={`mt-4 p-3 rounded-xl flex justify-center items-center gap-2 ${isSavingsNegative ? 'bg-orange-50 text-orange-700' : 'bg-green-50 text-green-700 dark:bg-green-900/20 dark:text-green-400'}`}>
                        {isSavingsNegative ? (
                            <>
                                <span className="text-xl">⚠️</span>
                                <span className="font-bold text-sm">File size increased. Try "Extreme" mode.</span>
                            </>
                        ) : (
                            <>
                                <span className="text-xl">🔥</span>
                                <span className="font-bold text-lg">{savingsPercent}% Smaller</span>
                            </>
                        )}
                    </div>
                </div>

                {/* --- Comparison View Feature --- */}
                {compressedThumbnailUrl && thumbnailUrl && (
                    <div className="mb-8 max-w-lg mx-auto">
                        <h4 className="text-xs font-bold uppercase text-slate-500 dark:text-slate-400 mb-3 tracking-wider">Quality Check</h4>
                        <div className="bg-slate-100 dark:bg-slate-900/50 p-2 rounded-2xl border border-slate-200 dark:border-slate-700">
                            <div className="relative aspect-[3/4] rounded-xl overflow-hidden bg-white">
                                <img 
                                    src={showOriginalInComparison ? thumbnailUrl : compressedThumbnailUrl} 
                                    alt="Preview" 
                                    className="w-full h-full object-contain" 
                                />
                                <div className="absolute top-2 left-2 bg-black/60 backdrop-blur-sm text-white text-[10px] font-bold px-2 py-1 rounded-lg">
                                    {showOriginalInComparison ? 'ORIGINAL' : 'COMPRESSED'}
                                </div>
                            </div>
                            
                            <div className="flex gap-2 mt-2">
                                <button 
                                    onMouseEnter={() => setShowOriginalInComparison(true)}
                                    onMouseLeave={() => setShowOriginalInComparison(false)}
                                    onTouchStart={() => setShowOriginalInComparison(true)}
                                    onTouchEnd={() => setShowOriginalInComparison(false)}
                                    className="w-full py-2 bg-white dark:bg-slate-800 text-slate-700 dark:text-slate-200 text-xs font-bold rounded-lg border border-slate-200 dark:border-slate-600 hover:bg-slate-50 shadow-sm"
                                >
                                    Hold to See Original
                                </button>
                            </div>
                        </div>
                    </div>
                )}

                <div className="flex flex-col sm:flex-row gap-4 justify-center">
                  <button 
                    onClick={handleDownload}
                    className="w-full sm:w-auto px-8 py-4 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl font-bold shadow-lg shadow-indigo-200 dark:shadow-none transition-all hover:scale-[1.02] active:scale-95 flex items-center justify-center gap-2"
                  >
                    <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4"></path></svg>
                    Download PDF
                  </button>
                  <button 
                    onClick={handleBackToOptions}
                    className="w-full sm:w-auto px-8 py-4 bg-white dark:bg-slate-700 text-slate-700 dark:text-slate-200 border border-slate-200 dark:border-slate-600 rounded-xl font-bold hover:bg-slate-50 dark:hover:bg-slate-600 transition-all"
                  >
                    Try Another Setting
                  </button>
                  <button 
                    onClick={resetState}
                    className="w-full sm:w-auto px-8 py-4 bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-400 rounded-xl font-bold hover:bg-slate-200 dark:hover:bg-slate-700 transition-all"
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
