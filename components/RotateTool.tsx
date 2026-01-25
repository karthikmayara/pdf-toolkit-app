import React, { useState, useRef, useEffect, useMemo } from 'react';
import { ProcessStatus } from '../types';
import { rotateDocument } from '../services/rotateService';

// Constants
const ITEMS_PER_PAGE = 48; // Pagination for large PDFs

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
  const fileInputRef = useRef<HTMLInputElement>(null);
  const resultsRef = useRef<HTMLDivElement>(null);

  // Auto-scroll
  useEffect(() => {
    if (status.resultBlob && resultsRef.current) {
        resultsRef.current.scrollIntoView({ behavior: 'smooth' });
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

  return (
    <div className="max-w-7xl mx-auto animate-fade-in pb-24">
      <div className="bg-white dark:bg-slate-800 rounded-2xl shadow-xl overflow-hidden border border-slate-100 dark:border-slate-700 flex flex-col h-[calc(100vh-140px)] min-h-[500px] transition-colors duration-300 relative">
        
        {/* Header */}
        <div className="bg-gradient-to-r from-amber-500 to-orange-600 p-4 md:p-6 text-white shrink-0 flex justify-between items-center">
          <div>
            <h2 className="text-xl md:text-2xl font-bold">Rotate PDF</h2>
            <p className="opacity-90 text-xs md:text-sm">Tap pages to rotate or use global controls.</p>
          </div>
          {file && (
             <button onClick={resetState} className="text-[10px] md:text-xs bg-white/20 hover:bg-white/30 px-3 py-1 rounded-lg text-white font-bold transition-colors">
                 Change File
             </button>
          )}
        </div>

        {!file ? (
            <div className="flex-1 flex items-center justify-center p-8">
                <div 
                  onClick={() => fileInputRef.current?.click()}
                  className="border-4 border-dashed border-slate-300 dark:border-slate-600 hover:border-amber-400 dark:hover:border-amber-500 rounded-2xl p-10 md:p-16 text-center cursor-pointer transition-all bg-slate-50 dark:bg-slate-700/30 group max-w-xl w-full"
                >
                   <div className="text-5xl md:text-6xl mb-6 group-hover:scale-110 transition-transform">↻</div>
                   <h3 className="text-xl md:text-2xl font-bold text-slate-700 dark:text-slate-200 mb-2">Select File to Rotate</h3>
                   <p className="text-sm md:text-base text-slate-500 dark:text-slate-400">PDFs and Images supported</p>
                </div>
            </div>
        ) : !status.resultBlob ? (
            <>
                {/* Global Controls Bar (Top) */}
                <div className="bg-slate-50 dark:bg-slate-900 border-b border-slate-200 dark:border-slate-700 p-3 flex justify-between items-center shrink-0 gap-2">
                    <div className="flex gap-2">
                        <button onClick={() => rotateAll(-90)} className="px-3 py-2 bg-white dark:bg-slate-800 border border-slate-300 dark:border-slate-600 rounded-lg text-xs font-bold text-slate-700 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-700 flex items-center gap-1">
                            <span className="text-lg leading-none">↺</span> All Left
                        </button>
                        <button onClick={() => rotateAll(90)} className="px-3 py-2 bg-white dark:bg-slate-800 border border-slate-300 dark:border-slate-600 rounded-lg text-xs font-bold text-slate-700 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-700 flex items-center gap-1">
                            <span className="text-lg leading-none">↻</span> All Right
                        </button>
                    </div>
                    <button onClick={resetRotations} className="text-xs text-slate-500 hover:text-red-500 font-bold px-2">
                        Reset
                    </button>
                </div>

                {/* Grid View */}
                <div className="flex-1 overflow-y-auto p-4 custom-scrollbar bg-slate-100 dark:bg-slate-800/50">
                    <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-4 pb-20">
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

                {/* Pagination (if needed) */}
                {totalGridPages > 1 && (
                    <div className="absolute bottom-20 left-0 right-0 flex justify-center pointer-events-none">
                        <div className="bg-slate-800/90 text-white px-4 py-2 rounded-full shadow-lg pointer-events-auto flex items-center gap-4 text-xs font-bold backdrop-blur">
                            <button onClick={() => setViewPage(p => Math.max(1, p - 1))} disabled={viewPage === 1} className="disabled:opacity-50 hover:text-amber-400">Prev</button>
                            <span>{viewPage} / {totalGridPages}</span>
                            <button onClick={() => setViewPage(p => Math.min(totalGridPages, p + 1))} disabled={viewPage === totalGridPages} className="disabled:opacity-50 hover:text-amber-400">Next</button>
                        </div>
                    </div>
                )}

                {/* Sticky Action Bar (Bottom) */}
                <div className="absolute bottom-0 left-0 right-0 p-4 bg-white dark:bg-slate-900 border-t border-slate-200 dark:border-slate-700 z-20 flex justify-center">
                    <button 
                        onClick={handleStart}
                        disabled={status.isProcessing}
                        className="w-full max-w-md py-3 bg-amber-500 hover:bg-amber-600 text-white rounded-xl font-bold shadow-lg shadow-amber-200 dark:shadow-none transition-all active:scale-[0.98] disabled:bg-slate-400 disabled:cursor-not-allowed flex items-center justify-center gap-2"
                    >
                        {status.isProcessing ? 'Saving Changes...' : 'Save Rotated File'}
                    </button>
                </div>
            </>
        ) : (
            /* Result Dashboard */
            <div ref={resultsRef} className="flex-1 flex items-center justify-center p-8 animate-fade-in-up">
                <div className="text-center max-w-md w-full">
                    <div className="inline-flex items-center justify-center w-24 h-24 bg-green-100 dark:bg-green-900/30 text-green-600 dark:text-green-400 rounded-full mb-6 shadow-sm">
                        <svg className="w-12 h-12" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M5 13l4 4L19 7"></path></svg>
                    </div>
                    <h3 className="text-3xl font-bold text-slate-800 dark:text-white mb-2">Rotation Saved!</h3>
                    <p className="text-slate-500 dark:text-slate-400 mb-8">Your file has been updated successfully.</p>
                    
                    <div className="flex flex-col gap-3">
                        <button 
                            onClick={handleDownload}
                            className="w-full py-4 bg-amber-500 hover:bg-amber-600 text-white rounded-xl font-bold text-lg shadow-lg shadow-amber-200 dark:shadow-none transition-all hover:scale-[1.02] active:scale-[0.98] flex items-center justify-center gap-2"
                        >
                            <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4"></path></svg>
                            Download File
                        </button>
                        <button 
                            onClick={resetState}
                            className="w-full py-3 bg-white dark:bg-slate-800 text-slate-700 dark:text-slate-300 rounded-xl font-bold border border-slate-200 dark:border-slate-600 hover:bg-slate-50 dark:hover:bg-slate-700 transition-colors"
                        >
                            Start Over
                        </button>
                    </div>
                </div>
            </div>
        )}
      </div>
      
      <input ref={fileInputRef} type="file" accept=".pdf,image/*" onChange={handleFileChange} className="hidden" />
    </div>
  );
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
        <div className="flex flex-col gap-2">
            <div 
                onClick={() => onRotate(90)} // Tap rotates CW
                className="relative aspect-[3/4] bg-white dark:bg-slate-900 rounded-xl border border-slate-200 dark:border-slate-700 shadow-sm cursor-pointer hover:border-amber-400 dark:hover:border-amber-500 transition-colors group overflow-hidden flex items-center justify-center"
            >
                {/* The Rotating Wrapper */}
                <div 
                    className="transition-transform duration-300 ease-out origin-center"
                    style={{ transform: `rotate(${rotation}deg)` }}
                >
                    <canvas ref={canvasRef} className="max-w-full max-h-full block shadow-sm" />
                </div>

                {/* Overlay Controls (Desktop Hover) */}
                <div className="absolute inset-0 bg-black/0 group-hover:bg-black/10 transition-colors flex items-center justify-center opacity-0 group-hover:opacity-100">
                    <div className="bg-white/90 dark:bg-slate-800/90 rounded-full p-2 shadow-lg backdrop-blur">
                        <span className="text-xl">↻</span>
                    </div>
                </div>

                {/* Page Number */}
                <div className="absolute top-2 left-2 bg-black/60 text-white text-[10px] font-bold px-1.5 py-0.5 rounded backdrop-blur-sm z-10 pointer-events-none">
                    {pageIndex + 1}
                </div>
                
                {/* Rotation Badge (if changed) */}
                {rotation !== 0 && (
                    <div className="absolute top-2 right-2 bg-amber-500 text-white text-[10px] font-bold px-1.5 py-0.5 rounded shadow-sm z-10">
                        {rotation}°
                    </div>
                )}
            </div>
            
            {/* Mobile-Friendly Control Buttons below image */}
            <div className="flex justify-between gap-1">
                <button 
                    onClick={() => onRotate(-90)} 
                    className="flex-1 bg-white dark:bg-slate-700 border border-slate-200 dark:border-slate-600 rounded py-1 text-slate-600 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-600"
                    title="Rotate Left"
                >
                    ↺
                </button>
                <button 
                    onClick={() => onRotate(90)} 
                    className="flex-1 bg-white dark:bg-slate-700 border border-slate-200 dark:border-slate-600 rounded py-1 text-slate-600 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-600"
                    title="Rotate Right"
                >
                    ↻
                </button>
            </div>
        </div>
    );
});

export default RotateTool;
