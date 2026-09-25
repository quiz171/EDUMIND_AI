import React from 'react';
import { ArrowRight } from 'lucide-react';
import { VortexLogo } from '../common/VortexLogo';

interface LandingNavProps {
  onNavigate: (route: string) => void;
}

export const LandingNav: React.FC<LandingNavProps> = ({ onNavigate }) => {
  return (
    <header className="sticky top-0 z-40 w-full bg-[#08080a]/80 backdrop-blur-xl border-b border-white/[0.08] px-4 md:px-8 py-3.5">
      <div className="max-w-7xl mx-auto flex items-center justify-between">
        {/* Official VORTEX AI Logo */}
        <div
          onClick={() => onNavigate('/landing-page')}
          className="cursor-pointer group"
        >
          <VortexLogo size="sm" showTagline={false} />
        </div>

        {/* Right CTA / Login */}
        <div className="flex items-center gap-2.5">
          <button
            onClick={() => onNavigate('/sign-up-login-screen')}
            className="px-4 py-2 rounded-full text-xs md:text-sm font-semibold text-stone-300 hover:text-white hover:bg-white/[0.06] transition-colors cursor-pointer"
          >
            Sign In
          </button>
          <button
            onClick={() => onNavigate('/sign-up-login-screen')}
            className="px-4.5 py-2 rounded-full bg-white text-black hover:bg-stone-200 active:scale-98 font-bold text-xs md:text-sm transition-all shadow-md flex items-center gap-1.5 cursor-pointer"
          >
            <span>Get Started</span>
            <ArrowRight className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>
    </header>
  );
};
