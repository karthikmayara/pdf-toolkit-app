import React from 'react';

interface UpdateNotificationProps {
  onUpdate: () => void;
  onDismiss: () => void;
  version?: string;
  notes?: string[];
}

const UpdateNotification: React.FC<UpdateNotificationProps> = ({ onUpdate, onDismiss, version, notes }) => {
  return (
    <div className="fixed bottom-6 left-1/2 transform -translate-x-1/2 z-50 animate-fade-in-up w-[90%] max-w-md">
      <div className="bg-slate-900/95 dark:bg-white/95 backdrop-blur shadow-2xl rounded-2xl overflow-hidden border border-slate-700 dark:border-slate-200 text-white dark:text-slate-900">
        
        {/* Header */}
        <div className="p-4 flex items-center justify-between border-b border-white/10 dark:border-slate-200">
          <div className="flex items-center gap-3">
            <div className="bg-primary-500 p-2 rounded-full animate-pulse">
              <svg className="w-5 h-5 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
              </svg>
            </div>
            <div>
              <h4 className="font-bold text-sm">Update Available {version && <span className="opacity-80">({version})</span>}</h4>
              <p className="text-xs opacity-70">A new version is ready to install.</p>
            </div>
          </div>
        </div>

        {/* Content */}
        {notes && notes.length > 0 && (
          <div className="p-4 bg-white/5 dark:bg-slate-50/50">
            <p className="text-xs font-bold uppercase opacity-60 mb-2 tracking-wider">What's New:</p>
            <ul className="text-xs space-y-1 opacity-90 list-disc list-inside">
              {notes.map((note, i) => (
                <li key={i}>{note}</li>
              ))}
            </ul>
          </div>
        )}

        {/* Actions */}
        <div className="p-3 flex gap-3 bg-slate-900 dark:bg-white">
          <button 
            onClick={onDismiss}
            className="flex-1 text-xs font-bold px-3 py-3 rounded-lg hover:bg-white/10 dark:hover:bg-slate-100 transition-colors text-slate-400 dark:text-slate-500"
          >
            Later
          </button>
          <button 
            onClick={onUpdate}
            className="flex-1 text-xs font-bold px-4 py-3 bg-primary-600 hover:bg-primary-500 text-white rounded-lg shadow-lg shadow-primary-500/30 transition-all active:scale-95"
          >
            Update Now
          </button>
        </div>
      </div>
    </div>
  );
};

export default UpdateNotification;