import React from 'react';

interface UpdateNotificationProps {
  onUpdate: () => void;
  onDismiss: () => void;
  version?: string;
  notes?: string[];
}

const UpdateNotification: React.FC<UpdateNotificationProps> = ({ onUpdate, onDismiss, version, notes }) => {
  return (
    <div className="fixed bottom-6 right-6 z-50 animate-fade-in-up w-[90%] max-w-sm md:w-full">
      <div className="relative group">
        {/* Glow Effect */}
        <div className="absolute -inset-0.5 bg-gradient-to-r from-indigo-500 to-purple-600 rounded-2xl blur opacity-30 group-hover:opacity-50 transition duration-1000"></div>
        
        <div className="relative bg-white/90 dark:bg-slate-900/90 backdrop-blur-xl shadow-2xl rounded-2xl overflow-hidden border border-slate-200/50 dark:border-slate-700/50 text-slate-800 dark:text-white">
          
          {/* Header */}
          <div className="p-5 flex items-start gap-4">
            <div className="bg-indigo-100 dark:bg-indigo-900/50 p-3 rounded-xl shrink-0">
              <span className="text-2xl">🚀</span>
            </div>
            <div className="flex-1 min-w-0">
              <div className="flex justify-between items-center mb-1">
                <h4 className="font-bold text-base leading-tight">Update Ready!</h4>
              </div>
              <p className="text-xs text-slate-500 dark:text-slate-400 leading-relaxed">
                A new version has been downloaded in the background. Update now to see new features.
              </p>
            </div>
          </div>

          {/* Actions */}
          <div className="p-4 flex gap-3 pt-0">
            <button 
              onClick={onDismiss}
              className="flex-1 py-2.5 text-xs font-bold text-slate-500 dark:text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-xl transition-colors"
            >
              Later
            </button>
            <button 
              onClick={onUpdate}
              className="flex-1 py-2.5 bg-gradient-to-r from-indigo-600 to-purple-600 hover:from-indigo-700 hover:to-purple-700 text-white text-xs font-bold rounded-xl shadow-md shadow-indigo-500/20 transition-all active:scale-95 flex items-center justify-center gap-2"
            >
              <span>Refresh App</span>
              <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" /></svg>
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};

export default UpdateNotification;