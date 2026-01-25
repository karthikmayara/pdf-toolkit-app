import React, { useState, useRef, useEffect } from 'react';
import { ProcessStatus, PageNumberSettings, PageNumberPosition } from '../types';
import { addPageNumbers } from '../services/pageNumberService';

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
        resultsRef.current.scrollIntoView({ behavior: 'smooth' });
    }
  }, [status.resultBlob]);

  const resetState = () => {
    setFile(null);
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

  // Position Grid Component
  const PositionGrid = () => {
      const positions: PageNumberPosition[] = [
          'top-left', 'top-center', 'top-right',
          'bottom-left', 'bottom-center', 'bottom-right'
      ];
      
      return (
          <div className="bg-slate-100 dark:bg-slate-900 rounded-lg p-2 aspect-[3/4] grid grid-rows-3 relative border border-slate-200 dark:border-slate-700 max-w-[140px] mx-auto shadow-inner">
              {/* Top Row */}
              <div className="flex justify-between items-start">
                   {positions.slice(0, 3).map(pos => (
                       <button 
                         key={pos}
                         onClick={() => setSettings(s => ({...s, position: pos}))}
                         className={`w-6 h-6 rounded-full border-2 transition-all hover:scale-110 flex items-center justify-center ${settings.position === pos ? 'bg-cyan-500 border-cyan-600 shadow-md ring-2 ring-cyan-200' : 'bg-white dark:bg-slate-700 border-slate-300 dark:border-slate-600 hover:border-cyan-400'}`}
                         title={pos.replace('-', ' ')}
                       >
                           {settings.position === pos && <div className="w-2 h-2 bg-white rounded-full"></div>}
                       </button>
                   ))}
              </div>

              {/* Middle (Spacer/Preview Text) */}
              <div className="flex items-center justify-center">
                  <span className="text-[10px] text-slate-400 font-medium opacity-50 select-none">PAGE</span>
              </div>

              {/* Bottom Row */}
              <div className="flex justify-between items-end">
                   {positions.slice(3, 6).map(pos => (
                       <button 
                         key={pos}
                         onClick={() => setSettings(s => ({...s, position: pos}))}
                         className={`w-6 h-6 rounded-full border-2 transition-all hover:scale-110 flex items-center justify-center ${settings.position === pos ? 'bg-cyan-500 border-cyan-600 shadow-md ring-2 ring-cyan-200' : 'bg-white dark:bg-slate-700 border-slate-300 dark:border-slate-600 hover:border-cyan-400'}`}
                         title={pos.replace('-', ' ')}
                       >
                           {settings.position === pos && <div className="w-2 h-2 bg-white rounded-full"></div>}
                       </button>
                   ))}
              </div>
          </div>
      );
  };

  return (
    <div className="max-w-4xl mx-auto animate-fade-in pb-20">
      <div className="bg-white dark:bg-slate-800 rounded-2xl shadow-xl overflow-hidden border border-slate-100 dark:border-slate-700 transition-colors duration-300">
        
        {/* Header */}
        <div className="bg-gradient-to-r from-cyan-600 to-teal-600 p-8 text-white text-center">
          <h2 className="text-3xl font-bold mb-2">Page Numbers</h2>
          <p className="opacity-90">Add numbering to your PDF documents instantly.</p>
        </div>

        <div className="p-4 sm:p-8">
            {!file ? (
                <div 
                    onClick={() => fileInputRef.current?.click()}
                    onDragOver={handleDragOver}
                    onDragLeave={handleDragLeave}
                    onDrop={handleDrop}
                    className={`
                        border-4 border-dashed rounded-xl p-16 text-center cursor-pointer transition-all duration-200 group
                        ${isDragging 
                        ? 'border-cyan-500 bg-cyan-50 dark:bg-slate-700 scale-102' 
                        : 'border-slate-200 dark:border-slate-600 hover:border-cyan-400 dark:hover:border-cyan-500 hover:bg-slate-50 dark:hover:bg-slate-700/50'}
                    `}
                    >
                    <div className="text-6xl mb-6 group-hover:scale-110 transition-transform">🔢</div>
                    <h3 className="text-xl font-bold text-slate-700 dark:text-slate-200 mb-2">Select PDF File</h3>
                    <p className="text-slate-500 dark:text-slate-400">or drop it here</p>
                </div>
            ) : (
                <div className="space-y-8 animate-fade-in">
                    
                    {/* Toolbar */}
                    <div className="flex justify-between items-center bg-slate-50 dark:bg-slate-700/50 p-4 rounded-xl border border-slate-200 dark:border-slate-600">
                        <div className="flex items-center gap-3">
                            <div className="text-2xl">📄</div>
                            <div className="min-w-0">
                                <h4 className="font-bold text-slate-700 dark:text-slate-200 truncate max-w-[200px]">{file.name}</h4>
                                <p className="text-xs text-slate-500 dark:text-slate-400">{formatBytes(file.size)}</p>
                            </div>
                        </div>
                        <button 
                            onClick={resetState}
                            className="text-xs font-bold text-red-500 hover:text-red-600 bg-white dark:bg-slate-800 px-3 py-2 rounded-lg border border-slate-200 dark:border-slate-600"
                            disabled={status.isProcessing}
                        >
                            Change File
                        </button>
                    </div>

                    {!status.resultBlob ? (
                        <div className="grid grid-cols-1 md:grid-cols-12 gap-8">
                            
                            {/* LEFT: Visual Preview & Position */}
                            <div className="md:col-span-4 flex flex-col gap-4">
                                <div className="bg-white dark:bg-slate-800 rounded-xl border border-slate-200 dark:border-slate-700 p-6 shadow-sm">
                                    <h4 className="text-xs font-bold uppercase text-slate-500 dark:text-slate-400 mb-4 text-center tracking-wide">Position</h4>
                                    <PositionGrid />
                                    <p className="text-center text-xs text-slate-400 mt-4">Click dots to place number</p>
                                </div>
                            </div>

                            {/* RIGHT: Configuration */}
                            <div className="md:col-span-8 space-y-6">
                                <div className="bg-slate-50 dark:bg-slate-700/30 rounded-xl border border-slate-200 dark:border-slate-700 p-6 space-y-6">
                                    
                                    {/* Format Selection */}
                                    <div>
                                        <label className="block text-sm font-bold text-slate-700 dark:text-slate-300 mb-2">Number Format</label>
                                        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                                            {[
                                                { id: 'n', label: '1' },
                                                { id: 'page-n', label: 'Page 1' },
                                                { id: 'n-of-total', label: '1 of N' },
                                                { id: 'page-n-of-total', label: 'Page 1 of N' }
                                            ].map(fmt => (
                                                <button
                                                    key={fmt.id}
                                                    onClick={() => setSettings(s => ({...s, format: fmt.id as any}))}
                                                    className={`py-2 px-3 text-sm font-medium rounded-lg border transition-all ${settings.format === fmt.id ? 'bg-cyan-50 border-cyan-500 text-cyan-700 dark:bg-cyan-900/20 dark:border-cyan-500 dark:text-cyan-300' : 'bg-white dark:bg-slate-800 border-slate-200 dark:border-slate-600 text-slate-700 dark:text-slate-300 hover:border-cyan-300'}`}
                                                >
                                                    {fmt.label}
                                                </button>
                                            ))}
                                        </div>
                                    </div>

                                    {/* Sliders Row */}
                                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">
                                        <div>
                                            <div className="flex justify-between mb-2">
                                                <label className="text-sm font-bold text-slate-700 dark:text-slate-300">Margin from Edge</label>
                                                <span className="text-xs bg-slate-200 dark:bg-slate-600 px-2 rounded font-mono">{settings.margin}pt</span>
                                            </div>
                                            <input 
                                                type="range" min="0" max="100" 
                                                value={settings.margin} 
                                                onChange={(e) => setSettings(s => ({...s, margin: Number(e.target.value)}))}
                                                className="w-full h-2 bg-slate-200 dark:bg-slate-600 rounded-lg appearance-none cursor-pointer accent-cyan-600"
                                            />
                                        </div>
                                        <div>
                                            <div className="flex justify-between mb-2">
                                                <label className="text-sm font-bold text-slate-700 dark:text-slate-300">Font Size</label>
                                                <span className="text-xs bg-slate-200 dark:bg-slate-600 px-2 rounded font-mono">{settings.fontSize}pt</span>
                                            </div>
                                            <input 
                                                type="range" min="6" max="32" 
                                                value={settings.fontSize} 
                                                onChange={(e) => setSettings(s => ({...s, fontSize: Number(e.target.value)}))}
                                                className="w-full h-2 bg-slate-200 dark:bg-slate-600 rounded-lg appearance-none cursor-pointer accent-cyan-600"
                                            />
                                        </div>
                                    </div>

                                    {/* Toggles */}
                                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 pt-2 border-t border-slate-200 dark:border-slate-600">
                                        <div className="flex items-center justify-between p-3 bg-white dark:bg-slate-800 rounded-lg border border-slate-200 dark:border-slate-600">
                                            <div>
                                                <span className="block text-sm font-bold text-slate-700 dark:text-slate-200">Skip First Page</span>
                                                <span className="text-xs text-slate-400">Don't number the cover</span>
                                            </div>
                                            <input 
                                                type="checkbox" 
                                                checked={settings.skipFirst}
                                                onChange={(e) => setSettings(s => ({...s, skipFirst: e.target.checked}))}
                                                className="w-5 h-5 text-cyan-600 rounded focus:ring-cyan-500"
                                            />
                                        </div>
                                        <div className="flex items-center justify-between p-3 bg-white dark:bg-slate-800 rounded-lg border border-slate-200 dark:border-slate-600">
                                            <div>
                                                <span className="block text-sm font-bold text-slate-700 dark:text-slate-200">Start Count At</span>
                                                <span className="text-xs text-slate-400">Custom starting number</span>
                                            </div>
                                            <input 
                                                type="number" min="1" max="999"
                                                value={settings.startFrom}
                                                onChange={(e) => setSettings(s => ({...s, startFrom: Number(e.target.value)}))}
                                                className="w-16 p-1 text-right text-sm font-bold border rounded bg-slate-50 dark:bg-slate-900 border-slate-300 dark:border-slate-600 text-slate-900 dark:text-slate-100 outline-none focus:border-cyan-500"
                                            />
                                        </div>
                                    </div>

                                </div>

                                {/* Progress */}
                                {status.isProcessing && (
                                    <div className="space-y-2">
                                        <div className="flex justify-between text-xs font-bold uppercase text-slate-500 dark:text-slate-400 tracking-wider">
                                            <span className="animate-pulse">{status.currentStep}</span>
                                            <span>{status.progress}%</span>
                                        </div>
                                        <div className="h-4 bg-slate-100 dark:bg-slate-700 rounded-full overflow-hidden">
                                            <div 
                                            className="h-full bg-cyan-500 transition-all duration-300 ease-out" 
                                            style={{ width: `${status.progress}%` }}
                                            ></div>
                                        </div>
                                    </div>
                                )}

                                {/* Error */}
                                {status.error && (
                                    <div className="bg-red-50 dark:bg-red-900/30 text-red-700 dark:text-red-300 p-4 rounded-xl border border-red-200 dark:border-red-800 text-sm font-medium">
                                        {status.error}
                                    </div>
                                )}

                                {/* Action Button */}
                                <button
                                    onClick={handleStart}
                                    disabled={status.isProcessing}
                                    className="w-full py-4 bg-cyan-600 hover:bg-cyan-700 text-white rounded-xl font-bold text-lg shadow-lg shadow-cyan-200 dark:shadow-none transition-all active:scale-[0.98] disabled:bg-slate-300 dark:disabled:bg-slate-700 disabled:cursor-not-allowed flex items-center justify-center gap-2"
                                >
                                    {status.isProcessing ? 'Adding Numbers...' : 'Add Page Numbers'}
                                </button>
                            </div>
                        </div>
                    ) : (
                        /* Results Dashboard */
                        <div ref={resultsRef} className="text-center animate-fade-in-up py-4">
                            <div className="inline-flex items-center justify-center w-20 h-20 bg-green-100 dark:bg-green-900/30 text-green-600 dark:text-green-400 rounded-full mb-6">
                                <svg className="w-10 h-10" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M5 13l4 4L19 7"></path></svg>
                            </div>
                            <h3 className="text-2xl font-bold text-slate-800 dark:text-white mb-2">Numbers Added Successfully!</h3>
                            <p className="text-slate-500 dark:text-slate-400 mb-8">Your document is ready for download.</p>
                            
                            <div className="flex flex-col sm:flex-row gap-4 justify-center">
                                <button 
                                    onClick={handleDownload}
                                    className="px-8 py-4 bg-cyan-600 hover:bg-cyan-700 text-white rounded-xl font-bold shadow-lg shadow-cyan-200 dark:shadow-none transition-all hover:scale-105 active:scale-95 flex items-center justify-center gap-2"
                                >
                                    <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4"></path></svg>
                                    Download PDF
                                </button>
                                <button 
                                    onClick={() => setStatus({isProcessing:false, currentStep:'', progress:0})}
                                    className="px-8 py-4 bg-slate-100 dark:bg-slate-700 text-slate-700 dark:text-slate-200 rounded-xl font-bold hover:bg-slate-200 dark:hover:bg-slate-600 transition-all"
                                >
                                    Modify Settings
                                </button>
                                <button 
                                    onClick={resetState}
                                    className="px-8 py-4 bg-white dark:bg-transparent border border-slate-200 dark:border-slate-600 text-slate-700 dark:text-slate-200 rounded-xl font-bold hover:bg-slate-50 dark:hover:bg-slate-700 transition-all"
                                >
                                    New File
                                </button>
                            </div>
                        </div>
                    )}
                </div>
            )}
        </div>
      </div>
      
      <input ref={fileInputRef} type="file" accept=".pdf" onChange={handleFileChange} className="hidden" />
    </div>
  );
};

export default PageNumberTool;