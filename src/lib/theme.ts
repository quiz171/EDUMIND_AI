export interface BackgroundTheme {
  id: string;
  name: string;
  subtitle: string;
  category: 'dark' | 'warm' | 'minimal' | 'light';
  badge?: string;
  accentColor: string;
  secondaryAccent?: string;
  canvasBg: string;
  surfaceBg: string;
  borderTone: string;
  bgClass: string;
  isLight?: boolean;
}

export const THEME_CATEGORIES = [
  { id: 'all', label: 'All' },
  { id: 'dark', label: 'Dark' },
  { id: 'warm', label: 'Warm' },
  { id: 'minimal', label: 'Minimal & OLED' },
  { id: 'light', label: 'Light' },
] as const;

export const BACKGROUND_THEMES: BackgroundTheme[] = [
  {
    id: 'solaris',
    name: 'Solaris',
    subtitle: 'Warm charcoal with amber and terracotta accents for long reading sessions.',
    category: 'warm',
    accentColor: '#f59e0b',
    secondaryAccent: '#ea580c',
    canvasBg: '#12100e',
    surfaceBg: '#1f1b17',
    borderTone: '#382f25',
    bgClass: 'theme-solaris',
  },
  {
    id: 'midnight',
    name: 'Midnight',
    subtitle: 'Deep navy charcoal with muted indigo and violet tones.',
    category: 'dark',
    accentColor: '#a855f7',
    secondaryAccent: '#6366f1',
    canvasBg: '#090a12',
    surfaceBg: '#151726',
    borderTone: '#242844',
    bgClass: 'theme-midnight',
  },
  {
    id: 'cyberpunk',
    name: 'Cyberpunk',
    subtitle: 'High-contrast dark obsidian with precise cyan and fuchsia accents.',
    category: 'dark',
    accentColor: '#06b6d4',
    secondaryAccent: '#f43f5e',
    canvasBg: '#090b10',
    surfaceBg: '#141a24',
    borderTone: '#1e2b3d',
    bgClass: 'theme-cyberpunk',
  },
  {
    id: 'emerald',
    name: 'Emerald',
    subtitle: 'Muted forest dark slate with calming jade and mint accents.',
    category: 'dark',
    accentColor: '#10b981',
    secondaryAccent: '#34d399',
    canvasBg: '#080f0c',
    surfaceBg: '#14211b',
    borderTone: '#1e332a',
    bgClass: 'theme-emerald',
  },
  {
    id: 'arctic',
    name: 'Arctic',
    subtitle: 'Sub-zero polar navy with crisp glacial cyan and ice-blue accents.',
    category: 'dark',
    accentColor: '#38bdf8',
    secondaryAccent: '#2dd4bf',
    canvasBg: '#070d14',
    surfaceBg: '#131e2c',
    borderTone: '#1d3047',
    bgClass: 'theme-arctic',
  },
  {
    id: 'amethyst',
    name: 'Amethyst',
    subtitle: 'Refined violet noir with muted lavender and stardust tones.',
    category: 'dark',
    accentColor: '#c084fc',
    secondaryAccent: '#a855f7',
    canvasBg: '#0d0a12',
    surfaceBg: '#1c1626',
    borderTone: '#2e223d',
    bgClass: 'theme-amethyst',
  },
  {
    id: 'crimson',
    name: 'Crimson',
    subtitle: 'Dark wine graphite with smoldering ruby and rose accents.',
    category: 'warm',
    accentColor: '#f43f5e',
    secondaryAccent: '#e11d48',
    canvasBg: '#100a0c',
    surfaceBg: '#20161a',
    borderTone: '#342128',
    bgClass: 'theme-crimson',
  },
  {
    id: 'mariana',
    name: 'Mariana',
    subtitle: 'Abyssal oceanic dark with deep sapphire and aquamarine accents.',
    category: 'dark',
    accentColor: '#3b82f6',
    secondaryAccent: '#06b6d4',
    canvasBg: '#060b14',
    surfaceBg: '#111a2c',
    borderTone: '#1a2944',
    bgClass: 'theme-mariana',
  },
  {
    id: 'obsidian',
    name: 'Obsidian OLED',
    subtitle: 'Pure pitch-black canvas with understated zinc neutrals and emerald focus.',
    category: 'minimal',
    accentColor: '#10b981',
    secondaryAccent: '#71717a',
    canvasBg: '#050505',
    surfaceBg: '#121214',
    borderTone: '#222226',
    bgClass: 'theme-obsidian',
  },
  {
    id: 'slate',
    name: 'Slate Grid',
    subtitle: 'Architectural gunmetal dark with industrial precision borders.',
    category: 'minimal',
    accentColor: '#38bdf8',
    secondaryAccent: '#94a3b8',
    canvasBg: '#0a0e14',
    surfaceBg: '#151d29',
    borderTone: '#212e40',
    bgClass: 'theme-slate',
  },
  {
    id: 'espresso',
    name: 'Kyoto Espresso',
    subtitle: 'Roasted cocoa dark with warm candlelight bronze and zero glare.',
    category: 'warm',
    accentColor: '#d97706',
    secondaryAccent: '#b45309',
    canvasBg: '#0f0c0a',
    surfaceBg: '#201a16',
    borderTone: '#362b23',
    bgClass: 'theme-espresso',
  },
  {
    id: 'oxford',
    name: 'Oxford Parchment',
    subtitle: 'Warm ivory vellum paper with British racing green typography.',
    category: 'light',
    accentColor: '#047857',
    secondaryAccent: '#b45309',
    canvasBg: '#f8f6f0',
    surfaceBg: '#ffffff',
    borderTone: '#e3ded3',
    bgClass: 'theme-oxford',
    isLight: true,
  },
  {
    id: 'porcelain',
    name: 'Studio Light',
    subtitle: 'Clean porcelain daylight canvas with balanced royal cobalt accents.',
    category: 'light',
    accentColor: '#2563eb',
    secondaryAccent: '#64748b',
    canvasBg: '#f8fafc',
    surfaceBg: '#ffffff',
    borderTone: '#e2e8f0',
    bgClass: 'theme-porcelain',
    isLight: true,
  },
];

