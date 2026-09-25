import React from 'react';
import { LandingNav } from '../../components/landing/LandingNav';
import { LandingHero } from '../../components/landing/LandingHero';
import { LandingFooter } from '../../components/landing/LandingFooter';
import { BackgroundWatermark } from '../../components/chat/BackgroundWatermark';

interface LandingPageProps {
  onNavigate: (route: string) => void;
}

export const LandingPage: React.FC<LandingPageProps> = ({ onNavigate }) => {
  return (
    <div className="min-h-screen bg-[#08080a] text-stone-100 flex flex-col justify-between font-sans selection:bg-emerald-500/30 relative overflow-hidden">
      <BackgroundWatermark />
      <LandingNav onNavigate={onNavigate} />
      <main className="flex-1 flex flex-col justify-center relative z-10">
        <LandingHero onNavigate={onNavigate} />
      </main>
      <LandingFooter onNavigate={onNavigate} />
    </div>
  );
};

export default LandingPage;
