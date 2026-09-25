import React from 'react';
import edumindLogoImg from '../../assets/images/edumind_logo.jpg';

export interface LogoProps {
  size?: 'xs' | 'sm' | 'md' | 'lg' | 'xl' | 'hero';
  showText?: boolean;
  showTagline?: boolean;
  className?: string;
  onClick?: () => void;
}

export type VortexLogoProps = LogoProps;
export type EduMindLogoProps = LogoProps;

const sizeMap = {
  xs: { icon: 'w-6 h-6', text: 'text-sm', tagline: 'text-[8px]' },
  sm: { icon: 'w-8 h-8', text: 'text-base', tagline: 'text-[9px]' },
  md: { icon: 'w-10 h-10', text: 'text-xl', tagline: 'text-[10px]' },
  lg: { icon: 'w-14 h-14', text: 'text-2xl sm:text-3xl', tagline: 'text-xs' },
  xl: { icon: 'w-20 h-20 sm:w-24 sm:h-24', text: 'text-3xl sm:text-4xl', tagline: 'text-xs sm:text-sm' },
  hero: { icon: 'w-28 h-28 sm:w-36 sm:h-36', text: 'text-4xl sm:text-6xl', tagline: 'text-sm sm:text-base' },
};

export const EduMindLogo: React.FC<LogoProps> = ({
  size = 'md',
  showText = true,
  showTagline = false,
  className = '',
  onClick,
}) => {
  const config = sizeMap[size];

  return (
    <div
      onClick={onClick}
      className={`inline-flex items-center gap-3 select-none ${onClick ? 'cursor-pointer' : ''} ${className}`}
    >
      {/* Emblem Icon */}
      <div className={`relative shrink-0 ${config.icon} group`}>
        {/* Ambient Cyan / Teal Glow */}
        <div className="absolute -inset-1.5 bg-cyan-500/30 rounded-full blur-md opacity-70 group-hover:opacity-100 transition-opacity" />
        
        {/* Circular Logo Image with subtle cyan border */}
        <div className="relative w-full h-full rounded-full overflow-hidden border border-cyan-400/40 shadow-[0_0_20px_rgba(6,182,212,0.35)] bg-[#070d18]">
          <img
            src={edumindLogoImg}
            alt="EduMind AI Logo"
            className="w-full h-full object-cover transform scale-105 group-hover:scale-110 transition-transform duration-300"
            referrerPolicy="no-referrer"
          />
        </div>
      </div>

      {/* Typography Lockup */}
      {showText && (
        <div className="flex flex-col justify-center leading-none">
          <div className={`font-black tracking-tight ${config.text} flex items-center gap-1.5`}>
            <span className="text-white">EduMind</span>
            <span className="text-cyan-400 drop-shadow-[0_0_12px_rgba(34,211,238,0.5)]">AI</span>
          </div>
          {showTagline && (
            <span className={`font-bold tracking-[0.22em] uppercase text-stone-400 mt-1 ${config.tagline}`}>
              Academic Second Brain
            </span>
          )}
        </div>
      )}
    </div>
  );
};

export const VortexLogo = EduMindLogo;
export default EduMindLogo;
