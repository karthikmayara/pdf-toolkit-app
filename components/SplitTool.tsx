import React, { useState, useRef, useEffect, useMemo } from 'react';
import { ProcessStatus, SplitSettings } from '../types';
import { splitPDF, parsePageRange, rangeSetToString } from '../services/pdfSplit';

// Constants
const ITEMS_PER_PAGE = 50; // Grid pagination size

// --- SUB-COMPONENT: THUMBNAIL ---
const PageThumbnail = React.memo(({ pageIndex, isSelected, onClick, pdf, mode }: { pageIndex: number, isSelected: boolean, onClick: () => void, pdf: any, mode: string }) => {
    const canvasRef = useRef<HTMLCanvasElement>(null);
    const [loaded, setLoaded] = useState(false);

    useEffect(() => {
        if (!pdf || loaded) return;

        let active = true;
        const render = async () => {
            try {
                const page = await pdf.getPage(pageIndex + 1);
                // Render small thumbnail
                const viewport = page.getViewport({ scale: 0.3 }); 
                const canvas = canvasRef.current;
                if (!canvas || !active) return;
                
                const ctx = canvas.getContext('2d');
                if(!ctx) return;

                canvas.width = viewport.width;
                canvas.height = viewport.height;
                
                await page.render({ canvasContext: ctx, viewport }).promise;
                if (active) setLoaded(true);
            } catch (e) {
                console.warn("Thumb render error", e);
            }
        };
        render();
        return () => { active = false; };
    }, [pdf, pageIndex, loaded]);

    const isExtract = mode === 'extract';

    // VISUAL LOGIC:
    // Extract Mode: Selected = GREEN (Kept). Unselected = GREY (Discarded).
    // Delete Mode: Selected = RED (Deleted). Unselected = NORMAL (Kept).
    
    let borderClass = 'border-white/10 hover:border-white/30';
    let opacityClass = 'opacity-100';
    let overlayIcon = null;

    if (isExtract) {
        if (isSelected) {
            borderClass = 'border-green-500 ring-2 ring-green-500/50 shadow-[0_0_15px_rgba(34,197,94,0.3)] transform scale-95 z-10';
            opacityClass = 'opacity-100';
            overlayIcon = (
                <div className="absolute inset-0 flex items-center justify-center bg-green-500/20 backdrop-blur-[1px]">
                    <div className="bg-green-500 text-white rounded-full p-1.5 shadow-lg animate-pop">
                        <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="3" d="M5 13l4 4L19 7"></path></svg>
                    </div>
                </div>
            );
        } else {
            // Unselected in extract mode implies "Discard", so dim it heavily
            opacityClass = 'opacity-40 grayscale blur-[1px] hover:grayscale-0 hover:blur-0 hover:opacity-80';
        }
    } else {
        // Delete Mode
        if (isSelected) {
            borderClass = 'border-red-500 ring-2 ring-red-500/50 shadow-[0_0_15px_rgba(239,68,68,0.3)] transform scale-95 z-10';
            opacityClass = 'opacity-60 grayscale'; // Dim the deleted ones slightly
            overlayIcon = (
                <div className="absolute inset-0 flex items-center justify-center bg-red-500/30 backdrop-blur-[1px]">
                    <div className="bg-red-500 text-white rounded-full p-1.5 shadow-lg animate-pop">
                         <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M6 18L18 6M6 6l12 12"></path></svg>
                    </div>
                </div>
            );
        } else {
            opacityClass = 'opacity-100';
        }
    }
    
    return (
        <div 
            onClick={onClick}
            className={`
                relative aspect-[3/4] rounded-xl cursor-pointer transition-all duration-300 border-2 overflow-hidden group bg-[#1e293b]
                ${borderClass} ${opacityClass}
            `}
        >
            <div className="w-full h-full flex items-center justify-center">
                 <canvas ref={canvasRef} className="max-w-full max-h-full block object-contain" />
            </div>
            
            {/* Number Badge */}
            <div className="absolute top-2 left-2 bg-black/60 text-white text-[10px] font-bold px-2 py-1 rounded-full backdrop-blur-md z-20 border border-white/10">
                {pageIndex + 1}
            </div>

            {/* Selection Overlay */}
            {overlayIcon}
            
            {/* Hover Indicator */}
            <div className="absolute inset-0 bg-indigo-500/0 group-hover:bg-indigo-500/10 transition-colors pointer-events-none"></div>
        </div>
    );
});

