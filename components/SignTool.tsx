
import React, { useState, useRef, useEffect, useCallback } from 'react';
import { renderPdfPage, embedSignatures, getPdfPageCount, RenderedPage, SignaturePlacement, AssetInsertion } from '../services/pdfSignature';

// --- HELPER: Base64 Utils ---
const blobToBase64 = (blob: Blob): Promise<string> => {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onloadend = () => resolve(reader.result as string);
    reader.onerror = reject;
    reader.readAsDataURL(blob);
  });
};

const base64ToBlob = async (base64: string): Promise<Blob> => {
  const res = await fetch(base64);
  return res.blob();
};

// --- TYPES ---
interface SigningAsset {
    id: string;
    type: 'signature' | 'date' | 'text' | 'image';
    blob: Blob;
    url: string;
    aspectRatio: number; // width / height
    label?: string; // e.g., "Blue Signature"
}

interface PlacedAsset extends SignaturePlacement {
    instanceId: string; // Unique ID for this specific placement on the page
    assetId: string; // Reference to the source asset
}

// --- SUB-COMPONENT: SIGNATURE CREATION STUDIO ---
interface SignatureStudioProps {
  onSave: (blob: Blob, label: string) => void;
  onCancel: () => void;
}

const SignatureStudio: React.FC<SignatureStudioProps> = ({ onSave, onCancel }) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [activeTab, setActiveTab] = useState<'draw' | 'type' | 'upload'>('draw');
  
  // Draw State
  const [inkColor, setInkColor] = useState('#6366f1'); // Default Indigo
  const [inkWidth, setInkWidth] = useState(3);
  
  // Type State
  const [typedText, setTypedText] = useState('');
  const [selectedFont, setSelectedFont] = useState('Dancing Script');
  
  // Upload State
  const [uploadedImg, setUploadedImg] = useState<HTMLImageElement | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  // Drawing Logic
  const isDrawing = useRef(false);
  const lastPoint = useRef<{x: number, y: number} | null>(null);

  useEffect(() => {
      // Init Canvas
      if (activeTab === 'draw' && canvasRef.current) {
          const canvas = canvasRef.current;
          const ctx = canvas.getContext('2d');
          const rect = canvas.parentElement?.getBoundingClientRect();
          if (ctx && rect) {
              canvas.width = rect.width * 2; // Retina
              canvas.height = 300 * 2;
              canvas.style.width = '100%';
              canvas.style.height = '300px';
              ctx.scale(2, 2);
              ctx.lineCap = 'round';
              ctx.lineJoin = 'round';
          }
      }
  }, [activeTab]);

  const getPos = (e: React.PointerEvent) => {
      const r = canvasRef.current!.getBoundingClientRect();
      return { x: e.clientX - r.left, y: e.clientY - r.top };
  };

  const drawStart = (e: React.PointerEvent) => {
      e.currentTarget.setPointerCapture(e.pointerId);
      isDrawing.current = true;
      lastPoint.current = getPos(e);
      const ctx = canvasRef.current?.getContext('2d');
      if(ctx) {
          ctx.beginPath();
          ctx.fillStyle = inkColor;
          ctx.arc(lastPoint.current.x, lastPoint.current.y, inkWidth / 2, 0, Math.PI * 2);
          ctx.fill();
      }
  };

  const drawMove = (e: React.PointerEvent) => {
      if (!isDrawing.current || !lastPoint.current) return;
      const ctx = canvasRef.current?.getContext('2d');
      if (!ctx) return;
      
      const p = getPos(e);
      ctx.beginPath();
      ctx.moveTo(lastPoint.current.x, lastPoint.current.y);
      ctx.lineTo(p.x, p.y);
      ctx.strokeStyle = inkColor;
      ctx.lineWidth = inkWidth;
      ctx.stroke();
      lastPoint.current = p;
  };

  const drawEnd = (e: React.PointerEvent) => {
      isDrawing.current = false;
      lastPoint.current = null;
  };

  const clearCanvas = () => {
      const c = canvasRef.current;
      const ctx = c?.getContext('2d');
      if (c && ctx) ctx.clearRect(0,0,c.width,c.height);
  };

  const handleSave = () => {
      let canvas: HTMLCanvasElement | null = null;

      if (activeTab === 'draw') {
          canvas = canvasRef.current;
      } else if (activeTab === 'type' && typedText) {
          canvas = document.createElement('canvas');
          const ctx = canvas.getContext('2d');
          const fontSize = 80;
          if (ctx) {
              ctx.font = `${fontSize}px "${selectedFont}"`;
              const metrics = ctx.measureText(typedText);
              canvas.width = metrics.width + 40;
              canvas.height = fontSize * 1.5;
              ctx.font = `${fontSize}px "${selectedFont}"`; // Re-set after resize
              ctx.fillStyle = inkColor;
              ctx.textBaseline = 'middle';
              ctx.fillText(typedText, 20, canvas.height/2);
          }
      } else if (activeTab === 'upload' && uploadedImg) {
          canvas = document.createElement('canvas');
          canvas.width = uploadedImg.width;
          canvas.height = uploadedImg.height;
          canvas.getContext('2d')?.drawImage(uploadedImg, 0, 0);
      }

      if (canvas) {
          canvas.toBlob(b => {
              if (b) onSave(b, activeTab === 'type' ? typedText : 'Signature');
          }, 'image/png');
      }
  };

  const fonts = [
      { name: 'Dancing Script', label: 'Dancing' },
      { name: 'Great Vibes', label: 'Vibes' },
      { name: 'Sacramento', label: 'Sacramento' },
      { name: 'Reenie Beanie', label: 'Reenie' },
      { name: 'Permanent Marker', label: 'Marker' },
      { name: 'Playfair Display', label: 'Playfair' },
  ];

  return (
      <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-md p-4 animate-fade-in">
          <div className="bg-[#1e293b] w-full max-w-2xl rounded-2xl shadow-2xl flex flex-col overflow-hidden max-h-[90vh] border border-white/10">
              
              {/* Header */}
              <div className="p-5 border-b border-white/10 flex justify-between items-center bg-[#0f172a]">
                  <h3 className="font-black text-xl text-white tracking-tight">CREATE SIGNATURE</h3>
                  <button onClick={onCancel} className="w-8 h-8 rounded-full bg-white/5 hover:bg-white/10 flex items-center justify-center text-slate-400 hover:text-white transition-colors">✕</button>
              </div>

              {/* Tabs */}
              <div className="flex border-b border-white/10 bg-[#1e293b]">
                  {['draw', 'type', 'upload'].map(t => (
                      <button
                        key={t}
                        onClick={() => setActiveTab(t as any)}
                        className={`flex-1 py-4 text-xs font-bold uppercase tracking-widest transition-colors ${activeTab === t ? 'text-indigo-400 bg-white/5 border-b-2 border-indigo-500' : 'text-slate-500 hover:text-white hover:bg-white/5'}`}
                      >
                          {t}
                      </button>
                  ))}
              </div>

              {/* Workspace */}
              <div className="p-6 flex-1 overflow-y-auto bg-[#0f172a]/50">
                  {activeTab === 'draw' && (
                      <div className="flex flex-col gap-6 h-full">
                          <div className="flex-1 bg-white rounded-xl shadow-lg border border-slate-200 overflow-hidden relative cursor-crosshair">
                              <canvas 
                                ref={canvasRef} 
                                onPointerDown={drawStart}
                                onPointerMove={drawMove}
                                onPointerUp={drawEnd}
                                onPointerLeave={drawEnd}
                                className="touch-none"
                              />
                              <button onClick={clearCanvas} className="absolute top-3 right-3 text-[10px] bg-slate-100 hover:bg-slate-200 px-3 py-1.5 rounded-full text-slate-600 font-bold shadow-sm uppercase tracking-wider">Clear</button>
                          </div>
                          
                          {/* Pen Controls */}
                          <div className="flex flex-col sm:flex-row items-center gap-6 justify-center">
                              <div className="flex gap-3 bg-[#1e293b] p-2 rounded-full shadow-lg border border-white/10">
                                  {['#6366f1', '#000000', '#dc2626'].map(c => (
                                      <button 
                                        key={c}
                                        onClick={() => setInkColor(c)}
                                        className={`w-8 h-8 rounded-full border-2 transition-transform ${inkColor === c ? 'border-white scale-110' : 'border-transparent hover:scale-105'}`}
                                        style={{ backgroundColor: c }}
                                      />
                                  ))}
                              </div>
                              <div className="flex items-center gap-3">
                                  <span className="text-[10px] uppercase font-bold text-slate-500">Width</span>
                                  <input 
                                    type="range" min="1" max="10" 
                                    value={inkWidth} 
                                    onChange={(e) => setInkWidth(Number(e.target.value))}
                                    className="w-32 h-1.5 bg-slate-700 rounded-lg appearance-none cursor-pointer accent-indigo-500" 
                                  />
                              </div>
                          </div>
                      </div>
                  )}

                  {activeTab === 'type' && (
                      <div className="flex flex-col gap-8 h-full items-center justify-center">
                          <input 
                            type="text" 
                            value={typedText}
                            onChange={(e) => setTypedText(e.target.value)}
                            className="w-full text-5xl text-center bg-transparent border-b-2 border-slate-700 focus:border-indigo-500 outline-none pb-4 transition-colors text-white placeholder:text-slate-700"
                            style={{ fontFamily: selectedFont, color: inkColor }}
                            placeholder="Type Name..."
                            autoFocus
                          />
                          
                          <div className="grid grid-cols-2 gap-3 w-full">
                              {fonts.map(f => (
                                  <button
                                    key={f.name}
                                    onClick={() => setSelectedFont(f.name)}
                                    className={`p-4 rounded-xl border transition-all ${selectedFont === f.name ? 'border-indigo-500 bg-indigo-500/20 text-white' : 'border-white/10 bg-white/5 text-slate-400 hover:border-white/30 hover:text-white'}`}
                                  >
                                      <span className="text-2xl block mb-2" style={{ fontFamily: f.name }}>Signature</span>
                                      <div className="text-[9px] uppercase font-bold tracking-widest opacity-60">{f.label}</div>
                                  </button>
                              ))}
                          </div>

                          <div className="flex gap-3 bg-[#1e293b] p-2 rounded-full shadow-lg border border-white/10">
                                {['#6366f1', '#000000', '#dc2626', '#15803d'].map(c => (
                                    <button 
                                    key={c}
                                    onClick={() => setInkColor(c)}
                                    className={`w-8 h-8 rounded-full border-2 transition-transform ${inkColor === c ? 'border-white scale-110' : 'border-transparent hover:scale-105'}`}
                                    style={{ backgroundColor: c }}
                                    />
                                ))}
                          </div>
                      </div>
                  )}

                  {activeTab === 'upload' && (
                      <div 
                        onClick={() => fileRef.current?.click()}
                        className="h-full border-2 border-dashed border-slate-700 rounded-xl flex flex-col items-center justify-center cursor-pointer hover:border-indigo-500 hover:bg-indigo-500/10 transition-all group"
                      >
                          {uploadedImg ? (
                              <img src={uploadedImg.src} className="max-h-64 object-contain shadow-2xl rounded-lg" />
                          ) : (
                              <>
                                  <div className="w-20 h-20 bg-slate-800 rounded-full flex items-center justify-center mb-4 group-hover:scale-110 transition-transform">
                                      <span className="text-4xl">📷</span>
                                  </div>
                                  <span className="font-bold text-white text-lg">Click to Upload Image</span>
                                  <span className="text-xs text-slate-500 uppercase tracking-widest mt-2">JPG or PNG</span>
                              </>
                          )}
                          <input 
                            ref={fileRef}
                            type="file" 
                            accept="image/*" 
                            className="hidden"
                            onChange={(e) => {
                                if(e.target.files?.[0]) {
                                    const img = new Image();
                                    img.onload = () => setUploadedImg(img);
                                    img.src = URL.createObjectURL(e.target.files[0]);
                                }
                            }} 
                          />
                      </div>
                  )}
              </div>

              {/* Footer */}
              <div className="p-5 border-t border-white/10 bg-[#1e293b] flex justify-end gap-4">
                  <button onClick={onCancel} className="px-6 py-3 font-bold text-slate-400 hover:text-white transition-colors text-xs uppercase tracking-wider">Cancel</button>
                  <button 
                    onClick={handleSave}
                    disabled={activeTab === 'type' && !typedText || activeTab === 'upload' && !uploadedImg}
                    className="px-8 py-3 bg-indigo-600 hover:bg-indigo-500 text-white font-bold rounded-xl shadow-lg shadow-indigo-500/20 disabled:opacity-50 disabled:cursor-not-allowed text-xs uppercase tracking-wider transition-all hover:scale-105"
                  >
                      Save Asset
                  </button>
              </div>
          </div>
      </div>
  );
};

