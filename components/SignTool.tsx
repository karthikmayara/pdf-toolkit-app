
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
  const [inkColor, setInkColor] = useState('#1d4ed8'); // Default Blue
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
      <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4 animate-fade-in">
          <div className="bg-white dark:bg-slate-900 w-full max-w-2xl rounded-2xl shadow-2xl flex flex-col overflow-hidden max-h-[90vh]">
              
              {/* Header */}
              <div className="p-4 border-b border-slate-200 dark:border-slate-800 flex justify-between items-center bg-slate-50 dark:bg-slate-950">
                  <h3 className="font-bold text-lg text-slate-800 dark:text-white">New Signature Asset</h3>
                  <button onClick={onCancel} className="text-slate-400 hover:text-red-500">✕</button>
              </div>

              {/* Tabs */}
              <div className="flex border-b border-slate-200 dark:border-slate-800">
                  {['draw', 'type', 'upload'].map(t => (
                      <button
                        key={t}
                        onClick={() => setActiveTab(t as any)}
                        className={`flex-1 py-3 text-sm font-bold uppercase tracking-wider ${activeTab === t ? 'text-indigo-600 border-b-2 border-indigo-600 bg-indigo-50 dark:bg-slate-800 dark:text-indigo-400' : 'text-slate-500 hover:bg-slate-50 dark:hover:bg-slate-800'}`}
                      >
                          {t}
                      </button>
                  ))}
              </div>

              {/* Workspace */}
              <div className="p-6 flex-1 overflow-y-auto bg-slate-100 dark:bg-slate-800/50">
                  {activeTab === 'draw' && (
                      <div className="flex flex-col gap-4 h-full">
                          <div className="flex-1 bg-white rounded-xl shadow-inner border border-slate-200 overflow-hidden relative cursor-crosshair">
                              <canvas 
                                ref={canvasRef} 
                                onPointerDown={drawStart}
                                onPointerMove={drawMove}
                                onPointerUp={drawEnd}
                                onPointerLeave={drawEnd}
                                className="touch-none"
                              />
                              <button onClick={clearCanvas} className="absolute top-2 right-2 text-xs bg-slate-100 hover:bg-slate-200 px-2 py-1 rounded text-slate-600 font-bold shadow-sm">Clear</button>
                          </div>
                          
                          {/* Pen Controls */}
                          <div className="flex items-center gap-6 justify-center">
                              <div className="flex gap-2 bg-white dark:bg-slate-800 p-2 rounded-full shadow-sm border border-slate-200 dark:border-slate-700">
                                  {['#1d4ed8', '#000000', '#dc2626'].map(c => (
                                      <button 
                                        key={c}
                                        onClick={() => setInkColor(c)}
                                        className={`w-8 h-8 rounded-full border-2 ${inkColor === c ? 'border-white ring-2 ring-indigo-500 scale-110' : 'border-transparent'}`}
                                        style={{ backgroundColor: c }}
                                      />
                                  ))}
                              </div>
                              <input 
                                type="range" min="1" max="10" 
                                value={inkWidth} 
                                onChange={(e) => setInkWidth(Number(e.target.value))}
                                className="w-32 h-2 bg-slate-300 rounded-lg appearance-none cursor-pointer accent-slate-600" 
                              />
                          </div>
                      </div>
                  )}

                  {activeTab === 'type' && (
                      <div className="flex flex-col gap-6 h-full items-center justify-center">
                          <input 
                            type="text" 
                            value={typedText}
                            onChange={(e) => setTypedText(e.target.value)}
                            className="w-full text-4xl text-center bg-transparent border-b-2 border-slate-300 focus:border-indigo-500 outline-none pb-2 transition-colors"
                            style={{ fontFamily: selectedFont, color: inkColor }}
                            placeholder="Type Name..."
                            autoFocus
                          />
                          
                          <div className="grid grid-cols-2 gap-3 w-full">
                              {fonts.map(f => (
                                  <button
                                    key={f.name}
                                    onClick={() => setSelectedFont(f.name)}
                                    className={`p-3 rounded-lg border transition-all ${selectedFont === f.name ? 'border-indigo-500 bg-indigo-50 dark:bg-indigo-900/20 text-indigo-700' : 'border-slate-200 bg-white dark:bg-slate-700 hover:border-indigo-300'}`}
                                  >
                                      <span className="text-xl" style={{ fontFamily: f.name }}>Signature</span>
                                      <div className="text-[10px] uppercase text-slate-400 font-bold mt-1">{f.label}</div>
                                  </button>
                              ))}
                          </div>

                          <div className="flex gap-2 bg-white dark:bg-slate-800 p-2 rounded-full shadow-sm">
                                {['#1d4ed8', '#000000', '#dc2626', '#15803d'].map(c => (
                                    <button 
                                    key={c}
                                    onClick={() => setInkColor(c)}
                                    className={`w-8 h-8 rounded-full border-2 ${inkColor === c ? 'border-white ring-2 ring-indigo-500 scale-110' : 'border-transparent'}`}
                                    style={{ backgroundColor: c }}
                                    />
                                ))}
                          </div>
                      </div>
                  )}

                  {activeTab === 'upload' && (
                      <div 
                        onClick={() => fileRef.current?.click()}
                        className="h-full border-2 border-dashed border-slate-300 dark:border-slate-700 rounded-xl flex flex-col items-center justify-center cursor-pointer hover:border-indigo-500 hover:bg-indigo-50 dark:hover:bg-slate-800 transition-all"
                      >
                          {uploadedImg ? (
                              <img src={uploadedImg.src} className="max-h-64 object-contain" />
                          ) : (
                              <>
                                  <div className="text-4xl mb-4 text-slate-400">📷</div>
                                  <span className="font-bold text-slate-600 dark:text-slate-400">Click to Upload Image</span>
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
              <div className="p-4 border-t border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 flex justify-end gap-3">
                  <button onClick={onCancel} className="px-6 py-2.5 font-bold text-slate-500 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-lg">Cancel</button>
                  <button 
                    onClick={handleSave}
                    disabled={activeTab === 'type' && !typedText || activeTab === 'upload' && !uploadedImg}
                    className="px-8 py-2.5 bg-indigo-600 hover:bg-indigo-700 text-white font-bold rounded-lg shadow-lg disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                      Create Asset
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
      // Debounce slightly or just save
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
      const pages = await getPdfPageCount(f);
      setNumPages(pages);
      setCurrPage(0);
      setPlacements({});
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
      // Also remove placements? Maybe keep them but they won't render if re-opened.
  };

  const placeAsset = (assetId: string) => {
      const asset = assets.find(a => a.id === assetId);
      if (!asset) return;

      // Default logic: Center on page, width 30%
      const w = 30;
      // Get page aspect ratio? We don't have it easily without storing from renderPdfPage.
      // Assume A4 portrait (0.7) for rough placement or just use square and let user resize.
      // Better: Use visual approximation.
      const h = (w * 0.7) / asset.aspectRatio; // Approximation

      const newPlace: PlacedAsset = {
          instanceId: Math.random().toString(36).substr(2,9),
          assetId,
          pageIndex: currPage,
          x: 35, y: 45, w, h: h > 100 ? 20 : h // Sanity check
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
          // Prepare payload
          const insertions: AssetInsertion[] = assets.map(a => {
              // Find all placements for this asset across all pages
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
      } catch (e) {
          console.error(e);
          alert("Failed to sign PDF.");
      }
      setIsSaving(false);
  };

  // Interaction Logic (Drag & Resize)
  const handleInteraction = (e: React.PointerEvent, instanceId: string, mode: 'move' | 'resize', corner?: string) => {
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
              // Resize logic (Simple SE corner for now)
              let nw = Math.max(5, startPos.w + dx);
              // Maintain Aspect Ratio based on source asset
              const asset = assets.find(a => a.id === placement.assetId);
              // Aspect Ratio of PAGE vs Image matters. 
              // w is % of page width. h is % of page height.
              // We need page aspect ratio to lock it properly.
              // Approximation:
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
    <div className="max-w-7xl mx-auto animate-fade-in pb-12 h-[calc(100vh-100px)] flex flex-col md:flex-row gap-6">
      
      {/* LEFT: Asset Library */}
      <div className="w-full md:w-80 bg-white dark:bg-slate-800 rounded-2xl shadow-xl flex flex-col border border-slate-100 dark:border-slate-700 shrink-0">
          <div className="p-4 border-b border-slate-100 dark:border-slate-700 bg-gradient-to-r from-indigo-600 to-purple-600 text-white rounded-t-2xl">
              <h2 className="font-bold text-lg">Signing Desk</h2>
              <p className="text-xs opacity-80">Drag or tap assets to place</p>
          </div>
          
          <div className="flex-1 overflow-y-auto p-4 space-y-4 custom-scrollbar">
              {/* Asset List */}
              {assets.length === 0 ? (
                  <div className="text-center text-slate-400 py-8">
                      <div className="text-4xl mb-2">📇</div>
                      <p className="text-sm">No saved signatures.</p>
                  </div>
              ) : (
                  <div className="grid grid-cols-1 gap-3">
                      {assets.map(asset => (
                          <div 
                            key={asset.id}
                            className="group relative bg-slate-50 dark:bg-slate-700/50 rounded-xl p-3 border border-slate-200 dark:border-slate-600 hover:border-indigo-400 transition-all cursor-pointer shadow-sm hover:shadow-md"
                            onClick={() => placeAsset(asset.id)}
                          >
                              <div className="h-16 flex items-center justify-center mb-2 bg-white rounded-lg border border-slate-100 pattern-grid-lg">
                                  <img src={asset.url} className="max-h-full max-w-full object-contain" />
                              </div>
                              <div className="flex justify-between items-center">
                                  <span className="text-xs font-bold text-slate-600 dark:text-slate-300 truncate">{asset.label || 'Signature'}</span>
                                  <span className="text-[10px] text-slate-400 uppercase bg-slate-200 dark:bg-slate-600 px-1.5 rounded">{asset.type}</span>
                              </div>
                              <button 
                                onClick={(e) => { e.stopPropagation(); deleteAsset(asset.id); }}
                                className="absolute -top-2 -right-2 bg-red-500 text-white rounded-full p-1 opacity-0 group-hover:opacity-100 transition-opacity shadow-sm hover:scale-110"
                              >
                                  <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M6 18L18 6M6 6l12 12"></path></svg>
                              </button>
                          </div>
                      ))}
                  </div>
              )}
          </div>

          <div className="p-4 border-t border-slate-100 dark:border-slate-700 grid grid-cols-2 gap-2">
              <button 
                onClick={() => setShowStudio(true)}
                className="col-span-2 py-3 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl font-bold shadow-lg flex items-center justify-center gap-2 transition-transform active:scale-95"
              >
                  <span className="text-xl">+</span> New Signature
              </button>
              <button onClick={createDateStamp} className="py-2 bg-slate-100 dark:bg-slate-700 text-slate-700 dark:text-slate-200 rounded-lg text-xs font-bold hover:bg-slate-200">
                  📅 Add Date
              </button>
              <button onClick={() => alert("Text Stamp coming soon!")} className="py-2 bg-slate-100 dark:bg-slate-700 text-slate-700 dark:text-slate-200 rounded-lg text-xs font-bold hover:bg-slate-200 opacity-50 cursor-not-allowed">
                  T Add Text
              </button>
          </div>
      </div>

      {/* RIGHT: Document Stage */}
      <div className="flex-1 bg-slate-200 dark:bg-slate-900 rounded-2xl shadow-inner border border-slate-300 dark:border-slate-700 flex flex-col relative overflow-hidden">
          
          {/* Toolbar */}
          <div className="h-14 bg-white dark:bg-slate-800 border-b border-slate-200 dark:border-slate-700 flex items-center justify-between px-4 shrink-0 z-10">
              <div className="flex items-center gap-4">
                  {file ? (
                      <>
                        <button onClick={() => setFile(null)} className="text-xs font-bold text-red-500 hover:bg-red-50 px-2 py-1 rounded">Change PDF</button>
                        <div className="h-6 w-px bg-slate-200 dark:bg-slate-600"></div>
                        <div className="flex items-center gap-2">
                            <button onClick={() => setCurrPage(Math.max(0, currPage - 1))} disabled={currPage === 0} className="p-1 hover:bg-slate-100 rounded disabled:opacity-30">◀</button>
                            <span className="text-sm font-mono font-bold text-slate-700 dark:text-slate-200">{currPage + 1} / {numPages}</span>
                            <button onClick={() => setCurrPage(Math.min(numPages - 1, currPage + 1))} disabled={currPage === numPages - 1} className="p-1 hover:bg-slate-100 rounded disabled:opacity-30">▶</button>
                        </div>
                      </>
                  ) : (
                      <span className="text-sm font-bold text-slate-400">No Document Loaded</span>
                  )}
              </div>
              
              {file && (
                  <button 
                    onClick={handleDownload}
                    disabled={isSaving}
                    className="px-4 py-1.5 bg-green-600 text-white rounded-lg text-sm font-bold shadow hover:bg-green-700 disabled:opacity-50"
                  >
                      {isSaving ? 'Signing...' : 'Download Signed PDF'}
                  </button>
              )}
          </div>

          {/* Canvas */}
          <div className="flex-1 overflow-auto flex items-center justify-center p-4 md:p-8 relative">
              {!file ? (
                  <div 
                    onClick={() => fileInputRef.current?.click()}
                    className="border-4 border-dashed border-slate-300 dark:border-slate-600 rounded-xl p-12 text-center cursor-pointer hover:border-indigo-400 transition-colors"
                  >
                      <div className="text-6xl mb-4 opacity-50">📄</div>
                      <h3 className="text-xl font-bold text-slate-600 dark:text-slate-300">Open PDF to Sign</h3>
                  </div>
              ) : (
                  <div ref={containerRef} className="relative shadow-2xl transition-opacity" style={{ width: '100%', maxWidth: '800px' }}>
                      {isRendering && (
                          <div className="absolute inset-0 z-20 bg-white/50 dark:bg-slate-900/50 backdrop-blur-sm flex items-center justify-center">
                              <div className="animate-spin w-10 h-10 border-4 border-indigo-600 border-t-transparent rounded-full"></div>
                          </div>
                      )}
                      
                      {/* PDF Page Image */}
                      {pageImg && <img src={pageImg} className="w-full h-auto block select-none" draggable={false} />}

                      {/* Overlays */}
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
                                  <div className={`w-full h-full ${isActive ? 'border-2 border-indigo-500 bg-indigo-500/10' : 'border border-transparent hover:border-indigo-300'}`}>
                                      <img src={asset.url} className="w-full h-full object-contain pointer-events-none" />
                                  </div>
                                  
                                  {/* Delete Button */}
                                  {isActive && (
                                      <button 
                                        onPointerDown={(e) => { e.stopPropagation(); removePlacement(p.instanceId); }}
                                        className="absolute -top-3 -right-3 bg-red-500 text-white rounded-full p-1 shadow-md hover:scale-110 z-50 touch-manipulation"
                                      >
                                          <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M6 18L18 6M6 6l12 12"></path></svg>
                                      </button>
                                  )}

                                  {/* Resize Handle */}
                                  {isActive && (
                                      <div 
                                        className="absolute -bottom-2 -right-2 w-5 h-5 bg-white border-2 border-indigo-500 rounded-full cursor-se-resize shadow-sm z-50 touch-none"
                                        onPointerDown={(e) => handleInteraction(e, p.instanceId, 'resize')}
                                      />
                                  )}
                              </div>
                          );
                      })}
                  </div>
              )}
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
