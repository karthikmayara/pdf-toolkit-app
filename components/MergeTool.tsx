import React, { useState, useRef, useEffect, useMemo } from 'react';
import { ProcessStatus } from '../types';
import { mergePDFs, getPageCount } from '../services/pdfMerge';

// Helper for formatting bytes
const formatBytes = (bytes: number, decimals = 2) => {
  if (bytes === 0) return '0 Bytes';
  const k = 1024;
  const dm = decimals < 0 ? 0 : decimals;
  const sizes = ['Bytes', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(dm)) + ' ' + sizes[i];
};

interface MergeItem {
  id: string;
  file: File;
  pageCount: number | null;
}

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
    // Filter for PDFs only
    const pdfs = newFiles.filter(f => f.type === 'application/pdf');
    if (pdfs.length === 0) return;

    // Create temporary items immediately so UI updates
    const newItems: MergeItem[] = pdfs.map(f => ({
      id: Math.random().toString(36).substr(2, 9),
      file: f,
      pageCount: null // Loading state
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
    // Reset input so same file can be selected again
    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  // External Drag & Drop (Uploading files)
  const handleExternalDragOver = (e: React.DragEvent) => { e.preventDefault(); setIsDraggingFile(true); };
  const handleExternalDragLeave = (e: React.DragEvent) => { e.preventDefault(); setIsDraggingFile(false); };
  const handleExternalDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDraggingFile(false);
    if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
      addFiles(Array.from(e.dataTransfer.files));
    }
  };

  // Internal Drag & Drop (Reordering list)
  const onDragStart = (e: React.DragEvent, index: number) => {
    setDraggedItemIndex(index);
    e.dataTransfer.effectAllowed = "move";
  };

  const onDragEnter = (e: React.DragEvent, index: number) => {
    e.preventDefault();
    if (draggedItemIndex === null || draggedItemIndex === index) return;
    
    // Reorder array
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
    <div className="max-w-4xl mx-auto">
      <div className="bg-white dark:bg-slate-800 rounded-2xl shadow-xl overflow-hidden border border-slate-100 dark:border-slate-700 transition-colors duration-300">
        
        {/* Header */}
        <div className="bg-gradient-to-r from-purple-600 to-indigo-600 p-8 text-white text-center">
          <h2 className="text-3xl font-bold mb-2">Merge PDFs</h2>
          <p className="opacity-90">Combine multiple PDF documents into one.</p>
        </div>

        <div className="p-4 sm:p-8">
          
          {/* Upload Area (Visible if empty) */}
          {items.length === 0 && (
            <div 
              onClick={() => fileInputRef.current?.click()}
              onDragOver={handleExternalDragOver}
              onDragLeave={handleExternalDragLeave}
              onDrop={handleExternalDrop}
              className={`
                border-4 border-dashed rounded-xl p-12 text-center cursor-pointer transition-all duration-200 group
                ${isDraggingFile 
                  ? 'border-purple-500 bg-purple-50 dark:bg-slate-700 scale-102' 
                  : 'border-slate-200 dark:border-slate-600 hover:border-purple-400 dark:hover:border-purple-500 hover:bg-slate-50 dark:hover:bg-slate-700/50'}
              `}
            >
              <div className="text-6xl mb-4 group-hover:scale-110 transition-transform duration-300">📑</div>
              <h3 className="text-xl font-bold text-slate-700 dark:text-slate-200 mb-2">
                {isDraggingFile ? 'Drop PDFs here!' : 'Select PDF Files'}
              </h3>
              <p className="text-slate-500 dark:text-slate-400">Drag & Drop multiple files to start</p>
            </div>
          )}

          {/* Main Interface */}
          {items.length > 0 && !status.resultBlob && (
            <div className={`space-y-6 animate-fade-in ${status.isProcessing ? 'pointer-events-none opacity-60' : ''}`}>
              
              {/* Toolbar */}
              <div className="flex flex-col sm:flex-row justify-between items-center gap-4 bg-slate-50 dark:bg-slate-700/30 p-4 rounded-lg border border-slate-200 dark:border-slate-700">
                <div className="text-center sm:text-left">
                  <h3 className="font-bold text-slate-700 dark:text-slate-200">{items.length} Documents Selected</h3>
                  <p className="text-sm text-slate-500 dark:text-slate-400">
                    Total Pages: <span className="font-mono font-bold text-purple-600 dark:text-purple-400">{totalPages > 0 ? totalPages : '...'}</span>
                  </p>
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
                    className="px-4 py-2 bg-white dark:bg-slate-700 border border-slate-200 dark:border-slate-600 hover:bg-slate-50 dark:hover:bg-slate-600 text-slate-700 dark:text-slate-200 rounded-lg text-sm font-bold transition-colors flex items-center gap-2"
                  >
                    <span>+</span> Add More
                  </button>
                </div>
              </div>

              {/* Draggable List */}
              <div 
                className="space-y-2"
                onDragOver={handleExternalDragOver}
                onDrop={handleExternalDrop} // Allow dropping more files onto the list
              >
                {items.map((item, index) => (
                  <div 
                    key={item.id}
                    draggable={!status.isProcessing}
                    onDragStart={(e) => onDragStart(e, index)}
                    onDragEnter={(e) => onDragEnter(e, index)}
                    onDragEnd={onDragEnd}
                    onDragOver={(e) => e.preventDefault()} // Necessary to allow dropping
                    className={`
                      relative flex items-center gap-4 p-4 bg-white dark:bg-slate-800 border rounded-xl shadow-sm transition-all
                      ${draggedItemIndex === index 
                        ? 'opacity-50 border-purple-500 scale-95 shadow-lg z-10' 
                        : 'border-slate-200 dark:border-slate-600 hover:border-purple-300 dark:hover:border-purple-500'}
                    `}
                  >
                    {/* Drag Handle */}
                    <div className="cursor-grab active:cursor-grabbing text-slate-400 hover:text-purple-500">
                      <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M4 8h16M4 16h16"></path></svg>
                    </div>

                    {/* File Icon */}
                    <div className="text-3xl">📄</div>

                    {/* Info */}
                    <div className="flex-1 min-w-0">
                      <h4 className="font-bold text-slate-700 dark:text-slate-200 truncate">{item.file.name}</h4>
                      <div className="flex gap-3 text-xs text-slate-500 dark:text-slate-400">
                         <span>{formatBytes(item.file.size)}</span>
                         <span>•</span>
                         <span className={`${item.pageCount === null ? 'animate-pulse' : ''}`}>
                           {item.pageCount !== null ? `${item.pageCount} pages` : 'Counting...'}
                         </span>
                      </div>
                    </div>

                    {/* Remove Button */}
                    <button 
                      onClick={() => removeItem(index)}
                      className="p-2 text-slate-400 hover:text-red-500 hover:bg-red-50 dark:hover:bg-red-900/20 rounded-full transition-colors"
                      title="Remove file"
                    >
                       <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M6 18L18 6M6 6l12 12"></path></svg>
                    </button>

                    {/* Index Badge */}
                    <div className="absolute -top-2 -left-2 w-6 h-6 bg-slate-200 dark:bg-slate-600 text-slate-600 dark:text-slate-200 rounded-full flex items-center justify-center text-xs font-bold border border-white dark:border-slate-800">
                      {index + 1}
                    </div>
                  </div>
                ))}
              </div>

              {/* Error Display */}
              {status.error && (
                <div className="bg-red-50 dark:bg-red-900/30 text-red-700 dark:text-red-300 p-4 rounded-lg border border-red-200 dark:border-red-800 text-sm font-medium animate-fade-in">
                  Error: {status.error}
                </div>
              )}

              {/* Progress Bar */}
              {status.isProcessing && (
                <div className="space-y-2">
                  <div className="flex justify-between text-xs font-bold uppercase text-slate-500 dark:text-slate-400 tracking-wider">
                    <span className="animate-pulse">{status.currentStep}</span>
                    <span>{status.progress}%</span>
                  </div>
                  <div className="h-4 bg-slate-100 dark:bg-slate-700 rounded-full overflow-hidden">
                    <div 
                      className="h-full bg-purple-600 transition-all duration-300 ease-out" 
                      style={{ width: `${status.progress}%` }}
                    ></div>
                  </div>
                </div>
              )}

              {/* Main Action */}
              <button
                onClick={handleStartMerge}
                disabled={status.isProcessing || items.length < 2}
                className="w-full py-4 bg-purple-600 hover:bg-purple-700 text-white rounded-xl font-bold text-lg shadow-lg shadow-purple-200 dark:shadow-none transition-all active:scale-[0.99] disabled:bg-slate-300 dark:disabled:bg-slate-700 disabled:cursor-not-allowed"
              >
                {status.isProcessing ? 'Merging...' : items.length < 2 ? 'Add at least 2 files' : 'Merge PDFs'}
              </button>
            </div>
          )}

          {/* Success Result */}
          {status.resultBlob && (
             <div ref={resultsRef} className="text-center animate-fade-in-up">
                <div className="inline-flex items-center justify-center w-20 h-20 bg-green-100 dark:bg-green-900/30 text-green-600 dark:text-green-400 rounded-full mb-6">
                  <svg className="w-10 h-10" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M5 13l4 4L19 7"></path></svg>
                </div>
                <h3 className="text-2xl font-bold text-slate-800 dark:text-white mb-2">Merge Successful!</h3>
                <p className="text-slate-500 dark:text-slate-400 mb-6">Your documents have been combined.</p>
                
                {/* Warning for skipped files */}
                {status.mergeErrors && status.mergeErrors.length > 0 && (
                  <div className="mb-6 p-4 bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-700 rounded-lg text-left max-w-lg mx-auto">
                    <div className="flex items-start gap-3">
                      <span className="text-xl">⚠️</span>
                      <div className="flex-1">
                        <p className="font-bold text-amber-800 dark:text-amber-300 text-sm mb-1">Some files could not be merged:</p>
                        <ul className="list-disc list-inside text-xs text-amber-700 dark:text-amber-400 space-y-1">
                          {status.mergeErrors.map((err, i) => (
                            <li key={i}>{err}</li>
                          ))}
                        </ul>
                      </div>
                    </div>
                  </div>
                )}

                <div className="flex justify-center items-center gap-8 mb-8 animate-fade-in">
                  <div className="text-center">
                    <p className="text-xs text-slate-500 dark:text-slate-400 uppercase font-bold tracking-wide">Final Size</p>
                    <p className="text-xl font-mono text-purple-600 dark:text-purple-400 font-bold">{formatBytes(status.compressedSize || status.resultBlob.size)}</p>
                  </div>
                  <div className="text-center">
                    <p className="text-xs text-slate-500 dark:text-slate-400 uppercase font-bold tracking-wide">Total Pages</p>
                    <p className="text-xl font-mono text-slate-700 dark:text-slate-300 font-bold">{totalPages}</p>
                  </div>
                </div>

                <div className="flex flex-col sm:flex-row gap-4 justify-center">
                  <button 
                    onClick={handleDownload}
                    className="px-8 py-4 bg-purple-600 hover:bg-purple-700 text-white rounded-xl font-bold shadow-lg shadow-purple-200 dark:shadow-none transition-all hover:scale-105 active:scale-95 flex items-center justify-center gap-2"
                  >
                    <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4"></path></svg>
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
                    Merge New
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