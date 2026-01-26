
import React, { useState, useRef, useEffect, useMemo } from 'react';
import { ProcessStatus } from '../types';
import { rotateDocument } from '../services/rotateService';

// Constants
const ITEMS_PER_PAGE = 48; // Pagination for large PDFs

// Helper for formatting bytes
const formatBytes = (bytes: number, decimals = 2) => {
  if (bytes === 0) return '0 Bytes';
  const k = 1024;
  const dm = decimals < 0 ? 0 : decimals;
  const sizes = ['Bytes', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(dm)) + ' ' + sizes[i];
};

// --- THUMBNAIL COMPONENT ---
const RotateThumbnail = React.memo(({ pageIndex, rotation, onRotate, pdf, imageFile }: { pageIndex: number, rotation: number, onRotate: (deg: number) => void, pdf: any, imageFile: File | null }) => {
    const canvasRef = useRef<HTMLCanvasElement>(null);
    const [loaded, setLoaded] = useState(false);

    useEffect(() => {
        if ((!pdf && !imageFile) || loaded) return;

        let active = true;
        const render = async () => {
            try {
                const canvas = canvasRef.current;
                if (!canvas) return;
                const ctx = canvas.getContext('2d');
                if (!ctx) return;

                if (pdf) {
                    const page = await pdf.getPage(pageIndex + 1);
                    const viewport = page.getViewport({ scale: 0.3 }); // Small scale for speed
                    canvas.width = viewport.width;
                    canvas.height = viewport.height;
                    await page.render({ canvasContext: ctx, viewport }).promise;
                } else if (imageFile) {
                    const img = new Image();
                    img.src = URL.createObjectURL(imageFile);
                    await new Promise(r => img.onload = r);
                    const scale = 200 / Math.max(img.width, img.height);
                    canvas.width = img.width * scale;
                    canvas.height = img.height * scale;
                    ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
                }
                
                if (active) setLoaded(true);
            } catch (e) {
                console.warn("Render error", e);
            }
        };
        render();
        return () => { active = false; };
    }, [pdf, imageFile, pageIndex, loaded]);

    return (
        <div className="relative group">
            <div 
                onClick={() => onRotate(90)} // Tap rotates CW
                className={`
                    relative aspect-[3/4] bg-[#1e293b] rounded-xl overflow-hidden cursor-pointer transition-all duration-300 border-2
                    ${rotation !== 0 ? 'border-amber-500 shadow-[0_0_15px_rgba(245,158,11,0.2)]' : 'border-transparent hover:border-white/20'}
                `}
            >
                <div className="w-full h-full flex items-center justify-center p-2">
                    {/* The Rotating Wrapper */}
                    <div 
                        className="transition-transform duration-300 ease-out origin-center shadow-lg"
                        style={{ transform: `rotate(${rotation}deg)` }}
                    >
                        <canvas ref={canvasRef} className="max-w-full max-h-full block object-contain rounded-sm" />
                    </div>
                </div>

                {/* Overlay Controls (Desktop Hover) */}
                <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center gap-2 backdrop-blur-[1px]">
                    <button 
                        onClick={(e) => { e.stopPropagation(); onRotate(-90); }}
                        className="p-2 bg-white text-slate-900 rounded-full hover:scale-110 transition-transform"
                        title="Rotate Left"
                    >
                        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M3 10h10a8 8 0 018 8v2M3 10l6 6m-6-6l6-6"></path></svg>
                    </button>
                    <button 
                        onClick={(e) => { e.stopPropagation(); onRotate(90); }}
                        className="p-2 bg-white text-slate-900 rounded-full hover:scale-110 transition-transform"
                        title="Rotate Right"
                    >
                        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M21 10h-10a8 8 0 00-8 8v2M21 10l-6 6m6-6l-6-6"></path></svg>
                    </button>
                </div>

                {/* Page Number */}
                <div className="absolute top-2 left-2 bg-black/60 text-white text-[10px] font-bold px-2 py-1 rounded-full backdrop-blur-md z-10 pointer-events-none border border-white/10">
                    {pageIndex + 1}
                </div>
                
                {/* Rotation Badge (if changed) */}
                {rotation !== 0 && (
                    <div className="absolute top-2 right-2 bg-amber-500 text-white text-[10px] font-bold px-2 py-1 rounded-full shadow-sm z-10 animate-pop">
                        {rotation}°
                    </div>
                )}
            </div>
        </div>
    );
});

