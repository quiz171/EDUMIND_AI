import React from 'react';

interface LandingFooterProps {
  onNavigate?: (route: string) => void;
}

export const LandingFooter: React.FC<LandingFooterProps> = () => {
  return (
    <footer className="border-t border-white/[0.08] bg-[#08080a] py-12 px-4 md:px-8 text-stone-400 text-xs">
      <div className="max-w-7xl mx-auto flex flex-col items-center justify-center text-center gap-3">
        <div className="w-9 h-9 rounded-xl bg-emerald-400 text-black font-black flex items-center justify-center text-base shadow-md">
          E
        </div>
        <div>
          <p className="font-bold text-white text-base tracking-tight">EduMind AI</p>
          <p className="text-stone-400 text-xs mt-0.5">Your Academic Second Brain for Nigerian Education</p>
        </div>
        <p className="text-stone-500 text-[11px] mt-2">
          © {new Date().getFullYear()} EduMind AI. All rights reserved.
        </p>
      </div>
    </footer>
  );
};
