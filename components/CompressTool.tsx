import React, { useState, useRef, useEffect } from 'react';
import { CompressionMode, CompressionSettings, ProcessStatus } from '../types';
import { compressPDF } from '../services/pdfCompression';
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

type PresetType = 'extreme' | 'recommended' | 'lossless' | 'custom';

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
    autoDetectText: true // Default to Hybrid Mode
  });

  const fileInputRef = useRef<HTMLInputElement>(null);
  const resultsRef = useRef<HTMLDivElement>(null);

  // Scroll to results
  useEffect(() => {
    if (status.resultBlob && resultsRef.current) {
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
            const viewport = page.getViewport({ scale: 1.5 }); // Higher quality for "Cover Art" look
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
            const viewport = page.getViewport({ scale: 1.5 });
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
    if (fileInputRef.current) fileInputRef.current.value = '';
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
    if (e.target) e.target.value = '';
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
        // Extreme: Force Image Mode, Disable Hybrid detection, Low Quality
        setSettings(s => ({ ...s, mode: CompressionMode.IMAGE, quality: 0.6, maxResolution: 1200, grayscale: false, autoDetectText: false }));
    } else if (type === 'recommended') {
        // Recommended: Hybrid Mode (Smart), Good Quality
        setSettings(s => ({ ...s, mode: CompressionMode.IMAGE, quality: 0.8, maxResolution: 2000, grayscale: false, autoDetectText: true }));
    } else if (type === 'lossless') {
        // Lossless: Structure Mode only
        setSettings(s => ({ ...s, mode: CompressionMode.STRUCTURE, quality: 1.0, maxResolution: 5000, grayscale: false, autoDetectText: true }));
    }
  };

  const handleStart = async () => {
    if (!file) return;

    setStatus({ 
        isProcessing: true, 
        currentStep: 'Initializing...', 
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

  const savingsPercent = status.originalSize && status.compressedSize 
    ? Math.round(((status.originalSize - status.compressedSize) / status.originalSize) * 100) 
    : 0;

  const isSavingsNegative = savingsPercent < 0;

  return (
    <div className="max-w-7xl mx-auto animate-fade-in pb-12 px-4 sm:px-6">
      {/* Main Card Container - Mimicking the "Ether Real" card */}
      <div className="bg-[#0f172a] text-white rounded-[2rem] shadow-2xl overflow-hidden min-h-[600px] flex flex-col md:flex-row relative">
        
        {/* Close Button (Top Right) */}
        {file && (
            <button 
                onClick={resetState}
                className="absolute top-4 right-4 z-50 w-10 h-10 bg-white/10 hover:bg-white/20 rounded-full flex items-center justify-center backdrop-blur-md transition-all"
                title="Close / Reset"
            >
                <svg className="w-5 h-5 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M6 18L18 6M6 6l12 12"></path></svg>
            </button>
        )}

        {/* LEFT COLUMN: VISUAL / THUMBNAIL */}
        <div 
            className={`
                relative md:w-1/2 min-h-[300px] md:min-h-full transition-all duration-500 overflow-hidden flex items-center justify-center
                ${!file ? 'bg-gradient-to-br from-indigo-900 to-[#0f172a]' : 'bg-black'}
            `}
            onDragOver={!file ? handleDragOver : undefined}
            onDragLeave={!file ? handleDragLeave : undefined}
            onDrop={!file ? handleDrop : undefined}
            onClick={() => !file && fileInputRef.current?.click()}
        >
            {/* Background Image / Thumbnail */}
            {thumbnailUrl ? (
                <>
                    <div className="absolute inset-0 bg-cover bg-center opacity-50 blur-xl scale-110" style={{ backgroundImage: `url(${thumbnailUrl})` }}></div>
                    <img src={thumbnailUrl} alt="PDF Cover" className="relative z-10 max-h-[80%] max-w-[85%] shadow-2xl rounded-lg object-contain transform hover:scale-105 transition-transform duration-700" />
                </>
            ) : (
                /* Empty State Visual */
                <div className={`text-center p-8 cursor-pointer transition-transform duration-300 ${isDragging ? 'scale-105' : ''}`}>
                    <div className="w-32 h-32 bg-indigo-500/20 rounded-full flex items-center justify-center mx-auto mb-6 backdrop-blur-sm border border-indigo-500/30">
                        <svg className="w-12 h-12 text-indigo-400" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12"></path></svg>
                    </div>
                    <h3 className="text-2xl font-bold tracking-tight mb-2">Upload PDF</h3>
                    <p className="text-indigo-200/60 text-sm font-medium uppercase tracking-widest">Drag & Drop or Click</p>
                </div>
            )}
            
            {/* Date/Info Tag (Top Left of Visual) - Aesthetic Only */}
            {file && (
                <div className="absolute top-6 left-6 z-20">
                    <div className="flex items-center gap-2 text-xs font-bold tracking-widest text-indigo-300 uppercase">
                        <span className="w-2 h-2 bg-indigo-400 rounded-full animate-pulse"></span>
                        {formatBytes(file.size)}
                    </div>
                </div>
            )}
        </div>

        {/* RIGHT COLUMN: CONTROLS & INFO */}
        <div className="md:w-1/2 p-8 md:p-12 flex flex-col justify-center relative bg-[#0f172a]">
            
            {!status.resultBlob ? (
                /* MODE: CONFIGURATION */
                <div className="space-y-10 animate-fade-in">
                    
                    {/* Header Section */}
                    <div>
                        <div className="flex items-center gap-3 mb-2 text-cyan-400 font-bold text-xs tracking-[0.2em] uppercase">
                            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19.428 15.428a2 2 0 00-1.022-.547l-2.384-.477a6 6 0 00-3.86.517l-.318.158a6 6 0 01-3.86.517L6.05 15.21a2 2 0 00-1.806.547M8 4h8l-1 1v5.172a2 2 0 00.586 1.414l5 5c1.26 1.26.367 3.414-1.415 3.414H4.828c-1.782 0-2.674-2.154-1.414-3.414l5-5A2 2 0 009 10.172V5L8 4z"></path></svg>
                            Hybrid Smart Engine
                        </div>
                        <h2 className="text-5xl md:text-6xl font-black text-white leading-[0.9] tracking-tighter">
                            COMPRESS <br/> PDF
                        </h2>
                        <p className="mt-4 text-slate-400 text-sm leading-relaxed max-w-sm">
                            {file ? file.name : "Automatically detects text to keep vectors sharp, or compresses scanned images."}
                        </p>
                    </div>

                    {file && (
                        <>
                            {/* Controls */}
                            <div className="space-y-6">
                                {/* Preset Buttons */}
                                <div className="grid grid-cols-3 gap-3">
                                    {[
                                        { id: 'recommended', label: 'Smart Hybrid' },
                                        { id: 'extreme', label: 'Force Image' },
                                        { id: 'lossless', label: 'Lossless' }
                                    ].map(preset => (
                                        <button
                                            key={preset.id}
                                            onClick={() => applyPreset(preset.id as PresetType)}
                                            className={`py-3 px-2 rounded-xl text-xs font-bold uppercase tracking-wider transition-all border
                                                ${activePreset === preset.id 
                                                    ? 'bg-white text-[#0f172a] border-white' 
                                                    : 'bg-transparent text-slate-500 border-slate-700 hover:border-slate-500 hover:text-slate-300'}
                                            `}
                                        >
                                            {preset.label}
                                        </button>
                                    ))}
                                </div>
                                <p className="text-[10px] text-slate-500 text-center">
                                    {activePreset === 'recommended' && "Detects text & vectors to keep them sharp."}
                                    {activePreset === 'extreme' && "Converts everything to image for max reduction."}
                                    {activePreset === 'lossless' && "Removes invisible data only. No quality loss."}
                                </p>

                                {/* Custom Slider Trigger */}
                                <div>
                                    <button 
                                        onClick={() => setShowAdvanced(!showAdvanced)}
                                        className="flex items-center gap-2 text-xs font-bold text-slate-500 hover:text-cyan-400 transition-colors uppercase tracking-wider"
                                    >
                                        <span>Custom Settings</span>
                                        <svg className={`w-3 h-3 transition-transform ${showAdvanced ? 'rotate-180' : ''}`} fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19 9l-7 7-7-7"></path></svg>
                                    </button>

                                    <div className={`overflow-hidden transition-all duration-300 ${showAdvanced ? 'max-h-64 mt-4 opacity-100' : 'max-h-0 opacity-0'}`}>
                                        <div className="space-y-4 p-4 rounded-xl bg-white/5 border border-white/10">
                                            <div>
                                                <div className="flex justify-between text-[10px] uppercase font-bold text-slate-400 mb-2">
                                                    <span>Quality</span>
                                                    <span>{Math.round(settings.quality * 100)}%</span>
                                                </div>
                                                <input 
                                                    type="range" min="10" max="100" 
                                                    value={settings.quality * 100}
                                                    onChange={(e) => { setSettings(s => ({ ...s, quality: Number(e.target.value) / 100 })); setActivePreset('custom'); }}
                                                    className="w-full h-1 bg-slate-700 rounded-full appearance-none cursor-pointer accent-cyan-400 hover:accent-cyan-300"
                                                />
                                            </div>
                                            
                                            <div className="flex items-center justify-between">
                                                <span className="text-[10px] uppercase font-bold text-slate-400">Hybrid Detection</span>
                                                <div 
                                                    onClick={() => { setSettings(s => ({...s, autoDetectText: !s.autoDetectText})); setActivePreset('custom'); }}
                                                    className={`w-10 h-5 rounded-full flex items-center p-1 cursor-pointer transition-colors ${settings.autoDetectText ? 'bg-cyan-500' : 'bg-slate-700'}`}
                                                >
                                                    <div className={`w-3 h-3 bg-white rounded-full shadow-md transform transition-transform ${settings.autoDetectText ? 'translate-x-5' : 'translate-x-0'}`}></div>
                                                </div>
                                            </div>
                                        </div>
                                    </div>
                                </div>
                            </div>

                            {/* Processing Status or Button */}
                            <div className="pt-4">
                                {status.isProcessing ? (
                                    <div className="flex flex-col items-start gap-3">
                                        <div className="h-1 w-full bg-slate-800 rounded-full overflow-hidden">
                                            <div className="h-full bg-cyan-400 transition-all duration-300" style={{ width: `${status.progress}%` }}></div>
                                        </div>
                                        <div className="flex justify-between w-full text-xs font-mono text-cyan-400">
                                            <span className="animate-pulse">{status.currentStep}</span>
                                            <span>{status.progress}%</span>
                                        </div>
                                    </div>
                                ) : (
                                    <div className="flex justify-between items-center">
                                        <div className="text-xs text-slate-500 font-bold uppercase tracking-widest">
                                            Ready to Process
                                        </div>
                                        <button 
                                            onClick={handleStart}
                                            className="group w-14 h-14 bg-white rounded-full flex items-center justify-center hover:scale-110 transition-transform shadow-[0_0_20px_rgba(255,255,255,0.3)]"
                                        >
                                            <svg className="w-6 h-6 text-[#0f172a] group-hover:translate-x-0.5 transition-transform" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M9 5l7 7-7 7"></path></svg>
                                        </button>
                                    </div>
                                )}
                                {status.error && <p className="text-red-400 text-xs mt-3 font-bold">{status.error}</p>}
                            </div>
                        </>
                    )}
                </div>
            ) : (
                /* MODE: RESULTS */
                <div className="space-y-6 animate-fade-in flex flex-col h-full" ref={resultsRef}>
                    <div className="shrink-0">
                        <div className="flex items-center gap-3 mb-2 text-green-400 font-bold text-xs tracking-[0.2em] uppercase">
                            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M5 13l4 4L19 7"></path></svg>
                            Success
                        </div>
                        <h2 className="text-4xl font-black text-white leading-tight tracking-tighter">
                            FILE READY
                        </h2>
                    </div>

                    {/* SLIDER AREA - Added Back */}
                    <div className="flex-1 bg-black/40 rounded-xl overflow-hidden relative border border-white/10 min-h-[160px]">
                        {thumbnailUrl && compressedThumbnailUrl ? (
                            <ComparisonSlider original={thumbnailUrl} compressed={compressedThumbnailUrl} />
                        ) : (
                            <div className="w-full h-full flex items-center justify-center">
                                <span className="text-slate-500 text-xs uppercase font-bold tracking-widest">Generating Preview...</span>
                            </div>
                        )}
                         <div className="absolute bottom-2 left-0 right-0 text-center pointer-events-none">
                            <span className="text-[10px] text-white/50 uppercase font-bold tracking-widest bg-black/50 px-2 py-1 rounded">Drag slider to compare</span>
                        </div>
                    </div>

                    <div className="grid grid-cols-2 gap-8 border-y border-white/10 py-4 shrink-0">
                        <div>
                            <p className="text-[10px] font-bold uppercase text-slate-500 mb-1 tracking-wider">Before</p>
                            <p className="text-lg font-mono text-slate-300 line-through decoration-red-500/50">{formatBytes(status.originalSize || 0)}</p>
                        </div>
                        <div>
                            <p className="text-[10px] font-bold uppercase text-cyan-400 mb-1 tracking-wider">After</p>
                            <p className="text-2xl font-mono font-bold text-white">{formatBytes(status.compressedSize || 0)}</p>
                        </div>
                    </div>

                    <div className="flex items-center justify-between bg-white/5 rounded-2xl p-4 border border-white/10 shrink-0">
                        <span className={`text-sm font-bold ${isSavingsNegative ? 'text-orange-400' : 'text-green-400'}`}>
                            {isSavingsNegative ? 'Larger (+)' : 'Reduced by'}
                        </span>
                        <span className="text-2xl font-black text-white">{savingsPercent}%</span>
                    </div>

                    <div className="flex gap-4 pt-2 shrink-0">
                        <button 
                            onClick={handleDownload}
                            className="flex-1 py-4 bg-white text-[#0f172a] rounded-xl font-bold uppercase tracking-widest text-xs hover:bg-cyan-50 transition-colors shadow-lg flex items-center justify-center gap-2"
                        >
                            <span>Download</span>
                            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4"></path></svg>
                        </button>
                        <button 
                            onClick={handleBackToOptions}
                            className="px-6 py-4 bg-transparent border border-slate-700 text-white rounded-xl font-bold uppercase tracking-widest text-xs hover:border-white transition-colors"
                        >
                            Tweak
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