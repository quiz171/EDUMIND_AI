import React, { useState } from 'react';
import { Download, Share, PlusSquare, X, Smartphone, Check } from 'lucide-react';
import { usePWAInstall } from '../../hooks/usePWAInstall';

interface PWAInstallButtonProps {
  variant?: 'header' | 'button' | 'settings';
  className?: string;
}

export const PWAInstallButton: React.FC<PWAInstallButtonProps> = ({
  variant = 'header',
  className = '',
}) => {
  const { isInstallable, isInstalled, isIOS, install } = usePWAInstall();
  const [showIOSGuide, setShowIOSGuide] = useState(false);
  const [justInstalled, setJustInstalled] = useState(false);

  // If already running as an installed PWA, hide cleanly
  if (isInstalled && !justInstalled) {
    return null;
  }

  const handleInstallClick = async () => {
    if (isIOS) {
      setShowIOSGuide(true);
      return;
    }

    if (isInstallable) {
      const outcome = await install();
      if (outcome) {
        setJustInstalled(true);
        setTimeout(() => setJustInstalled(false), 3000);
      }
    } else {
      // General instructions fallback
      setShowIOSGuide(true);
    }
  };

  if (justInstalled) {
    return (
      <div className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-emerald-500/20 border border-emerald-500/40 text-emerald-300 text-xs font-semibold">
        <Check className="w-3.5 h-3.5" />
        <span>App Installed!</span>
      </div>
    );
  }

  // If variant is settings row
  if (variant === 'settings') {
    return (
      <>
        <div className="flex items-center justify-between p-3.5 rounded-2xl bg-white/[0.03] border border-white/5 hover:border-emerald-500/30 transition-all">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-emerald-500/15 border border-emerald-500/30 flex items-center justify-center text-emerald-400">
              <Smartphone className="w-5 h-5" />
            </div>
            <div>
              <p className="text-sm font-semibold text-white">Install EduMind App</p>
              <p className="text-xs text-stone-400">Add to your Home Screen for instant offline access & fullscreen experience.</p>
            </div>
          </div>
          <button
            type="button"
            onClick={handleInstallClick}
            className="px-3.5 py-1.5 rounded-xl bg-emerald-400 hover:bg-emerald-300 text-black font-bold text-xs transition-transform active:scale-95 cursor-pointer flex items-center gap-1.5 shadow-md shadow-emerald-950/40"
          >
            <Download className="w-3.5 h-3.5" />
            <span>Install</span>
          </button>
        </div>

        {/* iOS / Browser Guided Modal */}
        {showIOSGuide && (
          <InstallGuideModal onClose={() => setShowIOSGuide(false)} isIOS={isIOS} />
        )}
      </>
    );
  }

  // Header or standalone button
  return (
    <>
      <button
        type="button"
        onClick={handleInstallClick}
        title="Install EduMind AI on your device"
        className={`flex items-center gap-2 px-3 py-1.5 rounded-full text-xs font-semibold transition-all cursor-pointer shadow-sm ${
          variant === 'header'
            ? 'bg-emerald-500/15 hover:bg-emerald-500/25 border border-emerald-500/30 text-emerald-300 hover:text-white'
            : 'bg-emerald-400 hover:bg-emerald-300 text-black font-bold'
        } ${className}`}
      >
        <Download className="w-3.5 h-3.5" />
        <span className="hidden sm:inline">Install App</span>
      </button>

      {/* Guided Modal */}
      {showIOSGuide && (
        <InstallGuideModal onClose={() => setShowIOSGuide(false)} isIOS={isIOS} />
      )}
    </>
  );
};

const InstallGuideModal: React.FC<{ onClose: () => void; isIOS: boolean }> = ({ onClose, isIOS }) => {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm p-4 animate-in fade-in duration-200">
      <div className="w-full max-w-sm rounded-3xl bg-[#121215] border border-white/10 p-6 shadow-2xl space-y-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2 text-white font-bold text-base">
            <Smartphone className="w-5 h-5 text-emerald-400" />
            <span>Install EduMind AI</span>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-1 rounded-full text-stone-400 hover:text-white hover:bg-white/10 transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <p className="text-xs text-stone-300 leading-relaxed">
          {isIOS
            ? 'Install EduMind AI on your iPhone or iPad for a full-screen, app-like experience with fast offline loading:'
            : 'Install EduMind AI directly onto your device from your browser toolbar for quick one-tap access:'}
        </p>

        {isIOS ? (
          <div className="space-y-3 bg-white/[0.03] border border-white/5 rounded-2xl p-4 text-xs text-stone-200">
            <div className="flex items-start gap-3">
              <div className="w-6 h-6 rounded-lg bg-emerald-500/20 text-emerald-400 flex items-center justify-center shrink-0 font-bold">1</div>
              <p>
                Tap the <strong className="text-white">Share</strong> button in Safari's bottom toolbar (<Share className="w-3.5 h-3.5 inline mx-1 text-emerald-400" />).
              </p>
            </div>
            <div className="flex items-start gap-3">
              <div className="w-6 h-6 rounded-lg bg-emerald-500/20 text-emerald-400 flex items-center justify-center shrink-0 font-bold">2</div>
              <p>
                Scroll down and select <strong className="text-white">"Add to Home Screen"</strong> (<PlusSquare className="w-3.5 h-3.5 inline mx-1 text-emerald-400" />).
              </p>
            </div>
            <div className="flex items-start gap-3">
              <div className="w-6 h-6 rounded-lg bg-emerald-500/20 text-emerald-400 flex items-center justify-center shrink-0 font-bold">3</div>
              <p>
                Tap <strong className="text-white">Add</strong> in the top-right corner. You're done!
              </p>
            </div>
          </div>
        ) : (
          <div className="space-y-3 bg-white/[0.03] border border-white/5 rounded-2xl p-4 text-xs text-stone-200">
            <div className="flex items-start gap-3">
              <div className="w-6 h-6 rounded-lg bg-emerald-500/20 text-emerald-400 flex items-center justify-center shrink-0 font-bold">1</div>
              <p>
                Look for the <strong className="text-white">Install</strong> icon in your browser address bar (top right).
              </p>
            </div>
            <div className="flex items-start gap-3">
              <div className="w-6 h-6 rounded-lg bg-emerald-500/20 text-emerald-400 flex items-center justify-center shrink-0 font-bold">2</div>
              <p>
                Click <strong className="text-white">"Install EduMind AI"</strong> to pin the app to your home screen or desktop.
              </p>
            </div>
          </div>
        )}

        <button
          type="button"
          onClick={onClose}
          className="w-full py-2.5 rounded-full bg-emerald-400 hover:bg-emerald-300 text-black font-bold text-xs transition-colors cursor-pointer"
        >
          Got It
        </button>
      </div>
    </div>
  );
};