// --- MAIN COMPONENT ---
const SignTool: React.FC = () => {
  const [file, setFile] = useState<File | null>(null);
  const [numPages, setNumPages] = useState(0);
  const [currPage, setCurrPage] = useState(0);
  
  // Assets & State
  const [assets, setAssets] = useState<SigningAsset[]>([]);
  const [placements, setPlacements] = useState<Record<number, PlacedAsset[]>>({});
  const [showStudio, setShowStudio] = useState(false);
  
  // Page Render
  const [pageImg, setPageImg] = useState<string | null>(null);
  const [isRendering, setIsRendering] = useState(false);
  const [isSaving, setIsSaving] = useState(false);

  // Interaction
  const [activePlacementId, setActivePlacementId] = useState<string | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Load saved assets on mount
  useEffect(() => {
      const loadAssets = async () => {
          try {
              const saved = localStorage.getItem('pdf_toolkit_assets');
              if (saved) {
                  const meta = JSON.parse(saved);
                  const restored: SigningAsset[] = [];
                  for (const m of meta) {
                      const blob = await base64ToBlob(m.base64);
                      restored.push({
                          id: m.id,
                          type: m.type,
                          label: m.label,
                          blob,
                          url: URL.createObjectURL(blob),
                          aspectRatio: m.aspectRatio
                      });
                  }
                  setAssets(restored);
              }
          } catch(e) { console.error("Asset load error", e); }
      };
      loadAssets();
  }, []);

  // Save assets on change
  useEffect(() => {
      if (assets.length === 0) return;
      const save = async () => {
          const meta = await Promise.all(assets.map(async (a) => ({
              id: a.id,
              type: a.type,
              label: a.label,
              aspectRatio: a.aspectRatio,
              base64: await blobToBase64(a.blob)
          })));
          localStorage.setItem('pdf_toolkit_assets', JSON.stringify(meta));
      };
      save();
  }, [assets]);

  // Load PDF Page
  useEffect(() => {
      if (!file) return;
      let active = true;
      const load = async () => {
          setIsRendering(true);
          try {
              const res = await renderPdfPage(file, currPage);
              if (active) setPageImg(URL.createObjectURL(res.blob));
          } catch(e) { console.error(e); }
          if (active) setIsRendering(false);
      };
      load();
      return () => { active = false; };
  }, [file, currPage]);

  // Handlers
  const handleFile = async (f: File) => {
      setFile(f);
      try {
        const pages = await getPdfPageCount(f);
        setNumPages(pages);
        setCurrPage(0);
        setPlacements({});
      } catch (e) {
          alert("Failed to load PDF. Please check if it's password protected.");
          setFile(null);
      }
  };

  const createAsset = (blob: Blob, label: string, type: SigningAsset['type'] = 'signature') => {
      const img = new Image();
      const url = URL.createObjectURL(blob);
      img.onload = () => {
          const newAsset: SigningAsset = {
              id: Math.random().toString(36).substr(2, 9),
              type,
              blob,
              url,
              aspectRatio: img.width / img.height,
              label
          };
          setAssets(prev => [...prev, newAsset]);
          setShowStudio(false);
      };
      img.src = url;
  };

  const createDateStamp = () => {
      const canvas = document.createElement('canvas');
      const ctx = canvas.getContext('2d');
      const dateStr = new Date().toLocaleDateString();
      if (ctx) {
          ctx.font = 'bold 60px "Courier Prime", monospace';
          const w = ctx.measureText(dateStr).width + 40;
          canvas.width = w;
          canvas.height = 80;
          ctx.font = 'bold 60px "Courier Prime", monospace';
          ctx.fillStyle = '#dc2626'; // Red stamp
          ctx.textBaseline = 'middle';
          ctx.fillText(dateStr, 20, 40);
          
          canvas.toBlob(b => {
              if (b) createAsset(b, 'Date Stamp', 'date');
          });
      }
  };

  const deleteAsset = (id: string) => {
      setAssets(prev => prev.filter(a => a.id !== id));
  };

  const placeAsset = (assetId: string) => {
      const asset = assets.find(a => a.id === assetId);
      if (!asset) return;

      const w = 30; // Default width percentage
      const h = (w * 0.7) / asset.aspectRatio; // Approximation

      const newPlace: PlacedAsset = {
          instanceId: Math.random().toString(36).substr(2,9),
          assetId,
          pageIndex: currPage,
          x: 35, y: 45, w, h: h > 100 ? 20 : h
      };

      setPlacements(prev => ({
          ...prev,
          [currPage]: [...(prev[currPage] || []), newPlace]
      }));
      setActivePlacementId(newPlace.instanceId);
  };

  const removePlacement = (instanceId: string) => {
      setPlacements(prev => ({
          ...prev,
          [currPage]: (prev[currPage] || []).filter(p => p.instanceId !== instanceId)
      }));
  };

  const updatePlacement = (instanceId: string, updates: Partial<SignaturePlacement>) => {
      setPlacements(prev => ({
          ...prev,
          [currPage]: (prev[currPage] || []).map(p => p.instanceId === instanceId ? { ...p, ...updates } : p)
      }));
  };

  const handleDownload = async () => {
      if (!file) return;
      setIsSaving(true);
      try {
          const insertions: AssetInsertion[] = assets.map(a => {
              const allPlacements: SignaturePlacement[] = [];
              Object.values(placements).forEach(pagePlacements => {
                  pagePlacements.filter(p => p.assetId === a.id).forEach(p => {
                      allPlacements.push({
                          pageIndex: p.pageIndex,
                          x: p.x, y: p.y, w: p.w, h: p.h
                      });
                  });
              });
              return { blob: a.blob, placements: allPlacements };
          }).filter(i => i.placements.length > 0);

          if (insertions.length === 0) {
              alert("No signatures placed.");
              setIsSaving(false);
              return;
          }

          const signedBlob = await embedSignatures(file, insertions);
          const url = URL.createObjectURL(signedBlob);
          const a = document.createElement('a');
          a.href = url;
          a.download = `signed_${file.name}`;
          document.body.appendChild(a);
          a.click();
          document.body.removeChild(a);
          URL.revokeObjectURL(url);
      } catch (e) {
          console.error(e);
          alert("Failed to sign PDF.");
      }
      setIsSaving(false);
  };

  // Interaction Logic (Drag & Resize)
  const handleInteraction = (e: React.PointerEvent, instanceId: string, mode: 'move' | 'resize') => {
      e.stopPropagation();
      e.currentTarget.setPointerCapture(e.pointerId);
      setActivePlacementId(instanceId);

      const startX = e.clientX;
      const startY = e.clientY;
      const rect = containerRef.current!.getBoundingClientRect();
      const placement = placements[currPage].find(p => p.instanceId === instanceId)!;
      const startPos = { ...placement };

      const onMove = (evt: PointerEvent) => {
          const dxPx = evt.clientX - startX;
          const dyPx = evt.clientY - startY;
          const dx = (dxPx / rect.width) * 100;
          const dy = (dyPx / rect.height) * 100;

          if (mode === 'move') {
              updatePlacement(instanceId, {
                  x: Math.max(0, Math.min(100 - startPos.w, startPos.x + dx)),
                  y: Math.max(0, Math.min(100 - startPos.h, startPos.y + dy))
              });
          } else {
              // Resize logic
              let nw = Math.max(5, startPos.w + dx);
              const asset = assets.find(a => a.id === placement.assetId);
              const pageAR = rect.width / rect.height; 
              const imgAR = asset?.aspectRatio || 1;
              const nh = (nw * pageAR) / imgAR;

              updatePlacement(instanceId, { w: nw, h: nh });
          }
      };

      const onUp = () => {
          window.removeEventListener('pointermove', onMove);
          window.removeEventListener('pointerup', onUp);
      };

      window.addEventListener('pointermove', onMove);
      window.addEventListener('pointerup', onUp);
  };

  return (
    <div className="max-w-7xl mx-auto animate-fade-in pb-12 px-4 sm:px-6">
      
      {/* Main Container */}
      <div className="bg-[#0f172a] text-white rounded-[2rem] shadow-2xl overflow-hidden min-h-[600px] flex flex-col md:flex-row relative">
        
        {/* LEFT COLUMN: DOCUMENT STAGE */}
        <div 
            className={`
                relative md:w-2/3 min-h-[400px] md:min-h-full transition-all duration-500 overflow-hidden flex flex-col
                ${!file ? 'bg-gradient-to-br from-indigo-900 to-[#0f172a] items-center justify-center' : 'bg-black/30'}
            `}
        >
            {/* Toolbar (Only when file present) */}
            {file && (
                <div className="h-16 bg-[#0f172a]/90 backdrop-blur-sm border-b border-white/10 flex items-center justify-between px-6 z-10 shrink-0">
                    <div className="flex items-center gap-4">
                        <button onClick={() => setFile(null)} className="text-[10px] font-bold uppercase text-red-400 hover:text-red-300 transition-colors">Change PDF</button>
                        <div className="h-4 w-px bg-white/10"></div>
                        <div className="flex items-center gap-3">
                            <button onClick={() => setCurrPage(Math.max(0, currPage - 1))} disabled={currPage === 0} className="w-8 h-8 rounded-full bg-white/5 hover:bg-white/10 flex items-center justify-center disabled:opacity-30">◀</button>
                            <span className="text-xs font-mono font-bold text-slate-300">PAGE {currPage + 1} / {numPages}</span>
                            <button onClick={() => setCurrPage(Math.min(numPages - 1, currPage + 1))} disabled={currPage === numPages - 1} className="w-8 h-8 rounded-full bg-white/5 hover:bg-white/10 flex items-center justify-center disabled:opacity-30">▶</button>
                        </div>
                    </div>
                </div>
            )}

            {/* Canvas Area */}
            <div className="flex-1 overflow-auto flex items-center justify-center p-8 relative">
                {!file ? (
                    <div 
                        onClick={() => fileInputRef.current?.click()}
                        className="text-center p-8 cursor-pointer transition-transform duration-300 hover:scale-105"
                    >
                        <div className="w-32 h-32 bg-indigo-500/20 rounded-full flex items-center justify-center mx-auto mb-6 backdrop-blur-sm border border-indigo-500/30">
                            <svg className="w-12 h-12 text-indigo-400" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z"></path></svg>
                        </div>
                        <h3 className="text-2xl font-bold tracking-tight mb-2">Upload PDF to Sign</h3>
                        <p className="text-indigo-200/60 text-sm font-medium uppercase tracking-widest">Drag & Drop or Click</p>
                    </div>
                ) : (
                    <div ref={containerRef} className="relative shadow-2xl transition-opacity w-full max-w-[800px]">
                        {isRendering && (
                            <div className="absolute inset-0 z-20 bg-[#0f172a]/50 backdrop-blur-sm flex items-center justify-center">
                                <div className="w-10 h-10 border-4 border-indigo-500 border-t-transparent rounded-full animate-spin"></div>
                            </div>
                        )}
                        
                        {/* PDF Page Image */}
                        {pageImg && <img src={pageImg} className="w-full h-auto block select-none rounded-sm shadow-2xl" draggable={false} />}

                        {/* Placed Assets */}
                        {(placements[currPage] || []).map(p => {
                            const asset = assets.find(a => a.id === p.assetId);
                            if (!asset) return null;
                            const isActive = activePlacementId === p.instanceId;

                            return (
                                <div
                                key={p.instanceId}
                                className={`absolute cursor-move select-none group ${isActive ? 'z-50' : 'z-10'}`}
                                style={{ top: `${p.y}%`, left: `${p.x}%`, width: `${p.w}%`, height: `${p.h}%` }}
                                onPointerDown={(e) => handleInteraction(e, p.instanceId, 'move')}
                                >
                                    <div className={`w-full h-full ${isActive ? 'border-2 border-indigo-500 bg-indigo-500/10' : 'border border-transparent hover:border-indigo-400/50'}`}>
                                        <img src={asset.url} className="w-full h-full object-contain pointer-events-none" />
                                    </div>
                                    
                                    {isActive && (
                                        <>
                                            <button 
                                                onPointerDown={(e) => { e.stopPropagation(); removePlacement(p.instanceId); }}
                                                className="absolute -top-3 -right-3 bg-red-500 text-white rounded-full p-1.5 shadow-md hover:scale-110 z-50 touch-manipulation"
                                            >
                                                <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M6 18L18 6M6 6l12 12"></path></svg>
                                            </button>
                                            <div 
                                                className="absolute -bottom-2 -right-2 w-6 h-6 bg-white border-2 border-indigo-500 rounded-full cursor-se-resize shadow-sm z-50 touch-none flex items-center justify-center"
                                                onPointerDown={(e) => handleInteraction(e, p.instanceId, 'resize')}
                                            >
                                                <div className="w-1.5 h-1.5 bg-indigo-500 rounded-full"></div>
                                            </div>
                                        </>
                                    )}
                                </div>
                            );
                        })}
                    </div>
                )}
            </div>
        </div>

        {/* RIGHT COLUMN: CONTROL PANEL */}
        <div className="md:w-1/3 p-6 md:p-8 flex flex-col relative bg-[#0f172a] z-10 border-t md:border-t-0 md:border-l border-white/5">
            
            {/* Header */}
            <div className="mb-8">
                <div className="flex items-center gap-3 mb-2 text-indigo-400 font-bold text-xs tracking-[0.2em] uppercase">
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z"></path></svg>
                    Digital Ink
                </div>
                <h2 className="text-4xl font-black text-white leading-[0.9] tracking-tighter">
                    SIGN PDF
                </h2>
            </div>

            {/* Content Area */}
            <div className="flex-1 flex flex-col min-h-0">
                {/* Assets List */}
                <div className="flex-1 overflow-y-auto custom-scrollbar mb-6">
                    <div className="flex items-center justify-between mb-4">
                        <label className="text-[10px] font-bold uppercase text-slate-500 tracking-wider">My Signatures</label>
                        <span className="text-[10px] bg-white/10 px-2 py-0.5 rounded-full text-white">{assets.length}</span>
                    </div>

                    {assets.length === 0 ? (
                        <div className="text-center py-8 border-2 border-dashed border-white/5 rounded-xl bg-white/5">
                            <span className="text-3xl block mb-2 opacity-50">✍️</span>
                            <p className="text-xs text-slate-400">No signatures yet.</p>
                        </div>
                    ) : (
                        <div className="grid grid-cols-1 gap-3">
                            {assets.map(asset => (
                                <div 
                                    key={asset.id}
                                    className="group relative bg-[#1e293b] rounded-xl p-3 border border-white/5 hover:border-indigo-500/50 transition-all cursor-pointer flex items-center gap-3"
                                    onClick={() => placeAsset(asset.id)}
                                >
                                    <div className="w-16 h-12 bg-white/90 rounded-lg flex items-center justify-center p-1 shrink-0">
                                        <img src={asset.url} className="max-w-full max-h-full object-contain" />
                                    </div>
                                    <div className="flex-1 min-w-0">
                                        <div className="text-xs font-bold text-white truncate">{asset.label || 'Signature'}</div>
                                        <div className="text-[10px] text-slate-500 uppercase">{asset.type}</div>
                                    </div>
                                    <div className="text-[10px] text-indigo-400 font-bold opacity-0 group-hover:opacity-100 transition-opacity">
                                        ADD +
                                    </div>
                                    <button 
                                        onClick={(e) => { e.stopPropagation(); deleteAsset(asset.id); }}
                                        className="absolute -top-2 -right-2 bg-red-500 text-white w-5 h-5 rounded-full flex items-center justify-center opacity-0 group-hover:opacity-100 transition-all hover:scale-110"
                                    >
                                        ✕
                                    </button>
                                </div>
                            ))}
                        </div>
                    )}
                </div>

                {/* Creation Buttons */}
                <div className="grid grid-cols-2 gap-3 mb-6">
                    <button 
                        onClick={() => setShowStudio(true)}
                        className="col-span-2 py-3 bg-white/10 hover:bg-white/20 text-white rounded-xl font-bold text-xs uppercase tracking-wider flex items-center justify-center gap-2 transition-all border border-white/5"
                    >
                        <span>+ New Signature</span>
                    </button>
                    <button 
                        onClick={createDateStamp}
                        className="py-3 bg-slate-800 hover:bg-slate-700 text-slate-300 hover:text-white rounded-xl font-bold text-[10px] uppercase tracking-wider transition-all border border-white/5"
                    >
                        Add Date
                    </button>
                    <button 
                        onClick={() => alert("Coming Soon")}
                        className="py-3 bg-slate-800 text-slate-500 rounded-xl font-bold text-[10px] uppercase tracking-wider transition-all border border-white/5 cursor-not-allowed opacity-50"
                    >
                        Add Text
                    </button>
                </div>

                {/* Download Button */}
                <button 
                    onClick={handleDownload}
                    disabled={!file || isSaving}
                    className="w-full py-4 bg-gradient-to-r from-indigo-600 to-indigo-500 hover:from-indigo-500 hover:to-indigo-400 text-white rounded-xl font-bold uppercase tracking-widest text-xs transition-all shadow-lg shadow-indigo-900/20 flex items-center justify-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed"
                >
                    {isSaving ? (
                        <span>Saving PDF...</span>
                    ) : (
                        <>
                            <span>Download Signed PDF</span>
                            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4"></path></svg>
                        </>
                    )}
                </button>
            </div>
        </div>
      </div>

      {showStudio && (
          <SignatureStudio 
            onSave={createAsset} 
            onCancel={() => setShowStudio(false)} 
          />
      )}

      <input ref={fileInputRef} type="file" accept=".pdf" className="hidden" onChange={(e) => e.target.files?.[0] && handleFile(e.target.files[0])} />
    </div>
  );
};

export default SignTool;