// --- MAIN TOOL ---
const RotateTool: React.FC = () => {
  const [file, setFile] = useState<File | null>(null);
  const [status, setStatus] = useState<ProcessStatus>({ isProcessing: false, currentStep: '', progress: 0 });
  
  // PDF State
  const [pdfDocProxy, setPdfDocProxy] = useState<any>(null);
  const [numPages, setNumPages] = useState(0);
  
  // State: Map of pageIndex -> Rotation Degrees (0, 90, 180, 270)
  // This stores the DELTA from the original file
  const [rotations, setRotations] = useState<Record<number, number>>({});
  
  // UI State
  const [viewPage, setViewPage] = useState(1);
  const [isDragging, setIsDragging] = useState(false);

  const fileInputRef = useRef<HTMLInputElement>(null);
  const resultsRef = useRef<HTMLDivElement>(null);

  // Auto-scroll
  useEffect(() => {
    if (status.resultBlob && resultsRef.current) {
        setTimeout(() => {
            resultsRef.current?.scrollIntoView({ behavior: 'smooth' });
        }, 100);
    }
  }, [status.resultBlob]);

  // Load File
  useEffect(() => {
    if (!file) return;
    
    if (file.type === 'application/pdf') {
        const loadPdf = async () => {
           try {
               const pdfjs = window.pdfjsLib;
               const url = URL.createObjectURL(file);
               const loadingTask = pdfjs.getDocument(url);
               const pdf = await loadingTask.promise;
               setPdfDocProxy(pdf);
               setNumPages(pdf.numPages);
               setRotations({});
               setViewPage(1);
           } catch (e) {
               console.error(e);
               alert("Failed to load PDF.");
           }
        };
        loadPdf();
    } else {
        // Image Mode
        setNumPages(1);
        setPdfDocProxy(null);
        setRotations({});
    }
  }, [file]);

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
      setFile(e.target.files[0]);
      setStatus({ isProcessing: false, currentStep: '', progress: 0 });
    }
    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
    if (e.dataTransfer.files && e.dataTransfer.files[0]) {
        setFile(e.dataTransfer.files[0]);
    }
  };

  // Rotation Logic
  const rotatePage = (idx: number, degrees: number) => {
      setRotations(prev => {
          const current = prev[idx] || 0;
          return { ...prev, [idx]: (current + degrees) % 360 };
      });
  };

  const rotateAll = (degrees: number) => {
      setRotations(prev => {
          const next = { ...prev };
          for(let i=0; i<numPages; i++) {
              const current = next[i] || 0;
              next[i] = (current + degrees) % 360;
          }
          return next;
      });
  };

  const resetRotations = () => setRotations({});

  const resetState = () => {
      setFile(null);
      setPdfDocProxy(null);
      setNumPages(0);
      setRotations({});
      setStatus({ isProcessing: false, currentStep: '', progress: 0 });
  };

  const handleStart = async () => {
      if (!file) return;
      
      // Check if any rotations are applied
      const hasChanges = Object.values(rotations).some(r => r !== 0);
      if (!hasChanges) {
          alert("No pages have been rotated yet.");
          return;
      }

      setStatus({ isProcessing: true, currentStep: 'Processing...', progress: 0 });

      try {
          const blob = await rotateDocument(file, rotations, (p, s) => setStatus(prev => ({...prev, progress: p, currentStep: s})));
          
          setStatus({
              isProcessing: false,
              currentStep: 'Done',
              progress: 100,
              resultBlob: blob,
              resultFileName: `rotated_${file.name}`,
              originalSize: file.size,
              compressedSize: blob.size
          });
      } catch (e: any) {
          console.error(e);
          setStatus(prev => ({ ...prev, isProcessing: false, error: e.message || 'Failed to rotate.' }));
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

  // Grid Logic
  const totalGridPages = Math.ceil(numPages / ITEMS_PER_PAGE);
  const currentGridStartIndex = (viewPage - 1) * ITEMS_PER_PAGE;
  const currentGridEndIndex = Math.min(currentGridStartIndex + ITEMS_PER_PAGE, numPages);
  
  const visiblePageIndices = useMemo(() => {
      const idxs = [];
      for(let i=currentGridStartIndex; i<currentGridEndIndex; i++) idxs.push(i);
      return idxs;
  }, [currentGridStartIndex, currentGridEndIndex]);

  const modifiedCount = Object.values(rotations).filter(r => r !== 0).length;

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

        {/* LEFT COLUMN: VISUAL STAGE */}
        <div 
            className={`
                relative md:w-7/12 min-h-[400px] md:min-h-full transition-all duration-500 overflow-hidden flex flex-col
                ${!file ? 'bg-gradient-to-br from-indigo-900 to-[#0f172a] items-center justify-center' : 'bg-black/20'}
            `}
            onDragOver={(e) => { e.preventDefault(); setIsDragging(true); }}
            onDragLeave={(e) => { e.preventDefault(); setIsDragging(false); }}
            onDrop={handleDrop}
            onClick={() => !file && fileInputRef.current?.click()}
        >
            {!file ? (
                <div className={`text-center p-8 cursor-pointer transition-transform duration-300 ${isDragging ? 'scale-105' : ''}`}>
                    <div className="w-32 h-32 bg-indigo-500/20 rounded-full flex items-center justify-center mx-auto mb-6 backdrop-blur-sm border border-indigo-500/30">
                        <svg className="w-12 h-12 text-indigo-400" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15"></path></svg>
                    </div>
                    <h3 className="text-2xl font-bold tracking-tight mb-2">Upload File</h3>
                    <p className="text-indigo-200/60 text-sm font-medium uppercase tracking-widest">PDF or Image</p>
                </div>
            ) : (
                <div className="flex-1 flex flex-col relative h-full">
                     {/* Grid */}
                     <div className="flex-1 overflow-y-auto p-6 custom-scrollbar">
                        <div className="grid grid-cols-3 sm:grid-cols-4 lg:grid-cols-4 gap-4 pb-20">
                            {visiblePageIndices.map(idx => (
                                <RotateThumbnail 
                                    key={idx}
                                    pageIndex={idx}
                                    rotation={rotations[idx] || 0}
                                    onRotate={(deg) => rotatePage(idx, deg)}
                                    pdf={pdfDocProxy}
                                    imageFile={file.type.startsWith('image/') ? file : null}
                                />
                            ))}
                        </div>
                     </div>

                     {/* Pagination Controls (Floating) */}
                     {totalGridPages > 1 && (
                        <div className="absolute bottom-4 left-0 right-0 flex justify-center pointer-events-none">
                            <div className="bg-[#0f172a]/90 backdrop-blur-md border border-white/10 px-4 py-2 rounded-full pointer-events-auto flex items-center gap-4 text-xs font-bold text-slate-300">
                                <button onClick={() => setViewPage(p => Math.max(1, p - 1))} disabled={viewPage === 1} className="hover:text-white disabled:opacity-30">◀</button>
                                <span>Page {viewPage} / {totalGridPages}</span>
                                <button onClick={() => setViewPage(p => Math.min(totalGridPages, p + 1))} disabled={viewPage === totalGridPages} className="hover:text-white disabled:opacity-30">▶</button>
                            </div>
                        </div>
                     )}
                </div>
            )}
            
            {file && isDragging && (
                <div className="absolute inset-0 bg-indigo-900/80 backdrop-blur-sm z-50 flex items-center justify-center">
                    <h3 className="text-2xl font-bold text-white animate-bounce">Drop to Replace</h3>
                </div>
            )}
        </div>

        {/* RIGHT COLUMN: CONTROLS */}
        <div className="md:w-5/12 p-8 md:p-12 flex flex-col justify-center relative bg-[#0f172a] z-10 border-t md:border-t-0 md:border-l border-white/5">
            
            {/* Header */}
            <div className="mb-8 shrink-0">
                <div className="flex items-center gap-3 mb-2 text-indigo-400 font-bold text-xs tracking-[0.2em] uppercase">
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15"></path></svg>
                    Fix Orientation
                </div>
                <h2 className="text-5xl font-black text-white leading-[0.9] tracking-tighter">
                    ROTATE
                </h2>
            </div>

            {!status.resultBlob ? (
                /* CONFIGURATION VIEW */
                <div className={`space-y-8 animate-fade-in ${status.isProcessing ? 'opacity-50 pointer-events-none' : ''}`}>
                    {file && (
                        <>
                            {/* Stats */}
                            <div className="grid grid-cols-2 gap-8 border-y border-white/10 py-6">
                                <div>
                                    <p className="text-[10px] font-bold uppercase text-slate-500 mb-1 tracking-wider">Total Pages</p>
                                    <p className="text-2xl font-mono font-bold text-white">{numPages}</p>
                                </div>
                                <div>
                                    <p className="text-[10px] font-bold uppercase text-slate-500 mb-1 tracking-wider">Modified</p>
                                    <p className={`text-2xl font-mono font-bold ${modifiedCount > 0 ? 'text-amber-400' : 'text-slate-500'}`}>{modifiedCount}</p>
                                </div>
                            </div>

                            {/* Global Controls */}
                            <div>
                                <label className="text-[10px] font-bold uppercase text-slate-500 mb-3 block tracking-wider">Global Rotation</label>
                                <div className="grid grid-cols-2 gap-3">
                                    <button 
                                        onClick={() => rotateAll(-90)}
                                        className="py-4 bg-[#1e293b] hover:bg-[#2d3b55] text-white rounded-xl font-bold text-xs uppercase tracking-wider transition-all border border-white/5 flex items-center justify-center gap-2 group"
                                    >
                                        <svg className="w-4 h-4 group-hover:-rotate-90 transition-transform" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M3 10h10a8 8 0 018 8v2M3 10l6 6m-6-6l6-6"></path></svg>
                                        All Left 90°
                                    </button>
                                    <button 
                                        onClick={() => rotateAll(90)}
                                        className="py-4 bg-[#1e293b] hover:bg-[#2d3b55] text-white rounded-xl font-bold text-xs uppercase tracking-wider transition-all border border-white/5 flex items-center justify-center gap-2 group"
                                    >
                                        All Right 90°
                                        <svg className="w-4 h-4 group-hover:rotate-90 transition-transform" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M21 10h-10a8 8 0 00-8 8v2M21 10l-6 6m6-6l-6-6"></path></svg>
                                    </button>
                                </div>
                                <button 
                                    onClick={resetRotations}
                                    disabled={modifiedCount === 0}
                                    className="w-full mt-3 py-2 text-[10px] font-bold uppercase tracking-widest text-slate-500 hover:text-red-400 disabled:opacity-0 transition-all"
                                >
                                    Reset All Changes
                                </button>
                            </div>

                            {/* Processing Status */}
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
                            {status.error && <p className="text-red-400 text-xs font-bold">{status.error}</p>}

                            {/* Action Button */}
                            {!status.isProcessing && (
                                <button 
                                    onClick={handleStart}
                                    disabled={modifiedCount === 0}
                                    className="w-full py-4 bg-gradient-to-r from-amber-500 to-orange-500 hover:from-amber-400 hover:to-orange-400 text-white rounded-xl font-bold uppercase tracking-widest text-xs transition-all shadow-lg shadow-amber-900/20 flex items-center justify-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed group"
                                >
                                    <span>Apply Rotation</span>
                                    <svg className="w-4 h-4 transition-transform group-hover:rotate-180" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15"></path></svg>
                                </button>
                            )}
                        </>
                    )}
                    
                    {!file && (
                        <div className="text-slate-500 text-sm font-medium italic opacity-50">
                            Select a document to begin rotating pages.
                        </div>
                    )}
                </div>
            ) : (
                /* RESULT VIEW */
                <div ref={resultsRef} className="flex flex-col h-full animate-fade-in space-y-6">
                    <div className="flex-1 bg-[#1e293b] rounded-xl p-6 border border-white/5 flex flex-col justify-center items-center text-center">
                        <div className="w-20 h-20 bg-amber-500/10 rounded-full flex items-center justify-center mb-4 border border-amber-500/20">
                            <svg className="w-10 h-10 text-amber-400" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M5 13l4 4L19 7"></path></svg>
                        </div>
                        <h3 className="text-xl font-bold text-white mb-1">Rotation Saved!</h3>
                        <p className="text-slate-400 text-xs">Your document orientation has been updated.</p>
                    </div>

                    <div className="grid grid-cols-2 gap-8 border-y border-white/10 py-4 shrink-0">
                        <div>
                            <p className="text-[10px] font-bold uppercase text-slate-500 mb-1 tracking-wider">Original Size</p>
                            <p className="text-xl font-mono text-slate-400">{formatBytes(status.originalSize || 0)}</p>
                        </div>
                        <div>
                            <p className="text-[10px] font-bold uppercase text-slate-500 mb-1 tracking-wider">New Size</p>
                            <p className="text-xl font-mono font-bold text-white">{formatBytes(status.compressedSize || 0)}</p>
                        </div>
                    </div>

                    <div className="flex gap-4 pt-2 shrink-0">
                        <button 
                            onClick={handleDownload}
                            className="flex-1 py-4 bg-white text-[#0f172a] rounded-xl font-bold uppercase tracking-widest text-xs hover:bg-amber-400 hover:text-white transition-colors shadow-lg flex items-center justify-center gap-2"
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
      
      <input ref={fileInputRef} type="file" accept=".pdf,image/*" onChange={handleFileChange} className="hidden" />
    </div>
  );
};

export default RotateTool;
