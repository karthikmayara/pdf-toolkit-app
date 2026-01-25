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
  version: 'v2.8.6',
  notes: [
    'Fixed update notification vanishing issue',
    'New "Quality Check" in Compress Tool',
    'Improved compression stability on mobile',
    'Reduced memory usage for large files',
    'added safeguards against corrupted PDFs',
    'added comparision slider'
  ]
};

const getToolDetails = (id: ToolType) => {
  switch(id) {
    case 'compress': return { name: 'Compress PDF', icon: '📦' };
    case 'merge': return { name: 'Merge PDFs', icon: '📑' };
    case 'split': return { name: 'Split PDF', icon: '✂️' };
    case 'convert': return { name: 'Image Converter', icon: '🔄' };
    case 'sign': return { name: 'Sign PDF', icon: '✍️' };
    case 'ocr': return { name: 'Image OCR', icon: '🔍' };
    case 'watermark': return { name: 'Watermark', icon: '🛡️' };
    case 'optimize': return { name: 'Optimize Image', icon: '📉' };
    case 'numbers': return { name: 'Page Numbers', icon: '🔢' };
    case 'rotate': return { name: 'Rotate', icon: '↻' };
    default: return { name: '', icon: '' };
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

  // 4. Service Worker - FIXED REGISTRATION LOGIC
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

  const ToolCard = ({ title, desc, icon, colorClass, onClick, delayClass = "" }: any) => (
    <button
      onClick={onClick}
      className={`group relative flex flex-col items-center justify-center p-6 bg-white/60 dark:bg-slate-800/60 backdrop-blur-md border border-white/50 dark:border-slate-700 rounded-3xl shadow-lg hover:shadow-2xl transition-all duration-300 hover:-translate-y-1 text-center animate-fade-in-up ${delayClass}`}
    >
      <div className={`mb-4 w-16 h-16 rounded-2xl flex items-center justify-center text-3xl shadow-sm group-hover:scale-110 transition-transform duration-300 ${colorClass}`}>
        {icon}
      </div>
      <h3 className="text-lg font-bold text-slate-800 dark:text-white mb-2">{title}</h3>
      <p className="text-xs text-slate-500 dark:text-slate-400 leading-relaxed px-2">{desc}</p>
    </button>
  );

  const currentToolDetails = activeTool ? getToolDetails(activeTool) : null;

  return (
    <div className="min-h-screen transition-colors duration-300 pb-24 font-sans">
      
      {/* Sticky Glass Header */}
      <header className="sticky top-0 z-40 w-full backdrop-blur-xl bg-white/70 dark:bg-slate-900/80 border-b border-white/20 dark:border-slate-800 shadow-sm transition-all duration-300">
        <div className="max-w-7xl mx-auto px-4 h-16 sm:h-20 flex items-center justify-between">
            
            <div className="flex items-center gap-3">
              {activeTool && currentToolDetails ? (
                <div className="flex items-center gap-2 sm:gap-4 animate-fade-in">
                   <button 
                      onClick={navigateHome}
                      className="group flex items-center gap-2 px-3 py-2 -ml-2 rounded-xl text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors"
                   >
                      <div className="w-8 h-8 rounded-full bg-white dark:bg-slate-700 shadow-sm border border-slate-200 dark:border-slate-600 flex items-center justify-center group-hover:-translate-x-1 transition-transform">
                        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M15 19l-7-7 7-7"></path></svg>
                      </div>
                      <span className="font-bold text-sm hidden sm:inline">Home</span>
                   </button>
                   <div className="h-6 w-px bg-slate-300 dark:bg-slate-700 hidden sm:block"></div>
                   <div className="flex items-center gap-2">
                      <span className="text-2xl">{currentToolDetails.icon}</span>
                      <h1 className="text-lg font-extrabold text-slate-800 dark:text-white tracking-tight">{currentToolDetails.name}</h1>
                   </div>
                </div>
              ) : (
                <div className="flex items-center gap-3 cursor-pointer group" onClick={navigateHome}>
                  {/* PWA Logo - Uses the cached icon if available */}
                  <img 
                    src="./icons/icon-192.png" 
                    onError={(e) => {
                        // Fallback to emoji if png is missing
                        e.currentTarget.style.display = 'none';
                        e.currentTarget.nextElementSibling?.classList.remove('hidden');
                    }}
                    className="w-10 h-10 rounded-xl shadow-lg group-hover:rotate-6 transition-transform duration-300" 
                    alt="Logo" 
                  />
                  <div className="w-10 h-10 bg-gradient-to-br from-indigo-500 to-purple-600 rounded-xl shadow-lg flex items-center justify-center text-white text-xl font-bold hidden">
                     P
                  </div>
                  <div className="hidden sm:block">
                    <h1 className="text-xl font-extrabold text-slate-900 dark:text-white tracking-tight leading-none">
                      PDF Toolkit <span className="text-indigo-600 dark:text-indigo-400">Pro</span>
                    </h1>
                    <p className="text-[10px] font-bold text-slate-500 uppercase tracking-widest opacity-80">Offline Suite</p>
                  </div>
                </div>
              )}
            </div>

            <div className="flex items-center gap-3">
              {deferredPrompt && (
                <button
                  onClick={handleInstallClick}
                  className="flex items-center gap-2 px-4 py-2 rounded-full bg-slate-900 dark:bg-white text-white dark:text-slate-900 shadow-lg hover:shadow-xl hover:scale-105 transition-all font-bold text-xs sm:text-sm animate-pop"
                >
                  Install App
                </button>
              )}
              
              <button
                onClick={() => setDarkMode(!darkMode)}
                className="w-10 h-10 rounded-full bg-slate-100 dark:bg-slate-800 flex items-center justify-center text-slate-600 dark:text-yellow-400 hover:bg-slate-200 dark:hover:bg-slate-700 transition-colors shadow-sm"
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
      
      <main className="max-w-7xl mx-auto px-4 pt-8 sm:pt-12">
        {!activeTool ? (
          <div className="space-y-12">
            <div className="text-center max-w-2xl mx-auto animate-fade-in space-y-4">
               <h2 className="text-4xl sm:text-5xl font-extrabold text-slate-800 dark:text-white tracking-tight">
                 All your PDF tools, <br/>
                 <span className="text-transparent bg-clip-text bg-gradient-to-r from-indigo-600 to-purple-600 dark:from-indigo-400 dark:to-purple-400">offline & secure.</span>
               </h2>
               <p className="text-slate-600 dark:text-slate-300 text-lg leading-relaxed">
                 Process documents directly in your browser. No uploads, no waiting, 100% private.
               </p>
            </div>

            <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4 sm:gap-6">
              <ToolCard title="Compress PDF" desc="Smart reduction" icon="📦" colorClass="bg-blue-100 text-blue-600 dark:bg-blue-900/40 dark:text-blue-300" onClick={() => navigateToTool('compress')} delayClass="stagger-1" />
              <ToolCard title="Merge PDFs" desc="Combine files" icon="📑" colorClass="bg-purple-100 text-purple-600 dark:bg-purple-900/40 dark:text-purple-300" onClick={() => navigateToTool('merge')} delayClass="stagger-2" />
              <ToolCard title="Split PDF" desc="Extract pages" icon="✂️" colorClass="bg-orange-100 text-orange-600 dark:bg-orange-900/40 dark:text-orange-300" onClick={() => navigateToTool('split')} delayClass="stagger-3" />
              <ToolCard title="Convert Images" desc="PDF ↔ IMG" icon="🔄" colorClass="bg-emerald-100 text-emerald-600 dark:bg-emerald-900/40 dark:text-emerald-300" onClick={() => navigateToTool('convert')} delayClass="stagger-4" />
              <ToolCard title="Sign PDF" desc="Digital signature" icon="✍️" colorClass="bg-indigo-100 text-indigo-600 dark:bg-indigo-900/40 dark:text-indigo-300" onClick={() => navigateToTool('sign')} delayClass="stagger-5" />
              <ToolCard title="Image OCR" desc="Extract text" icon="🔍" colorClass="bg-pink-100 text-pink-600 dark:bg-pink-900/40 dark:text-pink-300" onClick={() => navigateToTool('ocr')} delayClass="stagger-6" />
              <ToolCard title="Watermark" desc="Add stamp" icon="🛡️" colorClass="bg-cyan-100 text-cyan-600 dark:bg-cyan-900/40 dark:text-cyan-300" onClick={() => navigateToTool('watermark')} delayClass="stagger-7" />
              <ToolCard title="Optimize Image" desc="Compress IMG" icon="📉" colorClass="bg-teal-100 text-teal-600 dark:bg-teal-900/40 dark:text-teal-300" onClick={() => navigateToTool('optimize')} delayClass="stagger-8" />
              <ToolCard title="Page Numbers" desc="Add numbering" icon="🔢" colorClass="bg-sky-100 text-sky-600 dark:bg-sky-900/40 dark:text-sky-300" onClick={() => navigateToTool('numbers')} delayClass="stagger-9" />
              <ToolCard title="Rotate" desc="Fix orientation" icon="↻" colorClass="bg-amber-100 text-amber-600 dark:bg-amber-900/40 dark:text-amber-300" onClick={() => navigateToTool('rotate')} delayClass="stagger-10" />
            </div>
          </div>
        ) : (
          <div className="animate-fade-in-up pb-10">
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

      {/* Footer */}
      <footer className="max-w-7xl mx-auto px-4 py-8 text-center border-t border-slate-200 dark:border-slate-800 mt-12">
          <p className="text-slate-400 text-xs">© 2024 PDF Toolkit Pro. Offline & Secure.</p>
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