export function getThemeById(themeId?: string): BackgroundTheme {
  // Graceful fallback for older alias names
  if (themeId === 'aurora') {
    return BACKGROUND_THEMES.find((t) => t.id === 'emerald') || BACKGROUND_THEMES[3];
  }
  return (
    BACKGROUND_THEMES.find((t) => t.id === themeId) ||
    BACKGROUND_THEMES.find((t) => t.id === 'solaris') ||
    BACKGROUND_THEMES[0]
  );
}

export function getUserStoredTheme(userEmail?: string): string {
  if (typeof window === 'undefined') return 'solaris';
  try {
    if (userEmail) {
      const userKey = `vortex_theme_${userEmail.toLowerCase().trim()}`;
      const saved = localStorage.getItem(userKey);
      if (saved && (BACKGROUND_THEMES.some((t) => t.id === saved) || saved === 'aurora')) {
        return saved === 'aurora' ? 'emerald' : saved;
      }
    }
    const globalSaved = localStorage.getItem('vortex_global_theme');
    if (globalSaved && (BACKGROUND_THEMES.some((t) => t.id === globalSaved) || globalSaved === 'aurora')) {
      return globalSaved === 'aurora' ? 'emerald' : globalSaved;
    }
  } catch {
    // fallback
  }
  return 'solaris';
}

export function setUserStoredTheme(themeId: string, userEmail?: string): void {
  if (typeof window === 'undefined') return;
  try {
    if (userEmail) {
      localStorage.setItem(`vortex_theme_${userEmail.toLowerCase().trim()}`, themeId);
    }
    localStorage.setItem('vortex_global_theme', themeId);
  } catch {
    // ignore
  }
}
