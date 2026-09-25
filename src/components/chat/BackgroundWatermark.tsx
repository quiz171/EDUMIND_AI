import React from 'react';
import edumindLogoImg from '../../assets/images/edumind_logo.jpg';

interface BackgroundWatermarkProps {
  className?: string;
}

export const BackgroundWatermark: React.FC<BackgroundWatermarkProps> = ({
  className = '',
}) => {
  return (
    <div
      className={`pointer-events-none select-none absolute inset-0 flex items-center justify-center overflow-hidden z-0 ${className}`}
      aria-hidden="true"
    >
      {/* Ambient subtle central glow */}
      <div className="absolute w-[450px] h-[450px] sm:w-[600px] sm:h-[600px] rounded-full bg-cyan-500/[0.035] blur-3xl -z-10" />

      {/* Dead-Center Official Watermark Emblem & Typography */}
      <div className="flex flex-col items-center justify-center text-center opacity-[0.06] dark:opacity-[0.07] transition-opacity duration-300">
        {/* Glowing Logo Icon */}
        <div className="w-28 h-28 sm:w-36 sm:h-36 md:w-44 md:h-44 rounded-full overflow-hidden border-2 border-white/20 shadow-[0_0_50px_rgba(34,211,238,0.25)] mb-4 bg-[#0a0e17]">
          <img
            src={edumindLogoImg}
            alt="EduMind AI Watermark"
            className="w-full h-full object-cover contrast-125"
            referrerPolicy="no-referrer"
          />
        </div>

        {/* Central Brand Title Matching Logo */}
        <h2 className="text-3xl sm:text-5xl md:text-6xl lg:text-7xl font-black tracking-[0.22em] uppercase font-sans leading-none whitespace-nowrap pl-[0.22em] text-[var(--v-text-primary,#ffffff)]">
          EduMind <span className="text-cyan-400">AI</span>
        </h2>
        
        {/* Official Tagline from Logo */}
        <p className="text-[10px] sm:text-xs md:text-sm font-bold tracking-[0.4em] uppercase mt-3 whitespace-nowrap pl-[0.4em] text-[var(--v-text-primary,#ffffff)]">
          ACADEMIC SECOND BRAIN
        </p>
      </div>
    </div>
  );
};

export default BackgroundWatermark;
