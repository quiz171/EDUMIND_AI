import React, { useState, useEffect } from 'react';
import {
  X,
  User as UserIcon,
  Mail,
  GraduationCap,
  Check,
  Volume2,
  Mic,
  Shield,
  LogOut,
  Building,
  Sliders,
  Palette,
  MessageSquare,
  Send,
  Compass,
  School,
  ExternalLink,
} from 'lucide-react';
import { User, RagDocument } from '../../types';
import { BACKGROUND_THEMES, BackgroundTheme } from '../../lib/theme';
import { PWAInstallButton } from '../pwa/PWAInstallButton';

export type SettingsTab =
  | 'mode'
  | 'profile'
  | 'academic'
  | 'model'
  | 'appearance'
  | 'preferences'
  | 'feedback'
  | 'account';

interface EducationSettingsModalProps {
  isOpen: boolean;
  onClose: () => void;
  currentUser: User;
  onUpdateUser: (updatedUser: User) => void;
  onLogout?: () => void;
  currentThemeId?: string;
  onSelectTheme?: (themeId: string) => void;
  sessionsCount?: number;
  activeDoc?: RagDocument | null;
  defaultTab?: SettingsTab;
}

export const EDUCATION_LEVELS = [
  {
    id: 'General',
    name: 'General Assistant',
    subtitle: 'Professional Work, Coding & Everyday AI',
    years: ['General / Professional', 'Lifelong Learner', 'Business & Creative', 'Tech & Engineering'],
    defaultCourse: 'General Knowledge & Professional',
  },
  {
    id: 'University',
    name: 'University & Polytechnic',
    subtitle: 'Undergraduate, 6-Year Clinical & Postgraduate',
    years: [
      '100L / Year 1',
      '200L / Year 2',
      '300L / Year 3',
      '400L / Year 4',
      '500L / Year 5',
      '600L / Year 6 (Final Clinical)',
      'Postgraduate / Masters',
      'PhD / Doctorate',
    ],
    defaultCourse: 'Computer Science',
  },
  {
    id: 'SSS',
    name: 'Senior Secondary',
    subtitle: 'SS1–SS3, WAEC, NECO & JAMB UTME',
    years: ['SS1', 'SS2', 'SS3', 'JAMB Candidate', 'WAEC / NECO / GCE Candidate'],
    defaultCourse: 'Science (Physics, Chem, Bio, Math)',
  },
  {
    id: 'JSS',
    name: 'Junior Secondary',
    subtitle: 'JSS 1–3, BECE & Junior WAEC',
    years: ['JSS 1', 'JSS 2', 'JSS 3'],
    defaultCourse: 'Basic Science & Mathematics',
  },
  {
    id: 'Primary',
    name: 'Primary / Elementary',
    subtitle: 'Primary 1–6 & Foundational Phonics',
    years: ['Primary 1', 'Primary 2', 'Primary 3', 'Primary 4', 'Primary 5', 'Primary 6'],
    defaultCourse: 'Basic Science & Math',
  },
];

type PrimaryNavTab = 'profile' | 'appearance' | 'preferences' | 'feedback' | 'account';

function normalizeTab(tab?: SettingsTab): PrimaryNavTab {
  if (!tab) return 'profile';
  if (tab === 'mode' || tab === 'academic' || tab === 'model') return 'profile';
  return tab as PrimaryNavTab;
}

