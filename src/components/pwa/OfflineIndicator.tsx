import React from 'react';
import { WifiOff } from 'lucide-react';
import { useOnlineStatus } from '../../hooks/useOnlineStatus';

export const OfflineIndicator: React.FC = () => {
  const isOnline = useOnlineStatus();

  if (isOnline) return null;

  return (
    <div className="fixed bottom-4 left-4 z-50 flex items-center gap-2.5 rounded-2xl bg-amber-950/90 border border-amber-600/60 px-4 py-2 text-xs font-semibold text-amber-200 shadow-2xl backdrop-blur-md animate-in fade-in slide-in-from-bottom-2">
      <WifiOff className="w-4 h-4 text-amber-400 animate-pulse" />
      <span>Offline Mode — Cached notes and recent chats are available.</span>
    </div>
  );
};
