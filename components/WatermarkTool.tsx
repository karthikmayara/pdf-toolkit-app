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
    text: 'CONFIDENTIAL',
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
  // OPTIMIZED: Uses requestAnimationFrame to debounce rapid updates (dragging/typing)
  useEffect(() => {
      if (!baseImage || !canvasRef.current) return;
      
      let animationFrameId: number;

      const render = () => {
          const canvas = canvasRef.current;
          const ctx = canvas?.getContext('2d');
          if (!ctx || !baseImage) return;

          // Smart Scale for preview canvas (limit max dimension to save GPU memory)
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
      // Calculate effective font size relative to the PREVIEW canvas
      // The settings.fontSize is based on PDF points. 
      // We need to scale visual font size based on the ratio of preview canvas to "standard" page width.
      
      // Heuristic: Base scale on width relative to a 'standard' 1000px wide view
      const relativeScale = width / 1000;
      const fontSize = settings.fontSize * 2 * relativeScale; 

      const fontStyle = `${settings.isItalic ? 'italic' : ''} ${settings.isBold ? 'bold' : ''} ${fontSize}px "${settings.fontFamily}"`.trim();
      
      ctx.font = fontStyle;
      const metrics = ctx.measureText(settings.text);
      const textW = metrics.width;
      const textH = fontSize; // approx

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

      // Positioning Logic (Standardized to Center Anchors)
      const pX = 40 * scale; 
      const pY = 40 * scale;
      const cX = width / 2; 
      const cY = height / 2;
      const rX = width - (40 * scale); 
      const bY = height - (40 * scale);

      let positions: {x: number, y: number}[] = [];

      if (settings.position === 'tiled') {
          const cols = 3; const rows = 4;
          const xGap = width / cols;
          const yGap = height / rows;
          
          for(let r=0; r < rows; r++) {
                for(let c=0; c < cols; c++) {
                    // Offset odd rows for brick pattern
                    const offsetX = (r % 2 === 0) ? 0 : xGap/2;
                    positions.push({
                        x: (c * xGap) + (xGap/2) + offsetX - (r%2!==0 && c===cols-1 ? width : 0), // Wrap logic simplified
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

          positions.push({x, y});
      }
      
      // Page Selection Visibility Check (for PDF Preview)
      if (file && file.type === 'application/pdf' && settings.pageSelectMode !== 'all') {
          const p = previewPage + 1;
          if (settings.pageSelectMode === 'odd' && p % 2 === 0) positions = [];
          if (settings.pageSelectMode === 'even' && p % 2 !== 0) positions = [];
      }

      positions.forEach(p => drawText(p.x, p.y, settings.rotation));
  };


  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
      setFile(e.target.files[0]);
      setStatus({ isProcessing: false, currentStep: '', progress: 0, resultBlob: undefined });
    }
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
    <div className="max-w-7xl mx-auto animate-fade-in pb-12">
      <div className="bg-white dark:bg-slate-800 rounded-3xl shadow-2xl overflow-hidden border border-slate-100 dark:border-slate-700 flex flex-col md:flex-row h-auto min-h-screen md:min-h-0 md:h-[calc(100vh-120px)]">
            
            {/* LEFT: Preview Area */}
            <div className="h-[50vh] md:h-full md:w-7/12 bg-slate-100 dark:bg-slate-900/50 relative flex flex-col border-b md:border-b-0 md:border-r border-slate-200 dark:border-slate-700 transition-colors">
                
                {/* Preview Header */}
                <div className="absolute top-0 left-0 right-0 p-4 flex justify-between items-center z-10 pointer-events-none">
                     <div className="bg-white/90 dark:bg-slate-900/90 backdrop-blur px-3 py-1.5 rounded-full text-xs font-bold shadow-sm pointer-events-auto text-slate-700 dark:text-slate-200 border border-slate-200 dark:border-slate-700">
                        {file ? 'Live Preview' : 'No File Selected'}
                     </div>
                     {file && (
                         <button 
                            onClick={() => setFile(null)} 
                            className="bg-white/90 dark:bg-slate-900/90 backdrop-blur p-2 rounded-full shadow-sm text-red-500 hover:text-red-600 pointer-events-auto transition-transform hover:scale-110 border border-slate-200 dark:border-slate-700"
                            title="Remove File"
                         >
                            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M6 18L18 6M6 6l12 12"></path></svg>
                         </button>
                     )}
                </div>

                {/* Canvas Container */}
                <div className="flex-1 overflow-hidden relative flex items-center justify-center p-4 md:p-8">
                    {!file ? (
                        <div 
                            onClick={() => fileInputRef.current?.click()}
                            className="border-4 border-dashed border-slate-300 dark:border-slate-700 hover:border-blue-500 dark:hover:border-blue-500 hover:bg-blue-50 dark:hover:bg-slate-800 rounded-2xl p-8 md:p-12 text-center cursor-pointer transition-all w-full max-w-sm group"
                        >
                            <div className="w-16 h-16 md:w-20 md:h-20 bg-blue-100 dark:bg-slate-700 rounded-full flex items-center justify-center mx-auto mb-6 group-hover:scale-110 transition-transform text-blue-600 dark:text-blue-400">
                                <span className="text-3xl md:text-4xl">🛡️</span>
                            </div>
                            <h3 className="text-xl md:text-2xl font-bold text-slate-700 dark:text-slate-200 mb-2">Drop PDF or Image</h3>
                            <p className="text-sm text-slate-500 dark:text-slate-400">Add custom stamp securely</p>
                        </div>
                    ) : (
                        <div className="relative shadow-2xl rounded-lg overflow-hidden max-h-full border border-slate-200 dark:border-slate-700">
                             {/* Canvas Background */}
                             <div className="bg-[url('data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAABAAAAAQCAYAAAAf8/9hAAAAMUlEQVQ4T2NkYGAQYcAP3uCTZhw1gGGYhAGBZIA/nYDCgBDAm9BGDWAAJyRCgLaBCAAgXwixzAS0pgAAAABJRU5ErkJggg==')]">
                                <canvas ref={canvasRef} className="max-w-full max-h-full block" />
                             </div>
                             
                             {/* Loading Overlay */}
                             {isRenderingBase && (
                                 <div className="absolute inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center flex-col text-white gap-2">
                                     <div className="animate-spin w-8 h-8 border-4 border-white border-t-transparent rounded-full"></div>
                                     <span className="text-xs font-bold">Rendering Page...</span>
                                 </div>
                             )}
                        </div>
                    )}
                </div>

                {/* PDF Navigation Controls */}
                {file && file.type === 'application/pdf' && (
                    <div className="h-14 bg-white dark:bg-slate-800 border-t border-slate-200 dark:border-slate-700 flex items-center justify-center gap-6 shrink-0 transition-colors z-20 shadow-[0_-5px_15px_rgba(0,0,0,0.05)]">
                        <button 
                           onClick={() => setPreviewPage(Math.max(0, previewPage - 1))}
                           disabled={previewPage === 0 || isRenderingBase}
                           className="p-2 rounded-full hover:bg-slate-100 dark:hover:bg-slate-700 disabled:opacity-30 transition-colors text-slate-600 dark:text-slate-300"
                        >
                           <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M15 19l-7-7 7-7"></path></svg>
                        </button>
                        <span className="font-bold font-mono text-sm text-slate-700 dark:text-slate-200">
                            Page {previewPage + 1} / {numPages}
                        </span>
                        <button 
                           onClick={() => setPreviewPage(Math.min(numPages - 1, previewPage + 1))}
                           disabled={previewPage === numPages - 1 || isRenderingBase}
                           className="p-2 rounded-full hover:bg-slate-100 dark:hover:bg-slate-700 disabled:opacity-30 transition-colors text-slate-600 dark:text-slate-300"
                        >
                           <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M9 5l7 7-7 7"></path></svg>
                        </button>
                    </div>
                )}
            </div>

            {/* RIGHT: Settings Panel */}
            <div className="md:w-5/12 bg-white dark:bg-slate-800 flex flex-col h-full overflow-hidden transition-colors">
                
                {/* Tabs */}
                <div className="flex border-b border-slate-100 dark:border-slate-700 shrink-0">
                    {['content', 'style', 'position', 'pages'].map((tab) => (
                        <button
                            key={tab}
                            onClick={() => setActiveTab(tab as any)}
                            disabled={!file && tab !== 'content'} // Disable other tabs if no file
                            className={`flex-1 py-4 text-xs font-bold uppercase tracking-wider transition-colors relative
                                ${activeTab === tab 
                                    ? 'text-blue-600 dark:text-blue-400 bg-blue-50/50 dark:bg-slate-700/50' 
                                    : 'text-slate-400 hover:text-slate-600 dark:hover:text-slate-300'}
                                ${(!file && tab !== 'content') ? 'opacity-50 cursor-not-allowed' : ''}
                            `}
                        >
                            {tab}
                            {activeTab === tab && <div className="absolute bottom-0 left-0 right-0 h-0.5 bg-blue-600 dark:bg-blue-400"></div>}
                        </button>
                    ))}
                </div>

                <div className="flex-1 overflow-y-auto custom-scrollbar p-6">
                     
                     {/* TAB: CONTENT */}
                     {activeTab === 'content' && (
                         <div className="space-y-6 animate-fade-in">
                            {/* Text Input */}
                            <div>
                                <label className="block text-xs font-bold uppercase text-slate-500 dark:text-slate-400 mb-2">Watermark Text</label>
                                <input 
                                    type="text"
                                    value={settings.text}
                                    onChange={(e) => setSettings(s => ({...s, text: e.target.value}))}
                                    className="w-full p-4 bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-600 rounded-xl font-bold text-lg text-slate-800 dark:text-slate-200 outline-none focus:ring-2 focus:ring-blue-500 transition-all placeholder:text-slate-400 dark:placeholder:text-slate-600"
                                    placeholder="e.g. DRAFT"
                                />
                            </div>

                            {/* Color Picker */}
                            <div>
                                <label className="block text-xs font-bold uppercase text-slate-500 dark:text-slate-400 mb-3">Color</label>
                                <div className="flex flex-wrap gap-3">
                                    {colorPresets.map(c => (
                                        <button 
                                            key={c}
                                            onClick={() => setSettings(s => ({...s, color: c}))}
                                            className={`w-10 h-10 rounded-full border-2 shadow-sm transition-transform hover:scale-110 ${settings.color === c ? 'border-blue-500 scale-110 ring-2 ring-blue-200 dark:ring-blue-900' : 'border-slate-200 dark:border-slate-600'}`}
                                            style={{ backgroundColor: c }}
                                        />
                                    ))}
                                    <label className="w-10 h-10 rounded-full border-2 border-slate-200 dark:border-slate-600 flex items-center justify-center cursor-pointer hover:bg-slate-50 dark:hover:bg-slate-700 bg-white dark:bg-slate-800 overflow-hidden relative">
                                        <input 
                                            type="color" 
                                            value={settings.color}
                                            onChange={(e) => setSettings(s => ({...s, color: e.target.value}))}
                                            className="opacity-0 absolute inset-0 w-full h-full cursor-pointer"
                                        />
                                        <span className="text-lg">🎨</span>
                                    </label>
                                </div>
                            </div>

                            {/* Font Family */}
                            <div>
                                <label className="block text-xs font-bold uppercase text-slate-500 dark:text-slate-400 mb-2">Typography</label>
                                <div className="space-y-2">
                                    <select 
                                        value={settings.fontFamily}
                                        onChange={(e) => setSettings(s => ({...s, fontFamily: e.target.value}))}
                                        className="w-full p-3 bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-600 rounded-xl text-sm font-bold text-slate-700 dark:text-slate-200 outline-none focus:ring-2 focus:ring-blue-500"
                                    >
                                        {fonts.map(f => <option key={f.name} value={f.name}>{f.label}</option>)}
                                    </select>
                                    
                                    <div className="flex gap-2">
                                        <button 
                                            onClick={() => setSettings(s => ({...s, isBold: !s.isBold}))} 
                                            className={`flex-1 py-3 rounded-xl font-bold transition-all border ${settings.isBold ? 'bg-blue-50 dark:bg-slate-700 border-blue-500 text-blue-600 dark:text-blue-400' : 'bg-slate-50 dark:bg-slate-900 border-slate-200 dark:border-slate-600 text-slate-500 hover:bg-slate-100'}`}
                                        >
                                            Bold
                                        </button>
                                        <button 
                                            onClick={() => setSettings(s => ({...s, isItalic: !s.isItalic}))} 
                                            className={`flex-1 py-3 rounded-xl italic transition-all border ${settings.isItalic ? 'bg-blue-50 dark:bg-slate-700 border-blue-500 text-blue-600 dark:text-blue-400' : 'bg-slate-50 dark:bg-slate-900 border-slate-200 dark:border-slate-600 text-slate-500 hover:bg-slate-100'}`}
                                        >
                                            Italic
                                        </button>
                                    </div>
                                </div>
                            </div>
                         </div>
                     )}

                     {/* TAB: STYLE */}
                     {activeTab === 'style' && (
                        <div className="space-y-8 animate-fade-in">
                            {/* Opacity */}
                            <div>
                                <div className="flex justify-between mb-2">
                                    <label className="text-xs font-bold uppercase text-slate-500 dark:text-slate-400">Transparency</label>
                                    <span className="text-xs font-mono bg-slate-100 dark:bg-slate-700 px-2 py-0.5 rounded">{Math.round(settings.opacity * 100)}%</span>
                                </div>
                                <input type="range" min="0.1" max="1" step="0.1" value={settings.opacity} onChange={(e) => setSettings(s => ({...s, opacity: Number(e.target.value)}))} className="w-full h-2 bg-slate-200 dark:bg-slate-700 rounded-lg appearance-none cursor-pointer accent-blue-600" />
                            </div>

                            {/* Size */}
                            <div>
                                <div className="flex justify-between mb-2">
                                    <label className="text-xs font-bold uppercase text-slate-500 dark:text-slate-400">Font Size</label>
                                    <span className="text-xs font-mono bg-slate-100 dark:bg-slate-700 px-2 py-0.5 rounded">{settings.fontSize}px</span>
                                </div>
                                <input type="range" min="20" max="200" step="5" value={settings.fontSize} onChange={(e) => setSettings(s => ({...s, fontSize: Number(e.target.value)}))} className="w-full h-2 bg-slate-200 dark:bg-slate-700 rounded-lg appearance-none cursor-pointer accent-blue-600" />
                            </div>

                            {/* Rotation */}
                            <div>
                                <div className="flex justify-between mb-2">
                                    <label className="text-xs font-bold uppercase text-slate-500 dark:text-slate-400">Rotation</label>
                                    <span className="text-xs font-mono bg-slate-100 dark:bg-slate-700 px-2 py-0.5 rounded">{settings.rotation}°</span>
                                </div>
                                <input type="range" min="-180" max="180" step="5" value={settings.rotation} onChange={(e) => setSettings(s => ({...s, rotation: Number(e.target.value)}))} className="w-full h-2 bg-slate-200 dark:bg-slate-700 rounded-lg appearance-none cursor-pointer accent-blue-600" />
                                <div className="flex justify-between mt-2 text-[10px] text-slate-400 font-mono">
                                    <span>-180°</span>
                                    <span className="cursor-pointer hover:text-blue-500" onClick={() => setSettings(s => ({...s, rotation: 0}))}>0° (Reset)</span>
                                    <span>180°</span>
                                </div>
                            </div>
                        </div>
                     )}

                     {/* TAB: POSITION */}
                     {activeTab === 'position' && (
                         <div className="space-y-6 animate-fade-in">
                            <label className="block text-xs font-bold uppercase text-slate-500 dark:text-slate-400 mb-4 text-center">Placement Strategy</label>
                            
                            {/* Tiled Toggle */}
                            <div 
                                onClick={() => setSettings(s => ({...s, position: s.position === 'tiled' ? 'center' : 'tiled'}))}
                                className={`
                                    p-4 rounded-xl border-2 cursor-pointer transition-all flex items-center justify-between
                                    ${settings.position === 'tiled' 
                                        ? 'border-blue-500 bg-blue-50 dark:bg-slate-700 dark:border-blue-500' 
                                        : 'border-slate-200 dark:border-slate-600 hover:border-slate-300 dark:bg-slate-900'}
                                `}
                            >
                                <div className="flex items-center gap-3">
                                    <div className="text-2xl">🧱</div>
                                    <div>
                                        <div className="font-bold text-sm text-slate-800 dark:text-white">Tiled Pattern</div>
                                        <div className="text-xs text-slate-500 dark:text-slate-400">Repeat watermark across page</div>
                                    </div>
                                </div>
                                <div className={`w-6 h-6 rounded-full border-2 flex items-center justify-center ${settings.position === 'tiled' ? 'border-blue-600' : 'border-slate-300'}`}>
                                    {settings.position === 'tiled' && <div className="w-3 h-3 bg-blue-600 rounded-full" />}
                                </div>
                            </div>

                            {/* 3x3 Grid */}
                            <div className={`transition-all duration-300 ${settings.position === 'tiled' ? 'opacity-50 grayscale pointer-events-none' : 'opacity-100'}`}>
                                <div className="bg-slate-100 dark:bg-slate-900 rounded-2xl p-4 max-w-[240px] mx-auto shadow-inner border border-slate-200 dark:border-slate-700">
                                    <div className="grid grid-cols-3 gap-3">
                                        {positions.map(pos => (
                                            <button
                                                key={pos}
                                                onClick={() => setSettings(s => ({...s, position: pos}))}
                                                className={`
                                                    aspect-square rounded-lg border-2 transition-all hover:scale-105 active:scale-95 flex items-center justify-center
                                                    ${settings.position === pos 
                                                        ? 'bg-blue-500 border-blue-600 shadow-lg scale-105' 
                                                        : 'bg-white border-transparent hover:border-slate-300 dark:bg-slate-800 dark:border-slate-700'}
                                                `}
                                                title={pos}
                                            >
                                                <div className={`w-2 h-2 rounded-full ${settings.position === pos ? 'bg-white' : 'bg-slate-300 dark:bg-slate-600'}`} />
                                            </button>
                                        ))}
                                    </div>
                                </div>
                                <p className="text-center text-xs text-slate-400 mt-3">Tap grid to align watermark</p>
                            </div>
                         </div>
                     )}

                     {/* TAB: PAGES */}
                     {activeTab === 'pages' && (
                         <div className="space-y-6 animate-fade-in">
                            {file && file.type === 'application/pdf' ? (
                                <>
                                    <div className="bg-blue-50 dark:bg-blue-900/20 p-4 rounded-xl flex gap-3 items-center">
                                        <span className="text-2xl">📑</span>
                                        <div>
                                            <h4 className="font-bold text-sm text-slate-800 dark:text-white">Document Info</h4>
                                            <p className="text-xs text-slate-500 dark:text-slate-400">{numPages} Total Pages</p>
                                        </div>
                                    </div>

                                    <div>
                                        <label className="block text-xs font-bold uppercase text-slate-500 dark:text-slate-400 mb-3">Apply To</label>
                                        <div className="grid grid-cols-2 gap-2 mb-4">
                                            {(['all', 'odd', 'even', 'custom'] as const).map(mode => (
                                                <button
                                                    key={mode}
                                                    onClick={() => setSettings(s => ({...s, pageSelectMode: mode}))}
                                                    className={`py-3 px-2 text-xs font-bold rounded-xl border capitalize transition-all ${settings.pageSelectMode === mode ? 'bg-blue-50 border-blue-500 text-blue-700 dark:bg-blue-900/20 dark:border-blue-500 dark:text-blue-300' : 'border-slate-200 text-slate-600 hover:border-slate-300 dark:bg-slate-900 dark:border-slate-600 dark:text-slate-400'}`}
                                                >
                                                    {mode} Pages
                                                </button>
                                            ))}
                                        </div>
                                        
                                        {settings.pageSelectMode === 'custom' && (
                                            <div className="animate-fade-in">
                                                <label className="block text-[10px] font-bold uppercase text-slate-400 mb-1">Page Range (e.g. 1-5, 8, 10)</label>
                                                <input 
                                                    type="text"
                                                    value={settings.pageRange}
                                                    onChange={(e) => setSettings(s => ({...s, pageRange: e.target.value}))}
                                                    className="w-full p-3 bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-600 rounded-xl text-sm font-medium outline-none focus:border-blue-500 dark:text-white"
                                                    placeholder="1-5, 8, 11-15"
                                                />
                                            </div>
                                        )}
                                    </div>
                                </>
                            ) : (
                                <div className="text-center p-8 text-slate-400">
                                    <div className="text-4xl mb-2">🖼️</div>
                                    <p className="text-sm">Page selection is not available for single image files.</p>
                                </div>
                            )}
                         </div>
                     )}

                </div>
                
                {/* Action Area (Sticky Bottom) */}
                <div className="p-6 border-t border-slate-100 dark:border-slate-700 bg-slate-50 dark:bg-slate-900/30 shrink-0">
                    {status.resultBlob ? (
                        <div className="space-y-3">
                            <button 
                                onClick={handleDownload}
                                className="w-full py-4 bg-green-500 hover:bg-green-600 text-white rounded-xl font-bold text-lg shadow-lg shadow-green-200 dark:shadow-none transition-all active:scale-[0.98] flex items-center justify-center gap-2 animate-fade-in"
                            >
                                <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4"></path></svg>
                                Download PDF
                            </button>
                            <button 
                                onClick={() => setStatus({isProcessing:false, currentStep:'', progress:0})}
                                className="w-full py-3 bg-white dark:bg-slate-800 text-slate-600 dark:text-slate-300 rounded-xl font-bold border border-slate-200 dark:border-slate-600 hover:bg-slate-50 dark:hover:bg-slate-700 transition-colors"
                            >
                                Edit Settings
                            </button>
                        </div>
                    ) : (
                        <div className="space-y-3">
                            {status.isProcessing && (
                                <div className="space-y-1 mb-2">
                                    <div className="flex justify-between text-xs font-bold text-slate-500 dark:text-slate-400">
                                        <span>{status.currentStep}</span>
                                        <span>{status.progress}%</span>
                                    </div>
                                    <div className="h-2 bg-slate-200 dark:bg-slate-700 rounded-full overflow-hidden">
                                        <div className="h-full bg-blue-500 transition-all duration-300" style={{width: `${status.progress}%`}}></div>
                                    </div>
                                </div>
                            )}
                            <button
                                onClick={handleStart}
                                disabled={status.isProcessing || !file}
                                className="w-full py-4 bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-700 hover:to-indigo-700 text-white rounded-xl font-bold text-lg shadow-lg shadow-blue-200 dark:shadow-none transition-all active:scale-[0.98] disabled:opacity-50 disabled:cursor-not-allowed"
                            >
                                {status.isProcessing ? 'Processing...' : 'Apply Watermark'}
                            </button>
                        </div>
                    )}
                </div>
            </div>
      </div>
      
      <input ref={fileInputRef} type="file" accept=".pdf,image/*" onChange={handleFileChange} className="hidden" />
    </div>
  );
};

export default WatermarkTool;