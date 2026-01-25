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
      setStatus({ isProcessing: false, currentStep: '', progress: 0 });
      
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
      setStatus({ isProcessing: false, currentStep: '', progress: 0 });
  };

  // Determine Confidence Color
  const getConfidenceColor = (score: number) => {
      if (score >= 80) return 'text-green-600 bg-green-50 border-green-200';
      if (score >= 60) return 'text-amber-600 bg-amber-50 border-amber-200';
      return 'text-red-600 bg-red-50 border-red-200';
  };

  return (
    <div className="max-w-6xl mx-auto animate-fade-in pb-20">
      <div className="bg-white dark:bg-slate-800 rounded-2xl shadow-xl overflow-hidden border border-slate-100 dark:border-slate-700 transition-colors">
        
        {/* Header */}
        <div className="bg-gradient-to-r from-pink-500 to-rose-500 p-6 md:p-8 text-white text-center">
          <h2 className="text-2xl md:text-3xl font-bold mb-2">Image to Text (OCR)</h2>
          <p className="opacity-90 text-sm md:text-base">Extract text from images with AI. Supports 10+ languages.</p>
        </div>

        {!file ? (
            <div className="p-8 md:p-12">
                <div 
                    onDragOver={(e) => e.preventDefault()}
                    onDrop={handleDrop}
                    className="border-4 border-dashed border-pink-200 dark:border-slate-600 hover:border-pink-400 dark:hover:border-pink-500 rounded-2xl p-10 md:p-16 text-center transition-all bg-pink-50/50 dark:bg-slate-700/30 group"
                >
                    <div className="text-6xl mb-6 group-hover:scale-110 transition-transform">🔍</div>
                    <h3 className="text-2xl font-bold text-slate-700 dark:text-slate-200 mb-4">Start Scanning</h3>
                    
                    <div className="flex flex-col sm:flex-row gap-4 justify-center max-w-md mx-auto">
                        <button 
                            onClick={() => fileInputRef.current?.click()}
                            className="flex-1 py-3 px-6 bg-pink-600 hover:bg-pink-700 text-white rounded-xl font-bold shadow-lg transition-transform active:scale-95 flex items-center justify-center gap-2"
                        >
                            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4"></path></svg>
                            Upload Image
                        </button>
                        <button 
                            onClick={() => cameraInputRef.current?.click()}
                            className="flex-1 py-3 px-6 bg-slate-800 hover:bg-slate-900 text-white rounded-xl font-bold shadow-lg transition-transform active:scale-95 flex items-center justify-center gap-2"
                        >
                            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M3 9a2 2 0 012-2h.93a2 2 0 001.664-.89l.812-1.22A2 2 0 0110.07 4h3.86a2 2 0 011.664.89l.812 1.22A2 2 0 0018.07 7H19a2 2 0 012 2v9a2 2 0 01-2 2H5a2 2 0 01-2-2V9z"></path><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M15 13a3 3 0 11-6 0 3 3 0 016 0z"></path></svg>
                            Use Camera
                        </button>
                    </div>
                    <p className="text-slate-500 dark:text-slate-400 mt-4 text-sm">Supports JPG, PNG, WebP</p>
                </div>
            </div>
        ) : (
            <div className="flex flex-col">
                
                {/* TOP: Image Preview & Settings */}
                <div className="bg-slate-100 dark:bg-slate-900 border-b border-slate-200 dark:border-slate-700 p-4 md:p-6 flex flex-col gap-4">
                    
                    {/* Toolbar */}
                    <div className="flex flex-col lg:flex-row items-center gap-3 p-3 bg-white dark:bg-slate-800 rounded-xl border border-slate-200 dark:border-slate-600 shadow-sm w-full">
                        <div className="flex-1 flex gap-2 w-full lg:w-auto">
                            <select 
                                value={language}
                                onChange={(e) => setLanguage(e.target.value)}
                                disabled={status.isProcessing}
                                className="flex-1 p-2.5 font-bold text-slate-700 dark:text-slate-200 outline-none bg-slate-50 dark:bg-slate-700 rounded-lg cursor-pointer text-sm border border-slate-200 dark:border-slate-600 focus:border-pink-500"
                            >
                                {SUPPORTED_LANGUAGES.map(lang => (
                                    <option key={lang.code} value={lang.code}>
                                        {lang.icon} {lang.name}
                                    </option>
                                ))}
                            </select>

                            <select 
                                value={processMode}
                                onChange={(e) => setProcessMode(e.target.value as any)}
                                disabled={status.isProcessing}
                                className="flex-1 p-2.5 font-bold text-slate-700 dark:text-slate-200 outline-none bg-slate-50 dark:bg-slate-700 rounded-lg cursor-pointer text-sm border border-slate-200 dark:border-slate-600 focus:border-pink-500"
                                title="Image Enhancement Mode"
                            >
                                <option value="grayscale">Standard (Grayscale)</option>
                                <option value="binary">Text Only (B&W)</option>
                            </select>
                        </div>
                        
                        <div className="w-px h-6 bg-slate-200 dark:bg-slate-600 hidden lg:block"></div>
                        
                        <div className="flex gap-2 w-full lg:w-auto">
                            <button 
                                onClick={() => fileInputRef.current?.click()}
                                disabled={status.isProcessing}
                                className="flex-1 lg:flex-none text-xs font-bold text-indigo-600 dark:text-indigo-400 px-3 hover:bg-indigo-50 dark:hover:bg-slate-700 rounded py-2.5 transition-colors whitespace-nowrap border border-transparent hover:border-indigo-100 dark:hover:border-slate-600"
                            >
                                Replace Image
                            </button>
                            <button 
                                onClick={resetState} 
                                className="flex-1 lg:flex-none text-xs font-bold text-red-500 px-3 hover:bg-red-50 dark:hover:bg-red-900/20 rounded py-2.5 transition-colors whitespace-nowrap border border-transparent hover:border-red-100"
                            >
                                Close
                            </button>
                        </div>
                    </div>

                    <div className="flex flex-col md:flex-row gap-6">
                        {/* Image Viewer */}
                        <div className="relative flex-1 bg-slate-200 dark:bg-slate-950 rounded-xl overflow-hidden border border-slate-300 dark:border-slate-700 flex items-center justify-center p-2 min-h-[300px]">
                            <img 
                                src={previewUrl!} 
                                alt="Source" 
                                className={`max-w-full max-h-[500px] object-contain shadow-lg transition-all ${status.isProcessing ? 'blur-sm opacity-50' : ''}`} 
                            />
                            
                            {/* Processing Overlay */}
                            {status.isProcessing && (
                                <div className="absolute inset-0 flex flex-col items-center justify-center z-10 text-white drop-shadow-md bg-black/10 backdrop-blur-[1px]">
                                    <div className="animate-spin w-12 h-12 border-4 border-white border-t-transparent rounded-full mb-4"></div>
                                    <h3 className="text-xl font-bold animate-pulse">{status.currentStep}</h3>
                                    <p className="font-mono">{status.progress}%</p>
                                </div>
                            )}
                        </div>
                    </div>

                    {/* Action Button */}
                    <button 
                        onClick={handleStart}
                        disabled={status.isProcessing}
                        className="w-full py-4 bg-pink-600 hover:bg-pink-700 text-white rounded-xl font-bold text-lg shadow-lg transition-all active:scale-[0.98] disabled:bg-slate-400 disabled:cursor-not-allowed flex items-center justify-center gap-2"
                    >
                       {status.isProcessing ? 'Processing...' : 'Extract Text Now'}
                    </button>
                </div>

                {/* BOTTOM: Result Text */}
                <div className="flex-1 flex flex-col bg-white dark:bg-slate-800 min-h-[400px]">
                    <div className="p-3 border-b border-slate-100 dark:border-slate-700 flex justify-between items-center bg-slate-50 dark:bg-slate-700/30 shrink-0">
                        <div className="flex items-center gap-3">
                            <h4 className="font-bold text-slate-700 dark:text-slate-200 uppercase text-xs tracking-wide">Result</h4>
                            {confidence !== null && (
                                <span className={`text-xs font-bold px-2 py-0.5 rounded border ${getConfidenceColor(confidence)}`}>
                                    Confidence: {confidence}%
                                </span>
                            )}
                        </div>
                        <div className="flex gap-2">
                            <button 
                                onClick={copyToClipboard}
                                disabled={!resultText}
                                className={`px-3 py-1.5 rounded-lg text-sm font-bold transition-all flex items-center gap-2 ${copyFeedback ? 'bg-green-500 text-white' : 'bg-white border border-slate-200 text-slate-700 hover:bg-slate-50'}`}
                            >
                                {copyFeedback ? <span>✓ Copied</span> : <span>Copy Text</span>}
                            </button>
                            <button 
                                onClick={downloadText}
                                disabled={!resultText}
                                className="px-3 py-1.5 bg-slate-800 text-white rounded-lg text-sm font-bold hover:bg-slate-900 transition-colors disabled:opacity-50"
                            >
                                Download
                            </button>
                        </div>
                    </div>
                    
                    <textarea 
                        ref={resultRef}
                        value={resultText}
                        onChange={(e) => setResultText(e.target.value)}
                        placeholder="Extracted text will appear here..."
                        className="flex-1 w-full p-6 resize-none outline-none text-slate-900 dark:text-slate-100 dark:bg-slate-800 font-mono text-base leading-relaxed h-full min-h-[400px]"
                        spellCheck={false}
                    />
                    
                    {status.error && (
                        <div className="p-4 bg-red-50 dark:bg-red-900/20 text-red-600 dark:text-red-300 text-sm font-bold border-t border-red-100 dark:border-red-900">
                            Error: {status.error}
                        </div>
                    )}
                </div>
            </div>
        )}
      </div>
      
      {/* Hidden Inputs */}
      <input ref={fileInputRef} type="file" accept="image/*" onChange={handleFileChange} className="hidden" />
      <input ref={cameraInputRef} type="file" accept="image/*" capture="environment" onChange={handleFileChange} className="hidden" />
    </div>
  );
};

export default OCRTool;
