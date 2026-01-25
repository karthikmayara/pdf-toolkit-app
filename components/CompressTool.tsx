import React, { useState, useRef, useEffect } from 'react';
import { CompressionMode, CompressionSettings, ProcessStatus } from '../types';
import { compressPDF } from '../services/pdfCompression';

// Helper for formatting bytes
const formatBytes = (bytes: number, decimals = 2) => {
  if (bytes === 0) return '0 Bytes';
  const k = 1024;
  const dm = decimals < 0 ? 0 : decimals;
  const sizes = ['Bytes', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(dm)) + ' ' + sizes[i];
};

const CompressTool: React.FC = () => {
  const [file, setFile] = useState<File | null>(null);
  const [status, setStatus] = useState<ProcessStatus>({ isProcessing: false, currentStep: '', progress: 0 });
  const [isDragging, setIsDragging] = useState(false);
  
  const [settings, setSettings] = useState<CompressionSettings>({
    mode: CompressionMode.STRUCTURE, 
    quality: 0.8,
    maxResolution: 2000, 
    grayscale: false,
    flattenForms: false,
    preserveMetadata: false, // Default: Not selected
  });

  const fileInputRef = useRef<HTMLInputElement>(null);
  const resultsRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (status.resultBlob && resultsRef.current) {
        resultsRef.current.scrollIntoView({ behavior: 'smooth' });
    }
  }, [status.resultBlob]);

  const resetState = () => {
    setFile(null);
    setStatus({ isProcessing: false, currentStep: '', progress: 0, resultBlob: undefined, error: undefined });
  };

  const handleBackToOptions = () => {
    setStatus(prev => ({ 
        ...prev, 
        resultBlob: undefined, 
        resultFileName: undefined, 
        compressedSize: undefined, 
        error: undefined
    }));
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
      setFile(e.target.files[0]);
      setStatus({ isProcessing: false, currentStep: '', progress: 0 }); 
    }
  };

  // Drag and Drop Handlers
  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(true);
  };

  const handleDragLeave = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
    if (e.dataTransfer.files && e.dataTransfer.files[0]) {
      if (e.dataTransfer.files[0].type === 'application/pdf') {
        setFile(e.dataTransfer.files[0]);
        setStatus({ isProcessing: false, currentStep: '', progress: 0 });
      } else {
        alert('Please upload a PDF file.');
      }
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
      const resultBlob = await compressPDF(file, settings, (progress, step) => {
        setStatus(prev => ({ ...prev, progress, currentStep: step }));
      });

      setStatus({
        isProcessing: false,
        currentStep: 'Completed!',
        progress: 100,
        resultBlob,
        originalSize: file.size,
        compressedSize: resultBlob.size
      });
    } catch (error: any) {
      console.error(error);
      setStatus(prev => ({ 
        ...prev, 
        isProcessing: false, 
        error: error.message || 'Compression failed. The file might be corrupted or too large.' 
      }));
    }
  };

  const handleDownload = () => {
    if (!status.resultBlob || !file) return;
    const url = URL.createObjectURL(status.resultBlob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `compressed_${file.name}`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  const applyPreset = (type: 'web' | 'standard' | 'high') => {
    setSettings(prev => ({ ...prev, mode: CompressionMode.IMAGE }));
    // Improved presets for better text clarity
    if (type === 'web') setSettings(s => ({ ...s, mode: CompressionMode.IMAGE, quality: 0.7, maxResolution: 1500, grayscale: false }));
    if (type === 'standard') setSettings(s => ({ ...s, mode: CompressionMode.IMAGE, quality: 0.85, maxResolution: 2400, grayscale: false }));
    if (type === 'high') setSettings(s => ({ ...s, mode: CompressionMode.IMAGE, quality: 0.95, maxResolution: 3500, grayscale: false }));
  };

  const handleFileChangeClick = () => {
    if (fileInputRef.current) {
      // Reset value so onChange triggers even if same file is selected
      fileInputRef.current.value = '';
      fileInputRef.current.click();
    }
  };

  // Savings calculation
  const savingsPercent = status.originalSize && status.compressedSize 
    ? Math.round(((status.originalSize - status.compressedSize) / status.originalSize) * 100) 
    : 0;

  return (
    <div className="max-w-4xl mx-auto animate-fade-in pb-12">
      <div className="bg-white dark:bg-slate-800 rounded-2xl shadow-xl overflow-hidden border border-slate-100 dark:border-slate-700 transition-colors duration-300">
        
        {/* Header */}
        <div className="bg-gradient-to-r from-indigo-600 to-blue-600 p-8 text-white text-center">
          <h2 className="text-3xl font-bold mb-2">Compress PDF</h2>
          <p className="opacity-90">Securely reduce file size directly in your browser.</p>
        </div>

        <div className="p-4 sm:p-8">
          
          {/* 1. Upload Section */}
          {!file && (
            <div 
              onClick={() => fileInputRef.current?.click()}
              onDragOver={handleDragOver}
              onDragLeave={handleDragLeave}
              onDrop={handleDrop}
              className={`
                border-4 border-dashed rounded-2xl p-16 text-center cursor-pointer transition-all duration-200 group
                ${isDragging 
                  ? 'border-indigo-500 bg-indigo-50 dark:bg-slate-700 scale-102' 
                  : 'border-slate-200 dark:border-slate-600 hover:border-indigo-400 dark:hover:border-indigo-500 hover:bg-slate-50 dark:hover:bg-slate-700/50'}
              `}
            >
              <div className="w-20 h-20 bg-indigo-100 dark:bg-slate-700 rounded-full flex items-center justify-center mx-auto mb-6 group-hover:scale-110 transition-transform text-indigo-600 dark:text-indigo-400">
                  <span className="text-4xl">📦</span>
              </div>
              <h3 className="text-2xl font-bold text-slate-700 dark:text-slate-200 mb-2">
                {isDragging ? 'Drop file now' : 'Select PDF File'}
              </h3>
              <p className="text-slate-500 dark:text-slate-400">or drag and drop here</p>
            </div>
          )}

          {/* 2. Configuration & Process */}
          {file && !status.resultBlob && (
            <div className={`space-y-8 animate-fade-in ${status.isProcessing ? 'pointer-events-none opacity-60' : ''}`}>
              {/* File Info Bar */}
              <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between bg-slate-50 dark:bg-slate-700/50 p-4 rounded-xl border border-slate-200 dark:border-slate-600 gap-4">
                <div className="flex items-center gap-4">
                  <div className="w-12 h-12 bg-red-100 dark:bg-slate-600 rounded-lg flex items-center justify-center text-2xl text-red-500 dark:text-red-400">
                      📄
                  </div>
                  <div className="overflow-hidden">
                    <h3 className="font-bold text-slate-800 dark:text-slate-200 truncate max-w-[200px] sm:max-w-sm" title={file.name}>{file.name}</h3>
                    <p className="text-sm text-slate-500 dark:text-slate-400 font-mono">{formatBytes(file.size)}</p>
                  </div>
                </div>
                <div className="flex gap-2 w-full sm:w-auto">
                   <button 
                    onClick={resetState}
                    className="flex-1 sm:flex-none p-2.5 text-red-500 hover:bg-red-50 dark:hover:bg-red-900/20 rounded-lg transition-colors border border-transparent hover:border-red-200 dark:hover:border-red-800"
                    title="Remove file"
                    disabled={status.isProcessing}
                  >
                    <svg className="w-5 h-5 mx-auto" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"></path></svg>
                  </button>
                  <button 
                    onClick={handleFileChangeClick}
                    className="flex-1 sm:flex-none px-4 py-2 bg-white dark:bg-slate-600 border border-slate-200 dark:border-slate-500 text-indigo-600 dark:text-indigo-300 hover:bg-indigo-50 dark:hover:bg-slate-500 font-bold text-sm rounded-lg transition-colors"
                    disabled={status.isProcessing}
                  >
                    Change File
                  </button>
                </div>
              </div>

              {/* Mode Selection Cards */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                 {/* Structure Mode Card */}
                 <div 
                    onClick={() => !status.isProcessing && setSettings(s => ({ ...s, mode: CompressionMode.STRUCTURE }))}
                    className={`relative p-6 rounded-2xl border-2 cursor-pointer transition-all hover:scale-[1.02] active:scale-[0.98] flex flex-col gap-3
                        ${settings.mode === CompressionMode.STRUCTURE 
                          ? 'border-indigo-500 bg-indigo-50 dark:bg-indigo-900/20 shadow-md ring-1 ring-indigo-200 dark:ring-indigo-700' 
                          : 'border-slate-200 dark:border-slate-700 hover:border-indigo-300 dark:hover:border-slate-500 bg-white dark:bg-slate-800'}`}
                 >
                     <div className="flex items-center justify-between">
                         <div className="p-2 bg-blue-100 dark:bg-blue-900/40 text-blue-600 dark:text-blue-300 rounded-lg text-2xl">⚡</div>
                         {settings.mode === CompressionMode.STRUCTURE && <div className="w-4 h-4 bg-indigo-500 rounded-full"></div>}
                     </div>
                     <div>
                         <h4 className="font-bold text-lg text-slate-800 dark:text-white">Smart Optimization</h4>
                         <p className="text-sm text-slate-500 dark:text-slate-400 mt-1 leading-relaxed">
                            Removes redundant data and optimizes structure. 
                            <span className="block mt-1 font-bold text-blue-600 dark:text-blue-400">Best for: Text Documents, Invoices, Contracts</span>
                         </p>
                     </div>
                 </div>

                 {/* Image Mode Card */}
                 <div 
                    onClick={() => !status.isProcessing && setSettings(s => ({ ...s, mode: CompressionMode.IMAGE }))}
                    className={`relative p-6 rounded-2xl border-2 cursor-pointer transition-all hover:scale-[1.02] active:scale-[0.98] flex flex-col gap-3
                        ${settings.mode === CompressionMode.IMAGE 
                          ? 'border-indigo-500 bg-indigo-50 dark:bg-indigo-900/20 shadow-md ring-1 ring-indigo-200 dark:ring-indigo-700' 
                          : 'border-slate-200 dark:border-slate-700 hover:border-indigo-300 dark:hover:border-slate-500 bg-white dark:bg-slate-800'}`}
                 >
                     <div className="flex items-center justify-between">
                         <div className="p-2 bg-orange-100 dark:bg-orange-900/40 text-orange-600 dark:text-orange-300 rounded-lg text-2xl">🖼️</div>
                         {settings.mode === CompressionMode.IMAGE && <div className="w-4 h-4 bg-indigo-500 rounded-full"></div>}
                     </div>
                     <div>
                         <h4 className="font-bold text-lg text-slate-800 dark:text-white">Image Re-Compression</h4>
                         <p className="text-sm text-slate-500 dark:text-slate-400 mt-1 leading-relaxed">
                            Converts pages to images and compresses them. Strongest reduction.
                            <span className="block mt-1 font-bold text-orange-600 dark:text-orange-400">Best for: Scanned Docs, Old Files</span>
                         </p>
                     </div>
                 </div>
              </div>

               {/* Advanced Options Section */}
               <div className="bg-slate-50 dark:bg-slate-700/30 p-6 rounded-2xl border border-slate-100 dark:border-slate-700 space-y-6">
                    <h3 className="font-bold text-slate-800 dark:text-white text-sm uppercase tracking-wide">Refine Settings</h3>
                    
                    {/* Common Toggles */}
                    <div className="flex flex-col sm:flex-row gap-4">
                        <label className="flex items-center gap-3 p-3 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-600 rounded-xl cursor-pointer hover:bg-slate-50 dark:hover:bg-slate-700 transition-colors flex-1">
                            <input 
                                type="checkbox" 
                                checked={settings.preserveMetadata}
                                onChange={(e) => setSettings(s => ({...s, preserveMetadata: e.target.checked}))}
                                disabled={status.isProcessing}
                                className="w-5 h-5 text-indigo-600 rounded focus:ring-indigo-500 border-gray-300"
                            />
                            <div>
                                <span className="block text-sm font-bold text-slate-700 dark:text-slate-200">Preserve Metadata</span>
                                <span className="text-xs text-slate-400">Keep author/title info</span>
                            </div>
                        </label>
                        
                        {settings.mode === CompressionMode.STRUCTURE && (
                            <label className="flex items-center gap-3 p-3 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-600 rounded-xl cursor-pointer hover:bg-slate-50 dark:hover:bg-slate-700 transition-colors flex-1 animate-fade-in">
                                <input 
                                    type="checkbox" 
                                    checked={settings.flattenForms}
                                    onChange={(e) => setSettings(s => ({...s, flattenForms: e.target.checked}))}
                                    disabled={status.isProcessing}
                                    className="w-5 h-5 text-indigo-600 rounded focus:ring-indigo-500 border-gray-300"
                                />
                                <div>
                                    <span className="block text-sm font-bold text-slate-700 dark:text-slate-200">Flatten Forms</span>
                                    <span className="text-xs text-slate-400">Make fields non-editable</span>
                                </div>
                            </label>
                        )}

                        {settings.mode === CompressionMode.IMAGE && (
                             <label className="flex items-center gap-3 p-3 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-600 rounded-xl cursor-pointer hover:bg-slate-50 dark:hover:bg-slate-700 transition-colors flex-1 animate-fade-in">
                                <input 
                                    type="checkbox" 
                                    checked={settings.grayscale}
                                    onChange={(e) => setSettings(s => ({...s, grayscale: e.target.checked}))}
                                    disabled={status.isProcessing}
                                    className="w-5 h-5 text-indigo-600 rounded focus:ring-indigo-500 border-gray-300"
                                />
                                <div>
                                    <span className="block text-sm font-bold text-slate-700 dark:text-slate-200">Grayscale</span>
                                    <span className="text-xs text-slate-400">Convert to B&W</span>
                                </div>
                            </label>
                        )}
                    </div>

                    {/* Image Mode Sliders */}
                    {settings.mode === CompressionMode.IMAGE && (
                        <div className="space-y-6 pt-4 border-t border-slate-200 dark:border-slate-700 animate-fade-in">
                            <div className="flex gap-2">
                                {['web', 'standard', 'high'].map((preset) => (
                                <button 
                                    key={preset}
                                    onClick={() => applyPreset(preset as any)}
                                    disabled={status.isProcessing} 
                                    className="flex-1 py-2 text-xs font-bold uppercase bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-600 hover:bg-slate-50 dark:hover:bg-slate-700 rounded-lg text-slate-600 dark:text-slate-300 transition-colors"
                                >
                                    {preset} Preset
                                </button>
                                ))}
                            </div>

                            <div>
                                <div className="flex justify-between text-sm mb-2 text-slate-700 dark:text-slate-300">
                                    <span className="font-bold">Image Quality</span>
                                    <span className="font-mono bg-white dark:bg-slate-800 px-2 py-0.5 rounded border border-slate-200 dark:border-slate-600 text-xs">
                                        {Math.round(settings.quality * 100)}%
                                    </span>
                                </div>
                                <input 
                                    type="range" min="10" max="100" 
                                    value={settings.quality * 100}
                                    onChange={(e) => setSettings(s => ({ ...s, quality: Number(e.target.value) / 100 }))}
                                    className="w-full h-2 bg-slate-200 dark:bg-slate-600 rounded-lg appearance-none cursor-pointer accent-indigo-600"
                                />
                            </div>

                            <div>
                                <div className="flex justify-between text-sm mb-2 text-slate-700 dark:text-slate-300">
                                    <span className="font-bold">Max Resolution (px)</span>
                                    <span className="font-mono bg-white dark:bg-slate-800 px-2 py-0.5 rounded border border-slate-200 dark:border-slate-600 text-xs">
                                        {settings.maxResolution}px
                                    </span>
                                </div>
                                <input 
                                    type="range" min="1000" max="5000" step="100"
                                    value={settings.maxResolution}
                                    onChange={(e) => setSettings(s => ({ ...s, maxResolution: Number(e.target.value) }))}
                                    className="w-full h-2 bg-slate-200 dark:bg-slate-600 rounded-lg appearance-none cursor-pointer accent-indigo-600"
                                />
                            </div>
                        </div>
                    )}
               </div>

              {/* Progress & Error */}
              {status.error && (
                <div className="bg-red-50 dark:bg-red-900/30 text-red-700 dark:text-red-300 p-4 rounded-xl border border-red-200 dark:border-red-800 text-sm font-medium flex items-center gap-3 animate-fade-in">
                  <span className="text-xl">⚠️</span>
                  {status.error}
                </div>
              )}

              {status.isProcessing && (
                <div className="space-y-2">
                  <div className="flex justify-between text-xs font-bold uppercase text-slate-500 dark:text-slate-400 tracking-wider">
                    <span className="animate-pulse">{status.currentStep}</span>
                    <span>{status.progress}%</span>
                  </div>
                  <div className="h-4 bg-slate-100 dark:bg-slate-700 rounded-full overflow-hidden">
                    <div 
                      className="h-full bg-indigo-500 transition-all duration-300 ease-out relative overflow-hidden" 
                      style={{ width: `${status.progress}%` }}
                    >
                       <div className="absolute inset-0 bg-white/20 animate-[spin-slow_2s_linear_infinite]" style={{backgroundImage: 'linear-gradient(45deg,rgba(255,255,255,.15) 25%,transparent 25%,transparent 50%,rgba(255,255,255,.15) 50%,rgba(255,255,255,.15) 75%,transparent 75%,transparent)', backgroundSize: '1rem 1rem'}}></div>
                    </div>
                  </div>
                </div>
              )}

              {/* Action Button */}
              <button
                onClick={handleStart}
                disabled={status.isProcessing}
                className="w-full py-4 bg-indigo-600 hover:bg-indigo-700 dark:bg-indigo-600 dark:hover:bg-indigo-500 disabled:bg-slate-300 dark:disabled:bg-slate-700 disabled:cursor-not-allowed text-white rounded-xl font-bold text-lg shadow-lg shadow-indigo-200 dark:shadow-none transition-all active:scale-[0.99] flex items-center justify-center gap-2"
              >
                {status.isProcessing ? 'Compressing...' : 'Start Compression'}
              </button>
            </div>
          )}

          {/* 3. Results */}
          {status.resultBlob && (
             <div ref={resultsRef} className="text-center animate-fade-in-up">
                
                {/* Success Banner */}
                <div className="inline-block mb-8">
                    <div className="bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-300 px-6 py-2 rounded-full border border-green-200 dark:border-green-800 flex items-center gap-2">
                        <span className="text-xl">🎉</span>
                        <span className="font-bold">Compression Successful</span>
                    </div>
                </div>
                
                {/* Stats Card */}
                <div className="bg-slate-50 dark:bg-slate-800/50 rounded-2xl p-6 border border-slate-100 dark:border-slate-700 max-w-lg mx-auto mb-8 relative overflow-hidden">
                    {/* Background decoration */}
                    <div className="absolute -right-6 -top-6 text-[100px] opacity-5 rotate-12 select-none pointer-events-none">📉</div>
                    
                    <div className="grid grid-cols-3 divide-x divide-slate-200 dark:divide-slate-600">
                        <div className="px-2">
                             <p className="text-[10px] uppercase font-bold text-slate-400 tracking-wider mb-1">Before</p>
                             <p className="font-mono text-lg text-slate-500 line-through">{formatBytes(status.originalSize || 0)}</p>
                        </div>
                        <div className="px-2">
                             <p className="text-[10px] uppercase font-bold text-indigo-500 tracking-wider mb-1">After</p>
                             <p className="font-mono text-lg font-bold text-indigo-600 dark:text-indigo-400">{formatBytes(status.compressedSize || status.resultBlob.size)}</p>
                        </div>
                        <div className="px-2">
                             <p className="text-[10px] uppercase font-bold text-green-500 tracking-wider mb-1">Saved</p>
                             <p className="font-mono text-lg font-bold text-green-600 dark:text-green-400">-{savingsPercent}%</p>
                        </div>
                    </div>
                </div>

                <div className="flex flex-col sm:flex-row gap-4 justify-center">
                  <button 
                    onClick={handleDownload}
                    className="px-8 py-4 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl font-bold shadow-lg shadow-indigo-200 dark:shadow-none transition-all hover:scale-105 active:scale-95 flex items-center justify-center gap-2"
                  >
                    <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4"></path></svg>
                    Download PDF
                  </button>
                  <button 
                    onClick={handleBackToOptions}
                    className="px-8 py-4 bg-white dark:bg-slate-700 text-slate-700 dark:text-slate-200 border border-slate-200 dark:border-slate-600 rounded-xl font-bold hover:bg-slate-50 dark:hover:bg-slate-600 transition-all"
                  >
                    Adjust Settings
                  </button>
                  <button 
                    onClick={resetState}
                    className="px-8 py-4 bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-400 rounded-xl font-bold hover:bg-slate-200 dark:hover:bg-slate-700 transition-all"
                  >
                    New File
                  </button>
                </div>
             </div>
          )}
        </div>
      </div>

      {/* Hidden File Input */}
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

export default CompressTool;