export const EducationSettingsModal: React.FC<EducationSettingsModalProps> = ({
  isOpen,
  onClose,
  currentUser,
  onUpdateUser,
  onLogout,
  currentThemeId = 'obsidian',
  onSelectTheme,
  defaultTab = 'profile',
}) => {
  const [activeTab, setActiveTab] = useState<PrimaryNavTab>(normalizeTab(defaultTab));
  const [selectedLevel, setSelectedLevel] = useState<string>(currentUser.educationLevel || 'University');
  const [selectedYear, setSelectedYear] = useState<string>(currentUser.classYear || '100L / Year 1');
  const [course, setCourse] = useState<string>(currentUser.course || 'Computer Science');
  const [fullName, setFullName] = useState<string>(currentUser.fullName || '');
  const [school, setSchool] = useState<string>(currentUser.school || '');
  const [voiceSpeed, setVoiceSpeed] = useState<'normal' | 'slow' | 'fast'>('normal');
  const [enableVoiceTutor, setEnableVoiceTutor] = useState<boolean>(true);
  const [isSaved, setIsSaved] = useState<boolean>(false);

  // Feedback State
  const [feedbackRating, setFeedbackRating] = useState<number>(5);
  const [feedbackCategory, setFeedbackCategory] = useState<string>('General Feedback');
  const [feedbackMessage, setFeedbackMessage] = useState<string>('');
  const [feedbackSubmitting, setFeedbackSubmitting] = useState<boolean>(false);
  const [feedbackSuccess, setFeedbackSuccess] = useState<boolean>(false);
  const [feedbackError, setFeedbackError] = useState<string | null>(null);

  useEffect(() => {
    if (isOpen && currentUser) {
      setSelectedLevel(currentUser.educationLevel || 'University');
      setSelectedYear(currentUser.classYear || '100L / Year 1');
      setCourse(currentUser.course || 'Computer Science');
      setFullName(currentUser.fullName || '');
      setSchool(currentUser.school || '');
      setActiveTab(normalizeTab(defaultTab));
      setFeedbackSuccess(false);
      setFeedbackError(null);
    }
  }, [isOpen, currentUser, defaultTab]);

  if (!isOpen) return null;

  const isGeneralActive = selectedLevel.toLowerCase() === 'general';

  const currentLevelConfig =
    EDUCATION_LEVELS.find((l) => l.id.toLowerCase() === selectedLevel.toLowerCase()) ||
    EDUCATION_LEVELS[1];

  const handleLevelChange = (levelId: string) => {
    setSelectedLevel(levelId);
    const targetConfig = EDUCATION_LEVELS.find((l) => l.id === levelId) || EDUCATION_LEVELS[1];
    setSelectedYear(targetConfig.years[0]);
    if (!course || course === 'General' || course === 'Computer Science' || course === 'Basic Science & Math') {
      setCourse(targetConfig.defaultCourse);
    }
  };

  const handleToggleMode = (mode: 'general' | 'student') => {
    if (mode === 'general') {
      setSelectedLevel('General');
      setSelectedYear('General / Professional');
      setCourse('General Knowledge & Professional');
    } else {
      setSelectedLevel('University');
      setSelectedYear('100L / Year 1');
      setCourse('Computer Science');
    }
  };

  const handleSave = () => {
    const isGeneral = selectedLevel.toLowerCase() === 'general';
    const updated: User = {
      ...currentUser,
      fullName: fullName.trim() || currentUser.fullName,
      educationLevel: selectedLevel,
      classYear: selectedYear,
      course: course.trim() || currentLevelConfig.defaultCourse,
      school: school.trim() || currentUser.school,
      userType: isGeneral ? 'others' : 'student',
    };

    onUpdateUser(updated);
    setIsSaved(true);
    setTimeout(() => {
      setIsSaved(false);
      onClose();
    }, 400);
  };

  const handleSubmitFeedback = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!feedbackMessage.trim()) {
      setFeedbackError('Please enter your feedback message.');
      return;
    }

    setFeedbackSubmitting(true);
    setFeedbackError(null);

    try {
      const res = await fetch('/api/feedback', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          rating: feedbackRating,
          category: feedbackCategory,
          message: feedbackMessage.trim(),
          fullName: fullName.trim() || currentUser.fullName || 'User',
          email: currentUser.email,
          userId: currentUser.id,
        }),
      });

      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || 'Failed to submit feedback');
      }

      setFeedbackSuccess(true);
      setFeedbackMessage('');
    } catch (err: any) {
      setFeedbackError(err.message || 'Error delivering feedback. Please try again.');
    } finally {
      setFeedbackSubmitting(false);
    }
  };

  const directMailtoLink = `mailto:nelsonwazini1@gmail.com?subject=${encodeURIComponent(
    `[EduMind Feedback] ${feedbackCategory} (${feedbackRating}/5)`
  )}&body=${encodeURIComponent(
    `Hello Nelson,\n\n${feedbackMessage || 'Here is my feedback on EduMind AI:'}\n\nRating: ${feedbackRating}/5\nCategory: ${feedbackCategory}\nFrom: ${
      fullName || currentUser.fullName || 'User'
    } (${currentUser.email})\n`
  )}`;

  const navItems: { id: PrimaryNavTab; label: string; icon: React.FC<{ className?: string }> }[] = [
    { id: 'profile', label: 'Profile & Mode', icon: UserIcon },
    { id: 'appearance', label: 'Appearance', icon: Palette },
    { id: 'preferences', label: 'Voice & Audio', icon: Volume2 },
    { id: 'feedback', label: 'Send Feedback', icon: MessageSquare },
    { id: 'account', label: 'Account', icon: Shield },
  ];

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center p-3 sm:p-5 bg-black/75 backdrop-blur-sm animate-in fade-in duration-150">
      <div className="bg-[#121214] border border-white/10 rounded-2xl w-full max-w-3xl overflow-hidden shadow-2xl flex flex-col h-[90dvh] sm:h-[620px] text-stone-200">
        
        {/* Header */}
        <div className="px-6 py-4 border-b border-white/10 bg-[#161618] flex items-center justify-between shrink-0">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 rounded-lg bg-white/5 border border-white/10 flex items-center justify-center text-emerald-400">
              <Sliders className="w-4 h-4" />
            </div>
            <div>
              <h2 className="text-base font-semibold text-white tracking-tight">Settings</h2>
              <p className="text-xs text-stone-400">
                Manage your profile, learning mode, appearance, and audio preferences
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-2 text-stone-400 hover:text-white hover:bg-white/10 rounded-lg transition-colors cursor-pointer"
            aria-label="Close"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Body Layout: Clean Left Sidebar + Main Panel */}
        <div className="flex flex-col sm:flex-row flex-1 min-h-0 overflow-hidden">
          
          {/* Navigation Sidebar */}
          <nav className="sm:w-52 shrink-0 bg-[#141416] border-b sm:border-b-0 sm:border-r border-white/10 p-2 sm:p-3 flex sm:flex-col gap-1 overflow-x-auto sm:overflow-visible">
            {navItems.map((item) => {
              const Icon = item.icon;
              const isActive = activeTab === item.id;
              return (
                <button
                  key={item.id}
                  type="button"
                  onClick={() => setActiveTab(item.id)}
                  className={`flex items-center gap-3 px-3.5 py-2.5 rounded-xl text-xs font-medium whitespace-nowrap transition-colors cursor-pointer w-full text-left ${
                    isActive
                      ? 'bg-white/10 text-white font-semibold shadow-xs'
                      : 'text-stone-400 hover:text-stone-200 hover:bg-white/5'
                  }`}
                >
                  <Icon className={`w-4 h-4 shrink-0 ${isActive ? 'text-emerald-400' : 'text-stone-500'}`} />
                  <span>{item.label}</span>
                </button>
              );
            })}
          </nav>

          {/* Main Content Area */}
          <div className="flex-1 p-5 sm:p-6 overflow-y-auto min-h-0 bg-[#0e0e10] space-y-6">
            
            {/* 1. Profile & Mode Tab */}
            {activeTab === 'profile' && (
              <div className="space-y-6 max-w-xl animate-in fade-in-50 duration-150">
                {/* Mode Selector Segmented Control */}
                <div>
                  <label className="text-xs font-semibold text-stone-300 block mb-2">Operating Mode</label>
                  <div className="grid grid-cols-2 gap-1.5 p-1 bg-white/5 rounded-xl border border-white/10">
                    <button
                      type="button"
                      onClick={() => handleToggleMode('student')}
                      className={`flex items-center justify-center gap-2 py-2 px-3 rounded-lg text-xs font-semibold transition-all cursor-pointer ${
                        !isGeneralActive
                          ? 'bg-emerald-500 text-black shadow-xs'
                          : 'text-stone-400 hover:text-white'
                      }`}
                    >
                      <GraduationCap className="w-3.5 h-3.5" />
                      <span>Student Mode</span>
                    </button>
                    <button
                      type="button"
                      onClick={() => handleToggleMode('general')}
                      className={`flex items-center justify-center gap-2 py-2 px-3 rounded-lg text-xs font-semibold transition-all cursor-pointer ${
                        isGeneralActive
                          ? 'bg-cyan-500 text-black shadow-xs'
                          : 'text-stone-400 hover:text-white'
                      }`}
                    >
                      <Compass className="w-3.5 h-3.5" />
                      <span>General AI</span>
                    </button>
                  </div>
                  <p className="text-[11px] text-stone-400 mt-2">
                    {isGeneralActive
                      ? 'General AI provides open writing, programming, research, and creative brainstorming.'
                      : 'Student Mode grounds solutions in Nigerian and global syllabi, past questions, and academic marking schemes.'}
                  </p>
                </div>

                {/* Profile Information */}
                <div className="space-y-4 pt-2 border-t border-white/10">
                  <div className="space-y-1.5">
                    <label className="text-xs font-semibold text-stone-300">Full Name</label>
                    <input
                      type="text"
                      value={fullName}
                      onChange={(e) => setFullName(e.target.value)}
                      placeholder="Your full name"
                      className="w-full bg-[#18181b] border border-white/10 rounded-xl px-3.5 py-2.5 text-xs sm:text-sm text-white placeholder:text-stone-500 focus:outline-none focus:border-emerald-500 transition-colors"
                    />
                  </div>

                  <div className="space-y-1.5">
                    <label className="text-xs font-semibold text-stone-300">Email Address</label>
                    <div className="flex items-center gap-2 px-3.5 py-2.5 rounded-xl bg-white/5 border border-white/10 text-xs text-stone-400">
                      <Mail className="w-4 h-4 text-stone-500 shrink-0" />
                      <span className="truncate">{currentUser.email}</span>
                    </div>
                  </div>

                  {/* Student Mode Specific Fields */}
                  {!isGeneralActive ? (
                    <>
                      <div className="space-y-2">
                        <label className="text-xs font-semibold text-stone-300 flex items-center gap-1.5">
                          <School className="w-3.5 h-3.5 text-emerald-400" />
                          <span>Academic Stage</span>
                        </label>
                        <div className="grid grid-cols-2 gap-2">
                          {[
                            { id: 'University', label: 'University / Poly' },
                            { id: 'SSS', label: 'Senior Secondary (SSS)' },
                            { id: 'JSS', label: 'Junior Secondary (JSS)' },
                            { id: 'Primary', label: 'Primary School' },
                          ].map((stg) => {
                            const isSelected = selectedLevel.toLowerCase() === stg.id.toLowerCase();
                            return (
                              <button
                                key={stg.id}
                                type="button"
                                onClick={() => handleLevelChange(stg.id)}
                                className={`p-2.5 rounded-xl border text-left text-xs font-medium transition-colors cursor-pointer ${
                                  isSelected
                                    ? 'bg-emerald-500/15 border-emerald-500/40 text-emerald-300 font-semibold'
                                    : 'bg-white/5 border-white/10 text-stone-400 hover:text-white hover:bg-white/10'
                                }`}
                              >
                                {stg.label}
                              </button>
                            );
                          })}
                        </div>
                      </div>

                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                        <div className="space-y-1.5">
                          <label className="text-xs font-semibold text-stone-300">Class / Year</label>
                          <select
                            value={selectedYear}
                            onChange={(e) => setSelectedYear(e.target.value)}
                            className="w-full bg-[#18181b] border border-white/10 rounded-xl px-3 py-2.5 text-xs sm:text-sm text-white focus:outline-none focus:border-emerald-500 transition-colors"
                          >
                            {currentLevelConfig.years.map((yr) => (
                              <option key={yr} value={yr}>
                                {yr}
                              </option>
                            ))}
                          </select>
                        </div>

                        <div className="space-y-1.5">
                          <label className="text-xs font-semibold text-stone-300">Course / Department</label>
                          <input
                            type="text"
                            value={course}
                            onChange={(e) => setCourse(e.target.value)}
                            placeholder="e.g. Computer Science, Medicine"
                            className="w-full bg-[#18181b] border border-white/10 rounded-xl px-3.5 py-2.5 text-xs sm:text-sm text-white placeholder:text-stone-500 focus:outline-none focus:border-emerald-500 transition-colors"
                          />
                        </div>
                      </div>

                      <div className="space-y-1.5">
                        <label className="text-xs font-semibold text-stone-300">Institution / University (Optional)</label>
                        <div className="relative">
                          <Building className="w-4 h-4 text-stone-500 absolute left-3.5 top-1/2 -translate-y-1/2" />
                          <input
                            type="text"
                            value={school}
                            onChange={(e) => setSchool(e.target.value)}
                            placeholder="e.g. University of Lagos, ABU Zaria, UNN"
                            className="w-full bg-[#18181b] border border-white/10 rounded-xl pl-10 pr-3.5 py-2.5 text-xs sm:text-sm text-white placeholder:text-stone-500 focus:outline-none focus:border-emerald-500 transition-colors"
                          />
                        </div>
                      </div>
                    </>
                  ) : (
                    <div className="space-y-1.5">
                      <label className="text-xs font-semibold text-stone-300">Professional Focus / Occupation</label>
                      <input
                        type="text"
                        value={selectedYear}
                        onChange={(e) => setSelectedYear(e.target.value)}
                        placeholder="e.g. Software Engineer, Business Owner, Researcher"
                        className="w-full bg-[#18181b] border border-white/10 rounded-xl px-3.5 py-2.5 text-xs sm:text-sm text-white placeholder:text-stone-500 focus:outline-none focus:border-emerald-500 transition-colors"
                      />
                    </div>
                  )}
                </div>
              </div>
            )}

            {/* 2. Appearance & Theme Tab */}
            {activeTab === 'appearance' && (
              <div className="space-y-4 max-w-xl animate-in fade-in-50 duration-150">
                <div>
                  <h3 className="text-sm font-semibold text-white">Visual Theme</h3>
                  <p className="text-xs text-stone-400 mt-0.5">
                    Select a high-contrast dark theme optimized for long study sessions
                  </p>
                </div>

                <div className="grid grid-cols-2 sm:grid-cols-3 gap-2.5">
                  {BACKGROUND_THEMES.slice(0, 12).map((theme: BackgroundTheme) => {
                    const isSelected = currentThemeId === theme.id;
                    return (
                      <button
                        key={theme.id}
                        type="button"
                        onClick={() => onSelectTheme && onSelectTheme(theme.id)}
                        className={`p-3 rounded-xl border text-left transition-all cursor-pointer flex flex-col gap-2 ${
                          isSelected
                            ? 'border-emerald-500 bg-white/10 ring-1 ring-emerald-500'
                            : 'border-white/10 bg-white/5 hover:border-white/20 hover:bg-white/[0.08]'
                        }`}
                      >
                        <div
                          className="w-full h-10 rounded-lg border border-white/10 flex items-center justify-center relative overflow-hidden"
                          style={{ backgroundColor: theme.canvasBg }}
                        >
                          <div
                            className="w-3.5 h-3.5 rounded-full"
                            style={{ backgroundColor: theme.accentColor }}
                          />
                          {isSelected && (
                            <div className="absolute top-1.5 right-1.5 w-4 h-4 rounded-full bg-emerald-500 text-black flex items-center justify-center">
                              <Check className="w-2.5 h-2.5 stroke-[3]" />
                            </div>
                          )}
                        </div>
                        <div>
                          <div className="text-xs font-semibold text-white truncate">{theme.name}</div>
                          <div className="text-[10px] text-stone-400 truncate">{theme.subtitle}</div>
                        </div>
                      </button>
                    );
                  })}
                </div>
              </div>
            )}

            {/* 3. Voice & Audio Tab */}
            {activeTab === 'preferences' && (
              <div className="space-y-5 max-w-xl animate-in fade-in-50 duration-150">
                <div>
                  <h3 className="text-sm font-semibold text-white">Voice & Audio Settings</h3>
                  <p className="text-xs text-stone-400 mt-0.5">
                    Customize text-to-speech audio feedback and speech rate
                  </p>
                </div>

                <div className="space-y-3">
                  <div className="p-4 rounded-xl bg-white/5 border border-white/10 flex items-center justify-between">
                    <div>
                      <span className="text-xs font-semibold text-white block">Read-Aloud Explanations</span>
                      <span className="text-[11px] text-stone-400">
                        Enable voice narration for step-by-step problem working
                      </span>
                    </div>
                    <input
                      type="checkbox"
                      checked={enableVoiceTutor}
                      onChange={(e) => setEnableVoiceTutor(e.target.checked)}
                      className="w-4 h-4 accent-emerald-500 rounded cursor-pointer"
                    />
                  </div>

                  <div className="p-4 rounded-xl bg-white/5 border border-white/10 flex items-center justify-between">
                    <div>
                      <span className="text-xs font-semibold text-white block">Speech Speed</span>
                      <span className="text-[11px] text-stone-400">Pronunciation pacing rate</span>
                    </div>
                    <div className="flex items-center gap-1 p-1 bg-black/40 rounded-lg border border-white/10">
                      {(['slow', 'normal', 'fast'] as const).map((spd) => (
                        <button
                          key={spd}
                          type="button"
                          onClick={() => setVoiceSpeed(spd)}
                          className={`px-3 py-1 rounded text-xs capitalize transition-colors cursor-pointer ${
                            voiceSpeed === spd
                              ? 'bg-emerald-500 text-black font-semibold'
                              : 'text-stone-400 hover:text-white'
                          }`}
                        >
                          {spd}
                        </button>
                      ))}
                    </div>
                  </div>

                  <div className="p-4 rounded-xl bg-white/5 border border-white/10 flex items-center justify-between">
                    <div>
                      <span className="text-xs font-semibold text-white flex items-center gap-1.5">
                        <Mic className="w-3.5 h-3.5 text-cyan-400" />
                        <span>Voice Microphone Input</span>
                      </span>
                      <span className="text-[11px] text-stone-400">
                        Dictate questions directly into the chat input bar
                      </span>
                    </div>
                    <span className="text-[11px] font-medium text-emerald-400">Ready</span>
                  </div>
                </div>
              </div>
            )}

            {/* 4. Feedback Tab (Dispatches to Nelson Wazini) */}
            {activeTab === 'feedback' && (
              <div className="space-y-4 max-w-xl animate-in fade-in-50 duration-150">
                <div className="p-4 rounded-xl bg-emerald-500/10 border border-emerald-500/20 space-y-1">
                  <div className="flex items-center gap-2 text-white font-semibold text-sm">
                    <MessageSquare className="w-4 h-4 text-emerald-400" />
                    <span>Send Feedback directly to Nelson</span>
                  </div>
                  <p className="text-xs text-stone-300 leading-relaxed">
                    Your thoughts, bug reports, and suggestions are delivered straight to{' '}
                    <strong className="text-emerald-300 font-semibold">nelsonwazini1@gmail.com</strong>.
                  </p>
                </div>

                {feedbackSuccess && (
                  <div className="p-3.5 rounded-xl bg-emerald-500/15 border border-emerald-500/40 text-emerald-200 text-xs flex items-center gap-2.5 animate-in fade-in">
                    <Check className="w-4 h-4 text-emerald-400 shrink-0" />
                    <span>Thank you! Your feedback has been sent directly to Nelson Wazini.</span>
                  </div>
                )}

                {feedbackError && (
                  <div className="p-3 rounded-xl bg-rose-500/10 border border-rose-500/30 text-rose-300 text-xs">
                    {feedbackError}
                  </div>
                )}

                <form onSubmit={handleSubmitFeedback} className="space-y-4">
                  {/* Rating */}
                  <div className="space-y-1">
                    <label className="text-xs font-semibold text-stone-300 block">Satisfaction Rating</label>
                    <div className="flex items-center gap-1.5">
                      {[1, 2, 3, 4, 5].map((star) => (
                        <button
                          key={star}
                          type="button"
                          onClick={() => setFeedbackRating(star)}
                          className="p-1 text-stone-600 hover:text-amber-400 transition-colors cursor-pointer text-lg"
                        >
                          <span className={star <= feedbackRating ? 'text-amber-400' : 'text-stone-600'}>★</span>
                        </button>
                      ))}
                      <span className="text-xs text-stone-400 ml-2">
                        {feedbackRating === 5 ? '5/5 (Excellent)' : `${feedbackRating}/5`}
                      </span>
                    </div>
                  </div>

                  {/* Category */}
                  <div className="space-y-1">
                    <label className="text-xs font-semibold text-stone-300 block">Category</label>
                    <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                      {[
                        'General Feedback',
                        'Feature Request',
                        'Bug Report',
                        'Exam / Syllabus',
                        'Speed & Accuracy',
                        'User Interface',
                      ].map((cat) => (
                        <button
                          key={cat}
                          type="button"
                          onClick={() => setFeedbackCategory(cat)}
                          className={`px-3 py-2 rounded-xl text-xs font-medium border text-left transition-colors cursor-pointer ${
                            feedbackCategory === cat
                              ? 'bg-emerald-500/20 border-emerald-500/50 text-emerald-300 font-semibold'
                              : 'bg-white/5 border-white/10 text-stone-400 hover:text-white hover:bg-white/10'
                          }`}
                        >
                          {cat}
                        </button>
                      ))}
                    </div>
                  </div>

                  {/* Comments */}
                  <div className="space-y-1">
                    <label className="text-xs font-semibold text-stone-300 block">Comments or Suggestions</label>
                    <textarea
                      rows={4}
                      value={feedbackMessage}
                      onChange={(e) => setFeedbackMessage(e.target.value)}
                      placeholder="Write your suggestions, requested features, or questions for Nelson..."
                      className="w-full bg-[#18181b] border border-white/10 rounded-xl p-3 text-xs sm:text-sm text-white placeholder:text-stone-500 focus:outline-none focus:border-emerald-500 transition-colors resize-none"
                    />
                  </div>

                  <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 pt-1">
                    <a
                      href={directMailtoLink}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-[11px] text-stone-400 hover:text-emerald-400 transition-colors inline-flex items-center gap-1"
                    >
                      <ExternalLink className="w-3 h-3" />
                      <span>Or email Nelson directly via your mail client</span>
                    </a>

                    <button
                      type="submit"
                      disabled={feedbackSubmitting || !feedbackMessage.trim()}
                      className="px-4 py-2.5 rounded-xl bg-emerald-500 hover:bg-emerald-400 text-black font-semibold text-xs transition-colors cursor-pointer flex items-center gap-1.5 disabled:opacity-50 disabled:cursor-not-allowed ml-auto"
                    >
                      {feedbackSubmitting ? (
                        <span>Sending to Nelson...</span>
                      ) : (
                        <>
                          <Send className="w-3.5 h-3.5" />
                          <span>Send Feedback</span>
                        </>
                      )}
                    </button>
                  </div>
                </form>
              </div>
            )}

            {/* 5. Account & Security Tab */}
            {activeTab === 'account' && (
              <div className="space-y-5 max-w-xl animate-in fade-in-50 duration-150">
                <div>
                  <h3 className="text-sm font-semibold text-white">Account Details</h3>
                  <p className="text-xs text-stone-400 mt-0.5">Manage your active login session and credentials</p>
                </div>

                <div className="p-4 rounded-xl bg-white/5 border border-white/10 space-y-3">
                  <div>
                    <label className="text-[11px] text-stone-400 block mb-1">User Name</label>
                    <div className="text-sm font-semibold text-white">
                      {fullName || currentUser.fullName || 'User'}
                    </div>
                  </div>
                  <div>
                    <label className="text-[11px] text-stone-400 block mb-1">Registered Email</label>
                    <div className="text-xs font-mono text-stone-300">{currentUser.email}</div>
                  </div>
                  <div>
                    <label className="text-[11px] text-stone-400 block mb-1">Account Role</label>
                    <div className="text-xs text-stone-300 capitalize">{currentUser.role || 'Member'}</div>
                  </div>
                </div>

                {/* Progressive Web App Install Option */}
                <div>
                  <PWAInstallButton variant="settings" />
                </div>

                {onLogout && (
                  <div className="p-4 rounded-xl bg-rose-500/10 border border-rose-500/20 flex items-center justify-between">
                    <div>
                      <span className="text-xs font-semibold text-rose-300 block">Sign Out</span>
                      <span className="text-[11px] text-stone-400">Safely log out of your session on this device</span>
                    </div>
                    <button
                      type="button"
                      onClick={() => {
                        onClose();
                        onLogout();
                      }}
                      className="px-3.5 py-2 rounded-xl bg-rose-600 hover:bg-rose-500 text-white font-medium text-xs transition-colors cursor-pointer flex items-center gap-1.5"
                    >
                      <LogOut className="w-3.5 h-3.5" />
                      <span>Log Out</span>
                    </button>
                  </div>
                )}
              </div>
            )}

          </div>
        </div>

        {/* Footer */}
        <div className="px-6 py-3.5 border-t border-white/10 bg-[#161618] flex items-center justify-between shrink-0">
          <span className="text-xs text-stone-500">
            Current mode: <strong className="text-stone-300">{isGeneralActive ? 'General AI' : `Student (${selectedLevel})`}</strong>
          </span>
          <div className="flex items-center gap-2.5">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 rounded-xl text-xs font-medium text-stone-400 hover:text-white hover:bg-white/5 transition-colors cursor-pointer"
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={handleSave}
              className="px-4 py-2 rounded-xl bg-emerald-500 hover:bg-emerald-400 text-black font-semibold text-xs transition-colors cursor-pointer flex items-center gap-1.5"
            >
              {isSaved ? (
                <>
                  <Check className="w-4 h-4 stroke-[3]" />
                  <span>Saved</span>
                </>
              ) : (
                <span>Save Changes</span>
              )}
            </button>
          </div>
        </div>

      </div>
    </div>
  );
};