// --- MAIN COMPONENT ---
const SplitTool: React.FC = () => {
  const [file, setFile] = useState<File | null>(null);
  const [status, setStatus] = useState<ProcessStatus>({ isProcessing: false, currentStep: '', progress: 0 });
  
  // PDF State
  const [pdfDocProxy, setPdfDocProxy] = useState<any>(null);
  const [numPages, setNumPages] = useState(0);
  
  // Selection State
  const [settings, setSettings] = useState<SplitSettings>({
    mode: 'extract', // 'extract' = keep selected, 'remove' = delete selected
    selectedPages: new Set<number>()
  });
  
  // UI State
  const [viewPage, setViewPage] = useState(1); // Grid pagination (1-based)
  const [rangeInput, setRangeInput] = useState('');

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

  // Sync mode changes
  useEffect(() => {
      if (file) {
          setSettings(prev => ({ ...prev, selectedPages: new Set() }));
          setRangeInput('');
      }
  }, [settings.mode, file]);

  // Load PDF Structure
  useEffect(() => {
    if (!file) return;
    
    // Safety check
    if (!window.pdfjsLib) {
        alert("PDF library is still loading. Please try again in a few seconds.");
        setFile(null);
        return;
    }

    const loadPdf = async () => {
       try {
           const pdfjs = window.pdfjsLib;
           const url = URL.createObjectURL(file);
           const loadingTask = pdfjs.getDocument(url);
           const pdf = await loadingTask.promise;
           setPdfDocProxy(pdf);
           setNumPages(pdf.numPages);
           
           // Reset UI
           setSettings({ mode: 'extract', selectedPages: new Set() });
           setRangeInput('');
           setViewPage(1);

       } catch (e) {
           console.error(e);
           alert("Failed to load PDF structure.");
       }
    };
    loadPdf();
  }, [file]);

  // Sync Input Text with Selection
  useEffect(() => {
      setRangeInput(rangeSetToString(settings.selectedPages));
  }, [settings.selectedPages]);

  // Handle Range Input Change
  const handleRangeInputChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
      const val = e.target.value;
      setRangeInput(val); 
  };
  
  const applyRangeInput = () => {
      const newSet = parsePageRange(rangeInput, numPages);
      setSettings(prev => ({ ...prev, selectedPages: newSet }));
  };

  const togglePage = (idx: number) => {
      setSettings(prev => {
          const newSet = new Set(prev.selectedPages);
          if (newSet.has(idx)) newSet.delete(idx);
          else newSet.add(idx);
          return { ...prev, selectedPages: newSet };
      });
  };

  const selectAll = () => {
      const newSet = new Set<number>();
      for(let i=0; i<numPages; i++) newSet.add(i);
      setSettings(prev => ({ ...prev, selectedPages: newSet }));
  };

  const selectNone = () => {
      setSettings(prev => ({ ...prev, selectedPages: new Set() }));
  };

  const resetState = () => {
      setFile(null);
      setPdfDocProxy(null);
      setNumPages(0);
      setStatus({ isProcessing: false, currentStep: '', progress: 0 });
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
      setFile(e.target.files[0]);
    }
    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    if (e.dataTransfer.files && e.dataTransfer.files[0]?.type === 'application/pdf') {
        setFile(e.dataTransfer.files[0]);
    }
  };

  const handleStart = async () => {
    if (!file) return;
    
    // Determine which pages to keep based on mode
    let pagesToKeep = new Set<number>();
    
    if (settings.mode === 'extract') {
        if (settings.selectedPages.size === 0) {
            alert("Please select at least one page to extract.");
            return;
        }
        pagesToKeep = settings.selectedPages;
    } else {
        // Remove mode: Keep everything EXCEPT selected
        if (settings.selectedPages.size === numPages) {
            alert("You cannot delete all pages.");
            return;
        }
        if (settings.selectedPages.size === 0) {
            alert("Please select at least one page to delete.");
            return;
        }
        for(let i=0; i<numPages; i++) {
            if (!settings.selectedPages.has(i)) pagesToKeep.add(i);
        }
    }

    setStatus({ isProcessing: true, currentStep: 'Processing...', progress: 0 });

    try {
        const blob = await splitPDF(file, pagesToKeep, (p, s) => setStatus(prev => ({...prev, progress: p, currentStep: s})));
        
        setStatus({
            isProcessing: false,
            currentStep: 'Done',
            progress: 100,
            resultBlob: blob,
            resultFileName: settings.mode === 'extract' ? `extracted_${file.name}` : `split_${file.name}`,
            compressedSize: blob.size
        });
    } catch (e: any) {
        setStatus(prev => ({ ...prev, isProcessing: false, error: e.message }));
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

  // --- GRID PAGINATION ---
  const totalGridPages = Math.ceil(numPages / ITEMS_PER_PAGE);
  const currentGridStartIndex = (viewPage - 1) * ITEMS_PER_PAGE;
  const currentGridEndIndex = Math.min(currentGridStartIndex + ITEMS_PER_PAGE, numPages);
  
  const visiblePageIndices = useMemo(() => {
      const idxs = [];
      for(let i=currentGridStartIndex; i<currentGridEndIndex; i++) idxs.push(i);
      return idxs;
  }, [currentGridStartIndex, currentGridEndIndex]);

  // --- SUMMARY CALC ---
  const pagesResultCount = settings.mode === 'extract' 
      ? settings.selectedPages.size 
      : numPages - settings.selectedPages.size;

  const isExtract = settings.mode === 'extract';

  return (
    <div className="max-w-7xl mx-auto animate-fade-in pb-12 px-4 sm:px-6">
      
      {/* Main Card Container */}
      <div className="bg-[#0f172a] text-white rounded-[2rem] shadow-2xl overflow-hidden min-h-[600px] flex flex-col md:flex-row relative">
        
        {/* Close Button */}
        {file && !status.isProcessing && (
            <button 
                onClick={resetState}
                className="absolute top-4 right-4 z-50 w-10 h-10 bg-white/10 hover:bg-white/20 rounded-full flex items-center justify-center backdrop-blur-md transition-all"
                title="Close / Reset"
            >
                <svg className="w-5 h-5 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M6 18L18 6M6 6l12 12"></path></svg>
            </button>
        )}

        {/* LEFT COLUMN: THE GRID (Visual Stage) */}
        <div 
            className={`
                relative md:w-1/2 min-h-[300px] md:min-h-full transition-all duration-500 overflow-hidden flex flex-col
                ${!file ? 'bg-gradient-to-br from-indigo-900 to-[#0f172a] items-center justify-center' : 'bg-black/20'}
            `}
            onDragOver={(e) => e.preventDefault()}
            onDrop={handleDrop}
            onClick={() => !file && fileInputRef.current?.click()}
        >
            {!file ? (
                <div className="text-center p-8 cursor-pointer transition-transform duration-300 hover:scale-105">
                    <div className="w-32 h-32 bg-indigo-500/20 rounded-full flex items-center justify-center mx-auto mb-6 backdrop-blur-sm border border-indigo-500/30">
                        <svg className="w-12 h-12 text-indigo-400" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M14.121 15.536c-1.171 1.952-3.07 1.952-4.242 0-1.172-1.953-1.172-5.119 0-7.072 1.171-1.952 3.07-1.952 4.242 0M8 10.5h4m-4 3h4m9-1.5a9 9 0 11-18 0 9 9 0 0118 0z"></path></svg>
                    </div>
                    <h3 className="text-2xl font-bold tracking-tight mb-2">Upload PDF</h3>
                    <p className="text-indigo-200/60 text-sm font-medium uppercase tracking-widest">Drag & Drop or Click</p>
                </div>
            ) : (
                <div className="flex-1 flex flex-col relative h-full">
                     {/* Grid */}
                     <div className="flex-1 overflow-y-auto p-4 custom-scrollbar">
                        <div className="grid grid-cols-3 sm:grid-cols-4 lg:grid-cols-4 gap-3 pb-20">
                            {visiblePageIndices.map(idx => (
                                <PageThumbnail 
                                    key={idx}
                                    pageIndex={idx}
                                    isSelected={settings.selectedPages.has(idx)}
                                    onClick={() => togglePage(idx)}
                                    pdf={pdfDocProxy}
                                    mode={settings.mode}
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
        </div>

        {/* RIGHT COLUMN: CONTROLS */}
        <div className="md:w-1/2 p-8 md:p-12 flex flex-col justify-center relative bg-[#0f172a] z-10">
            
            {!status.resultBlob ? (
                <div className={`space-y-8 animate-fade-in ${status.isProcessing ? 'opacity-50 pointer-events-none' : ''}`}>
                    
                    {/* Header */}
                    <div>
                        <div className="flex items-center gap-3 mb-2 text-indigo-400 font-bold text-xs tracking-[0.2em] uppercase">
                            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19 11H5m14 0a2 2 0 012 2v6a2 2 0 01-2 2H5a2 2 0 01-2-2v-6a2 2 0 012-2m14 0V9a2 2 0 00-2-2M5 11V9a2 2 0 012-2m0 0V5a2 2 0 012-2h6a2 2 0 012 2v2M7 7h10"></path></svg>
                            Page Extractor
                        </div>
                        <h2 className="text-5xl md:text-6xl font-black text-white leading-[0.9] tracking-tighter">
                            SPLIT <br/> PDF
                        </h2>
                    </div>

                    {file && (
                        <>
                            {/* Stats */}
                            <div className="grid grid-cols-2 gap-8 border-y border-white/10 py-6">
                                <div>
                                    <p className="text-[10px] font-bold uppercase text-slate-500 mb-1 tracking-wider">Total Pages</p>
                                    <p className="text-2xl font-mono font-bold text-white">{numPages}</p>
                                </div>
                                <div>
                                    <p className="text-[10px] font-bold uppercase text-slate-500 mb-1 tracking-wider">Result Pages</p>
                                    <p className={`text-2xl font-mono font-bold ${isExtract ? 'text-green-400' : 'text-red-400'}`}>{pagesResultCount}</p>
                                </div>
                            </div>

                            {/* Controls */}
                            <div className="space-y-6">
                                {/* Mode Toggle */}
                                <div className="bg-black/20 p-1 rounded-xl flex gap-1 border border-white/5">
                                    <button 
                                        onClick={() => setSettings(s => ({...s, mode: 'extract'}))}
                                        className={`flex-1 py-3 rounded-lg text-xs font-bold uppercase tracking-wider transition-all flex items-center justify-center gap-2 ${isExtract ? 'bg-green-600 text-white shadow-lg' : 'text-slate-500 hover:text-white hover:bg-white/5'}`}
                                    >
                                        Extract Selected
                                    </button>
                                    <button 
                                        onClick={() => setSettings(s => ({...s, mode: 'remove'}))}
                                        className={`flex-1 py-3 rounded-lg text-xs font-bold uppercase tracking-wider transition-all flex items-center justify-center gap-2 ${!isExtract ? 'bg-red-600 text-white shadow-lg' : 'text-slate-500 hover:text-white hover:bg-white/5'}`}
                                    >
                                        Delete Selected
                                    </button>
                                </div>

                                {/* Range Input */}
                                <div>
                                    <div className="flex justify-between items-center mb-2">
                                        <label className="text-[10px] font-bold uppercase text-slate-400 tracking-wider">Page Range</label>
                                        <div className="flex gap-2">
                                            <button onClick={selectAll} className="text-[10px] font-bold text-indigo-400 hover:text-indigo-300">Select All</button>
                                            <span className="text-slate-600">/</span>
                                            <button onClick={selectNone} className="text-[10px] font-bold text-slate-500 hover:text-slate-300">Clear</button>
                                        </div>
                                    </div>
                                    <textarea 
                                        value={rangeInput}
                                        onChange={handleRangeInputChange}
                                        onBlur={applyRangeInput}
                                        placeholder="e.g. 1-5, 8, 10"
                                        className="w-full bg-white/5 border border-white/10 rounded-xl p-4 text-white font-mono text-sm focus:outline-none focus:border-indigo-500 transition-colors resize-none h-24"
                                    />
                                    <p className="text-[10px] text-slate-500 mt-2">Enter page numbers separated by commas or ranges (e.g. 1-5).</p>
                                </div>
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
                                    disabled={pagesResultCount === 0 || pagesResultCount === numPages}
                                    className={`w-full py-4 rounded-xl font-bold uppercase tracking-widest text-xs transition-all shadow-lg flex items-center justify-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed
                                        ${isExtract ? 'bg-white text-[#0f172a] hover:bg-green-400 hover:text-white' : 'bg-white text-[#0f172a] hover:bg-red-500 hover:text-white'}
                                    `}
                                >
                                    <span>{isExtract ? 'Extract Pages' : 'Delete Pages'}</span>
                                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M17 8l4 4m0 0l-4 4m4-4H3"></path></svg>
                                </button>
                            )}
                        </>
                    )}
                </div>
            ) : (
                /* RESULTS VIEW */
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

                    <div className="flex-1 bg-black/20 rounded-xl p-6 border border-white/5 flex flex-col justify-center items-center text-center">
                        <div className="w-20 h-20 bg-green-500/10 rounded-full flex items-center justify-center mb-4 border border-green-500/20">
                            <svg className="w-10 h-10 text-green-400" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z"></path></svg>
                        </div>
                        <h3 className="text-xl font-bold text-white mb-1">{isExtract ? 'Extraction Complete' : 'Pages Deleted'}</h3>
                        <p className="text-slate-400 text-xs">Your new document has been created successfully.</p>
                    </div>

                    <div className="grid grid-cols-2 gap-8 border-y border-white/10 py-4 shrink-0">
                         <div>
                            <p className="text-[10px] font-bold uppercase text-slate-500 mb-1 tracking-wider">Original</p>
                            <p className="text-xl font-mono text-slate-400">{numPages} pgs</p>
                        </div>
                        <div>
                            <p className="text-[10px] font-bold uppercase text-slate-500 mb-1 tracking-wider">New File</p>
                            <p className="text-xl font-mono font-bold text-white">{pagesResultCount} pgs</p>
                        </div>
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
                            onClick={resetState}
                            className="px-6 py-4 bg-transparent border border-slate-700 text-white rounded-xl font-bold uppercase tracking-widest text-xs hover:border-white transition-colors"
                        >
                            Reset
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

export default SplitTool;