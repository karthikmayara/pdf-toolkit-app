
import React, { useState, useRef, useEffect, useCallback } from 'react';

interface ComparisonSliderProps {
  original: string;
  compressed: string;
}

export const ComparisonSlider: React.FC<ComparisonSliderProps> = ({ original, compressed }) => {
  const [sliderPosition, setSliderPosition] = useState(50);
  const containerRef = useRef<HTMLDivElement>(null);
  const isDragging = useRef(false);

  const handleMove = useCallback((clientX: number) => {
    if (!containerRef.current) return;
    const rect = containerRef.current.getBoundingClientRect();
    const x = Math.max(0, Math.min(clientX - rect.left, rect.width));
    const percent = Math.max(0, Math.min((x / rect.width) * 100, 100));
    setSliderPosition(percent);
  }, []);

  const onPointerDown = (e: React.PointerEvent<HTMLDivElement>) => {
    e.preventDefault();
    isDragging.current = true;
    e.currentTarget.setPointerCapture(e.pointerId);
    handleMove(e.clientX);
  };

  const onPointerMove = (e: React.PointerEvent<HTMLDivElement>) => {
    if (!isDragging.current) return;
    e.preventDefault();
    handleMove(e.clientX);
  };

  const onPointerUp = (e: React.PointerEvent<HTMLDivElement>) => {
    isDragging.current = false;
    e.currentTarget.releasePointerCapture(e.pointerId);
  };

  return (
    <div 
      ref={containerRef} 
      className="relative w-full h-full select-none overflow-hidden cursor-col-resize group touch-none"
      style={{ touchAction: 'none' }} 
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerUp}
      onPointerCancel={onPointerUp}
    >
      {/* Background Layer (Original) */}
      <img 
        src={original} 
        alt="Original" 
        className="absolute top-0 left-0 w-full h-full object-contain object-center select-none pointer-events-none" 
        draggable={false}
      />

      {/* Label: Original */}
      <div className="absolute top-2 left-2 bg-black/50 text-white text-[10px] font-bold px-1.5 py-0.5 rounded backdrop-blur-sm z-20 pointer-events-none">
        Original
      </div>

      {/* Foreground Layer (Compressed) - Clipped */}
      <div 
        className="absolute top-0 left-0 h-full w-full overflow-hidden select-none pointer-events-none"
        style={{ clipPath: `inset(0 ${100 - sliderPosition}% 0 0)` }}
      >
        <img 
          src={compressed} 
          alt="Compressed" 
          className="absolute top-0 left-0 w-full h-full object-contain object-center select-none" 
          draggable={false}
        />
        
        {/* Label: Compressed */}
        <div className="absolute top-2 right-2 bg-green-500/80 text-white text-[10px] font-bold px-1.5 py-0.5 rounded backdrop-blur-sm z-20">
            Compressed
        </div>
      </div>

      {/* Slider Handle Line */}
      <div 
        className="absolute top-0 bottom-0 w-0.5 bg-white cursor-col-resize shadow-[0_0_10px_rgba(0,0,0,0.5)] z-10 pointer-events-none"
        style={{ left: `${sliderPosition}%` }}
      >
        {/* Handle Button */}
        <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-8 h-8 bg-white rounded-full shadow-xl flex items-center justify-center text-slate-400 text-[10px] ring-4 ring-black/10">
          <svg className="w-4 h-4 text-slate-600" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M8 9l4-4 4 4m0 6l-4 4-4-4"></path></svg>
        </div>
      </div>
    </div>
  );
};
