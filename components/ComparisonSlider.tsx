
import React, { useState, useRef, useEffect } from 'react';

export const ComparisonSlider = ({ original, compressed }: { original: string, compressed: string }) => {
    const [sliderPosition, setSliderPosition] = useState(50);
    const [isDragging, setIsDragging] = useState(false);
    const containerRef = useRef<HTMLDivElement>(null);
  
    const handleMove = (clientX: number) => {
      if (!containerRef.current) return;
      const rect = containerRef.current.getBoundingClientRect();
      const x = clientX - rect.left;
      const pos = Math.max(0, Math.min(100, (x / rect.width) * 100));
      setSliderPosition(pos);
    };
  
    const onMouseMove = (e: React.MouseEvent) => {
      if (isDragging) handleMove(e.clientX);
    };
  
    const onTouchMove = (e: React.TouchEvent) => {
      if (isDragging) handleMove(e.touches[0].clientX);
    };
  
    const handleInteractionStart = (clientX: number) => {
        setIsDragging(true);
        handleMove(clientX);
    };

    useEffect(() => {
        const stopDrag = () => setIsDragging(false);
        window.addEventListener('mouseup', stopDrag);
        window.addEventListener('touchend', stopDrag);
        return () => {
            window.removeEventListener('mouseup', stopDrag);
            window.removeEventListener('touchend', stopDrag);
        };
    }, []);
  
    return (
      <div 
        ref={containerRef}
        className="relative w-full h-full select-none group cursor-ew-resize overflow-hidden rounded-xl border border-slate-200 dark:border-slate-700 shadow-sm bg-slate-100 dark:bg-slate-900"
        onMouseDown={(e) => handleInteractionStart(e.clientX)}
        onTouchStart={(e) => handleInteractionStart(e.touches[0].clientX)}
        onMouseMove={onMouseMove}
        onTouchMove={onTouchMove}
      >
        {/* Compressed Image (Background) */}
        <img 
            src={compressed} 
            className="absolute inset-0 w-full h-full object-contain pointer-events-none select-none" 
            alt="Compressed"
        />
        <div className="absolute top-4 right-4 bg-black/60 backdrop-blur-sm text-white text-[10px] font-bold px-2 py-1 rounded pointer-events-none z-10">
            COMPRESSED
        </div>
        
        {/* Original Image (Foreground, Clipped) */}
        <div 
          className="absolute inset-0 pointer-events-none select-none"
          style={{ clipPath: `inset(0 ${100 - sliderPosition}% 0 0)` }}
        >
          <img 
            src={original} 
            className="absolute inset-0 w-full h-full object-contain" 
            alt="Original"
          />
          <div className="absolute top-4 left-4 bg-indigo-600/90 backdrop-blur-sm text-white text-[10px] font-bold px-2 py-1 rounded z-10">
             ORIGINAL
          </div>
        </div>
  
        {/* Slider Handle */}
        <div 
            className="absolute top-0 bottom-0 w-1 bg-white cursor-ew-resize shadow-[0_0_10px_rgba(0,0,0,0.5)] z-10" 
            style={{ left: `${sliderPosition}%` }}
        >
          <div className="absolute top-1/2 -translate-y-1/2 -translate-x-1/2 w-8 h-8 bg-white rounded-full shadow-xl flex items-center justify-center text-slate-400 border border-slate-200">
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M8 9l4-4 4 4m0 6l-4 4-4-4"></path></svg>
          </div>
        </div>
      </div>
    );
};
