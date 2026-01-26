import React, { useEffect, useState, useRef } from 'react';
import CompressTool from './components/CompressTool';
import ImageConverterTool from './components/ImageConverterTool';
import MergeTool from './components/MergeTool';
import ImageOptimizerTool from './components/ImageOptimizerTool';
import SignTool from './components/SignTool';
import WatermarkTool from './components/WatermarkTool';
import SplitTool from './components/SplitTool';
import PageNumberTool from './components/PageNumberTool';
import RotateTool from './components/RotateTool';
import OCRTool from './components/OCRTool';
import UpdateNotification from './components/UpdateNotification';

type ToolType = 'compress' | 'convert' | 'merge' | 'optimize' | 'sign' | 'watermark' | 'split' | 'numbers' | 'rotate' | 'ocr' | null;

const RELEASE_NOTES = {
  version: 'v2.9.9',
  notes: [
    'Fixed Smart Hybrid crash on single page docs',
    'New Resolution & Grayscale options',
    'Enhanced Lossless Deduplication'
  ]
};

const getToolDetails = (id: ToolType) => {
  switch(id) {
    case 'compress': return { name: 'Compress PDF', icon: '📦', desc: 'Smart reduction' };
    case 'merge': return { name: 'Merge PDFs', icon: '📑', desc: 'Combine files' };
    case 'split': return { name: 'Split PDF', icon: '✂️', desc: 'Extract pages' };
    case 'convert': return { name: 'Image Converter', icon: '🔄', desc: 'PDF ↔ IMG' };
    case 'sign': return { name: 'Sign PDF', icon: '✍️', desc: 'Digital signature' };
    case 'ocr': return { name: 'Image OCR', icon: '🔍', desc: 'Extract text' };
    case 'watermark': return { name: 'Watermark', icon: '🛡️', desc: 'Add stamp' };
    case 'optimize': return { name: 'Optimize Image', icon: '📉', desc: 'Compress IMG' };
    case 'numbers': return { name: 'Page Numbers', icon: '🔢', desc: 'Add numbering' };
    case 'rotate': return { name: 'Rotate', icon: '↻', desc: 'Fix orientation' };
    default: return { name: '', icon: '', desc: '' };
  }
};

