import React, { useEffect, useRef, useState } from 'react';
import { InsertSettings, ProcessStatus } from '../types';
import { insertPageIntoPDF } from '../services/pdfInsert';

// Helper for formatting bytes
const formatBytes = (bytes: number, decimals = 2) => {
  if (bytes === 0) return '0 Bytes';
  const k = 1024;
  const dm = decimals < 0 ? 0 : decimals;
  const sizes = ['Bytes', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(dm)) + ' ' + sizes[i];
};

const getPdfPageCount = async (file: File): Promise<number> => {
  if (!window.pdfjsLib) return 0;
  const pdfjs = window.pdfjsLib;
  const url = URL.createObjectURL(file);

  try {
    const loadingTask = pdfjs.getDocument(url);
    const pdf = await loadingTask.promise;
    return pdf.numPages;
  } catch (e) {
    console.error('Failed to count pages', e);
    return 0;
  } finally {
    URL.revokeObjectURL(url);
  }
};

const InsertPageTool: React.FC = () => {
  const [baseFile, setBaseFile] = useState<File | null>(null);
  const [insertFile, setInsertFile] = useState<File | null>(null);
  const [basePageCount, setBasePageCount] = useState(0);
  const [insertPageCount, setInsertPageCount] = useState(0);
  const [status, setStatus] = useState<ProcessStatus>({ isProcessing: false, currentStep: '', progress: 0 });
  const [settings, setSettings] = useState<InsertSettings>({
    insertMode: 'after',
    insertAt: 1,
    sourcePage: 1,
    useBlankPage: false
  });

  const baseInputRef = useRef<HTMLInputElement>(null);
  const insertInputRef = useRef<HTMLInputElement>(null);
  const resultsRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!baseFile) {
      setBasePageCount(0);
      return;
    }
    getPdfPageCount(baseFile).then(setBasePageCount);
  }, [baseFile]);

  useEffect(() => {
    if (!insertFile) {
      setInsertPageCount(0);
      return;
    }
    getPdfPageCount(insertFile).then(setInsertPageCount);
  }, [insertFile]);

  useEffect(() => {
    if (basePageCount > 0) {
      setSettings(prev => ({
        ...prev,
        insertAt: Math.min(Math.max(prev.insertAt, 1), basePageCount)
      }));
    }
  }, [basePageCount]);

  useEffect(() => {
    if (insertPageCount > 0) {
      setSettings(prev => ({
        ...prev,
        sourcePage: Math.min(Math.max(prev.sourcePage, 1), insertPageCount)
      }));
    }
  }, [insertPageCount]);

  useEffect(() => {
    if (status.resultBlob && resultsRef.current) {
      setTimeout(() => {
        resultsRef.current?.scrollIntoView({ behavior: 'smooth' });
      }, 100);
    }
  }, [status.resultBlob]);

  const resetState = () => {
    setBaseFile(null);
    setInsertFile(null);
    setBasePageCount(0);
    setInsertPageCount(0);
    setStatus({ isProcessing: false, currentStep: '', progress: 0 });
    setSettings({
      insertMode: 'after',
      insertAt: 1,
      sourcePage: 1,
      useBlankPage: false
    });
  };

  const handleBack = () => {
    setStatus(prev => ({ ...prev, resultBlob: undefined, error: undefined }));
  };

  const handleBaseChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
      setBaseFile(e.target.files[0]);
      setStatus({ isProcessing: false, currentStep: '', progress: 0 });
    }
    if (baseInputRef.current) baseInputRef.current.value = '';
  };

  const handleInsertChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
      setInsertFile(e.target.files[0]);
      setSettings(prev => ({ ...prev, useBlankPage: false, sourcePage: 1 }));
      setStatus({ isProcessing: false, currentStep: '', progress: 0 });
    }
    if (insertInputRef.current) insertInputRef.current.value = '';
  };

  const handleBaseDrop = (e: React.DragEvent) => {
    e.preventDefault();
    if (e.dataTransfer.files && e.dataTransfer.files[0]?.type === 'application/pdf') {
      setBaseFile(e.dataTransfer.files[0]);
      setStatus({ isProcessing: false, currentStep: '', progress: 0 });
    }
  };

  const handleInsertDrop = (e: React.DragEvent) => {
    e.preventDefault();
    if (e.dataTransfer.files && e.dataTransfer.files[0]?.type === 'application/pdf') {
      setInsertFile(e.dataTransfer.files[0]);
      setSettings(prev => ({ ...prev, useBlankPage: false, sourcePage: 1 }));
      setStatus({ isProcessing: false, currentStep: '', progress: 0 });
    }
  };

  const handleStart = async () => {
    if (!baseFile) {
      setStatus(prev => ({ ...prev, error: 'Please upload a base PDF.' }));
      return;
    }
    if (!settings.useBlankPage && !insertFile) {
      setStatus(prev => ({ ...prev, error: 'Please upload a PDF to insert or use a blank page.' }));
      return;
    }
    if (basePageCount === 0) {
      setStatus(prev => ({ ...prev, error: 'Unable to read base PDF pages.' }));
      return;
    }
    if (settings.insertAt < 1 || settings.insertAt > basePageCount) {
      setStatus(prev => ({ ...prev, error: `Insert position must be between 1 and ${basePageCount}.` }));
      return;
    }
    if (!settings.useBlankPage && (settings.sourcePage < 1 || settings.sourcePage > insertPageCount)) {
      setStatus(prev => ({ ...prev, error: `Source page must be between 1 and ${insertPageCount}.` }));
      return;
    }

    setStatus({ isProcessing: true, currentStep: 'Initializing...', progress: 0, error: undefined });

    try {
      const result = await insertPageIntoPDF(
        baseFile,
        settings.useBlankPage ? null : insertFile,
        settings,
        (progress, step) => setStatus(prev => ({ ...prev, progress, currentStep: step }))
      );

      setStatus({
        isProcessing: false,
        currentStep: 'Completed!',
        progress: 100,
        resultBlob: result.blob,
        resultFileName: `inserted_${baseFile.name}`,
        compressedSize: result.blob.size
      });
    } catch (error: any) {
      console.error(error);
      setStatus(prev => ({
        ...prev,
        isProcessing: false,
        error: error.message || 'Insert failed.'
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

  const insertReady = !!baseFile && (settings.useBlankPage || !!insertFile);
  const canInsert =
    insertReady &&
    basePageCount > 0 &&
    settings.insertAt >= 1 &&
    settings.insertAt <= basePageCount &&
    (settings.useBlankPage || (insertPageCount > 0 && settings.sourcePage >= 1 && settings.sourcePage <= insertPageCount));

  return (
    <div className="max-w-7xl mx-auto animate-fade-in pb-12 px-4 sm:px-6">
      <div className="bg-[#0f172a] text-white rounded-[2rem] shadow-2xl overflow-hidden min-h-[600px] flex flex-col md:flex-row relative">
        {baseFile && !status.isProcessing && (
          <button
            onClick={resetState}
            className="absolute top-4 right-4 z-50 w-10 h-10 bg-white/10 hover:bg-white/20 rounded-full flex items-center justify-center backdrop-blur-md transition-all"
            title="Close / Reset"
          >
            <svg className="w-5 h-5 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M6 18L18 6M6 6l12 12"></path>
            </svg>
          </button>
        )}

        <div
          className={`
            relative md:w-1/2 min-h-[300px] md:min-h-full transition-all duration-500 overflow-hidden flex flex-col
            ${!baseFile ? 'bg-gradient-to-br from-indigo-900 to-[#0f172a] items-center justify-center' : 'bg-black/20'}
          `}
          onDragOver={(e) => e.preventDefault()}
          onDrop={handleBaseDrop}
          onClick={() => !baseFile && baseInputRef.current?.click()}
        >
          {!baseFile ? (
            <div className="text-center p-8 cursor-pointer transition-transform duration-300 hover:scale-105">
              <div className="w-32 h-32 bg-indigo-500/20 rounded-full flex items-center justify-center mx-auto mb-6 backdrop-blur-sm border border-indigo-500/30">
                <svg className="w-12 h-12 text-indigo-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 4v16m8-8H4"></path>
                </svg>
              </div>
              <h3 className="text-2xl font-bold tracking-tight mb-2">Upload Base PDF</h3>
              <p className="text-indigo-200/60 text-sm font-medium uppercase tracking-widest">Drag & Drop or Click</p>
            </div>
          ) : (
            <div className="p-6 h-full flex flex-col gap-4">
              <div className="bg-white/5 border border-white/10 rounded-2xl p-5">
                <p className="text-[10px] font-bold uppercase tracking-widest text-indigo-300 mb-2">Base Document</p>
                <p className="text-lg font-bold text-white truncate">{baseFile.name}</p>
                <div className="mt-3 flex items-center gap-6 text-xs text-slate-300">
                  <span>{basePageCount || '...'} pages</span>
                  <span>{formatBytes(baseFile.size)}</span>
                </div>
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    baseInputRef.current?.click();
                  }}
                  className="mt-4 text-[10px] font-bold uppercase tracking-widest text-indigo-400 hover:text-indigo-300"
                >
                  Replace Base PDF
                </button>
              </div>

              <div
                className="bg-white/5 border border-dashed border-white/10 rounded-2xl p-5 flex-1 flex flex-col justify-center"
                onDragOver={(e) => e.preventDefault()}
                onDrop={handleInsertDrop}
              >
                <p className="text-[10px] font-bold uppercase tracking-widest text-slate-400 mb-2">Insert Source</p>
                {settings.useBlankPage ? (
                  <div className="text-center">
                    <div className="w-14 h-14 bg-indigo-500/10 rounded-full flex items-center justify-center mx-auto mb-3 border border-indigo-500/20">
                      <span className="text-2xl">📄</span>
                    </div>
                    <p className="text-sm font-semibold text-white">Blank Page Selected</p>
                    <p className="text-xs text-slate-400 mt-1">We will insert a new empty page.</p>
                  </div>
                ) : insertFile ? (
                  <>
                    <p className="text-lg font-bold text-white truncate">{insertFile.name}</p>
                    <div className="mt-3 flex items-center gap-6 text-xs text-slate-300">
                      <span>{insertPageCount || '...'} pages</span>
                      <span>{formatBytes(insertFile.size)}</span>
                    </div>
                  </>
                ) : (
                  <div className="text-center">
                    <div className="w-14 h-14 bg-white/5 rounded-full flex items-center justify-center mx-auto mb-3 border border-white/10">
                      <span className="text-2xl">➕</span>
                    </div>
                    <p className="text-sm font-semibold text-white">Upload Insert PDF</p>
                    <p className="text-xs text-slate-400 mt-1">Drag & drop or click to choose.</p>
                  </div>
                )}

                <div className="mt-4 flex flex-col gap-2">
                  <button
                    onClick={() => insertInputRef.current?.click()}
                    className="w-full py-2 rounded-lg bg-white/10 hover:bg-white/20 text-[10px] font-bold uppercase tracking-widest"
                  >
                    {insertFile ? 'Replace Insert PDF' : 'Upload Insert PDF'}
                  </button>
                  <label className="flex items-center justify-center gap-2 text-[10px] font-bold uppercase tracking-widest text-slate-300">
                    <input
                      type="checkbox"
                      checked={settings.useBlankPage}
                      onChange={(e) => {
                        const useBlankPage = e.target.checked;
                        setSettings(prev => ({ ...prev, useBlankPage }));
                        if (useBlankPage) {
                          setInsertFile(null);
                          setInsertPageCount(0);
                        }
                      }}
                      className="w-4 h-4 rounded border-white/20 bg-white/5 text-indigo-400 focus:ring-indigo-500"
                    />
                    Use blank page instead
                  </label>
                </div>
              </div>
            </div>
          )}
        </div>

        <div className="md:w-1/2 p-8 md:p-12 flex flex-col justify-center relative bg-[#0f172a] z-10">
          {!status.resultBlob ? (
            <div className={`space-y-8 animate-fade-in ${status.isProcessing ? 'opacity-50 pointer-events-none' : ''}`}>
              <div>
                <div className="flex items-center gap-3 mb-2 text-indigo-400 font-bold text-xs tracking-[0.2em] uppercase">
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 4v16m8-8H4"></path>
                  </svg>
                  Page Insert
                </div>
                <h2 className="text-5xl md:text-6xl font-black text-white leading-[0.9] tracking-tighter">
                  INSERT <br /> PAGE
                </h2>
              </div>

              {baseFile && (
                <>
                  <div className="grid grid-cols-2 gap-8 border-y border-white/10 py-6">
                    <div>
                      <p className="text-[10px] font-bold uppercase text-slate-500 mb-1 tracking-wider">Base Pages</p>
                      <p className="text-2xl font-mono font-bold text-white">{basePageCount || '...'}</p>
                    </div>
                    <div>
                      <p className="text-[10px] font-bold uppercase text-slate-500 mb-1 tracking-wider">Insert Pages</p>
                      <p className="text-2xl font-mono font-bold text-indigo-400">
                        {settings.useBlankPage ? 'Blank' : insertPageCount || '...'}
                      </p>
                    </div>
                  </div>

                  <div className="space-y-6">
                    <div className="bg-black/20 p-1 rounded-xl flex gap-1 border border-white/5">
                      <button
                        onClick={() => setSettings(prev => ({ ...prev, insertMode: 'before' }))}
                        className={`flex-1 py-3 rounded-lg text-xs font-bold uppercase tracking-wider transition-all ${
                          settings.insertMode === 'before'
                            ? 'bg-indigo-500 text-white shadow-lg'
                            : 'text-slate-500 hover:text-white hover:bg-white/5'
                        }`}
                      >
                        Insert Before
                      </button>
                      <button
                        onClick={() => setSettings(prev => ({ ...prev, insertMode: 'after' }))}
                        className={`flex-1 py-3 rounded-lg text-xs font-bold uppercase tracking-wider transition-all ${
                          settings.insertMode === 'after'
                            ? 'bg-indigo-500 text-white shadow-lg'
                            : 'text-slate-500 hover:text-white hover:bg-white/5'
                        }`}
                      >
                        Insert After
                      </button>
                    </div>

                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                      <div>
                        <label className="text-[10px] font-bold uppercase text-slate-400 tracking-wider">Insert at page</label>
                        <input
                          type="number"
                          min={1}
                          max={basePageCount || 1}
                          value={settings.insertAt}
                          onChange={(e) =>
                            setSettings(prev => ({ ...prev, insertAt: Number(e.target.value) }))
                          }
                          className="mt-2 w-full bg-white/5 border border-white/10 rounded-xl p-3 text-white font-mono text-sm focus:outline-none focus:border-indigo-500 transition-colors"
                        />
                        <p className="text-[10px] text-slate-500 mt-2">
                          Use {settings.insertMode} to control placement.
                        </p>
                      </div>
                      <div>
                        <label className="text-[10px] font-bold uppercase text-slate-400 tracking-wider">Source page</label>
                        <input
                          type="number"
                          min={1}
                          max={insertPageCount || 1}
                          value={settings.sourcePage}
                          onChange={(e) =>
                            setSettings(prev => ({ ...prev, sourcePage: Number(e.target.value) }))
                          }
                          disabled={settings.useBlankPage}
                          className="mt-2 w-full bg-white/5 border border-white/10 rounded-xl p-3 text-white font-mono text-sm focus:outline-none focus:border-indigo-500 transition-colors disabled:opacity-50"
                        />
                        <p className="text-[10px] text-slate-500 mt-2">
                          {settings.useBlankPage ? 'Using a blank page.' : 'Select a page from the insert PDF.'}
                        </p>
                      </div>
                    </div>
                  </div>

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

                  {status.error && <p className="text-red-400 text-xs font-bold">{status.error}</p>}

                  {!status.isProcessing && (
                    <div className="flex gap-4 pt-2">
                      <button
                        onClick={handleStart}
                        disabled={!canInsert}
                        className="flex-1 py-4 bg-white text-[#0f172a] rounded-xl font-bold uppercase tracking-widest text-xs hover:bg-indigo-400 hover:text-white transition-all shadow-lg flex items-center justify-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed"
                      >
                        <span>Insert Page</span>
                        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M13 10V3L4 14h7v7l9-11h-7z"></path>
                        </svg>
                      </button>
                    </div>
                  )}
                </>
              )}
            </div>
          ) : (
            <div className="space-y-6 animate-fade-in flex flex-col h-full" ref={resultsRef}>
              <div className="shrink-0">
                <div className="flex items-center gap-3 mb-2 text-green-400 font-bold text-xs tracking-[0.2em] uppercase">
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M5 13l4 4L19 7"></path>
                  </svg>
                  Success
                </div>
                <h2 className="text-4xl font-black text-white leading-tight tracking-tighter">FILE READY</h2>
              </div>

              <div className="flex-1 bg-black/20 rounded-xl p-6 border border-white/5 flex flex-col justify-center items-center text-center">
                <div className="w-20 h-20 bg-green-500/10 rounded-full flex items-center justify-center mb-4 border border-green-500/20">
                  <svg className="w-10 h-10 text-green-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z"></path>
                  </svg>
                </div>
                <h3 className="text-xl font-bold text-white mb-1">Insert Complete</h3>
                <p className="text-slate-400 text-xs">Your updated document has been created successfully.</p>
              </div>

              <div className="grid grid-cols-2 gap-8 border-y border-white/10 py-4 shrink-0">
                <div>
                  <p className="text-[10px] font-bold uppercase text-slate-500 mb-1 tracking-wider">Base Size</p>
                  <p className="text-xl font-mono text-slate-400">{baseFile ? formatBytes(baseFile.size) : '...'}</p>
                </div>
                <div>
                  <p className="text-[10px] font-bold uppercase text-slate-500 mb-1 tracking-wider">New File</p>
                  <p className="text-xl font-mono font-bold text-white">{formatBytes(status.compressedSize || 0)}</p>
                </div>
              </div>

              <div className="flex gap-4 pt-2 shrink-0">
                <button
                  onClick={handleDownload}
                  className="flex-1 py-4 bg-white text-[#0f172a] rounded-xl font-bold uppercase tracking-widest text-xs hover:bg-green-400 hover:text-white transition-colors shadow-lg flex items-center justify-center gap-2"
                >
                  <span>Download</span>
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4"></path>
                  </svg>
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

      <input ref={baseInputRef} type="file" accept=".pdf" onChange={handleBaseChange} className="hidden" />
      <input ref={insertInputRef} type="file" accept=".pdf" onChange={handleInsertChange} className="hidden" />
    </div>
  );
};

export default InsertPageTool;
