import React, { useState, useRef, useEffect, useMemo } from 'react';
import { ProcessStatus } from '../types';
import { mergePDFs, getPageCount } from '../services/pdfMerge';

// Helper for formatting bytes
const formatBytes = (bytes: number, decimals = 2) => {
  if (bytes === 0) return '0 Bytes';
  const k = 1024;
  const dm = decimals < 0 ? 0 : decimals;
  const sizes = ['B', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(dm)) + ' ' + sizes[i];
};

interface MergeItem {
  id: string;
  file: File;
  pageCount: number | null;
}

// --- MERGE ITEM THUMBNAIL COMPONENT ---
const MergeItemThumbnail = React.memo(({ item, index, isDragging, onDragStart, onDragEnter, onDragEnd, onRemove }: any) => {
    const canvasRef = useRef<HTMLCanvasElement>(null);
    const [thumbLoaded, setThumbLoaded] = useState(false);

    useEffect(() => {
        if (!item.file || thumbLoaded) return;
        if (!window.pdfjsLib) return;

        let active = true;
        const renderThumb = async () => {
            try {
                const pdfjs = window.pdfjsLib;
                const url = URL.createObjectURL(item.file);
                const loadingTask = pdfjs.getDocument(url);
                const pdf = await loadingTask.promise;
                const page = await pdf.getPage(1);
                
                if (!active) return;
                
                const viewport = page.getViewport({ scale: 0.3 }); 
                const canvas = canvasRef.current;
                if (!canvas) return;

                const ctx = canvas.getContext('2d');
                if (!ctx) return;

                canvas.width = viewport.width;
                canvas.height = viewport.height;

                await page.render({ canvasContext: ctx, viewport }).promise;
                if (active) setThumbLoaded(true);
                
                URL.revokeObjectURL(url);
            } catch (e) {
                console.warn("Thumbnail failed", e);
            }
        };
        renderThumb();
        return () => { active = false; };
    }, [item.file, thumbLoaded]);

    return (
        <div 
            draggable 
            onDragStart={onDragStart}
            onDragEnter={onDragEnter}
            onDragEnd={onDragEnd}
            onDragOver={(e) => e.preventDefault()}
            className={`
                relative group rounded-xl overflow-hidden cursor-move transition-all duration-300
                ${isDragging ? 'opacity-50 scale-95 ring-2 ring-indigo-500 z-10' : 'hover:-translate-y-1 hover:shadow-2xl'}
            `}
        >
            {/* Card Background */}
            <div className="bg-[#1e293b] h-full flex flex-col">
                
                {/* Visual Preview */}
                <div className="relative aspect-[3/4] bg-black/40 w-full overflow-hidden flex items-center justify-center">
                    <canvas ref={canvasRef} className={`max-w-full max-h-full object-contain transition-opacity duration-500 ${thumbLoaded ? 'opacity-100' : 'opacity-0'}`} />
                    
                    {!thumbLoaded && (
                        <div className="absolute inset-0 flex items-center justify-center">
                            <div className="w-5 h-5 border-2 border-indigo-500 border-t-transparent rounded-full animate-spin"></div>
                        </div>
                    )}

                    {/* Gradient Overlay */}
                    <div className="absolute inset-0 bg-gradient-to-t from-[#1e293b] via-transparent to-transparent opacity-60"></div>

                    {/* Page Count Badge */}
                    <div className="absolute bottom-2 right-2 bg-black/60 backdrop-blur-md text-white text-[9px] font-bold px-2 py-1 rounded-full border border-white/10">
                        {item.pageCount ? `${item.pageCount} PAGES` : '...'}
                    </div>
                </div>

                {/* Info Section */}
                <div className="p-3 flex items-start justify-between gap-2">
                    <div className="min-w-0">
                        <div className="text-[10px] text-indigo-400 font-bold mb-0.5 tracking-wider uppercase">Doc {String(index + 1).padStart(2, '0')}</div>
                        <h4 className="text-xs font-bold text-slate-200 truncate leading-tight" title={item.file.name}>{item.file.name}</h4>
                    </div>
                </div>
            </div>

            {/* Remove Button (Hover) */}
            <button 
                onClick={(e) => { e.stopPropagation(); onRemove(); }}
                className="absolute top-2 right-2 w-6 h-6 bg-red-500/90 hover:bg-red-500 text-white rounded-full flex items-center justify-center opacity-0 group-hover:opacity-100 transition-all duration-200 backdrop-blur-sm"
                title="Remove"
            >
                <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M6 18L18 6M6 6l12 12"></path></svg>
            </button>
        </div>
    );
});

