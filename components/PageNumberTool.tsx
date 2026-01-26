
import React, { useState, useRef, useEffect } from 'react';
import { ProcessStatus, PageNumberSettings, PageNumberPosition } from '../types';
import { addPageNumbers } from '../services/pageNumberService';
import { renderPdfPage } from '../services/pdfSignature';

// Constants
const formatBytes = (bytes: number, decimals = 2) => {
  if (bytes === 0) return '0 Bytes';
  const k = 1024;
  const dm = decimals < 0 ? 0 : decimals;
  const sizes = ['Bytes', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(dm)) + ' ' + sizes[i];
};

const PageNumberTool: React.FC = () => {
  const [file, setFile] = useState<File | null>(null);
  const [status, setStatus] = useState<ProcessStatus>({ isProcessing: false, currentStep: '', progress: 0 });
  const [isDragging, setIsDragging] = useState(false);
  const [previewImage, setPreviewImage] = useState<string | null>(null);
  
  // Settings
  const [settings, setSettings] = useState<PageNumberSettings>({
    position: 'bottom-center',
    margin: 30,
    fontSize: 12,
    format: 'n',
    startFrom: 1,
    skipFirst: false,
  });

  const fileInputRef = useRef<HTMLInputElement>(null);
  const resultsRef = useRef<HTMLDivElement>(null);

  // Auto-scroll to results
  useEffect(() => {
    if (status.resultBlob && resultsRef.current) {
        setTimeout(() => {
            resultsRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
        }, 100);
    }
  }, [status.resultBlob]);

  // Generate Preview
  useEffect(() => {
      if (!file) {
          setPreviewImage(null);
          return;
      }
      
      let active = true;
      // Render the first page
      renderPdfPage(file, 0).then(res => {
          if (active) setPreviewImage(URL.createObjectURL(res.blob));
      }).catch(err => {
          console.warn("Preview render failed", err);
      });
      
      return () => { active = false; };
  }, [file]);

  const resetState = () => {
    setFile(null);
    setPreviewImage(null);
    setStatus({ isProcessing: false, currentStep: '', progress: 0, resultBlob: undefined, error: undefined });
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
      setFile(e.target.files[0]);
    }
    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  // Drag handlers
  const handleDragOver = (e: React.DragEvent) => { e.preventDefault(); setIsDragging(true); };
  const handleDragLeave = (e: React.DragEvent) => { e.preventDefault(); setIsDragging(false); };
  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
    if (e.dataTransfer.files && e.dataTransfer.files[0]?.type === 'application/pdf') {
        setFile(e.dataTransfer.files[0]);
    } else {
        alert("Please drop a PDF file.");
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
      const resultBlob = await addPageNumbers(file, settings, (p, s) => {
        setStatus(prev => ({ ...prev, progress: p, currentStep: s }));
      });

      setStatus({
        isProcessing: false,
        currentStep: 'Completed!',
        progress: 100,
        resultBlob,
        originalSize: file.size,
        compressedSize: resultBlob.size,
        resultFileName: `numbered_${file.name}`
      });
    } catch (error: any) {
      console.error(error);
      setStatus(prev => ({ 
        ...prev, 
        isProcessing: false, 
        error: error.message || 'Processing failed.' 
      }));
    }
  };

  const handleDownload = () => {
    if (!status.resultBlob || !status.resultFileName) return;
    const url = URL.createObjectURL(status.resultBlob);
    const a = document.createElement('a');
    a.href = url;
    a.download = status.resultFileName;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  // Format Helper Display
  const getSampleText = () => {
      if (settings.format === 'n') return '1';
      if (settings.format === 'page-n') return 'Page 1';
      if (settings.format === 'n-of-total') return '1 of 5';
      if (settings.format === 'page-n-of-total') return 'Page 1 of 5';
      return '1';
  };

  return (
    <div className="max-w-7xl mx-auto animate-fade-in pb-12 px-4 sm:px-6">
      
      {/* Main Container */}
      <div className="bg-[#0f172a] text-white rounded-[2rem] shadow-2xl overflow-hidden min-h-[600px] flex flex-col md:flex-row relative">
        
        {/* Close/Reset Button */}
        {file && !status.isProcessing && (
            <button 
                onClick={resetState}
                className="absolute top-4 right-4 z-50 w-10 h-10 bg-white/10 hover:bg-white/20 rounded-full flex items-center justify-center backdrop-blur-md transition-all"
                title="Close / Reset"
            >
                <svg className="w-5 h-5 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M6 18L18 6M6 6l12 12"></path></svg>
            </button>
        )}

        {/* LEFT COLUMN: INTERACTIVE PREVIEW STAGE */}
        <div 
            className={`
                relative md:w-1/2 min-h-[400px] md:min-h-full transition-all duration-500 overflow-hidden flex flex-col
                ${!file ? 'bg-gradient-to-br from-indigo-900 to-[#0f172a] items-center justify-center' : 'bg-black/30'}
            `}
            onDragOver={handleDragOver}
            onDragLeave={handleDragLeave}
            onDrop={handleDrop}
            onClick={() => !file && fileInputRef.current?.click()}
        >
            {!file ? (
                <div className={`text-center p-8 cursor-pointer transition-transform duration-300 ${isDragging ? 'scale-105' : ''}`}>
                    <div className="w-32 h-32 bg-indigo-500/20 rounded-full flex items-center justify-center mx-auto mb-6 backdrop-blur-sm border border-indigo-500/30">
                        <svg className="w-12 h-12 text-indigo-400" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M7 21h10a2 2 0 002-2V9.414a1 1 0 00-.293-.707l-5.414-5.414A1 1 0 0012.586 3H7a2 2 0 00-2 2v14a2 2 0 002 2z"></path></svg>
                    </div>
                    <h3 className="text-2xl font-bold tracking-tight mb-2">Upload PDF</h3>
                    <p className="text-indigo-200/60 text-sm font-medium uppercase tracking-widest">Drag & Drop or Click</p>
                </div>
            ) : (
                <div className="w-full h-full flex flex-col items-center justify-center p-8 relative">
                    
                    {/* File Info - Fixed visibility issues */}
                    <div className="absolute top-4 left-4 md:top-6 md:left-6 flex items-center gap-3 z-30 pointer-events-none">
                        <div className="w-10 h-10 rounded-lg bg-red-500/20 flex items-center justify-center shadow-lg border border-white/10 backdrop-blur-sm">
                            <span className="text-xl">📄</span>
                        </div>
                        <div className="bg-black/60 backdrop-blur-md px-3 py-2 rounded-xl border border-white/10 shadow-lg">
                            <div className="text-xs font-bold text-white max-w-[150px] md:max-w-[250px] truncate">{file.name}</div>
                            <div className="text-[10px] text-slate-300 font-mono">{formatBytes(file.size)}</div>
                        </div>
                    </div>

                    {/* PREVIEW CONTAINER */}
                    <div className="relative w-full max-w-[340px] aspect-[1/1.414] bg-white rounded-lg shadow-2xl transition-all duration-300 transform md:scale-100 scale-90 overflow-hidden border border-white/10">
                        
                        {/* The Actual PDF Preview */}
                        {previewImage ? (
                            <img 
                                src={previewImage} 
                                alt="PDF Preview" 
                                className="w-full h-full object-contain pointer-events-none"
                            />
                        ) : (
                            <div className="absolute inset-0 flex items-center justify-center">
                                <div className="w-8 h-8 border-4 border-indigo-500 border-t-transparent rounded-full animate-spin"></div>
                            </div>
                        )}

                        {/* Interactive Click Zones */}
                        {[
                            'top-left', 'top-center', 'top-right',
                            'bottom-left', 'bottom-center', 'bottom-right'
                        ].map((pos) => {
                            const isSelected = settings.position === pos;
                            const isTop = pos.includes('top');
                            const isBottom = pos.includes('bottom');
                            const isLeft = pos.includes('left');
                            const isRight = pos.includes('right');
                            const isCenter = pos.includes('center');

                            // Classes for positioning the zones
                            let posClass = '';
                            if (isTop) posClass += 'top-0 ';
                            if (isBottom) posClass += 'bottom-0 ';
                            if (isLeft) posClass += 'left-0 ';
                            if (isRight) posClass += 'right-0 ';
                            if (isCenter) posClass += 'left-1/2 -translate-x-1/2 ';

                            return (
                                <div
                                    key={pos}
                                    onClick={() => setSettings(s => ({...s, position: pos as PageNumberPosition}))}
                                    className={`
                                        absolute w-24 h-24 flex items-center justify-center cursor-pointer transition-all duration-200 z-10
                                        ${posClass}
                                        ${isSelected ? 'opacity-100 scale-100' : 'opacity-0 hover:opacity-50 hover:bg-indigo-500/10'}
                                    `}
                                >
                                    {/* The Number Stamp */}
                                    <div className={`
                                        px-3 py-1 rounded text-slate-900 font-bold transition-all duration-300
                                        ${isSelected ? 'bg-indigo-100 text-indigo-700 ring-2 ring-indigo-500 shadow-lg' : 'bg-transparent border border-dashed border-slate-500/50'}
                                    `}
                                    style={{ fontSize: Math.max(10, settings.fontSize * 0.8) + 'px' }} // Scaled font for preview
                                    >
                                        {isSelected ? getSampleText() : '+'}
                                    </div>
                                </div>
                            );
                        })}
                    </div>
                    
                    <p className="mt-6 text-xs font-bold text-slate-500 uppercase tracking-widest">Click page corners to position</p>
                </div>
            )}
        </div>

        {/* RIGHT COLUMN: CONTROLS */}
        <div className="md:w-1/2 p-8 md:p-12 flex flex-col justify-center relative bg-[#0f172a] z-10 border-t md:border-t-0 md:border-l border-white/5">
            
            {/* Header */}
            <div className="mb-8 shrink-0">
                <div className="flex items-center gap-3 mb-2 text-indigo-400 font-bold text-xs tracking-[0.2em] uppercase">
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M7 20l4-16m2 16l4-16M6 9h14M4 15h14"></path></svg>
                    Organize & Index
                </div>
                <h2 className="text-5xl font-black text-white leading-[0.9] tracking-tighter">
                    PAGINATION
                </h2>
            </div>

            {!status.resultBlob ? (
                /* CONFIGURATION VIEW */
                <div className={`space-y-8 animate-fade-in ${status.isProcessing ? 'opacity-50 pointer-events-none' : ''}`}>
                    {file && (
                        <>
                            {/* Format Selection */}
                            <div>
                                <label className="text-[10px] font-bold uppercase text-slate-500 mb-3 block tracking-wider">Number Format</label>
                                <div className="grid grid-cols-2 gap-3">
                                    {[
                                        { id: 'n', label: '1' },
                                        { id: 'page-n', label: 'Page 1' },
                                        { id: 'n-of-total', label: '1 of N' },
                                        { id: 'page-n-of-total', label: 'Page 1 of N' }
                                    ].map(fmt => (
                                        <button
                                            key={fmt.id}
                                            onClick={() => setSettings(s => ({...s, format: fmt.id as any}))}
                                            className={`py-3 px-4 rounded-xl border text-xs font-bold transition-all
                                                ${settings.format === fmt.id 
                                                    ? 'bg-indigo-600 border-indigo-500 text-white shadow-lg shadow-indigo-500/20' 
                                                    : 'bg-[#1e293b] border-white/5 text-slate-400 hover:text-white hover:border-white/20'}
                                            `}
                                        >
                                            {fmt.label}
                                        </button>
                                    ))}
                                </div>
                            </div>

                            {/* Sliders Grid */}
                            <div className="grid grid-cols-2 gap-6">
                                {/* Font Size */}
                                <div>
                                    <div className="flex justify-between text-[10px] font-bold uppercase text-slate-500 mb-2 tracking-wider">
                                        <span>Font Size</span>
                                        <span className="text-white">{settings.fontSize}px</span>
                                    </div>
                                    <input 
                                        type="range" min="8" max="48" 
                                        value={settings.fontSize} 
                                        onChange={(e) => setSettings(s => ({...s, fontSize: Number(e.target.value)}))}
                                        className="w-full h-1.5 bg-[#1e293b] rounded-full appearance-none cursor-pointer accent-indigo-500 hover:accent-indigo-400"
                                    />
                                </div>

                                {/* Margin */}
                                <div>
                                    <div className="flex justify-between text-[10px] font-bold uppercase text-slate-500 mb-2 tracking-wider">
                                        <span>Edge Margin</span>
                                        <span className="text-white">{settings.margin}px</span>
                                    </div>
                                    <input 
                                        type="range" min="0" max="100" 
                                        value={settings.margin} 
                                        onChange={(e) => setSettings(s => ({...s, margin: Number(e.target.value)}))}
                                        className="w-full h-1.5 bg-[#1e293b] rounded-full appearance-none cursor-pointer accent-indigo-500 hover:accent-indigo-400"
                                    />
                                </div>
                            </div>

                            {/* Toggles & Inputs */}
                            <div className="space-y-4">
                                {/* Skip Cover */}
                                <div className="flex items-center justify-between bg-[#1e293b] p-4 rounded-xl border border-white/5">
                                    <div>
                                        <span className="block text-xs font-bold text-white">Skip Cover Page</span>
                                        <span className="text-[10px] text-slate-400">Do not number the first page</span>
                                    </div>
                                    <label className="relative inline-flex items-center cursor-pointer">
                                        <input 
                                            type="checkbox" 
                                            checked={settings.skipFirst} 
                                            onChange={(e) => setSettings(s => ({...s, skipFirst: e.target.checked}))} 
                                            className="sr-only peer" 
                                        />
                                        <div className="w-11 h-6 bg-slate-700 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-indigo-500"></div>
                                    </label>
                                </div>

                                {/* Start Count */}
                                <div className="flex items-center justify-between bg-[#1e293b] p-4 rounded-xl border border-white/5">
                                    <div>
                                        <span className="block text-xs font-bold text-white">Start Count At</span>
                                        <span className="text-[10px] text-slate-400">Offset numbering sequence</span>
                                    </div>
                                    <input 
                                        type="number" min="1" max="999"
                                        value={settings.startFrom}
                                        onChange={(e) => setSettings(s => ({...s, startFrom: Number(e.target.value)}))}
                                        className="w-16 bg-black/30 border border-white/10 rounded-lg p-2 text-center text-white font-mono text-sm focus:outline-none focus:border-indigo-500"
                                    />
                                </div>
                            </div>

                            {/* Processing Bar */}
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
                                    className="w-full py-4 bg-gradient-to-r from-indigo-600 to-indigo-500 hover:from-indigo-500 hover:to-indigo-400 text-white rounded-xl font-bold uppercase tracking-widest text-xs transition-all shadow-lg shadow-indigo-900/20 flex items-center justify-center gap-2 group mt-4"
                                >
                                    <span>Apply Numbers</span>
                                    <svg className="w-4 h-4 transition-transform group-hover:translate-x-1" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M13 10V3L4 14h7v7l9-11h-7z"></path></svg>
                                </button>
                            )}
                        </>
                    )}
                    
                    {!file && (
                        <div className="text-slate-500 text-sm font-medium italic opacity-50">
                            Upload a PDF to configure pagination.
                        </div>
                    )}
                </div>
            ) : (
                /* RESULT VIEW */
                <div ref={resultsRef} className="flex flex-col h-full animate-fade-in space-y-6">
                    <div className="flex-1 bg-[#1e293b] rounded-xl p-6 border border-white/5 flex flex-col justify-center items-center text-center">
                        <div className="w-20 h-20 bg-green-500/10 rounded-full flex items-center justify-center mb-4 border border-green-500/20">
                            <svg className="w-10 h-10 text-green-400" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M5 13l4 4L19 7"></path></svg>
                        </div>
                        <h3 className="text-xl font-bold text-white mb-1">Pagination Complete!</h3>
                        <p className="text-slate-400 text-xs">Numbers have been added to your document.</p>
                    </div>

                    <div className="flex gap-4 pt-2 shrink-0">
                        <button 
                            onClick={handleDownload}
                            className="flex-1 py-4 bg-white text-[#0f172a] rounded-xl font-bold uppercase tracking-widest text-xs hover:bg-green-400 hover:text-white transition-colors shadow-lg flex items-center justify-center gap-2"
                        >
                            <span>Download</span>
                            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4"></path></svg>
                        </button>
                        <button 
                            onClick={() => setStatus({isProcessing:false, currentStep:'', progress:0})}
                            className="px-6 py-4 bg-transparent border border-slate-700 text-white rounded-xl font-bold uppercase tracking-widest text-xs hover:border-white transition-colors"
                        >
                            Back
                        </button>
                    </div>
                </div>
            )}
        </div>
      </div>
      
      <input ref={fileInputRef} type="file" accept=".pdf" onChange={handleFileChange} className="hidden" />
    </div>
  );
};

export default PageNumberTool;
