import React from 'react';
import { ArrowRight } from 'lucide-react';
import { VortexLogo } from '../common/VortexLogo';

interface LandingHeroProps {
  onNavigate: (route: string) => void;
}

export const LandingHero: React.FC<LandingHeroProps> = ({ onNavigate }) => {
  return (
    <section className="relative pt-16 md:pt-24 pb-20 px-4 md:px-8 text-center overflow-hidden flex flex-col items-center justify-center flex-1">
      {/* Dynamic Ambient Background Illumination */}
      <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[650px] h-[400px] bg-cyan-500/10 rounded-full blur-[140px] pointer-events-none" />
      <div className="absolute bottom-10 left-1/3 w-[450px] h-[300px] bg-indigo-500/8 rounded-full blur-[120px] pointer-events-none" />
      <div className="absolute inset-0 bg-[radial-gradient(rgba(255,255,255,0.035)_1px,transparent_1px)] bg-[size:28px_28px] pointer-events-none" />

      <div className="max-w-4xl mx-auto space-y-7 relative z-10 flex flex-col items-center">
        {/* Central Logo Emblem */}
        <div className="mb-2">
          <VortexLogo size="hero" showText={false} />
        </div>

        {/* Display Typography */}
        <div className="space-y-3">
          <h1 className="text-5xl sm:text-6xl md:text-7xl lg:text-8xl font-black tracking-tight text-white leading-[1.02]">
            EduMind <span className="text-emerald-400 drop-shadow-[0_0_25px_rgba(52,211,153,0.4)]">AI</span>
          </h1>
          <p className="text-xs sm:text-sm md:text-base font-bold tracking-[0.35em] uppercase text-emerald-400/90">
            Academic Second Brain
          </p>
          <h2 className="text-2xl sm:text-3xl md:text-4xl font-extrabold tracking-tight text-stone-200 pt-2">
            Your AI Assistant for School & Exams
          </h2>
        </div>

        {/* Subtitle */}
        <p className="text-base sm:text-lg md:text-xl text-stone-400 font-normal max-w-2xl mx-auto leading-relaxed">
          Upload your lecture notes, snap textbook past questions, and receive step-by-step
          solutions strictly grounded in <span className="text-stone-100 font-medium">your school syllabus</span>.
        </p>

        {/* High-Contrast CTA Button */}
        <div className="pt-3 flex items-center justify-center gap-4">
          <button
            onClick={() => onNavigate('/sign-up-login-screen')}
            className="px-8 py-3.5 rounded-full bg-white text-black hover:bg-stone-100 active:scale-98 font-bold text-sm sm:text-base transition-all shadow-[0_10px_30px_rgba(255,255,255,0.15)] flex items-center justify-center gap-2 cursor-pointer group"
          >
            <span>Get Started</span>
            <ArrowRight className="w-4 h-4 transition-transform group-hover:translate-x-1" />
          </button>
        </div>
      </div>
    </section>
  );
};