// --- MAIN MERGE TOOL COMPONENT ---
const MergeTool: React.FC = () => {
  const [items, setItems] = useState<MergeItem[]>([]);
  const [status, setStatus] = useState<ProcessStatus>({ isProcessing: false, currentStep: '', progress: 0 });
  const [isDraggingFile, setIsDraggingFile] = useState(false); 
  const [draggedItemIndex, setDraggedItemIndex] = useState<number | null>(null); 
  
  const fileInputRef = useRef<HTMLInputElement>(null);
  const resultsRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (status.resultBlob && resultsRef.current) {
        setTimeout(() => {
            resultsRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
        }, 100);
    }
  }, [status.resultBlob]);

  const totalOriginalSize = useMemo(() => items.reduce((acc, i) => acc + i.file.size, 0), [items]);
  const totalPages = useMemo(() => items.reduce((acc, i) => acc + (i.pageCount || 0), 0), [items]);

  const resetState = () => {
    setItems([]);
    setStatus({ isProcessing: false, currentStep: '', progress: 0, resultBlob: undefined, error: undefined, mergeErrors: undefined });
  };

  const handleBack = () => {
      setStatus(prev => ({ ...prev, resultBlob: undefined, error: undefined, mergeErrors: undefined }));
  };

  const addFiles = async (newFiles: File[]) => {
    const pdfs = newFiles.filter(f => f.type === 'application/pdf');
    if (pdfs.length === 0) return;

    const newItems: MergeItem[] = pdfs.map(f => ({
      id: Math.random().toString(36).substr(2, 9),
      file: f,
      pageCount: null
    }));

    setItems(prev => [...prev, ...newItems]);

    for (const item of newItems) {
      const count = await getPageCount(item.file);
      setItems(prev => prev.map(i => i.id === item.id ? { ...i, pageCount: count } : i));
    }
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files.length > 0) {
      addFiles(Array.from(e.target.files));
    }
    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  const handleExternalDragOver = (e: React.DragEvent) => { e.preventDefault(); setIsDraggingFile(true); };
  const handleExternalDragLeave = (e: React.DragEvent) => { e.preventDefault(); setIsDraggingFile(false); };
  const handleExternalDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDraggingFile(false);
    if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
      addFiles(Array.from(e.dataTransfer.files));
    }
  };

  const onDragStart = (e: React.DragEvent, index: number) => {
    setDraggedItemIndex(index);
    e.dataTransfer.effectAllowed = "move";
  };

  const onDragEnter = (e: React.DragEvent, index: number) => {
    e.preventDefault();
    if (draggedItemIndex === null || draggedItemIndex === index) return;
    
    const newItems = [...items];
    const draggedItem = newItems[draggedItemIndex];
    newItems.splice(draggedItemIndex, 1);
    newItems.splice(index, 0, draggedItem);
    
    setDraggedItemIndex(index);
    setItems(newItems);
  };

  const onDragEnd = () => {
    setDraggedItemIndex(null);
  };

  const removeItem = (index: number) => {
    setItems(prev => prev.filter((_, i) => i !== index));
  };

  const handleStartMerge = async () => {
    if (items.length < 2) return;

    setStatus({ 
        isProcessing: true, 
        currentStep: 'Initializing...', 
        progress: 0,
        originalSize: totalOriginalSize,
        mergeErrors: undefined,
        error: undefined
    });

    try {
      const result = await mergePDFs(items.map(i => i.file), (progress, step) => {
        setStatus(prev => ({ ...prev, progress, currentStep: step }));
      });

      setStatus({
        isProcessing: false,
        currentStep: 'Completed!',
        progress: 100,
        resultBlob: result.blob,
        originalSize: totalOriginalSize,
        compressedSize: result.blob.size,
        mergeErrors: result.errors.length > 0 ? result.errors : undefined
      });
    } catch (error: any) {
      console.error(error);
      setStatus(prev => ({ 
        ...prev, 
        isProcessing: false, 
        error: error.message || 'Merge failed.' 
      }));
    }
  };

  const handleDownload = () => {
    if (!status.resultBlob) return;
    const url = URL.createObjectURL(status.resultBlob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `merged_${items.length}_files.pdf`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  return (
    <div className="max-w-7xl mx-auto animate-fade-in pb-12 px-4 sm:px-6">
      
      {/* Main Card Container */}
      <div className="bg-[#0f172a] text-white rounded-[2rem] shadow-2xl overflow-hidden min-h-[600px] flex flex-col md:flex-row relative">
        
        {/* Close Button */}
        {items.length > 0 && !status.isProcessing && (
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
                ${items.length === 0 ? 'bg-gradient-to-br from-indigo-900 to-[#0f172a] items-center justify-center' : 'bg-black/20'}
            `}
            onDragOver={handleExternalDragOver}
            onDragLeave={handleExternalDragLeave}
            onDrop={handleExternalDrop}
            onClick={() => items.length === 0 && fileInputRef.current?.click()}
        >
            {items.length === 0 ? (
                <div className={`text-center p-8 cursor-pointer transition-transform duration-300 ${isDraggingFile ? 'scale-105' : ''}`}>
                    <div className="w-32 h-32 bg-indigo-500/20 rounded-full flex items-center justify-center mx-auto mb-6 backdrop-blur-sm border border-indigo-500/30">
                        <svg className="w-12 h-12 text-indigo-400" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M9 13h6m-3-3v6m5 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"></path></svg>
                    </div>
                    <h3 className="text-2xl font-bold tracking-tight mb-2">Upload PDFs</h3>
                    <p className="text-indigo-200/60 text-sm font-medium uppercase tracking-widest">Drag & Drop or Click</p>
                </div>
            ) : (
                <div className="p-6 h-full overflow-y-auto custom-scrollbar">
                    <div className="grid grid-cols-2 lg:grid-cols-3 gap-4 pb-20">
                        {items.map((item, index) => (
                            <MergeItemThumbnail 
                                key={item.id}
                                item={item}
                                index={index}
                                isDragging={draggedItemIndex === index}
                                onDragStart={(e: React.DragEvent) => onDragStart(e, index)}
                                onDragEnter={(e: React.DragEvent) => onDragEnter(e, index)}
                                onDragEnd={onDragEnd}
                                onRemove={() => removeItem(index)}
                            />
                        ))}
                        {/* Add More Tile */}
                        {!status.resultBlob && !status.isProcessing && (
                            <div 
                                onClick={() => fileInputRef.current?.click()}
                                className="aspect-[3/4] border-2 border-dashed border-white/10 rounded-xl flex flex-col items-center justify-center cursor-pointer hover:border-indigo-500/50 hover:bg-white/5 transition-all group"
                            >
                                <span className="text-3xl text-white/30 group-hover:text-indigo-400 mb-2">+</span>
                                <span className="text-[10px] font-bold uppercase text-white/30 tracking-widest">Add</span>
                            </div>
                        )}
                    </div>
                </div>
            )}
            
            {/* Overlay hint when dragging over list */}
            {items.length > 0 && isDraggingFile && (
                <div className="absolute inset-0 bg-indigo-900/80 backdrop-blur-sm z-50 flex items-center justify-center">
                    <h3 className="text-2xl font-bold text-white animate-bounce">Drop to Add</h3>
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
                            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M8 7h12m0 0l-4-4m4 4l-4 4m0 6H4m0 0l4 4m-4-4l4-4"></path></svg>
                            Data Fusion
                        </div>
                        <h2 className="text-5xl md:text-6xl font-black text-white leading-[0.9] tracking-tighter">
                            MERGE <br/> PDFS
                        </h2>
                    </div>

                    {items.length > 0 && (
                        <>
                            {/* Stats */}
                            <div className="grid grid-cols-2 gap-8 border-y border-white/10 py-6">
                                <div>
                                    <p className="text-[10px] font-bold uppercase text-slate-500 mb-1 tracking-wider">Total Documents</p>
                                    <p className="text-2xl font-mono font-bold text-white">{items.length}</p>
                                </div>
                                <div>
                                    <p className="text-[10px] font-bold uppercase text-slate-500 mb-1 tracking-wider">Total Pages</p>
                                    <p className="text-2xl font-mono font-bold text-indigo-400">{totalPages || '...'}</p>
                                </div>
                            </div>

                            <p className="text-xs text-slate-400 leading-relaxed">
                                Combine multiple documents into a single, unified file. Drag and drop thumbnails on the left to reorder the sequence before merging.
                            </p>

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

                            {/* Actions */}
                            {!status.isProcessing && (
                                <div className="flex gap-4 pt-2">
                                    <button 
                                        onClick={handleStartMerge}
                                        disabled={items.length < 2}
                                        className="flex-1 py-4 bg-white text-[#0f172a] rounded-xl font-bold uppercase tracking-widest text-xs hover:bg-indigo-400 hover:text-white transition-all shadow-lg flex items-center justify-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed"
                                    >
                                        <span>Merge Data</span>
                                        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M13 10V3L4 14h7v7l9-11h-7z"></path></svg>
                                    </button>
                                </div>
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
                        <h3 className="text-xl font-bold text-white mb-1">Merge Complete</h3>
                        <p className="text-slate-400 text-xs">Your documents have been successfully unified.</p>
                        
                        {status.mergeErrors && status.mergeErrors.length > 0 && (
                            <div className="mt-4 p-3 bg-orange-500/10 border border-orange-500/20 rounded-lg text-left w-full">
                                <p className="text-[10px] font-bold text-orange-400 uppercase mb-1">Warnings</p>
                                <ul className="text-[10px] text-orange-300 list-disc list-inside">
                                    {status.mergeErrors.map((e, i) => <li key={i} className="truncate">{e}</li>)}
                                </ul>
                            </div>
                        )}
                    </div>

                    <div className="grid grid-cols-2 gap-8 border-y border-white/10 py-4 shrink-0">
                        <div>
                            <p className="text-[10px] font-bold uppercase text-slate-500 mb-1 tracking-wider">File Size</p>
                            <p className="text-xl font-mono font-bold text-white">{formatBytes(status.compressedSize || 0)}</p>
                        </div>
                        <div>
                            <p className="text-[10px] font-bold uppercase text-slate-500 mb-1 tracking-wider">Page Count</p>
                            <p className="text-xl font-mono font-bold text-white">{totalPages}</p>
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
                            onClick={handleBack}
                            className="px-6 py-4 bg-transparent border border-slate-700 text-white rounded-xl font-bold uppercase tracking-widest text-xs hover:border-white transition-colors"
                        >
                            Back
                        </button>
                        <button 
                            onClick={resetState}
                            className="px-6 py-4 bg-transparent border border-slate-700 text-white rounded-xl font-bold uppercase tracking-widest text-xs hover:border-red-500 hover:text-red-500 transition-colors"
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
        multiple
        onChange={handleFileChange} 
        className="hidden" 
      />
    </div>
  );
};

export default MergeTool;