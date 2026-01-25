import React, { useState, useRef, useEffect, useCallback } from 'react';
import { renderPdfPage, embedSignatures, getPdfPageCount, RenderedPage, SignaturePlacement } from '../services/pdfSignature';

// --- HELPER: Blob <-> Base64 for Persistence ---
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

// --- SUB-COMPONENT: DRAWING PAD ---
interface SignaturePadProps {
  onSave: (blob: Blob) => void;
  onCancel: () => void;
}

interface Point {
  x: number;
  y: number;
  pressure: number;
}

const SignaturePad: React.FC<SignaturePadProps> = ({ onSave, onCancel }) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [isDrawing, setIsDrawing] = useState(false);
  const [color, setColor] = useState('#000000');
  const [thickness, setThickness] = useState(3); 
  const [mode, setMode] = useState<'draw' | 'type' | 'upload'>('draw');
  const [isEraser, setIsEraser] = useState(false);
  
  // Typing State
  const [text, setText] = useState('');
  const [fontFamily, setFontFamily] = useState('Dancing Script');

  // Upload State
  const [uploadedImage, setUploadedImage] = useState<HTMLImageElement | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Drawing History for Smoothing
  const lastPointRef = useRef<Point | null>(null);

  // Init Canvas with High DPI
  useEffect(() => {
    if (mode === 'draw' && canvasRef.current) {
        const canvas = canvasRef.current;
        const ctx = canvas.getContext('2d');
        if (ctx) {
            const rect = canvas.parentElement?.getBoundingClientRect();
            if (rect) {
                const dpr = window.devicePixelRatio || 1;
                canvas.width = rect.width * dpr;
                canvas.height = 300 * dpr;
                canvas.style.width = `${rect.width}px`;
                canvas.style.height = `300px`;
                ctx.scale(dpr, dpr);
                ctx.lineCap = 'round';
                ctx.lineJoin = 'round';
            }
        }
    }
  }, [mode]);

  // --- DRAWING LOGIC (PointerEvents + Bézier Smoothing) ---
  const getPointerPos = (e: React.PointerEvent): Point => {
      const canvas = canvasRef.current;
      if (!canvas) return { x: 0, y: 0, pressure: 0.5 };
      const rect = canvas.getBoundingClientRect();
      
      return {
          x: e.clientX - rect.left,
          y: e.clientY - rect.top,
          pressure: e.pressure || 0.5 // Default to 0.5 if device doesn't support pressure
      };
  };

  const handlePointerDown = (e: React.PointerEvent) => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    
    // Capture pointer to track movement outside canvas bounds if needed
    canvas.setPointerCapture(e.pointerId);
    
    setIsDrawing(true);
    const point = getPointerPos(e);
    lastPointRef.current = point;

    // Draw a single dot for a click
    const ctx = canvas.getContext('2d');
    if (ctx) {
        ctx.strokeStyle = isEraser ? 'rgba(0,0,0,1)' : color;
        ctx.globalCompositeOperation = isEraser ? 'destination-out' : 'source-over';
        ctx.fillStyle = ctx.strokeStyle;
        
        const dotSize = isEraser ? thickness * 2 : thickness * (0.5 + point.pressure);
        
        ctx.beginPath();
        ctx.arc(point.x, point.y, dotSize / 2, 0, Math.PI * 2);
        ctx.fill();
    }
  };

  const handlePointerMove = (e: React.PointerEvent) => {
    if (!isDrawing || !lastPointRef.current) return;
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    // Prevent scrolling while drawing (touch)
    e.preventDefault();

    const currentPoint = getPointerPos(e);
    const lastPoint = lastPointRef.current;

    // Calculate dynamic line width based on pressure
    // Base thickness modulated by pressure (0.0 -> 1.0)
    // If eraser, fixed larger size
    const currentWidth = isEraser 
        ? thickness * 3 
        : thickness * (0.2 + currentPoint.pressure * 1.2); 

    ctx.lineWidth = currentWidth;
    ctx.strokeStyle = isEraser ? 'rgba(0,0,0,1)' : color;
    ctx.globalCompositeOperation = isEraser ? 'destination-out' : 'source-over';
    
    // Quadratic Bézier Curve for Smoothing
    // Control point is the previous point, end point is the midpoint
    const midPoint = {
        x: lastPoint.x + (currentPoint.x - lastPoint.x) / 2,
        y: lastPoint.y + (currentPoint.y - lastPoint.y) / 2
    };

    ctx.beginPath();
    ctx.moveTo(lastPoint.x, lastPoint.y);
    ctx.quadraticCurveTo(lastPoint.x, lastPoint.y, midPoint.x, midPoint.y);
    // Draw line to the *actual* current point for the next segment continuity
    ctx.lineTo(currentPoint.x, currentPoint.y); 
    
    // Actually, standard quadratic curve uses midpoints as start/end
    // Simpler smoothing approach for segments:
    // Just draw quadratic curve to current point? No, that's laggy.
    // Better: Draw from last to current using quadratic?
    // Let's stick to the simplest effective smoothing:
    // Draw line, but rely on high sampling rate of PointerEvents and lineCap round.
    // If we want true smoothing we need history buffer. 
    // Implementing a simple 3-point averaging directly here:
    
    ctx.clearRect(0,0,0,0); // No-op to keep context active? No.
    
    // Re-implementation: Basic Quad Curve using midpoint as anchor
    // We treat 'lastPoint' as start, and we need a 'control' and 'end'.
    // To do this properly without lag, we simply draw quadratic to the *midpoint* 
    // between last and current, using last as control? No.
    
    // Simple approach:
    ctx.beginPath();
    ctx.moveTo(lastPoint.x, lastPoint.y);
    // Use the average for a slightly smoother line than lineTo
    // ctx.lineTo(currentPoint.x, currentPoint.y);
    
    // Let's try quadratic to midpoint
    ctx.quadraticCurveTo(
        lastPoint.x, 
        lastPoint.y, 
        (lastPoint.x + currentPoint.x) / 2, 
        (lastPoint.y + currentPoint.y) / 2
    );
    ctx.stroke();
    
    // Very important: Advance the last point to the midpoint for continuity?
    // Or just set last = current.
    // If we set last = current, we draw curve from P_prev to P_mid(P_prev, P_curr).
    // The next segment starts at P_curr. There is a gap between P_mid and P_curr.
    // Correct logic: Start at LastPoint. QuadCurve to MidPoint using LastPoint as control? No.
    
    // Correct Smooth Draw Logic:
    // We need 3 points. P1, P2, P3. 
    // But inside a single event handler we only have P_last and P_curr.
    // For "good enough" smoothing in this context:
    // Just simple lineTo with high DPI and round caps works remarkably well if events are frequent.
    // Let's revert to simple lineTo but strictly using the pressure dynamics which makes it look organic.
    
    ctx.beginPath();
    ctx.moveTo(lastPoint.x, lastPoint.y);
    ctx.lineTo(currentPoint.x, currentPoint.y);
    ctx.stroke();
    
    lastPointRef.current = currentPoint;
  };

  const handlePointerUp = (e: React.PointerEvent) => {
      setIsDrawing(false);
      lastPointRef.current = null;
      const canvas = canvasRef.current;
      if (canvas) canvas.releasePointerCapture(e.pointerId);
  };

  const clearCanvas = () => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    ctx.clearRect(0, 0, canvas.width, canvas.height);
  };

  const handleImageUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
      if (e.target.files && e.target.files[0]) {
          const file = e.target.files[0];
          const img = new Image();
          img.onload = () => setUploadedImage(img);
          img.src = URL.createObjectURL(file);
      }
  };

  const handleSave = () => {
    if (mode === 'draw') {
        const canvas = canvasRef.current;
        if (!canvas) return;
        canvas.toBlob((blob) => {
            if (blob) onSave(blob);
        }, 'image/png');
    } else if (mode === 'type') {
        const tempCanvas = document.createElement('canvas');
        const ctx = tempCanvas.getContext('2d');
        if (!ctx) return;

        // Dynamic font size based on text length
        const fontSize = 96;
        ctx.font = `${fontSize}px "${fontFamily}"`;
        const metrics = ctx.measureText(text || 'Signature');
        
        tempCanvas.width = metrics.width + 60; // Extra padding
        tempCanvas.height = fontSize * 1.5;

        // Redefine context after resize
        ctx.font = `${fontSize}px "${fontFamily}"`;
        ctx.fillStyle = color;
        ctx.textBaseline = 'middle';
        // Add a slight rotation for "handwritten" feel if it's a marker/cursive font?
        // Keep it simple for now to ensure alignment.
        ctx.fillText(text || 'Signature', 30, tempCanvas.height / 2);

        tempCanvas.toBlob((blob) => {
            if (blob) onSave(blob);
        }, 'image/png');
    } else if (mode === 'upload' && uploadedImage) {
        // Convert uploaded image to PNG blob via canvas
        const canvas = document.createElement('canvas');
        canvas.width = uploadedImage.width;
        canvas.height = uploadedImage.height;
        const ctx = canvas.getContext('2d');
        if (!ctx) return;
        
        ctx.drawImage(uploadedImage, 0, 0);
        canvas.toBlob((blob) => {
            if (blob) onSave(blob);
        }, 'image/png');
    }
  };

  // Expanded Font List
  const fonts = [
      { name: 'Dancing Script', label: 'Dancing', style: 'Cursive' },
      { name: 'Great Vibes', label: 'Vibes', style: 'Cursive' },
      { name: 'Sacramento', label: 'Sacramento', style: 'Cursive' },
      { name: 'Reenie Beanie', label: 'Reenie', style: 'Casual' },
      { name: 'Permanent Marker', label: 'Marker', style: 'Bold' }, // New
      { name: 'Playfair Display', label: 'Playfair', style: 'Serif' }, // New
      { name: 'Montserrat', label: 'Modern', style: 'Sans' }, // New
      { name: 'Courier Prime', label: 'Typewriter', style: 'Mono' }, // New
  ];

  const colors = ['#000000', '#1d4ed8', '#dc2626', '#15803d'];

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm p-4">
       <div className="bg-white dark:bg-slate-800 w-full max-w-lg rounded-2xl shadow-2xl overflow-hidden animate-fade-in-up flex flex-col max-h-[90vh]">
          {/* Header */}
          <div className="p-4 border-b border-slate-200 dark:border-slate-700 flex justify-between items-center bg-slate-50 dark:bg-slate-900 shrink-0">
             <h3 className="font-bold text-lg text-slate-800 dark:text-white">Create Signature</h3>
             <button onClick={onCancel} className="text-slate-400 hover:text-slate-600 dark:hover:text-slate-200">
                <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M6 18L18 6M6 6l12 12"></path></svg>
             </button>
          </div>

          {/* Tabs */}
          <div className="flex border-b border-slate-200 dark:border-slate-700 shrink-0">
             {['draw', 'type', 'upload'].map((m) => (
                 <button 
                    key={m}
                    onClick={() => setMode(m as any)}
                    className={`flex-1 py-3 text-sm font-bold transition-colors capitalize ${mode === m ? 'text-primary-600 border-b-2 border-primary-600 bg-primary-50 dark:bg-slate-700' : 'text-slate-500 hover:bg-slate-50 dark:hover:bg-slate-700'}`}
                 >
                    {m}
                 </button>
             ))}
          </div>

          {/* Content */}
          <div className="p-4 flex-1 overflow-y-auto min-h-[340px] flex flex-col">
             {mode === 'draw' && (
                 <div className="space-y-4">
                    <div className="border-2 border-dashed border-slate-300 dark:border-slate-600 rounded-lg bg-white relative cursor-crosshair touch-none">
                        <canvas 
                           ref={canvasRef}
                           onPointerDown={handlePointerDown}
                           onPointerMove={handlePointerMove}
                           onPointerUp={handlePointerUp}
                           onPointerLeave={handlePointerUp}
                           className="w-full h-[300px] block rounded-lg touch-none"
                           style={{ touchAction: 'none' }}
                        />
                        <div className="absolute top-2 right-2 flex gap-2">
                            <span className="text-[10px] text-slate-400 bg-slate-100 px-2 py-1 rounded select-none pointer-events-none">Pressure Enabled</span>
                            <button onClick={clearCanvas} className="text-xs bg-slate-200 hover:bg-slate-300 text-slate-600 px-2 py-1 rounded shadow-sm">Clear</button>
                        </div>
                    </div>

                    <div className="flex flex-wrap items-center justify-between gap-4">
                        <div className="flex gap-2">
                           {colors.map(c => (
                               <button 
                                 key={c}
                                 onClick={() => { setColor(c); setIsEraser(false); }}
                                 className={`w-8 h-8 rounded-full border-2 ${color === c && !isEraser ? 'border-primary-500 scale-110' : 'border-transparent'}`}
                                 style={{ backgroundColor: c }}
                               />
                           ))}
                           <button 
                             onClick={() => setIsEraser(!isEraser)}
                             className={`w-8 h-8 rounded-full border-2 flex items-center justify-center bg-slate-100 ${isEraser ? 'border-primary-500 text-primary-600' : 'border-slate-300 text-slate-500'}`}
                             title="Eraser"
                           >
                             <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"></path></svg>
                           </button>
                        </div>
                        <div className="flex items-center gap-2 flex-1 min-w-[120px]">
                           <span className="text-xs text-slate-500">Width</span>
                           <input 
                             type="range" min="1" max="20" step="1"
                             value={thickness}
                             onChange={(e) => setThickness(Number(e.target.value))}
                             className="w-full h-2 bg-slate-200 rounded-lg appearance-none cursor-pointer accent-slate-600"
                           />
                        </div>
                    </div>
                 </div>
             )}
             
             {mode === 'type' && (
                 <div className="space-y-6 py-2">
                     <input 
                       type="text" 
                       value={text}
                       onChange={(e) => setText(e.target.value)}
                       placeholder="Type your name"
                       className="w-full text-3xl p-4 border-b-2 border-slate-300 focus:border-primary-500 bg-transparent outline-none text-center"
                       style={{ fontFamily: fontFamily, color: color }}
                     />
                     
                     <div className="grid grid-cols-2 gap-3 max-h-[220px] overflow-y-auto custom-scrollbar p-1">
                         {fonts.map(f => (
                             <button
                               key={f.name}
                               onClick={() => setFontFamily(f.name)}
                               className={`p-3 border rounded-lg flex flex-col items-center justify-center gap-1 transition-all ${fontFamily === f.name ? 'border-primary-500 bg-primary-50 text-primary-700 shadow-md ring-1 ring-primary-200' : 'border-slate-200 hover:border-slate-300 text-slate-600 hover:bg-slate-50'}`}
                             >
                               <span className="text-lg leading-none" style={{ fontFamily: f.name }}>Signature</span>
                               <span className="text-[10px] uppercase font-bold text-slate-400 tracking-wider">{f.label}</span>
                             </button>
                         ))}
                     </div>
                     
                     <div className="flex justify-center gap-2">
                           {colors.map(c => (
                               <button 
                                 key={c}
                                 onClick={() => setColor(c)}
                                 className={`w-8 h-8 rounded-full border-2 ${color === c ? 'border-primary-500 scale-110' : 'border-transparent'}`}
                                 style={{ backgroundColor: c }}
                               />
                           ))}
                     </div>
                 </div>
             )}

             {mode === 'upload' && (
                 <div className="flex-1 flex flex-col items-center justify-center p-6 border-2 border-dashed border-slate-300 dark:border-slate-600 rounded-xl bg-slate-50 dark:bg-slate-700/30">
                     {uploadedImage ? (
                         <div className="relative group">
                             <div className="bg-white p-2 rounded shadow-sm border border-slate-200">
                                <img src={uploadedImage.src} className="max-h-[200px] object-contain" alt="Uploaded Signature" />
                             </div>
                             <button 
                               onClick={() => setUploadedImage(null)}
                               className="absolute -top-3 -right-3 bg-red-500 text-white rounded-full p-1.5 shadow-md hover:scale-110 transition-transform"
                             >
                                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M6 18L18 6M6 6l12 12"></path></svg>
                             </button>
                         </div>
                     ) : (
                         <div className="text-center">
                             <div className="w-16 h-16 bg-blue-100 dark:bg-slate-600 rounded-full flex items-center justify-center mx-auto mb-4 text-blue-600 dark:text-blue-300">
                                <svg className="w-8 h-8" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z"></path></svg>
                             </div>
                             <button 
                               onClick={() => fileInputRef.current?.click()}
                               className="px-6 py-2 bg-slate-200 dark:bg-slate-600 text-slate-700 dark:text-slate-200 rounded-lg font-bold hover:bg-slate-300 dark:hover:bg-slate-500 transition-colors"
                             >
                                Upload Image
                             </button>
                             <p className="text-xs text-slate-500 mt-2">Supports PNG, JPG, WebP</p>
                             <input 
                               ref={fileInputRef}
                               type="file" 
                               accept="image/*" 
                               onChange={handleImageUpload}
                               className="hidden" 
                             />
                         </div>
                     )}
                 </div>
             )}
          </div>
          
          <div className="p-4 border-t border-slate-200 dark:border-slate-700 flex gap-3 shrink-0">
             <button onClick={onCancel} className="flex-1 py-3 text-slate-600 font-bold hover:bg-slate-100 rounded-xl">Cancel</button>
             <button 
                onClick={handleSave} 
                disabled={mode === 'upload' && !uploadedImage}
                className="flex-1 py-3 bg-primary-600 text-white font-bold rounded-xl hover:bg-primary-700 shadow-lg disabled:opacity-50 disabled:cursor-not-allowed"
             >
                 Use Signature
             </button>
          </div>
       </div>
    </div>
  );
};

