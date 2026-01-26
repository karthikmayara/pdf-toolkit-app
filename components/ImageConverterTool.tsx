import React, { useState, useRef, useMemo, useEffect } from 'react';
import { ProcessStatus, SupportedFormat } from '../types';
import { convertFile, ConversionItem } from '../services/imageConversion';

// Helper for formatting bytes
const formatBytes = (bytes: number, decimals = 2) => {
  if (bytes === 0) return '0 Bytes';
  const k = 1024;
  const dm = decimals < 0 ? 0 : decimals;
  const sizes = ['B', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(dm)) + ' ' + sizes[i];
};

interface ToolSettings {
    quality: number;
    mergeToPdf: boolean;
}

interface ExtendedConversionItem {
    id: string;
    file: File;
    targetFormat: SupportedFormat;
    previewUrl?: string;
    status: 'idle' | 'processing' | 'done';
}

const SUPPORTED_TYPES = ['image/jpeg', 'image/png', 'image/webp', 'application/pdf'];

const ImageConverterTool: React.FC = () => {
  const [items, setItems] = useState<ExtendedConversionItem[]>([]);
  const [status, setStatus] = useState<ProcessStatus>({ isProcessing: false, currentStep: '', progress: 0 });
  const [isDraggingFile, setIsDraggingFile] = useState(false);
  const [draggedItemIndex, setDraggedItemIndex] = useState<number | null>(null);
  
  const [unsupportedFiles, setUnsupportedFiles] = useState<string[]>([]);
  
  const [settings, setSettings] = useState<ToolSettings>({
    quality: 0.9,
    mergeToPdf: false
  });

  const fileInputRef = useRef<HTMLInputElement>(null);
  const resultsRef = useRef<HTMLDivElement>(null);

  // Auto-scroll to results when done
  useEffect(() => {
    if (status.resultBlob && resultsRef.current) {
        setTimeout(() => {
            resultsRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
        }, 100);
    }
  }, [status.resultBlob]);

  const resetState = () => {
    items.forEach(i => i.previewUrl && URL.revokeObjectURL(i.previewUrl));
    setItems([]);
    setStatus({ isProcessing: false, currentStep: '', progress: 0, resultBlob: undefined, error: undefined });
    setUnsupportedFiles([]);
  };

  const handleBackToOptions = () => {
    setStatus(prev => ({ 
        ...prev, 
        resultBlob: undefined, 
        resultFileName: undefined, 
        compressedSize: undefined,
        error: undefined
    }));
    setItems(prev => prev.map(i => ({ ...i, status: 'idle' })));
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files.length > 0) {
      addFiles(Array.from(e.target.files));
      setStatus(prev => ({ ...prev, error: undefined }));
    }
    if (e.target) e.target.value = '';
  };

  // External Drag (File Upload)
  const handleExternalDragOver = (e: React.DragEvent) => { e.preventDefault(); setIsDraggingFile(true); };
  const handleExternalDragLeave = (e: React.DragEvent) => { e.preventDefault(); setIsDraggingFile(false); };
  const handleExternalDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDraggingFile(false);
    if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
      addFiles(Array.from(e.dataTransfer.files));
      setStatus(prev => ({ ...prev, error: undefined }));
    }
  };

  const addFiles = (newFiles: File[]) => {
    const validFiles: File[] = [];
    const invalidNames: string[] = [];

    newFiles.forEach(f => {
        if (SUPPORTED_TYPES.includes(f.type)) {
            validFiles.push(f);
        } else {
            invalidNames.push(f.name);
        }
    });

    if (invalidNames.length > 0) {
        setUnsupportedFiles(prev => [...prev, ...invalidNames]);
        setTimeout(() => setUnsupportedFiles([]), 8000);
    }

    const defaultFormat: SupportedFormat = 'image/jpeg';
    const newItems: ExtendedConversionItem[] = validFiles.map(f => {
        let previewUrl: string | undefined = undefined;
        if (f.type.startsWith('image/')) {
            previewUrl = URL.createObjectURL(f);
        }
        
        return {
            id: Math.random().toString(36).substr(2, 9),
            file: f,
            targetFormat: f.type === 'application/pdf' ? 'image/jpeg' : defaultFormat,
            previewUrl,
            status: 'idle'
        };
    });
    setItems(prev => [...prev, ...newItems]);
  };

  const removeFile = (index: number) => {
      const newItems = [...items];
      const removed = newItems.splice(index, 1);
      if (removed[0].previewUrl) URL.revokeObjectURL(removed[0].previewUrl);
      setItems(newItems);
      if(status.resultBlob) {
          setStatus(prev => ({ ...prev, resultBlob: undefined }));
      }
  };

  const updateItemFormat = (index: number, format: SupportedFormat) => {
      setItems(prev => {
          const next = [...prev];
          next[index] = { ...next[index], targetFormat: format };
          return next;
      });
  };

  const setAllFormats = (format: SupportedFormat) => {
      setItems(prev => prev.map(item => ({ ...item, targetFormat: format })));
  };

  // Internal Drag (Reordering)
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

  const handleStart = async () => {
    if (items.length === 0) return;

    // Pre-flight check for libraries
    if (items.length > 1 || settings.mergeToPdf) {
        if (!window.JSZip && !settings.mergeToPdf) {
             setStatus(prev => ({ ...prev, error: "Compression library not loaded. Check internet connection." }));
             return;
        }
    }

    const totalSize = items.reduce((acc, i) => acc + i.file.size, 0);
    setItems(prev => prev.map(i => ({...i, status: 'idle'})));

    setStatus({ 
        isProcessing: true, 
        currentStep: 'Starting...', 
        progress: 0,
        originalSize: totalSize,
        error: undefined
    });

    try {
      const cleanItems = items.map(i => ({ file: i.file, targetFormat: i.targetFormat })) as unknown as ConversionItem[];
      
      const { blob, filename } = await convertFile(
          cleanItems, 
          settings, 
          (progress, step) => {
             setStatus(prev => ({ ...prev, progress, currentStep: step }));
          },
          (index, itemStatus) => {
             setItems(prev => {
                 const newArr = [...prev];
                 if (newArr[index]) {
                     newArr[index] = { ...newArr[index], status: itemStatus };
                 }
                 return newArr;
             });
          }
      );

      setStatus({
        isProcessing: false,
        currentStep: 'Completed!',
        progress: 100,
        resultBlob: blob,
        resultFileName: filename,
        originalSize: totalSize,
        compressedSize: blob.size
      });
    } catch (error: any) {
      console.error(error);
      setStatus(prev => ({ 
        ...prev, 
        isProcessing: false, 
        error: error.message || 'Compression library not loaded. Check internet connection.' 
      }));
    }
  };

  const handleDownload = () => {
    if (!status.resultBlob || items.length === 0) return;
    const url = URL.createObjectURL(status.resultBlob);
    const a = document.createElement('a');
    a.href = url;
    a.download = status.resultFileName || `converted_${items[0].file.name}`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  // Stats
  const showMergeOption = items.length > 1 || items.some(i => i.targetFormat === 'application/pdf');

  const availableFormats: {value: SupportedFormat, label: string}[] = [
    { value: 'image/jpeg', label: 'JPG' },
    { value: 'image/png', label: 'PNG' },
    { value: 'image/webp', label: 'WEBP' },
    { value: 'application/pdf', label: 'PDF' },
  ];

  return (
    <div className="max-w-7xl mx-auto animate-fade-in pb-12 px-4 sm:px-6">
      
      {/* Main Card Container */}
      <div className="bg-[#0f172a] text-white rounded-[2rem] shadow-2xl overflow-hidden min-h-[600px] flex flex-col md:flex-row relative">
        
        {/* Close/Reset Button */}
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
                        <svg className="w-12 h-12 text-indigo-400" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z"></path></svg>
                    </div>
                    <h3 className="text-2xl font-bold tracking-tight mb-2">Upload Files</h3>
                    <p className="text-indigo-200/60 text-sm font-medium uppercase tracking-widest">Images or PDF</p>
                </div>
            ) : (
                <div className="p-6 h-full overflow-y-auto custom-scrollbar">
                    {/* Unsupported Files Warning */}
                    {unsupportedFiles.length > 0 && (
                        <div className="mb-4 p-3 bg-red-500/20 border border-red-500/50 rounded-xl text-center">
                            <p className="text-red-200 text-xs font-bold">Skipped {unsupportedFiles.length} unsupported files</p>
                        </div>
                    )}

                    <div className="grid grid-cols-2 lg:grid-cols-3 gap-4 pb-20">
                        {items.map((item, index) => (
                            <div 
                                key={item.id}
                                draggable={!status.isProcessing}
                                onDragStart={(e) => onDragStart(e, index)}
                                onDragEnter={(e) => onDragEnter(e, index)}
                                onDragEnd={onDragEnd}
                                className={`
                                    relative group bg-[#1e293b] rounded-xl overflow-hidden cursor-move transition-all duration-300 flex flex-col
                                    ${draggedItemIndex === index ? 'opacity-50 scale-95 ring-2 ring-indigo-500 z-10' : 'hover:-translate-y-1 hover:shadow-xl'}
                                    ${item.status === 'processing' ? 'ring-2 ring-indigo-500' : ''}
                                    ${item.status === 'done' ? 'ring-2 ring-green-500' : ''}
                                `}
                            >
                                {/* Thumbnail */}
                                <div className="relative aspect-[4/3] bg-black/40 w-full flex items-center justify-center overflow-hidden">
                                    {item.previewUrl ? (
                                        <img src={item.previewUrl} className="w-full h-full object-cover opacity-80 group-hover:opacity-100 transition-opacity" alt="" />
                                    ) : (
                                        <span className="text-3xl opacity-50">{item.file.type === 'application/pdf' ? '📄' : '🖼️'}</span>
                                    )}
                                    
                                    {/* Type Badge */}
                                    <div className="absolute top-2 left-2 bg-black/60 backdrop-blur-md text-white text-[9px] font-bold px-1.5 py-0.5 rounded border border-white/10 uppercase">
                                        {item.file.name.split('.').pop()}
                                    </div>

                                    {/* Loading / Done Overlay */}
                                    {item.status === 'processing' && (
                                        <div className="absolute inset-0 bg-black/60 flex items-center justify-center">
                                            <div className="w-6 h-6 border-2 border-indigo-500 border-t-transparent rounded-full animate-spin"></div>
                                        </div>
                                    )}
                                    {item.status === 'done' && (
                                        <div className="absolute inset-0 bg-green-500/20 flex items-center justify-center">
                                            <div className="bg-green-500 text-white rounded-full p-1 shadow-lg animate-pop">
                                                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="3" d="M5 13l4 4L19 7"></path></svg>
                                            </div>
                                        </div>
                                    )}
                                </div>

                                {/* Controls Footer */}
                                <div className="p-2 bg-[#1e293b] border-t border-white/5">
                                    <div className="flex justify-between items-center mb-1">
                                        <div className="text-[10px] text-slate-400 font-medium truncate max-w-[80px]" title={item.file.name}>{item.file.name}</div>
                                        <div className="text-[9px] text-slate-500">{formatBytes(item.file.size, 0)}</div>
                                    </div>
                                    <select 
                                        value={item.targetFormat}
                                        onChange={(e) => updateItemFormat(index, e.target.value as SupportedFormat)}
                                        disabled={status.isProcessing}
                                        className="w-full bg-black/30 text-white text-[10px] font-bold py-1 px-2 rounded border border-white/10 focus:border-indigo-500 outline-none cursor-pointer"
                                    >
                                        <option value="image/jpeg">To JPG</option>
                                        <option value="image/png">To PNG</option>
                                        <option value="image/webp">To WEBP</option>
                                        <option value="application/pdf">To PDF</option>
                                    </select>
                                </div>

                                {/* Remove Button */}
                                <button 
                                    onClick={(e) => { e.stopPropagation(); removeFile(index); }}
                                    disabled={status.isProcessing}
                                    className="absolute top-1 right-1 w-6 h-6 bg-red-500/90 hover:bg-red-500 text-white rounded-full flex items-center justify-center opacity-0 group-hover:opacity-100 transition-all duration-200 backdrop-blur-sm shadow-lg"
                                >
                                    <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M6 18L18 6M6 6l12 12"></path></svg>
                                </button>
                            </div>
                        ))}

                        {/* Add More Tile */}
                        {!status.resultBlob && !status.isProcessing && (
                            <div 
                                onClick={() => fileInputRef.current?.click()}
                                className="aspect-[4/3] border-2 border-dashed border-white/10 rounded-xl flex flex-col items-center justify-center cursor-pointer hover:border-indigo-500/50 hover:bg-white/5 transition-all group"
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
                            Format Shifter
                        </div>
                        <h2 className="text-5xl md:text-6xl font-black text-white leading-[0.9] tracking-tighter">
                            CONVERT <br/> IMAGES
                        </h2>
                    </div>

                    {items.length > 0 && (
                        <>
                            {/* Global Controls */}
                            <div>
                                <label className="text-[10px] font-bold uppercase text-slate-500 mb-3 block tracking-wider">Convert All To</label>
                                <div className="grid grid-cols-4 gap-2">
                                    {availableFormats.map(fmt => (
                                        <button
                                            key={fmt.value}
                                            onClick={() => setAllFormats(fmt.value)}
                                            className={`py-3 rounded-xl text-[10px] font-bold uppercase border transition-all ${items.every(i => i.targetFormat === fmt.value) ? 'bg-[#1e293b] border-indigo-500 text-white shadow-[0_0_15px_rgba(99,102,241,0.3)]' : 'bg-transparent border-slate-700 text-slate-400 hover:border-slate-500 hover:text-white'}`}
                                        >
                                            {fmt.label}
                                        </button>
                                    ))}
                                </div>
                            </div>

                            {/* Dynamic Settings Container */}
                            <div className="space-y-4">
                                {/* Merge Option */}
                                {showMergeOption && (
                                    <div className="flex items-center justify-between bg-[#151f32] p-4 rounded-xl border border-white/5">
                                        <div>
                                            <span className="block text-xs font-bold text-white">Merge Output</span>
                                            <span className="text-[10px] text-slate-400">Combine PDFs into one file</span>
                                        </div>
                                        <label className="relative inline-flex items-center cursor-pointer">
                                            <input type="checkbox" checked={settings.mergeToPdf} onChange={(e) => setSettings(s => ({...s, mergeToPdf: e.target.checked}))} className="sr-only peer" />
                                            <div className="w-11 h-6 bg-slate-700 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-indigo-500"></div>
                                        </label>
                                    </div>
                                )}

                                {/* Quality Slider (for JPG/WEBP) */}
                                {(items.some(i => i.targetFormat === 'image/jpeg' || i.targetFormat === 'image/webp')) && (
                                    <div className="bg-[#151f32] p-4 rounded-xl border border-white/5">
                                        <div className="flex justify-between text-[10px] uppercase font-bold text-slate-400 mb-4">
                                            <span>Image Quality</span>
                                            <span className="text-white">{Math.round(settings.quality * 100)}%</span>
                                        </div>
                                        <input 
                                            type="range" min="10" max="100" 
                                            value={settings.quality * 100}
                                            onChange={(e) => setSettings(s => ({...s, quality: Number(e.target.value)/100}))}
                                            className="w-full h-1.5 bg-slate-700 rounded-full appearance-none cursor-pointer accent-indigo-500 hover:accent-indigo-400"
                                        />
                                    </div>
                                )}
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

                            {/* Error Display */}
                            {status.error && (
                                <div className="bg-red-500/10 border border-red-500/20 p-4 rounded-xl animate-fade-in flex items-start gap-3">
                                    <svg className="w-5 h-5 text-red-500 shrink-0 mt-0.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z"></path></svg>
                                    <span className="text-red-400 text-xs font-bold leading-relaxed">{status.error}</span>
                                </div>
                            )}

                            {/* Action Button */}
                            {!status.isProcessing && (
                                <button 
                                    onClick={handleStart}
                                    className="w-full py-4 bg-gradient-to-r from-indigo-600 to-indigo-500 hover:from-indigo-500 hover:to-indigo-400 text-white rounded-xl font-bold uppercase tracking-widest text-xs transition-all shadow-lg shadow-indigo-900/20 flex items-center justify-center gap-2 group mt-2"
                                >
                                    <span>Start Conversion</span>
                                    <svg className="w-4 h-4 transition-transform group-hover:translate-x-1" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M14 5l7 7m0 0l-7 7m7-7H3"></path></svg>
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
                        <h3 className="text-xl font-bold text-white mb-1">Conversion Complete</h3>
                        <p className="text-slate-400 text-xs">Your files have been processed successfully.</p>
                        <p className="text-[10px] text-indigo-400 mt-2 font-mono break-all">{status.resultFileName}</p>
                    </div>

                    <div className="grid grid-cols-2 gap-8 border-y border-white/10 py-4 shrink-0">
                        <div>
                            <p className="text-[10px] font-bold uppercase text-slate-500 mb-1 tracking-wider">Original</p>
                            <p className="text-xl font-mono text-slate-400 line-through">{formatBytes(status.originalSize || 0)}</p>
                        </div>
                        <div>
                            <p className="text-[10px] font-bold uppercase text-slate-500 mb-1 tracking-wider">Result</p>
                            <p className="text-xl font-mono font-bold text-white">{formatBytes(status.compressedSize || 0)}</p>
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
                            onClick={handleBackToOptions}
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
        accept="image/jpeg,image/png,image/webp,application/pdf" 
        multiple 
        onChange={handleFileChange} 
        className="hidden" 
      />
    </div>
  );
};

export default ImageConverterTool;