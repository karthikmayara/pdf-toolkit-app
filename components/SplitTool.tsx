
import React, { useState, useRef, useEffect, useMemo } from 'react';
import { ProcessStatus, SplitSettings } from '../types';
import { splitPDF, parsePageRange, rangeSetToString } from '../services/pdfSplit';

// Constants
const ITEMS_PER_PAGE = 48; // Grid pagination size

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
  const [thumbnailCache, setThumbnailCache] = useState<Record<number, string>>({});

  const fileInputRef = useRef<HTMLInputElement>(null);

  // Clean up thumbnails on unmount
  useEffect(() => {
    return () => {
        Object.values(thumbnailCache).forEach(url => URL.revokeObjectURL(url));
    };
  }, []);

  // CRITICAL UX FIX: Clear selection when switching modes to prevent confusion
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
           setThumbnailCache({});
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

  // Soft reset (Keep file, reset selection)
  const restartSameFile = () => {
      setSettings(prev => ({ ...prev, selectedPages: new Set() }));
      setStatus({ isProcessing: false, currentStep: '', progress: 0 });
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

    setStatus({ isProcessing: true, currentStep: 'Initializing...', progress: 0 });

    try {
        const blob = await splitPDF(file, pagesToKeep, (p, s) => setStatus(prev => ({...prev, progress: p, currentStep: s})));
        
        setStatus({
            isProcessing: false,
            currentStep: 'Done',
            progress: 100,
            resultBlob: blob,
            resultFileName: settings.mode === 'extract' ? `extracted_${file.name}` : `split_${file.name}`
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
  const themeColor = isExtract ? 'green' : 'red';
  const themeBg = isExtract ? 'bg-green-500' : 'bg-red-500';
  const themeText = isExtract ? 'text-green-600' : 'text-red-600';
  const themeBorder = isExtract ? 'border-green-200' : 'border-red-200';

  return (
    <div className="max-w-7xl mx-auto animate-fade-in pb-12 sm:pb-20">
      <div className="bg-white dark:bg-slate-800 rounded-2xl shadow-xl overflow-hidden border border-slate-100 dark:border-slate-700 flex flex-col h-[calc(100vh-140px)] min-h-[500px] transition-colors duration-300">
        
        {/* Header */}
        <div className={`p-4 md:p-6 text-white shrink-0 flex justify-between items-center transition-colors duration-300 ${isExtract ? 'bg-gradient-to-r from-emerald-500 to-green-600' : 'bg-gradient-to-r from-red-500 to-rose-600'}`}>
          <div>
            <h2 className="text-xl md:text-2xl font-bold">Split PDF</h2>
            <p className="opacity-90 text-xs md:text-sm">
                {isExtract ? 'Select pages to KEEP.' : 'Select pages to DELETE.'}
            </p>
          </div>
          {file && (
             <button onClick={resetState} className="text-[10px] md:text-xs bg-white/20 hover:bg-white/30 px-2 py-1 md:px-3 rounded text-white font-bold">Change File</button>
          )}
        </div>

        {!file ? (
            <div className="flex-1 flex items-center justify-center p-8">
                <div 
                  onClick={() => fileInputRef.current?.click()}
                  className="border-4 border-dashed border-slate-300 dark:border-slate-600 hover:border-green-400 dark:hover:border-green-500 rounded-2xl p-10 md:p-16 text-center cursor-pointer transition-all bg-slate-50 dark:bg-slate-700/30 group max-w-xl w-full"
                >
                   <div className="text-5xl md:text-6xl mb-6 group-hover:scale-110 transition-transform">✂️</div>
                   <h3 className="text-xl md:text-2xl font-bold text-slate-700 dark:text-slate-200 mb-2">Select PDF to Split</h3>
                   <p className="text-sm md:text-base text-slate-500 dark:text-slate-400">Handle large files easily</p>
                </div>
            </div>
        ) : (
            <div className="flex-1 flex flex-col md:flex-row overflow-hidden">
                
                {/* LEFT: Controls Sidebar - COMPACT MODE */}
                <div className="w-full md:w-72 bg-slate-50 dark:bg-slate-900 border-b md:border-b-0 md:border-r border-slate-200 dark:border-slate-700 p-3 md:p-5 flex flex-col gap-3 md:gap-4 shrink-0 overflow-y-auto z-10 transition-all">
                    
                    {/* Mode Switcher */}
                    <div className="grid grid-cols-2 gap-2">
                        <button 
                            onClick={() => setSettings(s => ({...s, mode: 'extract'}))}
                            className={`py-2 px-1 text-xs font-bold rounded-lg border-2 transition-all flex items-center justify-center gap-1 ${settings.mode === 'extract' ? 'bg-green-50 border-green-500 text-green-700 dark:bg-green-900/30 dark:border-green-500 dark:text-green-300 shadow-sm' : 'bg-white border-transparent text-slate-400 hover:border-slate-300 dark:bg-slate-800'}`}
                        >
                            <span className="text-base">📥</span>
                            Extract
                        </button>
                        <button 
                            onClick={() => setSettings(s => ({...s, mode: 'remove'}))}
                            className={`py-2 px-1 text-xs font-bold rounded-lg border-2 transition-all flex items-center justify-center gap-1 ${settings.mode === 'remove' ? 'bg-red-50 border-red-500 text-red-700 dark:bg-red-900/30 dark:border-red-500 dark:text-red-300 shadow-sm' : 'bg-white border-transparent text-slate-400 hover:border-slate-300 dark:bg-slate-800'}`}
                        >
                            <span className="text-base">🗑️</span>
                            Delete
                        </button>
                    </div>

                    <div className="space-y-1 flex-1 md:flex-none">
                        <div className="flex justify-between items-center">
                            <label className="text-[10px] md:text-xs font-bold uppercase text-slate-500 dark:text-slate-400">Selection Range</label>
                            <div className="flex gap-1">
                                <button onClick={selectAll} className="px-2 py-1 bg-slate-200 dark:bg-slate-700 text-slate-700 dark:text-slate-300 text-[10px] font-bold rounded hover:bg-slate-300 dark:hover:bg-slate-600">All</button>
                                <button onClick={selectNone} className="px-2 py-1 bg-slate-200 dark:bg-slate-700 text-slate-700 dark:text-slate-300 text-[10px] font-bold rounded hover:bg-slate-300 dark:hover:bg-slate-600">None</button>
                            </div>
                        </div>
                        <textarea 
                            value={rangeInput}
                            onChange={handleRangeInputChange}
                            onBlur={applyRangeInput}
                            placeholder="e.g. 1-5, 8"
                            className={`w-full p-2 h-14 md:h-24 rounded-lg border bg-white dark:bg-slate-800 text-slate-800 dark:text-slate-200 text-xs font-mono focus:ring-1 outline-none resize-none transition-colors ${isExtract ? 'focus:ring-green-500 border-green-100 dark:border-green-900' : 'focus:ring-red-500 border-red-100 dark:border-red-900'}`}
                        />
                    </div>

                    {/* Summary Card - Compact Line */}
                    <div className={`px-3 py-2 rounded-lg border flex justify-between items-center ${themeBorder} ${isExtract ? 'bg-green-50 dark:bg-green-900/10' : 'bg-red-50 dark:bg-red-900/10'}`}>
                        <span className="text-[10px] font-bold uppercase text-slate-500 dark:text-slate-400">Result</span>
                        <span className={`font-mono text-sm font-bold ${themeText}`}>{pagesResultCount} / {numPages} pgs</span>
                    </div>

                    <div className="pt-1 mt-auto md:mt-0">
                        {status.resultBlob ? (
                            <div className="space-y-2 animate-fade-in-up">
                                <button onClick={handleDownload} className="w-full py-3 bg-slate-800 hover:bg-slate-900 text-white font-bold rounded-lg shadow-lg flex items-center justify-center gap-2 transition-transform active:scale-95 text-sm">
                                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4"></path></svg>
                                    Download
                                </button>
                                <button onClick={restartSameFile} className="w-full py-2 bg-white border border-slate-300 text-slate-600 hover:bg-slate-50 rounded-lg font-bold text-xs">
                                    Restart (Clear)
                                </button>
                            </div>
                        ) : (
                            <button 
                                onClick={handleStart}
                                disabled={status.isProcessing || pagesResultCount === 0 || pagesResultCount === numPages}
                                className={`w-full py-3 rounded-lg font-bold text-white shadow-md transition-all text-sm ${themeBg} hover:opacity-90 disabled:opacity-50 disabled:cursor-not-allowed active:scale-95`}
                            >
                                {status.isProcessing ? 'Processing...' : (isExtract ? 'Extract Pages' : 'Remove Pages')}
                            </button>
                        )}
                        {status.error && <p className="text-red-500 text-[10px] mt-1 font-bold text-center">{status.error}</p>}
                    </div>
                </div>

                {/* RIGHT: Grid View */}
                <div className="flex-1 flex flex-col bg-slate-100 dark:bg-slate-800/50 overflow-hidden relative">
                    {/* Pagination Controls */}
                    {totalGridPages > 1 && (
                        <div className="p-2 bg-white dark:bg-slate-800 border-b border-slate-200 dark:border-slate-700 flex justify-between items-center shadow-sm z-10 shrink-0">
                            <button 
                                onClick={() => setViewPage(p => Math.max(1, p - 1))}
                                disabled={viewPage === 1}
                                className="px-3 py-1 rounded bg-slate-100 dark:bg-slate-700 hover:bg-slate-200 dark:hover:bg-slate-600 disabled:opacity-50 font-bold text-xs text-slate-700 dark:text-slate-200"
                            >
                                Prev
                            </button>
                            <span className="text-xs font-bold text-slate-600 dark:text-slate-300">
                                {currentGridStartIndex + 1}-{currentGridEndIndex} of {numPages}
                            </span>
                            <button 
                                onClick={() => setViewPage(p => Math.min(totalGridPages, p + 1))}
                                disabled={viewPage === totalGridPages}
                                className="px-3 py-1 rounded bg-slate-100 dark:bg-slate-700 hover:bg-slate-200 dark:hover:bg-slate-600 disabled:opacity-50 font-bold text-xs text-slate-700 dark:text-slate-200"
                            >
                                Next
                            </button>
                        </div>
                    )}
                    
                    {/* Grid */}
                    <div className="flex-1 overflow-y-auto p-2 sm:p-4 custom-scrollbar">
                        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6 xl:grid-cols-8 gap-3 pb-10">
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
                    
                    {/* Empty State / Hint */}
                    {settings.selectedPages.size === 0 && (
                        <div className="absolute bottom-6 left-1/2 -translate-x-1/2 bg-slate-800/80 text-white px-4 py-2 rounded-full text-xs font-medium pointer-events-none backdrop-blur animate-fade-in-up whitespace-nowrap z-20">
                            Click pages to {isExtract ? 'keep' : 'delete'}
                        </div>
                    )}
                </div>
            </div>
        )}
      </div>

      <input ref={fileInputRef} type="file" accept=".pdf" onChange={(e) => {
          if(e.target.files && e.target.files[0]) setFile(e.target.files[0]);
          if(fileInputRef.current) fileInputRef.current.value = '';
      }} className="hidden" />
    </div>
  );
};

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
                const viewport = page.getViewport({ scale: 0.4 }); // Increased scale for better visibility
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
    
    let borderClass = 'border-slate-200 dark:border-slate-600 hover:border-slate-400';
    let opacityClass = 'opacity-100';
    let overlayIcon = null;

    if (isExtract) {
        if (isSelected) {
            borderClass = 'border-green-500 ring-2 ring-green-400 shadow-md transform scale-95';
            opacityClass = 'opacity-100';
            overlayIcon = (
                <div className="absolute inset-0 flex items-center justify-center bg-green-500/20">
                    <div className="bg-green-500 text-white rounded-full p-1 shadow">
                        <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="3" d="M5 13l4 4L19 7"></path></svg>
                    </div>
                </div>
            );
        } else {
            // Unselected in extract mode implies "Discard", so dim it
            opacityClass = 'opacity-40 grayscale';
        }
    } else {
        // Delete Mode
        if (isSelected) {
            borderClass = 'border-red-500 ring-2 ring-red-400 shadow-md transform scale-95 bg-red-50';
            opacityClass = 'opacity-60 grayscale'; // Dim the deleted ones slightly
            overlayIcon = (
                <div className="absolute inset-0 flex items-center justify-center bg-red-500/20">
                    <div className="bg-red-500 text-white rounded-full p-1 shadow">
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
                relative aspect-[3/4] rounded-lg cursor-pointer transition-all duration-200 border-2 overflow-hidden group bg-white
                ${borderClass} ${opacityClass}
            `}
        >
            <div className="w-full h-full flex items-center justify-center">
                 <canvas ref={canvasRef} className="max-w-full max-h-full block" />
            </div>
            
            {/* Number Badge */}
            <div className="absolute top-1 left-1 bg-black/60 text-white text-[10px] font-bold px-1.5 py-0.5 rounded backdrop-blur-sm z-10">
                {pageIndex + 1}
            </div>

            {/* Selection Overlay */}
            {overlayIcon}
            
            {/* Hover Indicator */}
            <div className="absolute inset-0 bg-black/0 group-hover:bg-black/5 transition-colors pointer-events-none"></div>
        </div>
    );
});

export default SplitTool;