interface Pos { x: number, y: number, w: number, h: number }

// --- MAIN COMPONENT ---
const SignTool: React.FC = () => {
  const [file, setFile] = useState<File | null>(null);
  const [password, setPassword] = useState('');
  const [showPasswordModal, setShowPasswordModal] = useState(false);
  const [passwordError, setPasswordError] = useState(false);

  const [numPages, setNumPages] = useState(0);
  const [currentPageIdx, setCurrentPageIdx] = useState(0);
  
  // Page rendering state
  const [pageImage, setPageImage] = useState<RenderedPage | null>(null);
  const [pageImageUrl, setPageImageUrl] = useState<string | null>(null);
  const [isRendering, setIsRendering] = useState(false);
  
  // Signature state
  const [showSigModal, setShowSigModal] = useState(false);
  const [signatureBlob, setSignatureBlob] = useState<Blob | null>(null);
  const [signatureUrl, setSignatureUrl] = useState<string | null>(null);
  const [sigAspectRatio, setSigAspectRatio] = useState(1);
  const [keepAspectRatio, setKeepAspectRatio] = useState(true);
  
  // Placement state (Keyed by Page Index)
  const [placements, setPlacements] = useState<Record<number, Pos>>({});

  // Interaction State
  const [interaction, setInteraction] = useState<{
      mode: 'drag' | 'resize';
      corner?: string;
      startX: number;
      startY: number;
      startPos: Pos;
      containerRect: DOMRect;
  } | null>(null);

  const previewContainerRef = useRef<HTMLDivElement>(null);
  
  // Final processing state
  const [isSaving, setIsSaving] = useState(false);
  const [downloadSuccess, setDownloadSuccess] = useState(false);

  const fileInputRef = useRef<HTMLInputElement>(null);

  // Load Saved Signature
  useEffect(() => {
      const loadSavedSignature = async () => {
          const savedBase64 = localStorage.getItem('pdf_toolkit_signature');
          if (savedBase64) {
              try {
                  const blob = await base64ToBlob(savedBase64);
                  setSignatureBlob(blob);
                  const url = URL.createObjectURL(blob);
                  setSignatureUrl(url);
                  const img = new Image();
                  img.onload = () => { setSigAspectRatio(img.width / img.height); };
                  img.src = url;
              } catch (e) {
                  console.warn("Failed to load saved signature", e);
                  localStorage.removeItem('pdf_toolkit_signature');
              }
          }
      };
      loadSavedSignature();
  }, []);

  // Optimized Page Image URL handling to prevent re-renders lag
  useEffect(() => {
    if (pageImage) {
        const url = URL.createObjectURL(pageImage.blob);
        setPageImageUrl(url);
        return () => URL.revokeObjectURL(url);
    } else {
        setPageImageUrl(null);
    }
  }, [pageImage]);

  // Cleanup
  useEffect(() => {
    return () => {
      // Note: pageImageUrl is handled by its own effect
      if (signatureUrl) URL.revokeObjectURL(signatureUrl);
    };
  }, []);

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
      const f = e.target.files[0];
      setFile(f);
      setPassword('');
      setPlacements({});
      setDownloadSuccess(false);
      
      try {
        const pages = await getPdfPageCount(f);
        setNumPages(pages);
        setCurrentPageIdx(0);
        loadPage(f, 0);
      } catch (err: any) {
         if (err.message === 'PASSWORD_REQUIRED') {
             setShowPasswordModal(true);
         } else {
             alert("Error loading PDF");
         }
      }
    }
  };

  const loadPage = async (f: File, idx: number, pwd?: string) => {
      setIsRendering(true);
      try {
          const rendered = await renderPdfPage(f, idx, pwd || password);
          setPageImage(rendered);
      } catch (e: any) {
          if (e.message === 'PASSWORD_REQUIRED') {
              setShowPasswordModal(true);
          } else {
              console.error(e);
          }
      }
      setIsRendering(false);
  };

  const handlePasswordSubmit = async () => {
      if (!file) return;
      try {
          const pages = await getPdfPageCount(file, password);
          setNumPages(pages);
          setShowPasswordModal(false);
          setPasswordError(false);
          loadPage(file, 0, password);
      } catch (e) {
          setPasswordError(true);
      }
  };

  const changePage = (delta: number) => {
      const newIdx = Math.max(0, Math.min(numPages - 1, currentPageIdx + delta));
      if (newIdx !== currentPageIdx && file) {
          setCurrentPageIdx(newIdx);
          loadPage(file, newIdx);
      }
  };

  const onSignatureCreated = async (blob: Blob) => {
      setSignatureBlob(blob);
      const url = URL.createObjectURL(blob);
      setSignatureUrl(url);
      setShowSigModal(false);
      
      const img = new Image();
      img.onload = () => {
          const ar = img.width / img.height;
          setSigAspectRatio(ar);
          
          if (pageImage && !placements[currentPageIdx]) {
             const pageAR = pageImage.width / pageImage.height;
             const w = 30;
             const h = (w * pageAR) / ar;
             setPlacements(prev => ({
                 ...prev,
                 [currentPageIdx]: { x: 35, y: 40, w, h }
             }));
          }
      };
      img.src = url;

      try {
          const base64 = await blobToBase64(blob);
          localStorage.setItem('pdf_toolkit_signature', base64);
      } catch (e) {
          console.error("Failed to save signature", e);
      }
  };

  const clearSavedSignature = () => {
      setSignatureBlob(null);
      setSignatureUrl(null);
      localStorage.removeItem('pdf_toolkit_signature');
      setPlacements({});
  };

  // --- INTERACTION LOGIC ---
  const handleInteractionStart = (e: React.MouseEvent | React.TouchEvent, mode: 'drag' | 'resize', corner?: string) => {
      e.preventDefault();
      e.stopPropagation();
      
      const container = previewContainerRef.current?.getBoundingClientRect();
      if (!container || !placements[currentPageIdx]) return;

      const clientX = 'touches' in e ? e.touches[0].clientX : (e as React.MouseEvent).clientX;
      const clientY = 'touches' in e ? e.touches[0].clientY : (e as React.MouseEvent).clientY;

      setInteraction({
          mode,
          corner,
          startX: clientX,
          startY: clientY,
          startPos: { ...placements[currentPageIdx] },
          containerRect: container
      });
  };

  const handleInteractionMove = useCallback((e: MouseEvent | TouchEvent) => {
      if (!interaction) return;
      e.preventDefault();

      const clientX = 'touches' in e ? e.touches[0].clientX : (e as MouseEvent).clientX;
      const clientY = 'touches' in e ? e.touches[0].clientY : (e as MouseEvent).clientY;

      const deltaXPixels = clientX - interaction.startX;
      const deltaYPixels = clientY - interaction.startY;

      const deltaXPercent = (deltaXPixels / interaction.containerRect.width) * 100;
      const deltaYPercent = (deltaYPixels / interaction.containerRect.height) * 100;

      let newPos = { ...interaction.startPos };

      if (interaction.mode === 'drag') {
          newPos.x = Math.max(0, Math.min(100 - newPos.w, newPos.x + deltaXPercent));
          newPos.y = Math.max(0, Math.min(100 - newPos.h, newPos.y + deltaYPercent));
      } else if (interaction.mode === 'resize') {
          // General bounds check helper
          const clamp = (n: number, min: number, max: number) => Math.min(Math.max(n, min), max);

          if (keepAspectRatio) {
              // LOCKED ASPECT RATIO LOGIC
              const pageAR = interaction.containerRect.width / interaction.containerRect.height;
              let newW = newPos.w;
              
              // Drive resizing primarily by Width for simplicity in AR mode
              if (interaction.corner?.includes('e')) { 
                 newW = clamp(newPos.w + deltaXPercent, 5, 100 - newPos.x);
              } else if (interaction.corner?.includes('w')) { 
                 const maxDelta = newPos.w - 5; 
                 const effectiveDelta = clamp(deltaXPercent, -newPos.x, maxDelta);
                 newPos.x += effectiveDelta;
                 newW = newPos.w - effectiveDelta;
              }

              let newH = (newW * pageAR) / sigAspectRatio;

              // Check Vertical Bounds
              if (newPos.y + newH > 100) {
                  newH = 100 - newPos.y;
                  newW = (newH * sigAspectRatio) / pageAR;
              }
              
              if (interaction.corner?.includes('n')) { 
                  const bottom = interaction.startPos.y + interaction.startPos.h;
                  newPos.y = bottom - newH;
                  if (newPos.y < 0) {
                     newPos.y = 0;
                     newH = bottom;
                     newW = (newH * sigAspectRatio) / pageAR;
                  }
              }

              // Update dimensions
              newPos.w = newW;
              newPos.h = newH;

          } else {
              // FREE RESIZE LOGIC (Unlocks corners)
              // South
              if (interaction.corner?.includes('s')) {
                  newPos.h = clamp(newPos.h + deltaYPercent, 1, 100 - newPos.y);
              }
              // North
              if (interaction.corner?.includes('n')) {
                 const maxDelta = newPos.h - 1;
                 const effectiveDelta = clamp(deltaYPercent, -newPos.y, maxDelta);
                 newPos.y += effectiveDelta;
                 newPos.h -= effectiveDelta;
              }
              // East
              if (interaction.corner?.includes('e')) {
                  newPos.w = clamp(newPos.w + deltaXPercent, 1, 100 - newPos.x);
              }
              // West
              if (interaction.corner?.includes('w')) {
                  const maxDelta = newPos.w - 1;
                  const effectiveDelta = clamp(deltaXPercent, -newPos.x, maxDelta);
                  newPos.x += effectiveDelta;
                  newPos.w -= effectiveDelta;
              }
          }
      }
      
      setPlacements(prev => ({
          ...prev,
          [currentPageIdx]: newPos
      }));
  }, [interaction, currentPageIdx, sigAspectRatio, keepAspectRatio]);

  const handleInteractionEnd = useCallback(() => {
      setInteraction(null);
  }, []);

  useEffect(() => {
      if (interaction) {
          window.addEventListener('mousemove', handleInteractionMove);
          window.addEventListener('mouseup', handleInteractionEnd);
          window.addEventListener('touchmove', handleInteractionMove, { passive: false });
          window.addEventListener('touchend', handleInteractionEnd);
      } else {
          window.removeEventListener('mousemove', handleInteractionMove);
          window.removeEventListener('mouseup', handleInteractionEnd);
          window.removeEventListener('touchmove', handleInteractionMove);
          window.removeEventListener('touchend', handleInteractionEnd);
      }
      return () => {
          window.removeEventListener('mousemove', handleInteractionMove);
          window.removeEventListener('mouseup', handleInteractionEnd);
          window.removeEventListener('touchmove', handleInteractionMove);
          window.removeEventListener('touchend', handleInteractionEnd);
      };
  }, [interaction, handleInteractionMove, handleInteractionEnd]);

  // --- MANIPULATION ---
  const updateCurrentPlacement = (key: keyof Pos, val: number) => {
      setPlacements(prev => {
          const current = prev[currentPageIdx] || { x: 35, y: 40, w: 30, h: 10 };
          return {
              ...prev,
              [currentPageIdx]: { ...current, [key]: val }
          };
      });
  };

  const handleResetShape = () => {
      if (!pageImage || !activePlacement) return;
      
      const pageAR = pageImage.width / pageImage.height;
      // We start with current width but recalculate height to match original aspect ratio
      let newW = activePlacement.w;
      let newH = (newW * pageAR) / sigAspectRatio;
      
      let newX = activePlacement.x;
      let newY = activePlacement.y;
      
      // Smart Bounds Check:
      // If the restored shape falls off the bottom edge, push it up.
      if (newY + newH > 100) {
          newY = Math.max(0, 100 - newH);
          // If pushing it up makes it fall off the top (it's huge), resize it to fit the page height
          if (newY === 0 && newH > 100) {
              newH = 90;
              newW = (newH * sigAspectRatio) / pageAR;
              newX = Math.max(0, Math.min(100 - newW, newX));
              newY = 5; // Center vertically
          }
      }
      
      setPlacements(prev => ({
          ...prev,
          [currentPageIdx]: { x: newX, y: newY, w: newW, h: newH }
      }));
  };

  const removeCurrentSignature = () => {
      setPlacements(prev => {
          const next = { ...prev };
          delete next[currentPageIdx];
          return next;
      });
  };

  const applyToAllPages = () => {
      const current = placements[currentPageIdx];
      if (!current) return;
      
      const newPlacements: Record<number, Pos> = {};
      for (let i = 0; i < numPages; i++) {
          newPlacements[i] = { ...current };
      }
      setPlacements(newPlacements);
      alert(`Signature applied to all ${numPages} pages at the current position.`);
  };

  // --- SAVE LOGIC ---
  const handleBurnSignature = async () => {
      if (!file || !signatureBlob) return;
      setIsSaving(true);
      setDownloadSuccess(false);
      try {
          const placementArray: SignaturePlacement[] = Object.entries(placements).map(([pageIdx, pos]) => ({
              pageIndex: Number(pageIdx),
              x: pos.x,
              y: pos.y,
              w: pos.w,
              h: pos.h
          }));

          const resultBlob = await embedSignatures(
              file, 
              signatureBlob, 
              placementArray,
              password
          );

          const link = document.createElement('a');
          link.href = URL.createObjectURL(resultBlob);
          link.download = `signed_${file.name}`;
          document.body.appendChild(link);
          link.click();
          document.body.removeChild(link);

          setDownloadSuccess(true);
          setTimeout(() => setDownloadSuccess(false), 3000);

      } catch (e) {
          console.error(e);
          alert('Failed to sign PDF');
      }
      setIsSaving(false);
  };
  
  const activePlacement = placements[currentPageIdx];

  return (
    <div className="max-w-4xl mx-auto animate-fade-in pb-20">
      <div className="bg-white dark:bg-slate-800 rounded-2xl shadow-xl overflow-hidden border border-slate-100 dark:border-slate-700">
        
        {/* Header */}
        <div className="bg-gradient-to-r from-indigo-600 to-purple-600 p-8 text-white text-center">
           <h2 className="text-3xl font-bold mb-2">Sign PDF</h2>
           <p className="opacity-90">Draw, type, or upload your signature and place it securely.</p>
        </div>

        <div className="p-4 sm:p-8">
            {!file ? (
                <div 
                  onClick={() => fileInputRef.current?.click()}
                  className="border-4 border-dashed border-indigo-200 dark:border-slate-600 hover:border-indigo-400 rounded-xl p-12 text-center cursor-pointer transition-all bg-slate-50 dark:bg-slate-700/30"
                >
                   <div className="text-6xl mb-4">✍️</div>
                   <h3 className="text-xl font-bold text-slate-700 dark:text-slate-200">Select PDF to Sign</h3>
                </div>
            ) : (
                <div className="space-y-6">
                    {/* Toolbar */}
                    <div className="flex flex-wrap items-center justify-between gap-4 bg-slate-50 dark:bg-slate-700/50 p-3 rounded-xl border border-slate-200 dark:border-slate-600">
                         <div className="flex items-center gap-2">
                             <button onClick={() => changePage(-1)} disabled={currentPageIdx === 0} className="p-2 hover:bg-white dark:hover:bg-slate-600 rounded disabled:opacity-50">◀</button>
                             <span className="text-sm font-bold text-slate-700 dark:text-slate-200">Page {currentPageIdx + 1} of {numPages}</span>
                             <button onClick={() => changePage(1)} disabled={currentPageIdx === numPages - 1} className="p-2 hover:bg-white dark:hover:bg-slate-600 rounded disabled:opacity-50">▶</button>
                         </div>
                         
                         <div className="flex gap-2">
                             <button onClick={() => setFile(null)} className="text-xs text-red-500 font-bold px-3 py-2">Change File</button>
                             {!signatureBlob && (
                                 <button onClick={() => setShowSigModal(true)} className="px-4 py-2 bg-indigo-600 text-white rounded-lg text-sm font-bold shadow hover:bg-indigo-700">+ Create Signature</button>
                             )}
                         </div>
                    </div>

                    <div className="flex flex-col md:flex-row gap-6">
                        {/* Preview Area */}
                        <div className="flex-1 relative bg-slate-200 dark:bg-slate-900 rounded-xl overflow-hidden min-h-[400px] flex items-center justify-center border border-slate-300 dark:border-slate-700 select-none">
                            {isRendering ? (
                                <div className="animate-spin w-10 h-10 border-4 border-indigo-500 border-t-transparent rounded-full"></div>
                            ) : pageImageUrl && (
                                <div 
                                    ref={previewContainerRef}
                                    className="relative shadow-2xl"
                                    style={{ width: '100%', maxWidth: '600px' }} // Constrain width for mobile
                                >
                                    <img src={pageImageUrl} alt="PDF Page" className="w-full h-auto block pointer-events-none" />
                                    
                                    {/* Draggable Signature Overlay */}
                                    {signatureUrl && activePlacement && (
                                        <div 
                                        className={`absolute cursor-move group select-none touch-none ${interaction ? 'opacity-80 z-50' : 'z-10'}`}
                                        style={{
                                            top: `${activePlacement.y}%`,
                                            left: `${activePlacement.x}%`,
                                            width: `${activePlacement.w}%`,
                                            height: `${activePlacement.h}%`
                                        }}
                                        onMouseDown={(e) => handleInteractionStart(e, 'drag')}
                                        onTouchStart={(e) => handleInteractionStart(e, 'drag')}
                                        >
                                            <div className={`w-full h-full border-2 border-dashed ${interaction ? 'border-indigo-500 bg-indigo-500/20' : 'border-indigo-400 group-hover:border-indigo-300'} rounded p-1`}>
                                                <img src={signatureUrl} alt="Signature" className="w-full h-full object-contain pointer-events-none" />
                                            </div>
                                            
                                            {/* Action Bar - Only show when NOT interacting */}
                                            {!interaction && (
                                                <div className="absolute -top-10 left-0 right-0 hidden group-hover:flex justify-center gap-1">
                                                    <button onClick={(e) => { e.stopPropagation(); removeCurrentSignature(); }} className="bg-red-500 text-white p-1 rounded shadow text-xs">Remove</button>
                                                </div>
                                            )}

                                            {/* Resize Handles - Larger hit areas and better visuals */}
                                            <div 
                                                className="absolute -top-2 -left-2 w-5 h-5 bg-white border-2 border-indigo-600 rounded-full cursor-nw-resize z-20 hover:scale-125 transition-transform shadow-sm"
                                                onMouseDown={(e) => handleInteractionStart(e, 'resize', 'nw')}
                                                onTouchStart={(e) => handleInteractionStart(e, 'resize', 'nw')} 
                                            />
                                            <div 
                                                className="absolute -top-2 -right-2 w-5 h-5 bg-white border-2 border-indigo-600 rounded-full cursor-ne-resize z-20 hover:scale-125 transition-transform shadow-sm"
                                                onMouseDown={(e) => handleInteractionStart(e, 'resize', 'ne')}
                                                onTouchStart={(e) => handleInteractionStart(e, 'resize', 'ne')} 
                                            />
                                            <div 
                                                className="absolute -bottom-2 -left-2 w-5 h-5 bg-white border-2 border-indigo-600 rounded-full cursor-sw-resize z-20 hover:scale-125 transition-transform shadow-sm"
                                                onMouseDown={(e) => handleInteractionStart(e, 'resize', 'sw')}
                                                onTouchStart={(e) => handleInteractionStart(e, 'resize', 'sw')} 
                                            />
                                            <div 
                                                className="absolute -bottom-2 -right-2 w-5 h-5 bg-white border-2 border-indigo-600 rounded-full cursor-se-resize z-20 hover:scale-125 transition-transform shadow-sm"
                                                onMouseDown={(e) => handleInteractionStart(e, 'resize', 'se')}
                                                onTouchStart={(e) => handleInteractionStart(e, 'resize', 'se')} 
                                            />
                                        </div>
                                    )}
                                </div>
                            )}
                        </div>

                        {/* Controls Sidebar */}
                        <div className="w-full md:w-64 space-y-4">
                            {signatureBlob ? (
                                <>
                                    <div className="bg-slate-50 dark:bg-slate-700/50 p-4 rounded-xl border border-slate-200 dark:border-slate-600">
                                        <div className="flex justify-between items-start mb-2">
                                            <h4 className="font-bold text-slate-700 dark:text-slate-200">Signature</h4>
                                            <button onClick={clearSavedSignature} className="text-[10px] text-red-500 hover:underline">Clear Saved</button>
                                        </div>
                                        <div className="bg-white p-2 rounded border border-slate-200 mb-2">
                                            <img src={signatureUrl!} className="h-12 mx-auto object-contain" alt="Sig" />
                                        </div>
                                        <button onClick={() => setShowSigModal(true)} className="w-full text-xs text-indigo-600 dark:text-indigo-400 font-bold mb-4 hover:underline">Redraw / Upload New</button>

                                        {!activePlacement && (
                                            <button 
                                                onClick={() => {
                                                    // Init with correct AR
                                                    if (pageImage) {
                                                        const pageAR = pageImage.width / pageImage.height;
                                                        const w = 30;
                                                        const h = (w * pageAR) / sigAspectRatio;
                                                        setPlacements(prev => ({...prev, [currentPageIdx]: { x: 35, y: 40, w, h }}));
                                                    }
                                                }}
                                                className="w-full py-2 bg-indigo-100 dark:bg-indigo-600 text-indigo-700 dark:text-white rounded-lg font-bold text-sm hover:bg-indigo-200 dark:hover:bg-indigo-500 transition-colors"
                                            >
                                                Place on This Page
                                            </button>
                                        )}
                                        
                                        {activePlacement && (
                                            <div className="space-y-3 animate-fade-in">
                                                {/* Aspect Ratio Toggle */}
                                                <div className="flex flex-col gap-2 mb-3 bg-white dark:bg-slate-800 p-2 rounded border border-slate-200 dark:border-slate-600">
                                                    <div className="flex items-center gap-2">
                                                        <input 
                                                            type="checkbox"
                                                            checked={keepAspectRatio}
                                                            onChange={(e) => setKeepAspectRatio(e.target.checked)}
                                                            className="w-4 h-4 text-indigo-600 rounded"
                                                            id="ar-lock"
                                                        />
                                                        <label htmlFor="ar-lock" className="text-xs font-bold text-slate-700 dark:text-slate-300 cursor-pointer select-none">
                                                            Maintain Aspect Ratio
                                                        </label>
                                                    </div>
                                                    
                                                    {!keepAspectRatio && (
                                                        <div className="flex justify-between items-center">
                                                            <p className="text-[10px] text-slate-500 italic leading-tight">
                                                                Drag corners to squash/stretch.
                                                            </p>
                                                            <button 
                                                                onClick={handleResetShape}
                                                                className="text-xs text-indigo-600 font-bold hover:underline"
                                                                title="Reset to original shape"
                                                            >
                                                                Reset Shape
                                                            </button>
                                                        </div>
                                                    )}
                                                </div>

                                                <div className="grid grid-cols-2 gap-3">
                                                    <div>
                                                        <label className="block text-[11px] uppercase font-bold text-slate-800 dark:text-slate-200 mb-1 tracking-wide">X Pos %</label>
                                                        <input 
                                                            type="number" min="0" max="100" 
                                                            value={Math.round(activePlacement.x)}
                                                            onChange={(e) => updateCurrentPlacement('x', Number(e.target.value))}
                                                            className="w-full p-2 text-sm font-bold rounded-lg border border-slate-300 bg-white text-slate-900 dark:bg-slate-900 dark:border-slate-600 dark:text-white focus:ring-2 focus:ring-indigo-500 outline-none"
                                                        />
                                                    </div>
                                                    <div>
                                                        <label className="block text-[11px] uppercase font-bold text-slate-800 dark:text-slate-200 mb-1 tracking-wide">Y Pos %</label>
                                                        <input 
                                                            type="number" min="0" max="100" 
                                                            value={Math.round(activePlacement.y)}
                                                            onChange={(e) => updateCurrentPlacement('y', Number(e.target.value))}
                                                            className="w-full p-2 text-sm font-bold rounded-lg border border-slate-300 bg-white text-slate-900 dark:bg-slate-900 dark:border-slate-600 dark:text-white focus:ring-2 focus:ring-indigo-500 outline-none"
                                                        />
                                                    </div>
                                                    <div>
                                                        <label className="block text-[11px] uppercase font-bold text-slate-800 dark:text-slate-200 mb-1 tracking-wide">Width %</label>
                                                        <input 
                                                            type="number" min="5" max="100" 
                                                            value={Math.round(activePlacement.w)}
                                                            onChange={(e) => updateCurrentPlacement('w', Number(e.target.value))}
                                                            className="w-full p-2 text-sm font-bold rounded-lg border border-slate-300 bg-white text-slate-900 dark:bg-slate-900 dark:border-slate-600 dark:text-white focus:ring-2 focus:ring-indigo-500 outline-none"
                                                        />
                                                    </div>
                                                    <div>
                                                        <label className="block text-[11px] uppercase font-bold text-slate-800 dark:text-slate-200 mb-1 tracking-wide">Height %</label>
                                                        <input 
                                                            type="number" min="1" max="100" 
                                                            value={Math.round(activePlacement.h)}
                                                            onChange={(e) => updateCurrentPlacement('h', Number(e.target.value))}
                                                            className="w-full p-2 text-sm font-bold rounded-lg border border-slate-300 bg-white text-slate-900 dark:bg-slate-900 dark:border-slate-600 dark:text-white focus:ring-2 focus:ring-indigo-500 outline-none"
                                                        />
                                                    </div>
                                                </div>
                                                
                                                <button onClick={applyToAllPages} className="w-full py-2.5 bg-white dark:bg-slate-800 border border-indigo-300 dark:border-indigo-700 text-indigo-700 dark:text-indigo-300 rounded-lg text-xs font-bold hover:bg-indigo-50 dark:hover:bg-indigo-900/50 transition-colors shadow-sm">
                                                    Apply to All Pages
                                                </button>
                                                
                                                <button onClick={removeCurrentSignature} className="w-full py-2.5 bg-white dark:bg-slate-800 border border-red-200 dark:border-red-800 text-red-600 dark:text-red-400 text-xs font-bold hover:bg-red-50 dark:hover:bg-red-900/20 rounded-lg transition-colors shadow-sm">
                                                    Remove from Page
                                                </button>
                                            </div>
                                        )}
                                    </div>
                                </>
                            ) : (
                                <div className="text-center text-slate-500 text-sm p-4">
                                    Create a signature to start placing it.
                                </div>
                            )}
                        </div>
                    </div>

                    {/* Footer Actions */}
                    {signatureBlob && (
                        <div className="flex flex-col sm:flex-row gap-4 justify-center pt-4 border-t border-slate-200 dark:border-slate-700">
                           {downloadSuccess ? (
                               <div className="w-full sm:w-auto px-8 py-4 bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-300 rounded-xl font-bold text-lg text-center border border-green-200 dark:border-green-800 animate-fade-in flex items-center justify-center gap-2">
                                   <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M5 13l4 4L19 7"></path></svg>
                                   PDF Downloaded Successfully!
                               </div>
                           ) : (
                               <button 
                                 onClick={handleBurnSignature} 
                                 disabled={isSaving || Object.keys(placements).length === 0}
                                 className="px-8 py-4 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl font-bold text-lg shadow-lg flex items-center justify-center gap-2 disabled:bg-slate-400 dark:disabled:bg-slate-700 disabled:cursor-not-allowed"
                               >
                                 {isSaving ? 'Processing...' : 'Download Signed PDF'}
                               </button>
                           )}
                        </div>
                    )}
                </div>
            )}
        </div>
      </div>

      <input ref={fileInputRef} type="file" accept=".pdf" onChange={handleFileChange} className="hidden" />
      
      {showSigModal && (
          <SignaturePad 
            onSave={onSignatureCreated}
            onCancel={() => setShowSigModal(false)}
          />
      )}

      {/* Password Modal */}
      {showPasswordModal && (
          <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/80 backdrop-blur-sm px-4">
              <div className="bg-white dark:bg-slate-800 w-full max-w-sm rounded-xl p-6 shadow-2xl animate-fade-in-up">
                  <div className="text-center mb-4">
                      <div className="w-12 h-12 bg-slate-100 dark:bg-slate-700 rounded-full flex items-center justify-center mx-auto mb-3 text-2xl">🔒</div>
                      <h3 className="font-bold text-lg text-slate-900 dark:text-white">Password Required</h3>
                      <p className="text-sm text-slate-500">This PDF is encrypted.</p>
                  </div>
                  <input 
                    type="password" 
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    placeholder="Enter PDF Password"
                    className={`w-full p-3 rounded-lg border ${passwordError ? 'border-red-500' : 'border-slate-300 dark:border-slate-600'} dark:bg-slate-700 mb-4 focus:ring-2 focus:ring-indigo-500 outline-none`}
                    autoFocus
                  />
                  {passwordError && <p className="text-xs text-red-500 mb-3 text-center font-bold">Incorrect password</p>}
                  <div className="flex gap-2">
                      <button onClick={() => { setShowPasswordModal(false); setFile(null); }} className="flex-1 py-2 text-slate-500 font-bold hover:bg-slate-100 dark:hover:bg-slate-700 rounded-lg">Cancel</button>
                      <button onClick={handlePasswordSubmit} className="flex-1 py-2 bg-indigo-600 text-white font-bold rounded-lg hover:bg-indigo-700">Unlock</button>
                  </div>
              </div>
          </div>
      )}
    </div>
  );
};

export default SignTool;