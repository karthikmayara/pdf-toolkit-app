import React, { useMemo, useRef, useState } from 'react';
import { ProcessStatus } from '../types';
import {
  convertDocument,
  DocumentTargetFormat,
  FORMAT_PRESETS,
  getCapabilityRows,
  getUnsupportedPairReason,
} from '../services/documentConversion';

interface QueueItem {
  id: string;
  file: File;
  status: 'idle' | 'processing' | 'done' | 'error';
  progress: number;
  step: string;
  targetFormat: DocumentTargetFormat;
  error?: string;
  resultBlob?: Blob;
  resultFileName?: string;
}

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

const createQueueItem = (file: File, targetFormat: DocumentTargetFormat): QueueItem => ({
  id: `${Date.now()}_${Math.random().toString(36).slice(2, 10)}`,
  file,
  status: 'idle',
  progress: 0,
  step: 'Ready',
  targetFormat,
});

const DocumentConverterTool: React.FC = () => {
  const [queue, setQueue] = useState<QueueItem[]>([]);
  const [targetFormat, setTargetFormat] = useState<DocumentTargetFormat>('application/pdf');
  const [status, setStatus] = useState<ProcessStatus>({ isProcessing: false, currentStep: '', progress: 0 });
  const [isDragging, setIsDragging] = useState(false);
  const [toolError, setToolError] = useState<string | undefined>(undefined);
  const inputRef = useRef<HTMLInputElement>(null);

  const capabilityRows = useMemo(() => getCapabilityRows(), []);
  const pendingCount = queue.filter((item) => item.status === 'idle' || item.status === 'error').length;

  const addFilesToQueue = (files: File[]) => {
    const valid: File[] = [];
    const invalid: string[] = [];

    files.forEach((file) => {
      if (SOURCE_TYPES.includes(file.type)) valid.push(file);
      else invalid.push(file.name);
    });

    if (invalid.length) {
      setToolError(`Unsupported files skipped: ${invalid.join(', ')}`);
    } else {
      setToolError(undefined);
    }

    if (valid.length) {
      const next = valid.map((file) => createQueueItem(file, targetFormat));
      setQueue((prev) => [...prev, ...next]);
    }
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files ? Array.from(e.target.files) : [];
    addFilesToQueue(files);
    if (e.target) e.target.value = '';
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
    addFilesToQueue(Array.from(e.dataTransfer.files || []));
  };

  const updateItem = (id: string, patch: Partial<QueueItem>) => {
    setQueue((prev) => prev.map((item) => (item.id === id ? { ...item, ...patch } : item)));
  };

  const runSingle = async (item: QueueItem) => {
    const unsupported = getUnsupportedPairReason(item.file.type, item.targetFormat);
    if (unsupported) {
      updateItem(item.id, { status: 'error', error: unsupported, progress: 0, step: 'Unsupported pair' });
      return;
    }

    updateItem(item.id, { status: 'processing', error: undefined, progress: 0, step: 'Starting...' });

    try {
      const { blob, filename } = await convertDocument(
        { file: item.file, targetFormat: item.targetFormat },
        (progress, step) => updateItem(item.id, { progress, step })
      );

      updateItem(item.id, {
        status: 'done',
        progress: 100,
        step: 'Completed',
        resultBlob: blob,
        resultFileName: filename,
      });
    } catch (error: any) {
      updateItem(item.id, {
        status: 'error',
        progress: 0,
        step: 'Failed',
        error: error?.message || 'Conversion failed.',
      });
    }
  };

  const runQueue = async () => {
    const toProcess = queue.filter((item) => item.status === 'idle' || item.status === 'error');
    if (!toProcess.length) return;

    setStatus({ isProcessing: true, currentStep: 'Starting queue...', progress: 0 });

    for (let i = 0; i < toProcess.length; i++) {
      const item = toProcess[i];
      setStatus({ isProcessing: true, currentStep: `Processing ${item.file.name}`, progress: Math.round((i / toProcess.length) * 100) });
      // eslint-disable-next-line no-await-in-loop
      await runSingle(item);
    }

    setStatus({ isProcessing: false, currentStep: 'Queue completed', progress: 100 });
  };

  const retryItem = async (id: string) => {
    const item = queue.find((x) => x.id === id);
    if (!item || status.isProcessing) return;
    await runSingle(item);
  };

  const removeItem = (id: string) => {
    setQueue((prev) => prev.filter((item) => item.id !== id));
  };

  const resetAll = () => {
    setQueue([]);
    setStatus({ isProcessing: false, currentStep: '', progress: 0, error: undefined });
    setToolError(undefined);
    if (inputRef.current) inputRef.current.value = '';
  };

  const downloadItem = (item: QueueItem) => {
    if (!item.resultBlob || !item.resultFileName) return;
    const url = URL.createObjectURL(item.resultBlob);
    const a = document.createElement('a');
    a.href = url;
    a.download = item.resultFileName;
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
            <p className="text-indigo-100 mt-2 text-sm">Batch conversion, preset targets, and clear compatibility guidance.</p>
          </div>

          <div className="space-y-2">
            <p className="text-xs uppercase tracking-wider text-indigo-100/80">Quick presets</p>
            <div className="grid grid-cols-2 gap-2">
              {FORMAT_PRESETS.map((preset) => (
                <button
                  key={preset.value}
                  onClick={() => setTargetFormat(preset.value)}
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
              multiple
              accept=".pdf,.docx,.xlsx,.pptx"
              onChange={handleFileChange}
              className="hidden"
            />
            <p className="text-sm text-indigo-100 mb-3">Drop files here or choose manually</p>
            <button
              onClick={() => inputRef.current?.click()}
              className="px-4 py-2 bg-white text-indigo-700 rounded-lg font-semibold hover:bg-indigo-50"
            >
              Add Files
            </button>
            <p className="text-xs text-indigo-100/90 mt-3">{queue.length} file(s) in queue</p>
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
            <p className="text-slate-300 mt-1 text-sm">Set a target, add multiple files, then run queue conversion.</p>
          </div>

          <div className="space-y-2">
            <label className="block text-sm text-slate-300">Default target format for newly added files</label>
            <select
              value={targetFormat}
              onChange={(e) => setTargetFormat(e.target.value as DocumentTargetFormat)}
              className="w-full rounded-xl bg-slate-800 border border-slate-600 px-3 py-2"
            >
              {TARGET_OPTIONS.map((opt) => (
                <option key={opt.value} value={opt.value}>{opt.label}</option>
              ))}
            </select>
          </div>

          <div className="flex flex-wrap gap-3">
            <button
              onClick={runQueue}
              disabled={!pendingCount || status.isProcessing}
              className="px-5 py-2 rounded-xl bg-indigo-600 hover:bg-indigo-500 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {status.isProcessing ? 'Processing...' : `Start Queue (${pendingCount})`}
            </button>
            <button onClick={resetAll} className="px-5 py-2 rounded-xl bg-slate-700 hover:bg-slate-600">Reset All</button>
          </div>

          {(status.currentStep || toolError) && (
            <div className="rounded-xl bg-slate-800/80 border border-slate-700 p-4">
              {status.currentStep && <div className="text-sm text-slate-300">{status.currentStep}</div>}
              <div className="w-full h-2 rounded bg-slate-700 mt-2 overflow-hidden">
                <div className="h-full bg-indigo-500" style={{ width: `${status.progress}%` }} />
              </div>
              {toolError && <p className="text-amber-300 text-sm mt-3">{toolError}</p>}
            </div>
          )}

          <div className="space-y-3">
            {queue.length === 0 && (
              <div className="rounded-xl border border-slate-700 bg-slate-900/40 p-4 text-sm text-slate-300">
                No files in queue yet. Add files from the left panel.
              </div>
            )}

            {queue.map((item) => {
              const pairReason = getUnsupportedPairReason(item.file.type, item.targetFormat);
              return (
                <div key={item.id} className="rounded-xl border border-slate-700 bg-slate-900/50 p-4">
                  <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-2">
                    <div>
                      <p className="font-semibold text-slate-100 break-all">{item.file.name}</p>
                      <p className="text-xs text-slate-400">Target: {TARGET_OPTIONS.find((x) => x.value === item.targetFormat)?.label} • {formatBytes(item.file.size)}</p>
                    </div>
                    <div className="text-xs px-2 py-1 rounded bg-slate-800 border border-slate-600 w-fit">{item.status.toUpperCase()}</div>
                  </div>

                  {pairReason && <p className="text-amber-300 text-xs mt-2">{pairReason}</p>}
                  {item.step && <p className="text-slate-300 text-xs mt-2">{item.step}</p>}

                  <div className="w-full h-2 rounded bg-slate-700 mt-2 overflow-hidden">
                    <div className={`h-full ${item.status === 'error' ? 'bg-red-500' : 'bg-indigo-500'}`} style={{ width: `${item.progress}%` }} />
                  </div>

                  {item.error && <p className="text-red-300 text-xs mt-2">{item.error}</p>}

                  <div className="flex flex-wrap gap-2 mt-3">
                    {item.status === 'done' && (
                      <button onClick={() => downloadItem(item)} className="px-3 py-1.5 rounded-lg text-sm bg-emerald-600 hover:bg-emerald-500">
                        Download
                      </button>
                    )}
                    {item.status === 'error' && (
                      <button onClick={() => retryItem(item.id)} className="px-3 py-1.5 rounded-lg text-sm bg-indigo-600 hover:bg-indigo-500">
                        Retry
                      </button>
                    )}
                    <button onClick={() => removeItem(item.id)} className="px-3 py-1.5 rounded-lg text-sm bg-slate-700 hover:bg-slate-600">
                      Remove
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </div>
    </div>
  );
};

export default DocumentConverterTool;
