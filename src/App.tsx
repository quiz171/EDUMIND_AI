import React, { useState, useEffect } from 'react';
import LandingPage from './app/landing-page/page';
import SignUpLoginPage from './app/sign-up-login-screen/page';
import ChatAppPage from './app/chat-app/page';
import { OfflineIndicator } from './components/pwa/OfflineIndicator';

const getInitialRoute = (): string => {
  if (typeof window !== 'undefined' && window.location.hash) {
    const hash = window.location.hash.replace('#', '');
    if (hash === 'auth' || hash === 'sign-up-login-screen' || hash === 'login') {
      return '/sign-up-login-screen';
    }
    if (hash === 'chat' || hash === 'chat-app') {
      return '/chat-app';
    }
  }
  return '/landing-page';
};

export default function App() {
  const [currentRoute, setCurrentRoute] = useState<string>(getInitialRoute);

  // Handle URL hash changes or popstate
  useEffect(() => {
    const handleHashChange = () => {
      const hash = window.location.hash.replace('#', '');
      if (hash === 'landing' || hash === 'landing-page' || hash === '') {
        setCurrentRoute('/landing-page');
      } else if (hash === 'auth' || hash === 'sign-up-login-screen' || hash === 'login') {
        setCurrentRoute('/sign-up-login-screen');
      } else if (hash === 'chat' || hash === 'chat-app') {
        setCurrentRoute('/chat-app');
      }
    };

    window.addEventListener('hashchange', handleHashChange);
    return () => window.removeEventListener('hashchange', handleHashChange);
  }, []);

  const handleNavigate = (route: string) => {
    if (route.includes('login')) {
      setCurrentRoute('/sign-up-login-screen');
      localStorage.setItem('vortex_auth_mode', 'login');
      window.location.hash = 'login';
      window.scrollTo({ top: 0, behavior: 'smooth' });
      return;
    }

    setCurrentRoute(route);
    if (route.includes('landing')) {
      window.location.hash = 'landing';
      window.scrollTo({ top: 0, behavior: 'smooth' });
    } else if (route.includes('sign-up') || route.includes('auth')) {
      window.location.hash = 'auth';
      window.scrollTo({ top: 0, behavior: 'smooth' });
    } else if (route.includes('chat')) {
      window.location.hash = 'chat';
    }
  };

  return (
    <div className={`bg-[#08080a] text-stone-100 font-sans selection:bg-emerald-500/30 w-full ${
      currentRoute === '/chat-app' ? 'h-full overflow-hidden' : 'min-h-full'
    }`}>
      {/* Route Views */}
      {currentRoute === '/sign-up-login-screen' ? (
        <SignUpLoginPage onNavigate={handleNavigate} />
      ) : currentRoute === '/chat-app' ? (
        <ChatAppPage onNavigate={handleNavigate} />
      ) : (
        <LandingPage onNavigate={handleNavigate} />
      )}

      {/* Global Connectivity Indicator */}
      <OfflineIndicator />
    </div>
  );
}
