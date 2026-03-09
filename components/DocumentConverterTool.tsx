import React, { useMemo, useRef, useState } from 'react';
import { ProcessStatus } from '../types';
import {
  convertDocument,
  DocumentTargetFormat,
  FORMAT_PRESETS,
  getCapabilityRows,
  getUnsupportedPairReason,
} from '../services/documentConversion';

const SOURCE_TYPES = [
  'application/pdf',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  'application/vnd.openxmlformats-officedocument.presentationml.presentation',
];

const TARGET_OPTIONS: { value: DocumentTargetFormat; label: string }[] = [
  { value: 'application/pdf', label: 'PDF' },
  { value: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document', label: 'DOCX (Word)' },
  { value: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', label: 'XLSX (Excel)' },
  { value: 'application/vnd.openxmlformats-officedocument.presentationml.presentation', label: 'PPTX (PowerPoint)' },
];

const formatBytes = (bytes?: number, decimals = 2) => {
  if (!bytes || bytes <= 0) return '0 B';
  const k = 1024;
  const dm = decimals < 0 ? 0 : decimals;
  const sizes = ['B', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return `${parseFloat((bytes / Math.pow(k, i)).toFixed(dm))} ${sizes[i]}`;
};

const DocumentConverterTool: React.FC = () => {
  const [file, setFile] = useState<File | null>(null);
  const [targetFormat, setTargetFormat] = useState<DocumentTargetFormat>('application/pdf');
  const [status, setStatus] = useState<ProcessStatus>({ isProcessing: false, currentStep: '', progress: 0 });
  const [isDragging, setIsDragging] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  const capabilityRows = useMemo(() => getCapabilityRows(), []);
  const unsupportedReason = useMemo(() => {
    if (!file) return null;
    return getUnsupportedPairReason(file.type, targetFormat);
  }, [file, targetFormat]);

  const resetState = () => {
    setFile(null);
    setStatus({ isProcessing: false, currentStep: '', progress: 0, resultBlob: undefined, error: undefined });
    if (inputRef.current) inputRef.current.value = '';
  };

  const clearResultOnly = () => {
    setStatus(prev => ({
      ...prev,
      resultBlob: undefined,
      resultFileName: undefined,
      compressedSize: undefined,
      error: undefined,
      currentStep: '',
      progress: 0,
    }));
  };

  const selectFile = (selected: File | undefined) => {
    if (!selected) return;

    if (!SOURCE_TYPES.includes(selected.type)) {
      setStatus(prev => ({ ...prev, error: 'Unsupported file. Use PDF, DOCX, XLSX or PPTX.' }));
      return;
    }

    setFile(selected);
    setStatus({ isProcessing: false, currentStep: '', progress: 0, error: undefined, resultBlob: undefined });
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    selectFile(e.target.files?.[0]);
    if (e.target) e.target.value = '';
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
    selectFile(e.dataTransfer.files?.[0]);
  };

  const onStart = async () => {
    if (!file || unsupportedReason) return;

    setStatus({
      isProcessing: true,
      currentStep: 'Preparing...',
      progress: 5,
      error: undefined,
      originalSize: file.size,
    });

    try {
      const { blob, filename } = await convertDocument(
        { file, targetFormat },
        (progress, step) => setStatus(prev => ({ ...prev, progress, currentStep: step }))
      );

      setStatus({
        isProcessing: false,
        currentStep: 'Completed!',
        progress: 100,
        resultBlob: blob,
        resultFileName: filename,
        originalSize: file.size,
        compressedSize: blob.size,
      });
    } catch (error: any) {
      setStatus(prev => ({ ...prev, isProcessing: false, error: error?.message || 'Conversion failed.' }));
    }
  };

  const onDownload = () => {
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

  return (
    <div className="max-w-7xl mx-auto animate-fade-in pb-12 px-4 sm:px-6">
      <div className="bg-[#0f172a] text-white rounded-[2rem] shadow-2xl overflow-hidden min-h-[600px] flex flex-col md:flex-row relative">
        <div className="w-full md:w-[36%] bg-gradient-to-b from-indigo-600 to-indigo-700 p-6 sm:p-8 flex flex-col gap-6">
          <div>
            <h3 className="text-2xl sm:text-3xl font-black">Office ↔ PDF</h3>
            <p className="text-indigo-100 mt-2 text-sm">Single-file conversion with clear compatibility guidance.</p>
          </div>

          <div className="space-y-2">
            <p className="text-xs uppercase tracking-wider text-indigo-100/80">Quick presets</p>
            <div className="grid grid-cols-2 gap-2">
              {FORMAT_PRESETS.map((preset) => (
                <button
                  key={preset.value}
                  onClick={() => {
                    setTargetFormat(preset.value);
                    clearResultOnly();
                  }}
                  className={`text-xs rounded-lg px-3 py-2 border transition-colors ${
                    targetFormat === preset.value
                      ? 'border-white bg-white text-indigo-700 font-semibold'
                      : 'border-white/40 bg-white/10 text-indigo-50 hover:bg-white/20'
                  }`}
                >
                  {preset.label}
                </button>
              ))}
            </div>
          </div>

          <div
            onDragOver={(e) => { e.preventDefault(); setIsDragging(true); }}
            onDragLeave={(e) => { e.preventDefault(); setIsDragging(false); }}
            onDrop={handleDrop}
            className={`rounded-2xl border-2 border-dashed p-6 text-center transition-all ${
              isDragging ? 'border-white bg-white/20' : 'border-white/40 bg-white/10'
            }`}
          >
            <input
              ref={inputRef}
              type="file"
              accept=".pdf,.docx,.xlsx,.pptx"
              onChange={handleFileChange}
              className="hidden"
            />
            <p className="text-sm text-indigo-100 mb-3">Drop one file here or choose manually</p>
            <button
              onClick={() => inputRef.current?.click()}
              className="px-4 py-2 bg-white text-indigo-700 rounded-lg font-semibold hover:bg-indigo-50"
            >
              {file ? 'Choose Another File' : 'Choose File'}
            </button>
            {file && <p className="text-xs text-indigo-100 mt-3 break-all">{file.name}</p>}
          </div>

          <div className="rounded-xl bg-white/10 border border-white/20 p-3">
            <p className="text-xs font-semibold text-indigo-50 mb-2">Capability Matrix</p>
            <div className="space-y-2">
              {capabilityRows.map((row) => (
                <div key={row.pair} className="text-xs">
                  <p className="font-semibold text-indigo-50">{row.pair} • {row.status}</p>
                  <p className="text-indigo-100/80">{row.note}</p>
                </div>
              ))}
            </div>
          </div>
        </div>

        <div className="w-full md:w-[64%] p-6 sm:p-8 space-y-6">
          <div>
            <h2 className="text-2xl sm:text-3xl font-black">Document Converter</h2>
            <p className="text-slate-300 mt-1 text-sm">Select one file and convert using a supported pair.</p>
          </div>

          <div className="space-y-2">
            <label className="block text-sm text-slate-300">Convert to</label>
            <select
              value={targetFormat}
              onChange={(e) => {
                setTargetFormat(e.target.value as DocumentTargetFormat);
                clearResultOnly();
              }}
              className="w-full rounded-xl bg-slate-800 border border-slate-600 px-3 py-2"
            >
              {TARGET_OPTIONS.map((opt) => (
                <option key={opt.value} value={opt.value}>{opt.label}</option>
              ))}
            </select>
          </div>

          {unsupportedReason && (
            <div className="rounded-xl bg-amber-500/10 border border-amber-400/30 p-4">
              <p className="text-amber-200 text-sm">{unsupportedReason}</p>
            </div>
          )}

          <div className="flex flex-wrap gap-3">
            <button
              onClick={onStart}
              disabled={!file || !!unsupportedReason || status.isProcessing}
              className="px-5 py-2 rounded-xl bg-indigo-600 hover:bg-indigo-500 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {status.isProcessing ? 'Converting...' : 'Start Conversion'}
            </button>
            <button onClick={resetState} className="px-5 py-2 rounded-xl bg-slate-700 hover:bg-slate-600">
              Reset
            </button>
          </div>

          {(status.isProcessing || status.currentStep || status.error) && (
            <div className="rounded-xl bg-slate-800/80 border border-slate-700 p-4">
              <div className="text-sm text-slate-300">{status.currentStep || 'Waiting...'}</div>
              <div className="w-full h-2 rounded bg-slate-700 mt-2 overflow-hidden">
                <div className="h-full bg-indigo-500" style={{ width: `${status.progress}%` }} />
              </div>
              {status.error && <p className="text-red-300 text-sm mt-3">{status.error}</p>}
            </div>
          )}

          {status.resultBlob && (
            <div className="rounded-xl bg-emerald-500/10 border border-emerald-400/30 p-4 space-y-3">
              <p className="text-emerald-200 font-semibold">Conversion complete</p>
              <p className="text-emerald-100 text-sm">{formatBytes(status.originalSize)} → {formatBytes(status.compressedSize)}</p>
              <div className="flex flex-wrap gap-3">
                <button onClick={onDownload} className="px-5 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-500">
                  Download Result
                </button>
                <button
                  onClick={() => {
                    resetState();
                    setTimeout(() => inputRef.current?.click(), 0);
                  }}
                  className="px-5 py-2 rounded-xl bg-slate-700 hover:bg-slate-600"
                >
                  Convert Another File
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default DocumentConverterTool;
