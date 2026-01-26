
import React, { useState, useRef } from 'react';
import { ProcessStatus } from '../types';
import { recognizeText, preprocessImage, SUPPORTED_LANGUAGES, PreprocessOptions } from '../services/ocrService';

const OCRTool: React.FC = () => {
  const [file, setFile] = useState<File | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [resultText, setResultText] = useState('');
  
  const [status, setStatus] = useState<ProcessStatus>({ isProcessing: false, currentStep: '', progress: 0 });
  const [language, setLanguage] = useState('eng');
  
  // Settings
  const [processMode, setProcessMode] = useState<'grayscale' | 'binary'>('grayscale');
  const [confidence, setConfidence] = useState<number | null>(null);
  const [copyFeedback, setCopyFeedback] = useState(false);

  const fileInputRef = useRef<HTMLInputElement>(null);
  const cameraInputRef = useRef<HTMLInputElement>(null);
  const resultRef = useRef<HTMLTextAreaElement>(null);

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
        processFile(e.target.files[0]);
    }
    // Reset so same file triggers change
    if (e.target) e.target.value = '';
  };

  const processFile = (f: File) => {
      if (!f.type.startsWith('image/')) {
          alert("Please upload an image file (JPG, PNG, WebP) for OCR.");
          return;
      }
      
      setFile(f);
      setResultText('');
      setConfidence(null);
      setStatus({ isProcessing: false, currentStep: '', progress: 0, resultBlob: undefined });
      
      if (previewUrl) URL.revokeObjectURL(previewUrl);
      setPreviewUrl(URL.createObjectURL(f));
  };

  const handleDrop = (e: React.DragEvent) => {
      e.preventDefault();
      if (e.dataTransfer.files && e.dataTransfer.files[0]) {
          processFile(e.dataTransfer.files[0]);
      }
  };

  const handleStart = async () => {
      if (!file) return;
      
      setStatus({ isProcessing: true, currentStep: 'Initializing...', progress: 0 });
      setResultText('');
      setConfidence(null);

      try {
          // 1. Pre-process
          setStatus(prev => ({ ...prev, currentStep: 'Enhancing Image...', progress: 10 }));
          
          const options: PreprocessOptions = {
              mode: processMode,
              contrast: 30
          };
          
          const inputBlob = await preprocessImage(file, options);

          // 2. Recognize
          const result = await recognizeText(inputBlob, language, (p, s) => {
              // Scale progress: Preprocessing is 0-20, OCR is 20-100
              const scaledP = 20 + (p * 0.8);
              setStatus(prev => ({ ...prev, progress: Math.round(scaledP), currentStep: s }));
          });
          
          setResultText(result.text);
          setConfidence(result.confidence);
          
          setStatus({ isProcessing: false, currentStep: 'Completed', progress: 100, resultBlob: new Blob([result.text], {type: 'text/plain'}) });
      } catch (e: any) {
          setStatus(prev => ({ ...prev, isProcessing: false, error: e.message }));
      }
  };

  const copyToClipboard = () => {
      if (!resultText) return;
      navigator.clipboard.writeText(resultText);
      setCopyFeedback(true);
      setTimeout(() => setCopyFeedback(false), 2000);
  };

  const downloadText = () => {
      if (!resultText) return;
      const blob = new Blob([resultText], { type: 'text/plain' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `extracted_${file?.name.split('.')[0] || 'text'}.txt`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
  };

  const resetState = () => {
      setFile(null);
      if (previewUrl) URL.revokeObjectURL(previewUrl);
      setPreviewUrl(null);
      setResultText('');
      setConfidence(null);
      setStatus({ isProcessing: false, currentStep: '', progress: 0, resultBlob: undefined, error: undefined });
  };

  return (
    <div className="max-w-7xl mx-auto animate-fade-in pb-12 px-4 sm:px-6">
      
      {/* Main Card Container */}
      <div className="bg-[#0f172a] text-white rounded-[2rem] shadow-2xl overflow-hidden min-h-[600px] flex flex-col md:flex-row relative">
        
        {/* Close/Reset Button (Only when file loaded) */}
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
                relative md:w-1/2 min-h-[300px] md:min-h-full transition-all duration-500 overflow-hidden flex flex-col justify-center items-center
                ${!file ? 'bg-gradient-to-br from-indigo-900 to-[#0f172a]' : 'bg-black/30'}
            `}
            onDragOver={(e) => e.preventDefault()}
            onDrop={handleDrop}
        >
            {!file ? (
                <div className="text-center p-8 space-y-6">
                    <div className="w-32 h-32 bg-indigo-500/20 rounded-full flex items-center justify-center mx-auto backdrop-blur-sm border border-indigo-500/30">
                        <svg className="w-12 h-12 text-indigo-400" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M3 9a2 2 0 012-2h.93a2 2 0 001.664-.89l.812-1.22A2 2 0 0110.07 4h3.86a2 2 0 011.664.89l.812 1.22A2 2 0 0018.07 7H19a2 2 0 012 2v9a2 2 0 01-2 2H5a2 2 0 01-2-2V9z"></path><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M15 13a3 3 0 11-6 0 3 3 0 016 0z"></path></svg>
                    </div>
                    <div>
                        <h3 className="text-2xl font-bold tracking-tight text-white mb-2">Scan Image</h3>
                        <p className="text-indigo-200/60 text-sm font-medium uppercase tracking-widest">Extract text from photos</p>
                    </div>
                    <div className="flex gap-4 justify-center">
                        <button 
                            onClick={() => fileInputRef.current?.click()}
                            className="px-6 py-3 bg-white/10 hover:bg-white/20 rounded-xl font-bold text-xs uppercase tracking-wider transition-all border border-white/5"
                        >
                            Upload File
                        </button>
                        <button 
                            onClick={() => cameraInputRef.current?.click()}
                            className="px-6 py-3 bg-indigo-600 hover:bg-indigo-500 rounded-xl font-bold text-xs uppercase tracking-wider transition-all shadow-lg shadow-indigo-500/20"
                        >
                            Camera
                        </button>
                    </div>
                </div>
            ) : (
                <div className="relative w-full h-full p-8 flex items-center justify-center">
                    <img 
                        src={previewUrl!} 
                        className={`max-w-full max-h-[500px] object-contain shadow-2xl rounded-lg transition-all ${status.isProcessing ? 'blur-sm opacity-50' : 'opacity-100'}`} 
                    />
                    
                    {/* Processing Overlay */}
                    {status.isProcessing && (
                        <div className="absolute inset-0 flex flex-col items-center justify-center z-10">
                            <div className="w-16 h-16 border-4 border-indigo-500 border-t-transparent rounded-full animate-spin mb-4"></div>
                            <h3 className="text-xl font-bold text-white animate-pulse tracking-wide">{status.currentStep}</h3>
                            <p className="font-mono text-indigo-400 mt-2">{status.progress}%</p>
                        </div>
                    )}
                </div>
            )}
        </div>

        {/* RIGHT COLUMN: CONTROLS & RESULT */}
        <div className="md:w-1/2 p-8 md:p-12 flex flex-col justify-center relative bg-[#0f172a] z-10 border-t md:border-t-0 md:border-l border-white/5">
            
            {/* Header */}
            <div className="mb-8 shrink-0">
                <div className="flex items-center gap-3 mb-2 text-indigo-400 font-bold text-xs tracking-[0.2em] uppercase">
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2"></path></svg>
                    Text Extractor
                </div>
                <h2 className="text-5xl md:text-6xl font-black text-white leading-[0.9] tracking-tighter">
                    IMAGE <br/> OCR
                </h2>
            </div>

            {!status.resultBlob ? (
                /* CONFIGURATION VIEW */
                <div className={`space-y-8 animate-fade-in ${status.isProcessing ? 'opacity-50 pointer-events-none' : ''}`}>
                    {file && (
                        <>
                            {/* Settings */}
                            <div className="space-y-6">
                                {/* Language */}
                                <div>
                                    <label className="text-[10px] font-bold uppercase text-slate-500 mb-2 block tracking-wider">Document Language</label>
                                    <div className="relative">
                                        <select 
                                            value={language}
                                            onChange={(e) => setLanguage(e.target.value)}
                                            className="w-full bg-[#1e293b] text-white p-4 rounded-xl border border-white/10 outline-none appearance-none font-bold text-sm focus:border-indigo-500 transition-colors cursor-pointer"
                                        >
                                            {SUPPORTED_LANGUAGES.map(lang => (
                                                <option key={lang.code} value={lang.code}>
                                                    {lang.icon} {lang.name}
                                                </option>
                                            ))}
                                        </select>
                                        <div className="absolute right-4 top-1/2 -translate-y-1/2 pointer-events-none text-slate-400">▼</div>
                                    </div>
                                </div>

                                {/* Mode Toggle */}
                                <div>
                                    <label className="text-[10px] font-bold uppercase text-slate-500 mb-2 block tracking-wider">Enhancement Mode</label>
                                    <div className="grid grid-cols-2 gap-2 bg-[#1e293b] p-1 rounded-xl border border-white/10">
                                        <button 
                                            onClick={() => setProcessMode('grayscale')}
                                            className={`py-3 rounded-lg text-xs font-bold uppercase tracking-wider transition-all ${processMode === 'grayscale' ? 'bg-indigo-600 text-white shadow-lg' : 'text-slate-500 hover:text-white hover:bg-white/5'}`}
                                        >
                                            Standard
                                        </button>
                                        <button 
                                            onClick={() => setProcessMode('binary')}
                                            className={`py-3 rounded-lg text-xs font-bold uppercase tracking-wider transition-all ${processMode === 'binary' ? 'bg-indigo-600 text-white shadow-lg' : 'text-slate-500 hover:text-white hover:bg-white/5'}`}
                                        >
                                            Text Only (B&W)
                                        </button>
                                    </div>
                                    <p className="text-[10px] text-slate-500 mt-2 ml-1">
                                        {processMode === 'grayscale' ? 'Best for photos and documents with images.' : 'Best for scanned documents with clear text.'}
                                    </p>
                                </div>
                            </div>

                            {/* Processing Bar (Visual only, actual status handled by overlay) */}
                            {status.isProcessing && (
                                <div className="h-1 bg-slate-800 rounded-full overflow-hidden mt-4">
                                    <div className="h-full bg-indigo-500 transition-all duration-300" style={{ width: `${status.progress}%` }}></div>
                                </div>
                            )}

                            {/* Error */}
                            {status.error && (
                                <div className="p-4 bg-red-500/10 border border-red-500/20 rounded-xl text-red-400 text-xs font-bold">
                                    {status.error}
                                </div>
                            )}

                            {/* Start Button */}
                            <button 
                                onClick={handleStart}
                                className="w-full py-4 bg-white text-[#0f172a] rounded-xl font-bold uppercase tracking-widest text-xs hover:bg-indigo-400 hover:text-white transition-all shadow-lg flex items-center justify-center gap-2 group mt-4"
                            >
                                <span>Start Scanning</span>
                                <svg className="w-4 h-4 transition-transform group-hover:translate-x-1" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M14 5l7 7m0 0l-7 7m7-7H3"></path></svg>
                            </button>
                        </>
                    )}
                    
                    {!file && (
                        <div className="text-slate-500 text-sm font-medium italic opacity-50">
                            Select an image from the left panel to begin.
                        </div>
                    )}
                </div>
            ) : (
                /* RESULT VIEW */
                <div className="flex flex-col h-full animate-fade-in">
                    
                    {/* Header: Confidence */}
                    <div className="flex items-center justify-between mb-4">
                        <div className="flex items-center gap-2">
                            <span className="text-[10px] font-bold uppercase text-slate-500 tracking-wider">Confidence Score</span>
                            {confidence !== null && (
                                <span className={`text-[10px] font-bold px-2 py-0.5 rounded border ${confidence > 80 ? 'bg-green-500/20 text-green-400 border-green-500/50' : (confidence > 50 ? 'bg-yellow-500/20 text-yellow-400 border-yellow-500/50' : 'bg-red-500/20 text-red-400 border-red-500/50')}`}>
                                    {confidence}%
                                </span>
                            )}
                        </div>
                        {copyFeedback && <span className="text-green-400 text-[10px] font-bold animate-pulse">COPIED!</span>}
                    </div>

                    {/* Text Area */}
                    <div className="flex-1 relative group">
                        <textarea 
                            ref={resultRef}
                            value={resultText}
                            onChange={(e) => setResultText(e.target.value)}
                            className="w-full h-full bg-[#151f32] border border-white/10 rounded-xl p-4 text-slate-300 font-mono text-xs leading-relaxed resize-none focus:outline-none focus:border-indigo-500 custom-scrollbar"
                            spellCheck={false}
                        />
                        <button 
                            onClick={copyToClipboard}
                            className="absolute top-2 right-2 bg-white/10 hover:bg-white/20 text-white p-2 rounded-lg backdrop-blur-md opacity-0 group-hover:opacity-100 transition-all border border-white/5"
                            title="Copy to Clipboard"
                        >
                            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z"></path></svg>
                        </button>
                    </div>

                    {/* Actions */}
                    <div className="grid grid-cols-2 gap-3 mt-4 shrink-0">
                        <button 
                            onClick={downloadText}
                            className="py-3 bg-white text-[#0f172a] rounded-xl font-bold uppercase tracking-widest text-[10px] hover:bg-indigo-400 hover:text-white transition-all shadow-lg flex items-center justify-center gap-2"
                        >
                            <span>Download .TXT</span>
                            <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4"></path></svg>
                        </button>
                        <button 
                            onClick={resetState}
                            className="py-3 bg-transparent border border-slate-700 text-white rounded-xl font-bold uppercase tracking-widest text-[10px] hover:border-white transition-colors"
                        >
                            Scan New
                        </button>
                    </div>
                </div>
            )}
        </div>
      </div>
      
      {/* Hidden Inputs */}
      <input ref={fileInputRef} type="file" accept="image/*" onChange={handleFileChange} className="hidden" />
      <input ref={cameraInputRef} type="file" accept="image/*" capture="environment" onChange={handleFileChange} className="hidden" />
    </div>
  );
};

export default OCRTool;
