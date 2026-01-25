
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

// --- MERGE ITEM THUMBNAIL COMPONENT (Defined before use) ---
const MergeItemThumbnail = React.memo(({ item, index, isDragging, onDragStart, onDragEnter, onDragEnd, onRemove }: any) => {
    const canvasRef = useRef<HTMLCanvasElement>(null);
    const [thumbLoaded, setThumbLoaded] = useState(false);

    useEffect(() => {
        if (!item.file || thumbLoaded) return;
        
        // Safety check for library
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
                
                const viewport = page.getViewport({ scale: 0.3 }); // Small thumbnail
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
                relative bg-white dark:bg-slate-800 rounded-xl border-2 transition-all cursor-move group
                ${isDragging ? 'opacity-50 border-purple-500 scale-95 z-10' : 'border-slate-100 dark:border-slate-700 hover:border-purple-300 dark:hover:border-purple-500 hover:shadow-lg'}
            `}
        >
            <div className="p-3">
                {/* Thumbnail Container */}
                <div className="aspect-[3/4] bg-slate-100 dark:bg-slate-900 rounded-lg overflow-hidden flex items-center justify-center mb-3 relative">
                    <canvas ref={canvasRef} className={`max-w-full max-h-full shadow-sm transition-opacity duration-300 ${thumbLoaded ? 'opacity-100' : 'opacity-0'}`} />
                    
                    {!thumbLoaded && (
                        <div className="absolute inset-0 flex items-center justify-center">
                            <div className="animate-spin w-6 h-6 border-2 border-purple-500 border-t-transparent rounded-full"></div>
                        </div>
                    )}

                    {/* Page Count Badge */}
                    <div className="absolute bottom-1 right-1 bg-black/60 backdrop-blur-sm text-white text-[9px] px-1.5 py-0.5 rounded font-bold">
                        {item.pageCount ? `${item.pageCount} pgs` : '...'}
                    </div>
                </div>

                {/* Info */}
                <div className="text-left">
                    <h4 className="text-xs font-bold text-slate-700 dark:text-slate-200 truncate leading-tight" title={item.file.name}>{item.file.name}</h4>
                    <p className="text-[10px] text-slate-400 mt-0.5">{formatBytes(item.file.size)}</p>
                </div>
            </div>

            {/* Remove Button */}
            <button 
                onClick={(e) => { e.stopPropagation(); onRemove(); }}
                className="absolute -top-2 -right-2 bg-red-500 hover:bg-red-600 text-white rounded-full p-1 shadow-md opacity-0 group-hover:opacity-100 transition-all scale-75 group-hover:scale-100 z-20"
                title="Remove"
            >
                <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M6 18L18 6M6 6l12 12"></path></svg>
            </button>

            {/* Order Badge */}
            <div className="absolute -top-2 -left-2 w-6 h-6 bg-purple-600 text-white rounded-full flex items-center justify-center text-xs font-bold shadow-sm border-2 border-white dark:border-slate-800 z-10">
                {index + 1}
            </div>
        </div>
    );
});

// --- MAIN MERGE TOOL COMPONENT ---
const MergeTool: React.FC = () => {
  const [items, setItems] = useState<MergeItem[]>([]);
  const [status, setStatus] = useState<ProcessStatus>({ isProcessing: false, currentStep: '', progress: 0 });
  const [isDraggingFile, setIsDraggingFile] = useState(false); // For external file drop
  const [draggedItemIndex, setDraggedItemIndex] = useState<number | null>(null); // For reordering
  
  const fileInputRef = useRef<HTMLInputElement>(null);
  const resultsRef = useRef<HTMLDivElement>(null);

  // Auto-scroll to results when done
  useEffect(() => {
    if (status.resultBlob && resultsRef.current) {
        resultsRef.current.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }
  }, [status.resultBlob]);

  // Computed totals
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

    // Async fetch page counts
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

  // External Drag & Drop
  const handleExternalDragOver = (e: React.DragEvent) => { e.preventDefault(); setIsDraggingFile(true); };
  const handleExternalDragLeave = (e: React.DragEvent) => { e.preventDefault(); setIsDraggingFile(false); };
  const handleExternalDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDraggingFile(false);
    if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
      addFiles(Array.from(e.dataTransfer.files));
    }
  };

  // Internal Drag & Drop (Reordering)
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
        currentStep: 'Starting...', 
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
    <div className="max-w-6xl mx-auto animate-fade-in pb-24">
      <div className="bg-white dark:bg-slate-800 rounded-2xl shadow-xl overflow-hidden border border-slate-100 dark:border-slate-700 transition-colors duration-300">
        
        {/* Header */}
        <div className="bg-gradient-to-r from-purple-600 to-blue-600 p-8 text-white text-center">
          <h2 className="text-3xl font-bold mb-2">Merge PDFs</h2>
          <p className="opacity-90">Combine multiple documents into a single PDF.</p>
        </div>

        <div className="p-4 sm:p-8">
          
          {items.length === 0 && (
            <div 
              onClick={() => fileInputRef.current?.click()}
              onDragOver={handleExternalDragOver}
              onDragLeave={handleExternalDragLeave}
              onDrop={handleExternalDrop}
              className={`
                border-4 border-dashed rounded-2xl p-16 text-center cursor-pointer transition-all duration-200 group
                ${isDraggingFile 
                  ? 'border-purple-500 bg-purple-50 dark:bg-slate-700 scale-102' 
                  : 'border-slate-200 dark:border-slate-600 hover:border-purple-400 dark:hover:border-purple-500 hover:bg-slate-50 dark:hover:bg-slate-700/50'}
              `}
            >
              <div className="text-6xl mb-6 group-hover:scale-110 transition-transform duration-300">📑</div>
              <h3 className="text-2xl font-bold text-slate-700 dark:text-slate-200 mb-2">
                {isDraggingFile ? 'Drop PDFs here!' : 'Add PDF Files'}
              </h3>
              <p className="text-slate-500 dark:text-slate-400">Drag & Drop multiple files to rearrange</p>
            </div>
          )}

          {items.length > 0 && !status.resultBlob && (
            <div className={`space-y-6 animate-fade-in ${status.isProcessing ? 'pointer-events-none opacity-60' : ''}`}>
              
              {/* Toolbar */}
              <div className="flex flex-col sm:flex-row justify-between items-center gap-4 bg-slate-50 dark:bg-slate-700/30 p-4 rounded-xl border border-slate-200 dark:border-slate-700">
                <div className="text-center sm:text-left">
                  <h3 className="font-bold text-slate-700 dark:text-slate-200">{items.length} Documents</h3>
                  <div className="flex gap-3 text-xs text-slate-500 dark:text-slate-400 mt-1">
                     <span>Total: <strong className="text-slate-700 dark:text-slate-300">{totalPages || '...'} Pages</strong></span>
                     <span>•</span>
                     <span>Size: <strong className="text-slate-700 dark:text-slate-300">{formatBytes(totalOriginalSize)}</strong></span>
                  </div>
                </div>
                <div className="flex gap-2">
                  <button 
                    onClick={resetState}
                    className="px-4 py-2 text-red-500 hover:bg-red-50 dark:hover:bg-red-900/20 rounded-lg text-sm font-bold transition-colors"
                  >
                    Clear All
                  </button>
                  <button 
                    onClick={() => fileInputRef.current?.click()}
                    className="px-5 py-2.5 bg-white dark:bg-slate-700 border border-slate-200 dark:border-slate-600 hover:bg-slate-50 dark:hover:bg-slate-600 text-slate-700 dark:text-slate-200 rounded-lg text-sm font-bold transition-colors shadow-sm"
                  >
                    + Add More
                  </button>
                </div>
              </div>

              {/* Grid Layout */}
              <div 
                className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-4"
                onDragOver={handleExternalDragOver}
                onDrop={handleExternalDrop}
              >
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
                
                {/* Add Button Tile */}
                <div 
                    onClick={() => fileInputRef.current?.click()}
                    className="aspect-[3/4] border-2 border-dashed border-slate-200 dark:border-slate-700 rounded-xl flex flex-col items-center justify-center cursor-pointer hover:border-purple-400 hover:bg-slate-50 dark:hover:bg-slate-700/50 transition-colors"
                >
                    <span className="text-3xl text-slate-300 dark:text-slate-600 mb-2">+</span>
                    <span className="text-xs font-bold text-slate-400">Add PDF</span>
                </div>
              </div>

              {status.error && (
                <div className="bg-red-50 dark:bg-red-900/30 text-red-700 dark:text-red-300 p-4 rounded-xl border border-red-200 dark:border-red-800 text-sm font-medium animate-fade-in flex items-center gap-2">
                  <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"></path></svg>
                  {status.error}
                </div>
              )}

              {status.isProcessing && (
                <div className="space-y-2">
                  <div className="flex justify-between text-xs font-bold uppercase text-slate-500 dark:text-slate-400 tracking-wider">
                    <span className="flex items-center gap-2">
                       <div className="w-2 h-2 bg-purple-500 rounded-full animate-ping"></div>
                       {status.currentStep}
                    </span>
                    <span>{status.progress}%</span>
                  </div>
                  <div className="h-3 bg-slate-100 dark:bg-slate-700 rounded-full overflow-hidden">
                    <div className="h-full bg-purple-600 transition-all duration-300 ease-out" style={{ width: `${status.progress}%` }}></div>
                  </div>
                </div>
              )}

              <button
                onClick={handleStartMerge}
                disabled={status.isProcessing || items.length < 2}
                className="w-full py-4 bg-purple-600 hover:bg-purple-700 text-white rounded-xl font-bold text-lg shadow-lg shadow-purple-200 dark:shadow-none transition-all active:scale-[0.99] disabled:bg-slate-300 dark:disabled:bg-slate-700 disabled:cursor-not-allowed flex items-center justify-center gap-2"
              >
                {status.isProcessing ? 'Merging PDFs...' : `Merge ${items.length} Files Now`}
                {!status.isProcessing && <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M14 5l7 7m0 0l-7 7m7-7H3"></path></svg>}
              </button>
            </div>
          )}

          {/* Success View */}
          {status.resultBlob && (
             <div ref={resultsRef} className="text-center animate-fade-in-up py-4">
                <div className="inline-flex items-center justify-center w-24 h-24 bg-green-100 dark:bg-green-900/30 text-green-600 dark:text-green-400 rounded-full mb-6">
                  <svg className="w-12 h-12" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M5 13l4 4L19 7"></path></svg>
                </div>
                <h3 className="text-3xl font-bold text-slate-800 dark:text-white mb-2">Merge Complete!</h3>
                <p className="text-slate-500 dark:text-slate-400 mb-8 max-w-md mx-auto">Your documents have been successfully combined into a single PDF.</p>
                
                {status.mergeErrors && status.mergeErrors.length > 0 && (
                  <div className="mb-8 p-4 bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-700 rounded-xl text-left max-w-lg mx-auto">
                    <p className="font-bold text-amber-800 dark:text-amber-300 text-sm mb-2">Warnings:</p>
                    <ul className="list-disc list-inside text-xs text-amber-700 dark:text-amber-400 space-y-1">
                      {status.mergeErrors.map((err, i) => <li key={i}>{err}</li>)}
                    </ul>
                  </div>
                )}

                <div className="flex flex-col sm:flex-row gap-4 justify-center">
                  <button 
                    onClick={handleDownload}
                    className="px-8 py-4 bg-purple-600 hover:bg-purple-700 text-white rounded-xl font-bold shadow-lg shadow-purple-200 dark:shadow-none transition-all hover:scale-105 active:scale-95 flex items-center justify-center gap-2"
                  >
                    <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4"></path></svg>
                    Download Merged PDF
                  </button>
                  <button 
                    onClick={handleBack}
                    className="px-8 py-4 bg-slate-100 dark:bg-slate-700 text-slate-700 dark:text-slate-200 rounded-xl font-bold hover:bg-slate-200 dark:hover:bg-slate-600 transition-all"
                  >
                    Modify Order
                  </button>
                  <button 
                    onClick={resetState}
                    className="px-8 py-4 bg-white dark:bg-transparent border border-slate-200 dark:border-slate-600 text-slate-700 dark:text-slate-200 rounded-xl font-bold hover:bg-slate-50 dark:hover:bg-slate-700 transition-all"
                  >
                    Start New
                  </button>
                </div>
             </div>
          )}
        </div>
      </div>

      <input ref={fileInputRef} type="file" accept=".pdf" multiple onChange={handleFileChange} className="hidden" />
    </div>
  );
};

export default MergeTool;
