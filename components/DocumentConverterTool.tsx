import React, { useRef, useState } from 'react';
import { ProcessStatus } from '../types';
import { convertDocument, DocumentTargetFormat } from '../services/documentConversion';

const SOURCE_TYPES = [
  'application/pdf',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  'application/vnd.openxmlformats-officedocument.presentationml.presentation'
];

const targetOptions: { value: DocumentTargetFormat; label: string }[] = [
  { value: 'application/pdf', label: 'PDF' },
  { value: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document', label: 'DOCX (Word)' },
  { value: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', label: 'XLSX (Excel)' },
  { value: 'application/vnd.openxmlformats-officedocument.presentationml.presentation', label: 'PPTX (PowerPoint)' },
];

const DocumentConverterTool: React.FC = () => {
  const [file, setFile] = useState<File | null>(null);
  const [targetFormat, setTargetFormat] = useState<DocumentTargetFormat>('application/pdf');
  const [status, setStatus] = useState<ProcessStatus>({ isProcessing: false, currentStep: '', progress: 0 });
  const inputRef = useRef<HTMLInputElement>(null);

  const reset = () => {
    setFile(null);
    setStatus({ isProcessing: false, currentStep: '', progress: 0 });
  };

  const onSelectFile = (selected: File | undefined) => {
    if (!selected) return;

    if (!SOURCE_TYPES.includes(selected.type)) {
      setStatus(prev => ({ ...prev, error: 'Unsupported file. Use PDF, DOCX, XLSX or PPTX.' }));
      return;
    }

    setFile(selected);
    setStatus({ isProcessing: false, currentStep: '', progress: 0, error: undefined });
  };

  const onStart = async () => {
    if (!file) return;

    setStatus({ isProcessing: true, currentStep: 'Preparing...', progress: 5, error: undefined });

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
      setStatus(prev => ({
        ...prev,
        isProcessing: false,
        error: error?.message || 'Conversion failed.'
      }));
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
    <div className="max-w-4xl mx-auto animate-fade-in pb-12 px-4 sm:px-6">
      <div className="bg-[#0f172a] text-white rounded-[2rem] shadow-2xl overflow-hidden p-6 sm:p-8 space-y-6">
        <div>
          <h2 className="text-2xl sm:text-3xl font-black">Office ↔ PDF Converter</h2>
          <p className="text-slate-300 mt-2 text-sm sm:text-base">
            Converts between PDF and Word/Excel/PowerPoint using in-browser text extraction.
          </p>
        </div>

        <div className="space-y-4">
          <input
            ref={inputRef}
            type="file"
            accept=".pdf,.docx,.xlsx,.pptx"
            onChange={(e) => onSelectFile(e.target.files?.[0])}
            className="hidden"
          />

          <button
            onClick={() => inputRef.current?.click()}
            className="w-full rounded-xl border border-indigo-400/30 bg-indigo-500/10 hover:bg-indigo-500/20 transition-colors px-4 py-3 text-left"
          >
            {file ? `Selected: ${file.name}` : 'Choose a file (PDF, DOCX, XLSX, PPTX)'}
          </button>

          <label className="block text-sm text-slate-300">Convert to</label>
          <select
            value={targetFormat}
            onChange={(e) => setTargetFormat(e.target.value as DocumentTargetFormat)}
            className="w-full rounded-xl bg-slate-800 border border-slate-600 px-3 py-2"
          >
            {targetOptions.map((opt) => (
              <option key={opt.value} value={opt.value}>{opt.label}</option>
            ))}
          </select>

          <div className="flex flex-wrap gap-3">
            <button
              onClick={onStart}
              disabled={!file || status.isProcessing}
              className="px-5 py-2 rounded-xl bg-indigo-600 hover:bg-indigo-500 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {status.isProcessing ? 'Converting...' : 'Start Conversion'}
            </button>
            <button
              onClick={reset}
              className="px-5 py-2 rounded-xl bg-slate-700 hover:bg-slate-600"
            >
              Reset
            </button>
          </div>
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
            <p className="text-emerald-200 font-semibold">Conversion complete.</p>
            <button onClick={onDownload} className="px-5 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-500">
              Download Result
            </button>
          </div>
        )}
      </div>
    </div>
  );
};

export default DocumentConverterTool;
