import React, { useEffect } from 'react';
import LandingPage from './landing-page/page';

interface PageProps {
  onNavigate?: (route: string) => void;
}

export default function Page({ onNavigate }: PageProps) {
  return <LandingPage onNavigate={onNavigate || (() => {})} />;
}
