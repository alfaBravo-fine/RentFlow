import React, { useState, useEffect } from 'react';
import { CloudOff, Wifi, WifiOff } from '../icons';

export const OfflineIndicator: React.FC = () => {
  const [isOnline, setIsOnline] = useState<boolean>(() => {
    return typeof navigator !== 'undefined' ? navigator.onLine : true;
  });
  const [justReconnected, setJustReconnected] = useState(false);

  useEffect(() => {
    const handleOnline = () => {
      setIsOnline(true);
      setJustReconnected(true);
      const timer = setTimeout(() => {
        setJustReconnected(false);
      }, 3500);
      return () => clearTimeout(timer);
    };

    const handleOffline = () => {
      setIsOnline(false);
      setJustReconnected(false);
    };

    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);

    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
    };
  }, []);

  // When fully online and not just reconnected, stay completely hidden
  if (isOnline && !justReconnected) {
    return null;
  }

  return (
    <div
      role="status"
      aria-live="polite"
      className="fixed bottom-4 left-4 z-50 pointer-events-none select-none transition-all duration-300 animate-in fade-in slide-in-from-bottom-2"
    >
      {!isOnline ? (
        <div className="flex items-center gap-2 px-3 py-1.5 rounded-full bg-[var(--bg-surface)]/95 backdrop-blur-md border border-amber-500/30 text-amber-700 dark:text-amber-300 text-xs font-medium shadow-lg pointer-events-auto">
          <span className="relative flex h-2 w-2">
            <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-amber-400 opacity-75" />
            <span className="relative inline-flex rounded-full h-2 w-2 bg-amber-500" />
          </span>
          <CloudOff className="w-3.5 h-3.5 text-amber-600 dark:text-amber-400 shrink-0" />
          <span>Offline Mode &bull; Changes saved to encrypted local DB</span>
        </div>
      ) : (
        <div className="flex items-center gap-2 px-3 py-1.5 rounded-full bg-[var(--bg-surface)]/95 backdrop-blur-md border border-emerald-500/30 text-emerald-700 dark:text-emerald-300 text-xs font-medium shadow-lg pointer-events-auto animate-in fade-in duration-200">
          <span className="h-2 w-2 rounded-full bg-emerald-500" />
          <Wifi className="w-3.5 h-3.5 text-emerald-600 dark:text-emerald-400 shrink-0" />
          <span>Back online &bull; Ready to sync</span>
        </div>
      )}
    </div>
  );
};
