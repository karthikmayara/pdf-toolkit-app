
import React, { useState, useRef, useEffect, useMemo } from 'react';
import { ProcessStatus, WatermarkSettings } from '../types';
import { watermarkImage, watermarkPDF } from '../services/watermarkService';
import { renderPdfPage, getPdfPageCount } from '../services/pdfSignature';

const WatermarkTool: React.FC = () => {
  const [file, setFile] = useState<File | null>(null);
  const [status, setStatus] = useState<ProcessStatus>({ isProcessing: false, currentStep: '', progress: 0 });
  const [numPages, setNumPages] = useState(0);
  const [previewPage, setPreviewPage] = useState(0);
  const [activeTab, setActiveTab] = useState<'content' | 'style' | 'position' | 'pages'>('content');
  
  // Optimization: Store base image bitmap to avoid re-rendering PDF on every setting change
  const [baseImage, setBaseImage] = useState<ImageBitmap | null>(null);
  const [isRenderingBase, setIsRenderingBase] = useState(false);

  // Settings
  const [settings, setSettings] = useState<WatermarkSettings>({
    text: 'MAIK',
    color: '#FF0000',
    fontSize: 60,
    opacity: 0.3,
    rotation: -45,
    position: 'center',
    fontFamily: 'Montserrat',
    isBold: true,
    isItalic: false,
    pageSelectMode: 'all',
    pageRange: ''
  });

  const fileInputRef = useRef<HTMLInputElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const resultsRef = useRef<HTMLDivElement>(null);

  // Auto-scroll to results
  useEffect(() => {
    if (status.resultBlob && resultsRef.current) {
        setTimeout(() => {
            resultsRef.current?.scrollIntoView({ behavior: 'smooth' });
        }, 100);
    }
  }, [status.resultBlob]);

  // Constants
  const fonts = [
      { name: 'Montserrat', label: 'Modern Sans' },
      { name: 'Playfair Display', label: 'Classic Serif' },
      { name: 'Permanent Marker', label: 'Marker Bold' },
      { name: 'Dancing Script', label: 'Elegant Cursive' },
      { name: 'Courier Prime', label: 'Typewriter' },
      { name: 'Arial', label: 'System Arial' },
      { name: 'Times New Roman', label: 'System Times' },
  ];

  const colorPresets = ['#FF0000', '#000000', '#FFFFFF', '#0000FF', '#008000', '#808080'];

  const positions: WatermarkSettings['position'][] = [
      'top-left', 'top-center', 'top-right',
      'middle-left', 'center', 'middle-right',
      'bottom-left', 'bottom-center', 'bottom-right'
  ];

  // 1. Load File Info
  useEffect(() => {
    if (file && file.type === 'application/pdf') {
        getPdfPageCount(file).then(count => {
            setNumPages(count);
            setPreviewPage(0);
        }).catch(err => console.error(err));
    } else {
        setNumPages(1);
        setPreviewPage(0);
    }
  }, [file]);

  // 2. Render Base Image (Expensive Operation) - Triggers only on File/Page change
  useEffect(() => {
      if (!file) {
          setBaseImage(null);
          return;
      }

      let active = true;
      const loadBase = async () => {
          setIsRenderingBase(true);
          try {
              let bitmap: ImageBitmap;
              if (file.type === 'application/pdf') {
                   const rendered = await renderPdfPage(file, previewPage);
                   bitmap = await createImageBitmap(rendered.blob);
              } else {
                   bitmap = await createImageBitmap(file);
              }
              if (active) setBaseImage(bitmap);
          } catch (e) {
              console.error("Failed to load base image", e);
          }
          if (active) setIsRenderingBase(false);
      };

      loadBase();
      return () => { active = false; };
  }, [file, previewPage]);

  // 3. Draw Canvas (Cheap Operation) - Triggers on Settings change or Base Image load
  useEffect(() => {
      if (!baseImage || !canvasRef.current) return;
      
      let animationFrameId: number;

      const render = () => {
          const canvas = canvasRef.current;
          const ctx = canvas?.getContext('2d');
          if (!ctx || !baseImage) return;

          // Smart Scale for preview canvas
          const MAX_PREVIEW_DIM = 1200;
          let scale = 1;
          if (baseImage.width > MAX_PREVIEW_DIM || baseImage.height > MAX_PREVIEW_DIM) {
              scale = Math.min(MAX_PREVIEW_DIM / baseImage.width, MAX_PREVIEW_DIM / baseImage.height);
          }

          if (canvas.width !== baseImage.width * scale) {
              canvas.width = baseImage.width * scale;
              canvas.height = baseImage.height * scale;
          }

          // Draw Base
          ctx.drawImage(baseImage, 0, 0, canvas.width, canvas.height);

          // Draw Watermark Overlay
          drawWatermarkOverlay(ctx, canvas.width, canvas.height, scale);
      };

      animationFrameId = requestAnimationFrame(render);
      return () => cancelAnimationFrame(animationFrameId);

  }, [baseImage, settings]);

  const drawWatermarkOverlay = (ctx: CanvasRenderingContext2D, width: number, height: number, scale: number) => {
      const relativeScale = width / 1000;
      const fontSize = settings.fontSize * 2 * relativeScale; 

      const fontStyle = `${settings.isItalic ? 'italic' : ''} ${settings.isBold ? 'bold' : ''} ${fontSize}px "${settings.fontFamily}"`.trim();
      
      ctx.font = fontStyle;
      
      const drawText = (x: number, y: number, rot: number) => {
         ctx.save();
         ctx.translate(x, y);
         ctx.rotate((rot * Math.PI) / 180);
         ctx.fillStyle = settings.color;
         ctx.globalAlpha = settings.opacity;
         ctx.textAlign = 'center';
         ctx.textBaseline = 'middle';
         ctx.fillText(settings.text, 0, 0);
         ctx.restore();
      };

      // Positioning Logic
      const cX = width / 2; 
      const cY = height / 2;

      let positionsArr: {x: number, y: number}[] = [];

      if (settings.position === 'tiled') {
          const cols = 3; const rows = 4;
          const xGap = width / cols;
          const yGap = height / rows;
          
          for(let r=0; r < rows; r++) {
                for(let c=0; c < cols; c++) {
                    const offsetX = (r % 2 === 0) ? 0 : xGap/2;
                    positionsArr.push({
                        x: (c * xGap) + (xGap/2) + offsetX - (r%2!==0 && c===cols-1 ? width : 0),
                        y: (r * yGap) + (yGap/2)
                    });
                }
          }
      } else {
          let x = cX, y = cY;
          if (settings.position.includes('left')) x = width * 0.15;
          if (settings.position.includes('center') || settings.position === 'top-center' || settings.position === 'bottom-center') x = width * 0.5;
          if (settings.position.includes('right')) x = width * 0.85;

          if (settings.position.includes('top')) y = height * 0.15;
          if (settings.position.includes('middle') || settings.position === 'center') y = height * 0.5;
          if (settings.position.includes('bottom')) y = height * 0.85;

          positionsArr.push({x, y});
      }
      
      if (file && file.type === 'application/pdf' && settings.pageSelectMode !== 'all') {
          const p = previewPage + 1;
          if (settings.pageSelectMode === 'odd' && p % 2 === 0) positionsArr = [];
          if (settings.pageSelectMode === 'even' && p % 2 !== 0) positionsArr = [];
      }

      positionsArr.forEach(p => drawText(p.x, p.y, settings.rotation));
  };


  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
      setFile(e.target.files[0]);
      setStatus({ isProcessing: false, currentStep: '', progress: 0, resultBlob: undefined });
    }
    if (e.target) e.target.value = '';
  };

  const resetState = () => {
      setFile(null);
      setBaseImage(null);
      setNumPages(0);
      setStatus({ isProcessing: false, currentStep: '', progress: 0 });
  };

  const handleStart = async () => {
    if (!file) return;

    setStatus({ 
        isProcessing: true, 
        currentStep: 'Initializing...', 
        progress: 0,
    });

    try {
      let resultBlob: Blob;
      let filename = file.name;

      if (file.type === 'application/pdf') {
          resultBlob = await watermarkPDF(file, settings, (p, s) => setStatus(st => ({...st, progress: p, currentStep: s})));
          filename = `watermarked_${file.name}`;
      } else {
          const res = await watermarkImage(file, settings, (p, s) => setStatus(st => ({...st, progress: p, currentStep: s})));
          resultBlob = res.blob;
          filename = res.filename;
      }

      setStatus({
        isProcessing: false,
        currentStep: 'Completed!',
        progress: 100,
        resultBlob,
        resultFileName: filename
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

  return (
    <div className="max-w-7xl mx-auto animate-fade-in pb-12 px-4 sm:px-6">
      
      {/* Main Container */}
      <div className="bg-[#0f172a] text-white rounded-[2rem] shadow-2xl overflow-hidden min-h-[600px] flex flex-col md:flex-row relative">
        
        {/* Close/Reset Button */}
        {file && !status.isProcessing && (
            <button 
                onClick={resetState}
                className="absolute top-4 right-4 z-50 w-10 h-10 bg-white/10 hover:bg-white/20 rounded-full flex items-center justify-center backdrop-blur-md transition-all"
                title="Close / Reset"
            >
                <svg className="w-5 h-5 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M6 18L18 6M6 6l12 12"></path></svg>
            </button>
        )}

        {/* LEFT COLUMN: PREVIEW STAGE */}
        <div 
            className={`
                relative md:w-7/12 min-h-[400px] md:min-h-full transition-all duration-500 overflow-hidden flex flex-col
                ${!file ? 'bg-gradient-to-br from-indigo-900 to-[#0f172a] items-center justify-center' : 'bg-black/30'}
            `}
        >
            {!file ? (
                <div 
                    onClick={() => fileInputRef.current?.click()}
                    className="text-center p-8 cursor-pointer transition-transform duration-300 hover:scale-105"
                >
                    <div className="w-32 h-32 bg-indigo-500/20 rounded-full flex items-center justify-center mx-auto mb-6 backdrop-blur-sm border border-indigo-500/30">
                        <svg className="w-12 h-12 text-indigo-400" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z"></path></svg>
                    </div>
                    <h3 className="text-2xl font-bold tracking-tight mb-2">Upload to Watermark</h3>
                    <p className="text-indigo-200/60 text-sm font-medium uppercase tracking-widest">PDF or Image</p>
                </div>
            ) : (
                <>
                    {/* Canvas Container */}
                    <div className="flex-1 overflow-hidden relative flex items-center justify-center p-8">
                        <div className="relative shadow-2xl transition-all duration-300 max-w-full max-h-full">
                             {/* Transparent Checkerboard Background */}
                             <div className="absolute inset-0 bg-[url('data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAABAAAAAQCAYAAAAf8/9hAAAAMUlEQVQ4T2NkYGAQYcAP3uCTZhw1gGGYhAGBZIA/nYDCgBDAm9BGDWAAJyRCgLaBCAAgXwixzAS0pgAAAABJRU5ErkJggg==')] opacity-10"></div>
                             
                             <canvas ref={canvasRef} className="max-w-full max-h-[70vh] block relative z-10 rounded shadow-lg" />
                             
                             {/* Loading Overlay */}
                             {isRenderingBase && (
                                 <div className="absolute inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center flex-col text-white gap-3 z-20">
                                     <div className="w-8 h-8 border-4 border-indigo-500 border-t-transparent rounded-full animate-spin"></div>
                                     <span className="text-[10px] uppercase font-bold tracking-widest">Rendering...</span>
                                 </div>
                             )}
                        </div>
                    </div>

                    {/* Navigation Bar (PDF Only) */}
                    {file.type === 'application/pdf' && (
                        <div className="absolute bottom-6 left-1/2 -translate-x-1/2 bg-[#0f172a]/90 backdrop-blur-md border border-white/10 px-6 py-3 rounded-full flex items-center gap-6 shadow-xl z-30">
                            <button 
                               onClick={() => setPreviewPage(Math.max(0, previewPage - 1))}
                               disabled={previewPage === 0 || isRenderingBase}
                               className="hover:text-indigo-400 disabled:opacity-30 transition-colors"
                            >
                               ◀
                            </button>
                            <span className="font-mono text-xs font-bold text-slate-200">
                                PAGE {previewPage + 1} / {numPages}
                            </span>
                            <button 
                               onClick={() => setPreviewPage(Math.min(numPages - 1, previewPage + 1))}
                               disabled={previewPage === numPages - 1 || isRenderingBase}
                               className="hover:text-indigo-400 disabled:opacity-30 transition-colors"
                            >
                               ▶
                            </button>
                        </div>
                    )}
                </>
            )}
        </div>

        {/* RIGHT COLUMN: CONTROLS */}
        <div className="md:w-5/12 p-8 md:p-10 flex flex-col relative bg-[#0f172a] z-10 border-t md:border-t-0 md:border-l border-white/5">
            
            {/* Header */}
            <div className="mb-8">
                <div className="flex items-center gap-3 mb-2 text-indigo-400 font-bold text-xs tracking-[0.2em] uppercase">
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z"></path></svg>
                    Protect & Brand
                </div>
                <h2 className="text-4xl md:text-5xl font-black text-white leading-[0.9] tracking-tighter">
                    WATERMARK
                </h2>
            </div>

            {!status.resultBlob ? (
                <div className={`flex-1 flex flex-col min-h-0 ${status.isProcessing ? 'opacity-50 pointer-events-none' : ''}`}>
                    
                    {file && (
                        <>
                            {/* Tabs */}
                            <div className="flex border-b border-white/10 mb-6 shrink-0">
                                {['content', 'style', 'position', 'pages'].map((tab) => (
                                    <button
                                        key={tab}
                                        onClick={() => setActiveTab(tab as any)}
                                        disabled={!file && tab !== 'content'}
                                        className={`flex-1 py-3 text-[10px] font-bold uppercase tracking-widest transition-all relative
                                            ${activeTab === tab 
                                                ? 'text-indigo-400' 
                                                : 'text-slate-500 hover:text-slate-300'}
                                        `}
                                    >
                                        {tab}
                                        {activeTab === tab && <div className="absolute bottom-0 left-0 right-0 h-0.5 bg-indigo-500 shadow-[0_0_10px_rgba(99,102,241,0.5)]"></div>}
                                    </button>
                                ))}
                            </div>

                            {/* Scrollable Content Area */}
                            <div className="flex-1 overflow-y-auto custom-scrollbar pr-2 mb-6">
                                
                                {/* CONTENT TAB */}
                                {activeTab === 'content' && (
                                    <div className="space-y-5 animate-fade-in">
                                        <div>
                                            <label className="text-[10px] font-bold uppercase text-slate-500 mb-2 block tracking-wider">Text</label>
                                            <input 
                                                type="text"
                                                value={settings.text}
                                                onChange={(e) => setSettings(s => ({...s, text: e.target.value}))}
                                                className="w-full bg-[#1e293b] border border-white/10 rounded-xl p-3 text-white font-bold focus:outline-none focus:border-indigo-500 transition-colors"
                                                placeholder="e.g. CONFIDENTIAL"
                                            />
                                        </div>

                                        <div>
                                            <label className="text-[10px] font-bold uppercase text-slate-500 mb-2 block tracking-wider">Color</label>
                                            <div className="flex flex-wrap gap-3">
                                                {colorPresets.map(c => (
                                                    <button 
                                                        key={c}
                                                        onClick={() => setSettings(s => ({...s, color: c}))}
                                                        className={`w-8 h-8 rounded-full border-2 transition-transform ${settings.color === c ? 'border-indigo-500 scale-110' : 'border-transparent hover:scale-110'}`}
                                                        style={{ backgroundColor: c }}
                                                    />
                                                ))}
                                                <label className="w-8 h-8 rounded-full bg-gradient-to-br from-pink-500 via-purple-500 to-indigo-500 flex items-center justify-center cursor-pointer border-2 border-transparent hover:border-white transition-all">
                                                    <input 
                                                        type="color" 
                                                        value={settings.color}
                                                        onChange={(e) => setSettings(s => ({...s, color: e.target.value}))}
                                                        className="opacity-0 absolute inset-0 w-full h-full cursor-pointer"
                                                    />
                                                </label>
                                            </div>
                                        </div>

                                        <div>
                                            <label className="text-[10px] font-bold uppercase text-slate-500 mb-2 block tracking-wider">Typography</label>
                                            <select 
                                                value={settings.fontFamily}
                                                onChange={(e) => setSettings(s => ({...s, fontFamily: e.target.value}))}
                                                className="w-full bg-[#1e293b] border border-white/10 rounded-xl p-3 text-xs font-bold text-white focus:outline-none focus:border-indigo-500 cursor-pointer mb-3"
                                            >
                                                {fonts.map(f => <option key={f.name} value={f.name}>{f.label}</option>)}
                                            </select>
                                            <div className="flex gap-2">
                                                <button 
                                                    onClick={() => setSettings(s => ({...s, isBold: !s.isBold}))} 
                                                    className={`flex-1 py-2 rounded-lg text-xs font-bold uppercase tracking-wider border transition-all ${settings.isBold ? 'bg-indigo-500/20 border-indigo-500 text-indigo-400' : 'bg-[#1e293b] border-white/10 text-slate-500 hover:text-white'}`}
                                                >
                                                    Bold
                                                </button>
                                                <button 
                                                    onClick={() => setSettings(s => ({...s, isItalic: !s.isItalic}))} 
                                                    className={`flex-1 py-2 rounded-lg text-xs font-bold uppercase tracking-wider border transition-all ${settings.isItalic ? 'bg-indigo-500/20 border-indigo-500 text-indigo-400' : 'bg-[#1e293b] border-white/10 text-slate-500 hover:text-white'}`}
                                                >
                                                    Italic
                                                </button>
                                            </div>
                                        </div>
                                    </div>
                                )}

                                {/* STYLE TAB */}
                                {activeTab === 'style' && (
                                    <div className="space-y-6 animate-fade-in">
                                        {[
                                            { label: 'Opacity', key: 'opacity', min: 0.1, max: 1, step: 0.1, valDisplay: Math.round(settings.opacity * 100) + '%' },
                                            { label: 'Size', key: 'fontSize', min: 20, max: 200, step: 5, valDisplay: settings.fontSize + 'px' },
                                            { label: 'Rotation', key: 'rotation', min: -180, max: 180, step: 5, valDisplay: settings.rotation + '°' }
                                        ].map((ctrl: any) => (
                                            <div key={ctrl.key}>
                                                <div className="flex justify-between text-[10px] font-bold uppercase text-slate-500 mb-2 tracking-wider">
                                                    <span>{ctrl.label}</span>
                                                    <span className="text-indigo-400">{ctrl.valDisplay}</span>
                                                </div>
                                                <input 
                                                    type="range" 
                                                    min={ctrl.min} max={ctrl.max} step={ctrl.step} 
                                                    value={settings[ctrl.key as keyof WatermarkSettings] as number}
                                                    onChange={(e) => setSettings(s => ({...s, [ctrl.key]: Number(e.target.value)}))}
                                                    className="w-full h-1.5 bg-[#1e293b] rounded-full appearance-none cursor-pointer accent-indigo-500 hover:accent-indigo-400"
                                                />
                                            </div>
                                        ))}
                                    </div>
                                )}

                                {/* POSITION TAB */}
                                {activeTab === 'position' && (
                                    <div className="space-y-6 animate-fade-in">
                                        <div className="flex items-center justify-between bg-[#1e293b] p-3 rounded-xl border border-white/10">
                                            <div className="flex items-center gap-3">
                                                <span className="text-xl">🧱</span>
                                                <div>
                                                    <div className="text-xs font-bold text-white">Tiled Pattern</div>
                                                    <div className="text-[10px] text-slate-500">Repeat across page</div>
                                                </div>
                                            </div>
                                            <label className="relative inline-flex items-center cursor-pointer">
                                                <input type="checkbox" checked={settings.position === 'tiled'} onChange={() => setSettings(s => ({...s, position: s.position === 'tiled' ? 'center' : 'tiled'}))} className="sr-only peer" />
                                                <div className="w-9 h-5 bg-slate-700 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-4 after:w-4 after:transition-all peer-checked:bg-indigo-500"></div>
                                            </label>
                                        </div>

                                        <div className={`transition-opacity duration-300 ${settings.position === 'tiled' ? 'opacity-30 pointer-events-none' : 'opacity-100'}`}>
                                            <label className="text-[10px] font-bold uppercase text-slate-500 mb-3 block tracking-wider text-center">Alignment</label>
                                            <div className="bg-[#1e293b] rounded-xl p-4 max-w-[200px] mx-auto border border-white/10">
                                                <div className="grid grid-cols-3 gap-2">
                                                    {positions.map(pos => (
                                                        <button
                                                            key={pos}
                                                            onClick={() => setSettings(s => ({...s, position: pos}))}
                                                            className={`aspect-square rounded-lg border-2 transition-all flex items-center justify-center ${settings.position === pos ? 'bg-indigo-500 border-indigo-400 shadow-[0_0_10px_rgba(99,102,241,0.5)]' : 'bg-transparent border-white/10 hover:border-white/30'}`}
                                                        >
                                                            <div className={`w-1.5 h-1.5 rounded-full ${settings.position === pos ? 'bg-white' : 'bg-slate-500'}`} />
                                                        </button>
                                                    ))}
                                                </div>
                                            </div>
                                        </div>
                                    </div>
                                )}

                                {/* PAGES TAB */}
                                {activeTab === 'pages' && (
                                    <div className="space-y-6 animate-fade-in">
                                        {file.type === 'application/pdf' ? (
                                            <>
                                                <div>
                                                    <label className="text-[10px] font-bold uppercase text-slate-500 mb-2 block tracking-wider">Apply To</label>
                                                    <div className="grid grid-cols-2 gap-2">
                                                        {(['all', 'odd', 'even', 'custom'] as const).map(mode => (
                                                            <button
                                                                key={mode}
                                                                onClick={() => setSettings(s => ({...s, pageSelectMode: mode}))}
                                                                className={`py-3 text-[10px] font-bold uppercase tracking-wider rounded-lg border transition-all ${settings.pageSelectMode === mode ? 'bg-indigo-500/20 border-indigo-500 text-white' : 'bg-[#1e293b] border-white/10 text-slate-500 hover:text-white'}`}
                                                            >
                                                                {mode}
                                                            </button>
                                                        ))}
                                                    </div>
                                                </div>
                                                
                                                {settings.pageSelectMode === 'custom' && (
                                                    <div className="animate-fade-in">
                                                        <label className="text-[10px] font-bold uppercase text-slate-500 mb-2 block tracking-wider">Page Range</label>
                                                        <input 
                                                            type="text"
                                                            value={settings.pageRange}
                                                            onChange={(e) => setSettings(s => ({...s, pageRange: e.target.value}))}
                                                            className="w-full bg-[#1e293b] border border-white/10 rounded-xl p-3 text-sm text-white font-mono placeholder:text-slate-600 focus:outline-none focus:border-indigo-500"
                                                            placeholder="e.g. 1-5, 8, 12"
                                                        />
                                                    </div>
                                                )}
                                            </>
                                        ) : (
                                            <div className="bg-[#1e293b] p-6 rounded-xl border border-white/10 text-center">
                                                <p className="text-xs text-slate-400">Page selection is not applicable for single images.</p>
                                            </div>
                                        )}
                                    </div>
                                )}
                            </div>

                            {/* Processing Bar */}
                            {status.isProcessing && (
                                <div className="space-y-2 mb-4">
                                    <div className="flex justify-between text-[10px] font-bold uppercase text-indigo-300 tracking-wider">
                                        <span className="animate-pulse">{status.currentStep}</span>
                                        <span>{status.progress}%</span>
                                    </div>
                                    <div className="h-1 bg-slate-800 rounded-full overflow-hidden">
                                        <div className="h-full bg-indigo-500 transition-all duration-300" style={{ width: `${status.progress}%` }}></div>
                                    </div>
                                </div>
                            )}

                            {/* Error */}
                            {status.error && (
                                <p className="text-red-400 text-xs font-bold mb-4 bg-red-500/10 p-3 rounded-lg border border-red-500/20">{status.error}</p>
                            )}

                            {/* Action Button */}
                            {!status.isProcessing && (
                                <button 
                                    onClick={handleStart}
                                    className="w-full py-4 bg-gradient-to-r from-indigo-600 to-indigo-500 hover:from-indigo-500 hover:to-indigo-400 text-white rounded-xl font-bold uppercase tracking-widest text-xs transition-all shadow-lg shadow-indigo-900/20 flex items-center justify-center gap-2 group"
                                >
                                    <span>Apply Watermark</span>
                                    <svg className="w-4 h-4 transition-transform group-hover:translate-x-1" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M13 10V3L4 14h7v7l9-11h-7z"></path></svg>
                                </button>
                            )}
                        </>
                    )}
                </div>
            ) : (
                /* RESULT VIEW */
                <div ref={resultsRef} className="flex flex-col h-full animate-fade-in space-y-6">
                    <div className="flex-1 bg-[#1e293b] rounded-xl p-6 border border-white/5 flex flex-col justify-center items-center text-center">
                        <div className="w-20 h-20 bg-green-500/10 rounded-full flex items-center justify-center mb-4 border border-green-500/20">
                            <svg className="w-10 h-10 text-green-400" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z"></path></svg>
                        </div>
                        <h3 className="text-xl font-bold text-white mb-1">Success!</h3>
                        <p className="text-slate-400 text-xs">Watermark applied successfully.</p>
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
                            onClick={() => setStatus({isProcessing:false, currentStep:'', progress:0})}
                            className="px-6 py-4 bg-transparent border border-slate-700 text-white rounded-xl font-bold uppercase tracking-widest text-xs hover:border-white transition-colors"
                        >
                            Back
                        </button>
                    </div>
                </div>
            )}
        </div>
      </div>
      
      <input ref={fileInputRef} type="file" accept=".pdf,image/*" onChange={handleFileChange} className="hidden" />
    </div>
  );
};

export default WatermarkTool;