export default function App() {
  const [darkMode, setDarkMode] = useState(() => {
    if (typeof window !== 'undefined') {
      return localStorage.getItem('theme') === 'dark' ||
        (!('theme' in localStorage) && window.matchMedia('(prefers-color-scheme: dark)').matches);
    }
    return false;
  });

  const [activeTool, setActiveTool] = useState<ToolType>(null);
  const [showUpdateNotification, setShowUpdateNotification] = useState(false);
  const [swRegistration, setSwRegistration] = useState<ServiceWorkerRegistration | null>(null);
  const [deferredPrompt, setDeferredPrompt] = useState<any>(null);
  const swInitialized = useRef(false);

  // 1. Dark Mode
  useEffect(() => {
    if (darkMode) {
      document.documentElement.classList.add('dark');
      localStorage.setItem('theme', 'dark');
    } else {
      document.documentElement.classList.remove('dark');
      localStorage.setItem('theme', 'light');
    }
  }, [darkMode]);

  // 2. Install Prompt
  useEffect(() => {
    const handleBeforeInstallPrompt = (e: Event) => {
      e.preventDefault();
      console.log('Install prompt captured');
      setDeferredPrompt(e);
    };
    window.addEventListener('beforeinstallprompt', handleBeforeInstallPrompt);
    return () => window.removeEventListener('beforeinstallprompt', handleBeforeInstallPrompt);
  }, []);

  // 3. Navigation
  useEffect(() => {
    const handlePopState = (event: PopStateEvent) => {
      const toolId = event.state?.tool;
      setActiveTool(toolId || null);
    };
    window.addEventListener('popstate', handlePopState);
    if (window.location.hash) {
      const toolFromHash = window.location.hash.substring(1) as ToolType;
      if (getToolDetails(toolFromHash).name) setActiveTool(toolFromHash);
    }
    return () => window.removeEventListener('popstate', handlePopState);
  }, []);

  const navigateToTool = (toolId: ToolType) => {
    setActiveTool(toolId);
    if (toolId) window.history.pushState({ tool: toolId }, '', `#${toolId}`);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const navigateHome = () => {
    setActiveTool(null);
    window.history.pushState({}, '', window.location.pathname);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const handleInstallClick = () => {
    if (deferredPrompt) {
      deferredPrompt.prompt();
      deferredPrompt.userChoice.then((choiceResult: any) => {
        setDeferredPrompt(null);
      });
    }
  };

  // 4. Service Worker
  useEffect(() => {
    if (swInitialized.current) return;
    swInitialized.current = true;

    const registerSW = async () => {
      if ('serviceWorker' in navigator) {
        try {
          const swUrl = './sw.js';
          
          const reg = await navigator.serviceWorker.register(swUrl, { scope: './' });
          setSwRegistration(reg);

          if (reg.waiting) {
            setShowUpdateNotification(true);
          }

          reg.update();

          reg.addEventListener('updatefound', () => {
            const newWorker = reg.installing;
            if (newWorker) {
              newWorker.addEventListener('statechange', () => {
                if (newWorker.state === 'installed' && navigator.serviceWorker.controller) {
                  setShowUpdateNotification(true);
                }
              });
            }
          });

          let refreshing = false;
          navigator.serviceWorker.addEventListener('controllerchange', () => {
            if (!refreshing) {
              window.location.reload();
              refreshing = true;
            }
          });
        } catch (err) {
          console.warn('SW Registration Warning:', err);
        }
      }
    };
    
    if (document.readyState === 'complete') {
        registerSW();
    } else {
        window.addEventListener('load', registerSW);
    }
  }, []);

  const handleUpdateApp = () => {
    if (swRegistration && swRegistration.waiting) {
      swRegistration.waiting.postMessage({ type: 'SKIP_WAITING' });
      setShowUpdateNotification(false);
    } else {
      window.location.reload();
    }
  };

  const ToolCard = ({ title, desc, icon, onClick, delayClass = "" }: any) => (
    <button
      onClick={onClick}
      className={`group relative flex flex-col items-start justify-between p-6 h-full min-h-[180px] bg-white/40 dark:bg-white/5 backdrop-blur-md border border-white/50 dark:border-white/10 hover:border-indigo-500/50 dark:hover:border-indigo-400/50 rounded-2xl shadow-sm hover:shadow-xl transition-all duration-300 hover:-translate-y-1 text-left animate-fade-in-up ${delayClass}`}
    >
      <div className="flex justify-between w-full mb-4">
        <div className="w-12 h-12 rounded-xl flex items-center justify-center text-2xl bg-white/80 dark:bg-white/10 shadow-sm group-hover:scale-110 transition-transform duration-300">
          {icon}
        </div>
        <div className="opacity-0 group-hover:opacity-100 transition-opacity">
            <svg className="w-6 h-6 text-indigo-600 dark:text-indigo-400 -rotate-45" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M14 5l7 7m0 0l-7 7m7-7H3"></path></svg>
        </div>
      </div>
      <div>
        <h3 className="text-xl font-bold text-slate-800 dark:text-white mb-1 group-hover:text-indigo-600 dark:group-hover:text-indigo-400 transition-colors">{title}</h3>
        <p className="text-xs font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400 opacity-80">{desc}</p>
      </div>
    </button>
  );

  const currentToolDetails = activeTool ? getToolDetails(activeTool) : null;

  return (
    <div className="min-h-screen transition-colors duration-300 font-montserrat overflow-x-hidden">
      
      {/* LUMINA-STYLE HEADER */}
      <header className="fixed top-0 z-50 w-full backdrop-blur-xl bg-white/10 dark:bg-[#0b0f19]/70 border-b border-white/20 dark:border-white/5 shadow-lg shadow-black/5 transition-all duration-300">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 h-20 sm:h-24 flex items-center justify-between">
            
            <div className="flex items-center gap-6">
              <div 
                className="flex items-center gap-3 cursor-pointer group" 
                onClick={navigateHome}
              >
                {/* Logo */}
                <div className="relative">
                    <div className="absolute -inset-1 bg-gradient-to-r from-indigo-500 to-cyan-500 rounded-lg blur opacity-40 group-hover:opacity-75 transition duration-500"></div>
                    <img 
                      src="./icon.svg" 
                      className="relative w-10 h-10 sm:w-12 sm:h-12 rounded-lg shadow-2xl" 
                      alt="Logo" 
                    />
                </div>
                
                {/* Brand Text */}
                <div className="hidden sm:block">
                  <h1 className="text-xl font-black text-slate-900 dark:text-white tracking-tighter leading-none">
                    PDF <span className="text-transparent bg-clip-text bg-gradient-to-r from-indigo-500 to-cyan-500">PRO TOOLKIT</span>
                  </h1>
                  <p className="text-[10px] font-bold text-slate-500 dark:text-slate-400 uppercase tracking-[0.2em]">Offline Suite</p>
                </div>
              </div>

              {/* Navigation Links (Desktop) */}
              {activeTool && (
                  <div className="hidden md:flex items-center gap-1 pl-6 border-l border-slate-200 dark:border-slate-800">
                      <button onClick={navigateHome} className="text-xs font-bold uppercase tracking-wider text-slate-500 hover:text-indigo-600 dark:text-slate-400 dark:hover:text-white transition-colors">Home</button>
                      <span className="text-slate-300 dark:text-slate-700">/</span>
                      <span className="text-xs font-bold uppercase tracking-wider text-indigo-600 dark:text-white">{currentToolDetails?.name}</span>
                  </div>
              )}
            </div>

            <div className="flex items-center gap-4">
              {deferredPrompt && (
                <button
                  onClick={handleInstallClick}
                  className="hidden sm:flex px-6 py-2.5 rounded-full border border-slate-300 dark:border-slate-600 text-slate-900 dark:text-white font-bold text-xs uppercase tracking-widest hover:bg-slate-100 dark:hover:bg-white/10 transition-all"
                >
                  Get App
                </button>
              )}
              
              <button
                onClick={() => setDarkMode(!darkMode)}
                className="w-10 h-10 rounded-full bg-slate-100 dark:bg-white/5 flex items-center justify-center text-slate-600 dark:text-yellow-400 hover:bg-slate-200 dark:hover:bg-white/10 transition-colors border border-transparent dark:border-white/5"
              >
                {darkMode ? 
                  <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 3v1m0 16v1m9-9h-1M4 12H3m15.364 6.364l-.707-.707M6.343 6.343l-.707-.707m12.728 0l-.707.707M6.343 17.657l-.707.707M16 12a4 4 0 11-8 0 4 4 0 018 0z"></path></svg> 
                  : 
                  <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M20.354 15.354A9 9 0 018.646 3.646 9.003 9.003 0 0012 21a9.003 9.003 0 008.354-5.646z"></path></svg>
                }
              </button>
            </div>
        </div>
      </header>
      
      {/* MAIN CONTENT */}
      <main className="pt-20 sm:pt-24 min-h-screen flex flex-col">
        {!activeTool ? (
          <>
            {/* HERO SECTION - "LUMINA" STYLE */}
            <div className="relative w-full overflow-hidden bg-slate-50 dark:bg-[#0b0f19] py-16 sm:py-24 lg:py-32">
                {/* Background Blobs */}
                <div className="absolute top-0 left-1/4 w-96 h-96 bg-indigo-500/20 rounded-full blur-[100px] pointer-events-none"></div>
                <div className="absolute bottom-0 right-1/4 w-96 h-96 bg-cyan-500/20 rounded-full blur-[100px] pointer-events-none"></div>

                <div className="max-w-7xl mx-auto px-4 relative z-10 text-center space-y-6">
                    <div className="inline-block animate-fade-in-up">
                        <span className="px-3 py-1 rounded-full border border-indigo-500/30 bg-indigo-500/10 text-indigo-600 dark:text-indigo-300 text-[10px] font-bold uppercase tracking-[0.2em] backdrop-blur-sm">
                            Developed by MAIK
                        </span>
                    </div>
                    
                    <h2 className="text-5xl sm:text-7xl md:text-8xl font-black tracking-tighter text-slate-900 dark:text-white leading-[0.9] animate-fade-in-up delay-100">
                        PRIVACY <br className="sm:hidden" />
                        <span className="text-transparent bg-clip-text bg-gradient-to-r from-indigo-600 via-purple-600 to-cyan-500 animate-gradient-x">FIRST</span>
                    </h2>
                    
                    <p className="max-w-2xl mx-auto text-lg sm:text-xl text-slate-600 dark:text-slate-400 font-medium leading-relaxed animate-fade-in-up delay-200">
                        The ultimate offline PDF manipulation suite. <br/>
                        Process documents directly in your browser. Zero uploads.
                    </p>
                </div>
            </div>

            {/* MARQUEE STRIP */}
            <div className="w-full bg-slate-900 dark:bg-white text-white dark:text-black py-3 sm:py-4 overflow-hidden relative z-20 shadow-xl rotate-1 sm:-rotate-1 scale-105 transform origin-center border-y-4 border-indigo-500">
                <div className="flex animate-marquee whitespace-nowrap">
                    {[1,2,3,4,5,6].map(i => (
                        <div key={i} className="flex items-center gap-8 mx-4">
                            <span className="text-sm sm:text-lg font-black uppercase tracking-widest">Offline Processing</span>
                            <span className="text-indigo-400 dark:text-indigo-600">★</span>
                            <span className="text-sm sm:text-lg font-black uppercase tracking-widest">100% Private</span>
                            <span className="text-indigo-400 dark:text-indigo-600">★</span>
                            <span className="text-sm sm:text-lg font-black uppercase tracking-widest">Instant Results</span>
                            <span className="text-indigo-400 dark:text-indigo-600">★</span>
                        </div>
                    ))}
                </div>
            </div>

            {/* TOOL GRID */}
            <div className="max-w-7xl mx-auto px-4 py-16 sm:py-24">
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 sm:gap-6">
                    <ToolCard title="Compress PDF" desc="Smart Reduction" icon="📦" onClick={() => navigateToTool('compress')} delayClass="delay-[50ms]" />
                    <ToolCard title="Merge PDFs" desc="Combine Files" icon="📑" onClick={() => navigateToTool('merge')} delayClass="delay-[100ms]" />
                    <ToolCard title="Split PDF" desc="Extract Pages" icon="✂️" onClick={() => navigateToTool('split')} delayClass="delay-[150ms]" />
                    <ToolCard title="Convert Images" desc="PDF ↔ IMG" icon="🔄" onClick={() => navigateToTool('convert')} delayClass="delay-[200ms]" />
                    <ToolCard title="Sign PDF" desc="Digital Ink" icon="✍️" onClick={() => navigateToTool('sign')} delayClass="delay-[250ms]" />
                    <ToolCard title="Image OCR" desc="Text Extract" icon="🔍" onClick={() => navigateToTool('ocr')} delayClass="delay-[300ms]" />
                    <ToolCard title="Watermark" desc="Stamp & Protect" icon="🛡️" onClick={() => navigateToTool('watermark')} delayClass="delay-[350ms]" />
                    <ToolCard title="Optimize Image" desc="Web Ready" icon="📉" onClick={() => navigateToTool('optimize')} delayClass="delay-[400ms]" />
                    <ToolCard title="Page Numbers" desc="Pagination" icon="🔢" onClick={() => navigateToTool('numbers')} delayClass="delay-[450ms]" />
                    <ToolCard title="Rotate" desc="Orientation" icon="↻" onClick={() => navigateToTool('rotate')} delayClass="delay-[500ms]" />
                </div>
            </div>
          </>
        ) : (
          <div className="max-w-7xl mx-auto w-full px-4 py-8 animate-fade-in-up">
            {/* Tool Header (Mobile Back) */}
            <div className="md:hidden mb-6">
                <button onClick={navigateHome} className="flex items-center gap-2 text-slate-500 hover:text-slate-900 dark:text-slate-400 dark:hover:text-white font-bold uppercase text-xs tracking-widest">
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M15 19l-7-7 7-7"></path></svg>
                    Back to Hub
                </button>
            </div>

            {activeTool === 'compress' && <CompressTool />}
            {activeTool === 'convert' && <ImageConverterTool />}
            {activeTool === 'merge' && <MergeTool />}
            {activeTool === 'optimize' && <ImageOptimizerTool />}
            {activeTool === 'sign' && <SignTool />}
            {activeTool === 'watermark' && <WatermarkTool />}
            {activeTool === 'split' && <SplitTool />}
            {activeTool === 'numbers' && <PageNumberTool />}
            {activeTool === 'rotate' && <RotateTool />}
            {activeTool === 'ocr' && <OCRTool />}
          </div>
        )}
      </main>

      {/* FOOTER */}
      <footer className="w-full border-t border-slate-200 dark:border-slate-800 bg-white/50 dark:bg-black/20 backdrop-blur-sm mt-auto">
          <div className="max-w-7xl mx-auto px-4 py-12 flex flex-col md:flex-row justify-between items-center gap-6">
              <div className="flex items-center gap-3 opacity-50 grayscale hover:grayscale-0 transition-all duration-500">
                  <img src="./icon.svg" className="w-8 h-8 rounded-lg" alt="Footer Logo" />
                  <span className="font-bold text-slate-900 dark:text-white tracking-widest text-xs">PDF TOOLKIT PRO</span>
              </div>
              <p className="text-slate-400 text-xs font-medium">
                  © 2026 MAIK. Offline & Secure.
              </p>
          </div>
      </footer>

      {showUpdateNotification && (
        <UpdateNotification 
          version={RELEASE_NOTES.version}
          notes={RELEASE_NOTES.notes}
          onUpdate={handleUpdateApp} 
          onDismiss={() => setShowUpdateNotification(false)} 
        />
      )}
    </div>
  );
}