import React, { useState, useEffect } from 'react';
import {
  X,
  User as UserIcon,
  Mail,
  GraduationCap,
  BookOpen,
  Check,
  Volume2,
  Mic,
  Shield,
  LogOut,
  Building,
  Sparkles,
  Award,
  Sliders,
  Cpu,
  Camera,
  Palette,
  Flame,
  MessageSquare,
  FileText,
  Send,
  Compass,
  ArrowRight,
  School,
  Sparkle,
} from 'lucide-react';
import { User, RagDocument } from '../../types';
import { BACKGROUND_THEMES, THEME_CATEGORIES, BackgroundTheme } from '../../lib/theme';

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
    name: 'General Public (Not in School)',
    subtitle: 'Everyday AI, Professional Work & Lifelong Learning',
    years: ['General / Professional', 'Lifelong Learner', 'Business & Creative', 'Tech & Engineering'],
    defaultCourse: 'General Knowledge & Professional',
  },
  {
    id: 'University',
    name: 'University / Polytechnic',
    subtitle: 'Undergraduate, 6-Yr Clinical & Postgrad',
    years: [
      '100L / Year 1',
      '200L / Year 2',
      '300L / Year 3',
      '400L / Year 4',
      '500L / Year 5 (5-Year Final / Clinical 1)',
      '600L / Year 6 (Final Year MBBS / Vet Med / PharmD / BDS)',
      'Postgraduate / Masters',
      'PhD / Doctorate',
    ],
    defaultCourse: 'Computer Science',
  },
  {
    id: 'SSS',
    name: 'Senior Secondary',
    subtitle: 'SS1–SS3, WAEC, NECO & JAMB Prep',
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

const PRESET_COURSES = [
  { name: 'Medicine & Surgery (MBBS - 6 Yrs)', isSixYear: true },
  { name: 'Veterinary Medicine (DVM - 6 Yrs)', isSixYear: true },
  { name: 'Pharmacy (PharmD - 6 Yrs)', isSixYear: true },
  { name: 'Dentistry (BDS - 6 Yrs)', isSixYear: true },
  { name: 'Nursing Science (5 Yrs)', isSixYear: false },
  { name: 'Law (LL.B - 5 Yrs)', isSixYear: false },
  { name: 'Computer Science / Software Eng', isSixYear: false },
  { name: 'Electrical / Mechanical Engineering', isSixYear: false },
  { name: 'Accounting / Economics / Finance', isSixYear: false },
];

export const EducationSettingsModal: React.FC<EducationSettingsModalProps> = ({
  isOpen,
  onClose,
  currentUser,
  onUpdateUser,
  onLogout,
  currentThemeId = 'obsidian',
  onSelectTheme,
  sessionsCount = 0,
  activeDoc = null,
  defaultTab = 'profile',
}) => {
  const [activeNav, setActiveNav] = useState<SettingsTab>(defaultTab);
  const [selectedLevel, setSelectedLevel] = useState<string>(currentUser.educationLevel || 'University');
  const [selectedYear, setSelectedYear] = useState<string>(currentUser.classYear || '100L / Year 1');
  const [course, setCourse] = useState<string>(currentUser.course || 'Computer Science');
  const [fullName, setFullName] = useState<string>(currentUser.fullName || '');
  const [school, setSchool] = useState<string>(currentUser.school || '');
  const [targetExam, setTargetExam] = useState<string>(currentUser.targetExam || 'Semester Exams');
  const [voiceSpeed, setVoiceSpeed] = useState<'normal' | 'slow' | 'fast'>('normal');
  const [enableVoiceTutor, setEnableVoiceTutor] = useState<boolean>(true);
  const [isSaved, setIsSaved] = useState<boolean>(false);
  const [appearanceCategory, setAppearanceCategory] = useState<string>('all');

  // Feedback State
  const [feedbackRating, setFeedbackRating] = useState<number>(5);
  const [feedbackCategory, setFeedbackCategory] = useState<string>('General Feedback');
  const [feedbackMessage, setFeedbackMessage] = useState<string>('');
  const [feedbackSubmitting, setFeedbackSubmitting] = useState<boolean>(false);
  const [feedbackSuccess, setFeedbackSuccess] = useState<boolean>(false);
  const [feedbackError, setFeedbackError] = useState<string | null>(null);

  const handleSubmitFeedback = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!feedbackMessage.trim()) {
      setFeedbackError('Please enter your feedback or comments.');
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
          fullName: fullName || currentUser.fullName || 'Student',
          email: currentUser.email || 'student@edumind.app',
          userId: currentUser.id || 'guest',
        }),
      });

      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || 'Failed to submit feedback');
      }

      setFeedbackSuccess(true);
      setFeedbackMessage('');
      setTimeout(() => {
        setFeedbackSuccess(false);
      }, 5000);
    } catch (err: any) {
      setFeedbackError(err.message || 'Error sending feedback. Please try again.');
    } finally {
      setFeedbackSubmitting(false);
    }
  };

  useEffect(() => {
    if (isOpen && currentUser) {
      setSelectedLevel(currentUser.educationLevel || 'University');
      setSelectedYear(currentUser.classYear || '100L / Year 1');
      setCourse(currentUser.course || 'Computer Science');
      setFullName(currentUser.fullName || '');
      setSchool(currentUser.school || '');
      setTargetExam(currentUser.targetExam || 'Semester Exams');
      setActiveNav(defaultTab);
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

  // Instant switch to General Mode
  const handleSwitchToGeneral = () => {
    setSelectedLevel('General');
    setSelectedYear('General / Professional');
    setCourse('General Knowledge & Professional');
  };

  // Instant switch to Student Mode
  const handleSwitchToStudent = (targetStage = 'University') => {
    setSelectedLevel(targetStage);
    const targetConfig = EDUCATION_LEVELS.find((l) => l.id === targetStage) || EDUCATION_LEVELS[1];
    setSelectedYear(targetConfig.years[0]);
    setCourse(targetConfig.defaultCourse);
  };

  // Direct 1-click switch & save
  const handleDirectSwitchAndSave = (targetMode: 'general' | 'student') => {
    const newLevel = targetMode === 'general' ? 'General' : (selectedLevel === 'General' ? 'University' : selectedLevel);
    const targetConfig = EDUCATION_LEVELS.find((l) => l.id === newLevel) || EDUCATION_LEVELS[1];
    const newYear = targetMode === 'general' ? 'General / Professional' : (selectedYear === 'General / Professional' ? targetConfig.years[0] : selectedYear);
    const newCourse = targetMode === 'general' ? 'General Knowledge & Professional' : (course === 'General Knowledge & Professional' ? targetConfig.defaultCourse : course);

    const updated: User = {
      ...currentUser,
      fullName: fullName.trim() || currentUser.fullName,
      educationLevel: newLevel,
      classYear: newYear,
      course: newCourse,
      school: school.trim() || currentUser.school,
      targetExam: targetExam.trim() || currentUser.targetExam,
      userType: targetMode === 'general' ? 'others' : 'student',
    };

    setSelectedLevel(newLevel);
    setSelectedYear(newYear);
    setCourse(newCourse);
    onUpdateUser(updated);
    setIsSaved(true);
    setTimeout(() => {
      setIsSaved(false);
      onClose();
    }, 350);
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
      targetExam: targetExam.trim() || currentUser.targetExam,
      userType: isGeneral ? 'others' : 'student',
    };

    onUpdateUser(updated);
    setIsSaved(true);
    setTimeout(() => {
      setIsSaved(false);
      onClose();
    }, 350);
  };

  const getInitials = (name: string) => {
    if (!name) return 'U';
    const parts = name.trim().split(' ');
    if (parts.length >= 2) {
      return (parts[0][0] + parts[1][0]).toUpperCase();
    }
    return parts[0][0].toUpperCase();
  };

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center p-2 sm:p-4 bg-black/80 backdrop-blur-sm animate-in fade-in duration-150">
      <div className="glass-panel border border-white/10 rounded-2xl w-full max-w-3xl overflow-hidden shadow-2xl flex flex-col h-[90dvh] sm:h-[630px] text-stone-200">
        {/* Header with Mode Status & Close Button */}
        <div className="px-5 py-4 border-b border-white/10 bg-[#111] flex items-center justify-between shrink-0">
          <div className="flex items-center gap-2.5 min-w-0">
            <div className="w-8 h-8 rounded-xl bg-white/5 border border-white/10 flex items-center justify-center text-emerald-400 shrink-0">
              <Sliders className="w-4 h-4" />
            </div>
            <div className="min-w-0">
              <div className="flex items-center gap-2 flex-wrap">
                <h2 className="text-base font-bold text-white tracking-tight">Settings</h2>
                <span
                  className={`px-2 py-0.5 rounded-full text-[10px] font-bold border transition-colors ${
                    isGeneralActive
                      ? 'bg-cyan-500/20 text-cyan-300 border-cyan-500/40'
                      : 'bg-emerald-500/20 text-emerald-300 border-emerald-500/40'
                  }`}
                >
                  {isGeneralActive ? '🌐 General AI Mode' : `🎓 Student Mode (${selectedLevel})`}
                </span>
              </div>
              <p className="text-xs text-stone-400">
                Change between General AI and Student Mode, manage profile, theme & preferences
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 text-stone-400 hover:text-white hover:bg-white/10 rounded-lg transition-colors cursor-pointer"
            aria-label="Close settings"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Desktop Split-View / Mobile Stack */}
        <div className="flex flex-col sm:flex-row flex-1 min-h-0 overflow-hidden">
          {/* Navigation Rail */}
          <nav className="sm:w-56 shrink-0 bg-[#0f0f0f] border-b sm:border-b-0 sm:border-r border-white/10 p-2 sm:p-3 flex sm:flex-col gap-1 overflow-x-auto sm:overflow-visible shrink-0 scrollbar-none">
            {[
              { id: 'mode', label: 'AI Mode (General / Student)', icon: Sparkles },
              { id: 'profile', label: isGeneralActive ? 'User Profile' : 'Student Profile', icon: UserIcon },
              { id: 'academic', label: 'Education & Stage', icon: GraduationCap },
              { id: 'model', label: 'AI & Exam Vision', icon: Cpu },
              { id: 'appearance', label: 'Appearance & Theme', icon: Palette },
              { id: 'preferences', label: 'Voice & Audio', icon: Volume2 },
              { id: 'feedback', label: 'Site Feedback', icon: MessageSquare },
              { id: 'account', label: 'Account & Sign Out', icon: Shield },
            ].map((item) => {
              const Icon = item.icon;
              const isActive = activeNav === item.id;
              return (
                <button
                  key={item.id}
                  type="button"
                  onClick={() => setActiveNav(item.id as SettingsTab)}
                  className={`flex items-center gap-2.5 px-3 py-2 sm:py-2.5 rounded-xl text-xs font-semibold whitespace-nowrap transition-all cursor-pointer w-full text-left ${
                    isActive
                      ? 'bg-white/10 text-white font-bold shadow-xs'
                      : 'text-stone-400 hover:text-stone-200 hover:bg-white/5'
                  }`}
                >
                  <Icon
                    className={`w-4 h-4 shrink-0 ${
                      isActive
                        ? item.id === 'mode'
                          ? 'text-cyan-400'
                          : 'text-emerald-400'
                        : 'text-stone-400'
                    }`}
                  />
                  <span>{item.label}</span>
                </button>
              );
            })}
          </nav>

          {/* Right Main Content Panel */}
          <div className="flex-1 p-4 sm:p-6 overflow-y-auto min-h-0 bg-[#141414] overscroll-contain space-y-6">
            {/* AI Mode Selector Tab */}
            {activeNav === 'mode' && (
              <div className="space-y-5 max-w-xl animate-in fade-in-50 duration-150">
                <div className="space-y-1">
                  <h3 className="text-sm sm:text-base font-bold text-white flex items-center gap-2">
                    <Sparkle className="w-4 h-4 text-emerald-400" />
                    <span>Choose Your AI Mode</span>
                  </h3>
                  <p className="text-xs text-stone-400">
                    Switch freely between General Assistant Mode and Student / Academic Syllabus Mode at any time.
                  </p>
                </div>

                {/* Two Main Mode Cards */}
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5">
                  {/* General Mode Card */}
                  <div
                    onClick={handleSwitchToGeneral}
                    className={`p-4 rounded-2xl border transition-all cursor-pointer flex flex-col justify-between relative overflow-hidden group ${
                      isGeneralActive
                        ? 'bg-cyan-500/10 border-cyan-500/80 ring-1 ring-cyan-500/30 text-white'
                        : 'bg-white/[0.02] border-white/10 text-stone-300 hover:bg-white/[0.05] hover:border-white/20'
                    }`}
                  >
                    <div className="space-y-2 mb-3">
                      <div className="flex items-center justify-between">
                        <div className="w-9 h-9 rounded-xl bg-cyan-500/20 text-cyan-400 flex items-center justify-center">
                          <Compass className="w-5 h-5" />
                        </div>
                        {isGeneralActive ? (
                          <span className="flex items-center gap-1 text-[11px] font-bold text-cyan-400 bg-cyan-500/20 px-2 py-0.5 rounded-full border border-cyan-500/30">
                            <Check className="w-3 h-3 stroke-[3]" /> Active Mode
                          </span>
                        ) : (
                          <span className="text-[11px] text-stone-500 group-hover:text-stone-300">Click to Select</span>
                        )}
                      </div>
                      <h4 className="text-sm font-bold text-white">General Assistant</h4>
                      <p className="text-xs text-stone-400 leading-relaxed">
                        Everyday AI for writing, coding, creative exploration, business research, and open discussions. Free of academic syllabi or exam formatting.
                      </p>
                    </div>

                    <div className="pt-2 border-t border-white/5 flex items-center justify-between text-[11px]">
                      <span className="text-cyan-300 font-medium">Non-Student / Professional</span>
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          handleDirectSwitchAndSave('general');
                        }}
                        className={`px-2.5 py-1 rounded-lg font-bold transition-all text-[11px] ${
                          isGeneralActive
                            ? 'bg-cyan-500 text-black'
                            : 'bg-white/10 text-stone-200 hover:bg-cyan-500 hover:text-black'
                        }`}
                      >
                        {isGeneralActive ? 'Current Active' : 'Switch & Save'}
                      </button>
                    </div>
                  </div>

                  {/* Student Mode Card */}
                  <div
                    onClick={() => handleSwitchToStudent('University')}
                    className={`p-4 rounded-2xl border transition-all cursor-pointer flex flex-col justify-between relative overflow-hidden group ${
                      !isGeneralActive
                        ? 'bg-emerald-500/10 border-emerald-500/80 ring-1 ring-emerald-500/30 text-white'
                        : 'bg-white/[0.02] border-white/10 text-stone-300 hover:bg-white/[0.05] hover:border-white/20'
                    }`}
                  >
                    <div className="space-y-2 mb-3">
                      <div className="flex items-center justify-between">
                        <div className="w-9 h-9 rounded-xl bg-emerald-500/20 text-emerald-400 flex items-center justify-center">
                          <GraduationCap className="w-5 h-5" />
                        </div>
                        {!isGeneralActive ? (
                          <span className="flex items-center gap-1 text-[11px] font-bold text-emerald-400 bg-emerald-500/20 px-2 py-0.5 rounded-full border border-emerald-500/30">
                            <Check className="w-3 h-3 stroke-[3]" /> Active Mode
                          </span>
                        ) : (
                          <span className="text-[11px] text-stone-500 group-hover:text-stone-300">Click to Select</span>
                        )}
                      </div>
                      <h4 className="text-sm font-bold text-white">Student & Academic Mode</h4>
                      <p className="text-xs text-stone-400 leading-relaxed">
                        Curriculum-grounded AI tailored for University (100L–600L), WAEC/JAMB, Secondary, and Primary. Delivers step-by-step working and exam past question vision.
                      </p>
                    </div>

                    <div className="pt-2 border-t border-white/5 flex items-center justify-between text-[11px]">
                      <span className="text-emerald-300 font-medium">Curriculum & Exam Tutor</span>
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          handleDirectSwitchAndSave('student');
                        }}
                        className={`px-2.5 py-1 rounded-lg font-bold transition-all text-[11px] ${
                          !isGeneralActive
                            ? 'bg-emerald-400 text-black'
                            : 'bg-white/10 text-stone-200 hover:bg-emerald-400 hover:text-black'
                        }`}
                      >
                        {!isGeneralActive ? 'Current Active' : 'Switch & Save'}
                      </button>
                    </div>
                  </div>
                </div>

                {/* Sub-selector for Academic Stage when in Student Mode */}
                {!isGeneralActive && (
                  <div className="p-4 rounded-xl bg-white/[0.02] border border-white/10 space-y-3 animate-in fade-in-50 duration-150">
                    <div className="flex items-center justify-between">
                      <label className="text-xs font-semibold text-stone-300 flex items-center gap-1.5">
                        <School className="w-3.5 h-3.5 text-emerald-400" />
                        <span>Academic Stage Selection</span>
                      </label>
                      <span className="text-[11px] font-mono text-emerald-400">{selectedLevel}</span>
                    </div>

                    <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                      {[
                        { id: 'University', label: 'University', sub: '100L–600L' },
                        { id: 'SSS', label: 'Senior Sec (SSS)', sub: 'WAEC / JAMB' },
                        { id: 'JSS', label: 'Junior Sec (JSS)', sub: 'BECE 1–3' },
                        { id: 'Primary', label: 'Primary', sub: 'Class 1–6' },
                      ].map((stg) => {
                        const isStageSelected = selectedLevel.toLowerCase() === stg.id.toLowerCase();
                        return (
                          <button
                            key={stg.id}
                            type="button"
                            onClick={() => handleLevelChange(stg.id)}
                            className={`p-2.5 rounded-xl border text-left transition-all cursor-pointer flex flex-col justify-between ${
                              isStageSelected
                                ? 'bg-emerald-500/20 border-emerald-500 text-white ring-1 ring-emerald-500/40'
                                : 'bg-white/5 border-white/10 text-stone-400 hover:text-white hover:bg-white/10'
                            }`}
                          >
                            <span className="text-xs font-bold leading-tight">{stg.label}</span>
                            <span className="text-[10px] text-stone-400 mt-0.5">{stg.sub}</span>
                          </button>
                        );
                      })}
                    </div>
                  </div>
                )}
              </div>
            )}

            {/* Profile Tab (User or Student Profile) */}
            {activeNav === 'profile' && (
              <div className="space-y-5 max-w-xl animate-in fade-in-50 duration-150">
                {/* Avatar & Identity Card */}
                <div className="flex flex-col sm:flex-row items-center sm:items-start gap-4 p-4 rounded-2xl bg-white/[0.03] border border-white/10">
                  <div
                    className={`w-16 h-16 rounded-2xl flex items-center justify-center text-white text-xl font-bold shadow-lg shrink-0 ${
                      isGeneralActive
                        ? 'bg-gradient-to-tr from-cyan-600 to-teal-400'
                        : 'bg-gradient-to-tr from-emerald-600 to-teal-400'
                    }`}
                  >
                    {getInitials(fullName || currentUser.fullName)}
                  </div>

                  <div className="text-center sm:text-left min-w-0 flex-1 space-y-1">
                    <div className="flex items-center justify-center sm:justify-start gap-2">
                      <h3 className="text-base sm:text-lg font-bold text-white truncate">
                        {fullName || currentUser.fullName || (isGeneralActive ? 'User' : 'Student')}
                      </h3>
                      <span
                        className={`px-2 py-0.5 rounded-full text-[10px] font-semibold border ${
                          isGeneralActive
                            ? 'bg-cyan-500/20 text-cyan-400 border-cyan-500/30'
                            : 'bg-emerald-500/20 text-emerald-400 border-emerald-500/30'
                        }`}
                      >
                        {isGeneralActive ? 'General Public Mode' : `${selectedLevel} Student`}
                      </span>
                    </div>
                    <p className="text-xs text-stone-400 flex items-center justify-center sm:justify-start gap-1.5 truncate">
                      <Mail className="w-3.5 h-3.5 shrink-0 text-stone-500" />
                      <span className="truncate">{currentUser.email}</span>
                    </p>
                    <p className="text-xs text-stone-300">
                      <strong className="text-white">{selectedYear || currentUser.classYear}</strong> •{' '}
                      {course || currentUser.course}
                    </p>
                  </div>
                </div>

                {/* Profile Edit Fields */}
                <div className="p-4 rounded-xl bg-white/[0.02] border border-white/10 space-y-3.5">
                  <h4 className="text-xs font-bold uppercase tracking-wider text-emerald-400">
                    {isGeneralActive ? 'Account & Personal Details' : 'Student Profile Details'}
                  </h4>

                  <div className="space-y-1.5">
                    <label className="text-xs font-semibold text-stone-300">Full Name</label>
                    <input
                      type="text"
                      value={fullName}
                      onChange={(e) => setFullName(e.target.value)}
                      placeholder="e.g. Your Name"
                      className="w-full bg-[#1c1c1c] border border-white/10 rounded-xl px-3.5 py-2.5 text-xs sm:text-sm text-white placeholder:text-stone-500 focus:outline-none focus:border-emerald-500 transition-colors"
                    />
                  </div>

                  <div className="space-y-1.5">
                    <label className="text-xs font-semibold text-stone-300">Email Address</label>
                    <div className="flex items-center gap-2 px-3.5 py-2.5 rounded-xl bg-white/5 border border-white/10 text-xs sm:text-sm text-stone-400">
                      <Mail className="w-4 h-4 text-stone-500 shrink-0" />
                      <span className="truncate">{currentUser.email}</span>
                      <span className="ml-auto text-[10px] font-mono text-emerald-400 bg-emerald-500/10 px-2 py-0.5 rounded border border-emerald-500/20 shrink-0">
                        Verified
                      </span>
                    </div>
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-1">
                    <div className="space-y-1.5">
                      <label className="text-xs font-semibold text-stone-300">
                        {isGeneralActive ? 'Role / Focus' : 'Class / Year'}
                      </label>
                      <input
                        type="text"
                        value={selectedYear}
                        onChange={(e) => setSelectedYear(e.target.value)}
                        placeholder={isGeneralActive ? 'e.g. Professional, Developer, Creator' : 'e.g. 600L, SS3, Year 1'}
                        className="w-full bg-[#1c1c1c] border border-white/10 rounded-xl px-3.5 py-2.5 text-xs sm:text-sm text-white placeholder:text-stone-500 focus:outline-none focus:border-emerald-500 transition-colors"
                      />
                    </div>
                    <div className="space-y-1.5">
                      <label className="text-xs font-semibold text-stone-300">
                        {isGeneralActive ? 'Field of Interest' : 'Course / Major'}
                      </label>
                      <input
                        type="text"
                        value={course}
                        onChange={(e) => setCourse(e.target.value)}
                        placeholder={isGeneralActive ? 'e.g. Technology, Business, Science' : 'e.g. Medicine & Surgery, Science'}
                        className="w-full bg-[#1c1c1c] border border-white/10 rounded-xl px-3.5 py-2.5 text-xs sm:text-sm text-white placeholder:text-stone-500 focus:outline-none focus:border-emerald-500 transition-colors"
                      />
                    </div>
                  </div>
                </div>

                {/* Learning & Activity Stats */}
                <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
                  <div className="p-3.5 rounded-xl bg-white/[0.02] border border-white/10 space-y-1">
                    <div className="flex items-center gap-1.5 text-amber-400 text-xs font-semibold">
                      <Flame className="w-4 h-4 shrink-0" />
                      <span>{isGeneralActive ? 'Daily Streak' : 'Study Streak'}</span>
                    </div>
                    <p className="text-lg font-bold text-white">Active</p>
                    <p className="text-[10px] text-stone-400">Keep learning daily</p>
                  </div>

                  <div className="p-3.5 rounded-xl bg-white/[0.02] border border-white/10 space-y-1">
                    <div className="flex items-center gap-1.5 text-cyan-400 text-xs font-semibold">
                      <MessageSquare className="w-4 h-4 shrink-0" />
                      <span>Saved Sessions</span>
                    </div>
                    <p className="text-lg font-bold text-white">{sessionsCount}</p>
                    <p className="text-[10px] text-stone-400">Archived chats</p>
                  </div>

                  <div className="p-3.5 rounded-xl bg-white/[0.02] border border-white/10 space-y-1 col-span-2 sm:col-span-1">
                    <div className="flex items-center gap-1.5 text-emerald-400 text-xs font-semibold">
                      <FileText className="w-4 h-4 shrink-0" />
                      <span>Grounded Notes</span>
                    </div>
                    <p className="text-xs font-bold text-white truncate">
                      {activeDoc ? activeDoc.fileName : 'None attached'}
                    </p>
                    <p className="text-[10px] text-stone-400">
                      {activeDoc ? `${activeDoc.chunksCount} chunks indexed` : 'Upload PDF in chat'}
                    </p>
                  </div>
                </div>
              </div>
            )}

            {/* Academic & Stage Tab */}
            {activeNav === 'academic' && (
              <div className="space-y-5 max-w-xl animate-in fade-in-50 duration-150">
                {/* Education Stage Grid */}
                <div className="space-y-2">
                  <div className="flex items-center justify-between">
                    <label className="text-xs font-semibold text-stone-300">Education Stage / Level</label>
                    <span className="text-[11px] font-mono text-emerald-400">{selectedLevel}</span>
                  </div>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                    {EDUCATION_LEVELS.map((lvl) => {
                      const isSelected = selectedLevel.toLowerCase() === lvl.id.toLowerCase();
                      return (
                        <button
                          key={lvl.id}
                          type="button"
                          onClick={() => handleLevelChange(lvl.id)}
                          className={`p-3 rounded-xl text-left border transition-all cursor-pointer flex flex-col justify-between ${
                            isSelected
                              ? 'bg-emerald-500/10 border-emerald-500/60 text-white ring-1 ring-emerald-500/30'
                              : 'bg-white/[0.02] border-white/10 text-stone-300 hover:bg-white/[0.05] hover:border-white/20'
                          }`}
                        >
                          <div className="flex items-center justify-between gap-2 mb-1">
                            <span className="font-semibold text-xs text-white">{lvl.name}</span>
                            {isSelected && <Check className="w-3.5 h-3.5 text-emerald-400 stroke-[3]" />}
                          </div>
                          <span className="text-[11px] text-stone-400 leading-snug">{lvl.subtitle}</span>
                        </button>
                      );
                    })}
                  </div>
                </div>

                {/* Class / Year Level */}
                <div className="space-y-1.5">
                  <div className="flex items-center justify-between">
                    <label className="text-xs font-semibold text-stone-300">Class & Year Track</label>
                    {selectedLevel === 'University' && (
                      <span className="text-[11px] text-emerald-400">Up to 600L (Final Year Clinical)</span>
                    )}
                  </div>
                  <select
                    value={selectedYear}
                    onChange={(e) => setSelectedYear(e.target.value)}
                    className="w-full bg-[#1c1c1c] border border-white/10 rounded-xl px-3.5 py-2.5 text-xs sm:text-sm text-white focus:outline-none focus:border-emerald-500 transition-colors cursor-pointer"
                  >
                    {currentLevelConfig.years.map((yr) => (
                      <option key={yr} value={yr} className="bg-[#1c1c1c] text-white py-1">
                        {yr}
                      </option>
                    ))}
                  </select>
                </div>

                {/* Course / Focus Area */}
                <div className="space-y-2">
                  <label className="text-xs font-semibold text-stone-300">Course / Major / Focus</label>
                  <div className="relative">
                    <BookOpen className="w-4 h-4 text-stone-400 absolute left-3.5 top-1/2 -translate-y-1/2" />
                    <input
                      type="text"
                      value={course}
                      onChange={(e) => setCourse(e.target.value)}
                      placeholder="e.g. Medicine & Surgery (MBBS), Computer Science, Law"
                      className="w-full bg-[#1c1c1c] border border-white/10 rounded-xl pl-10 pr-3.5 py-2.5 text-xs sm:text-sm text-white placeholder:text-stone-500 focus:outline-none focus:border-emerald-500 transition-colors"
                    />
                  </div>

                  {/* Preset Pills */}
                  {selectedLevel === 'University' && (
                    <div className="space-y-1.5 pt-1">
                      <span className="text-[11px] text-stone-400 font-medium">Quick suggestions:</span>
                      <div className="flex flex-wrap gap-1.5">
                        {PRESET_COURSES.map((pc) => (
                          <button
                            key={pc.name}
                            type="button"
                            onClick={() => {
                              setCourse(pc.name);
                              if (pc.isSixYear) {
                                setSelectedYear('600L / Year 6 (Final Year MBBS / Vet Med / PharmD / BDS)');
                              }
                            }}
                            className={`text-[11px] px-2.5 py-1 rounded-lg border transition-all cursor-pointer ${
                              course === pc.name
                                ? 'bg-emerald-500/20 border-emerald-500 text-emerald-300 font-semibold'
                                : 'bg-white/5 border-white/10 text-stone-400 hover:text-white hover:bg-white/10'
                            }`}
                          >
                            {pc.name}
                          </button>
                        ))}
                      </div>
                    </div>
                  )}
                </div>

                {/* School / Institution */}
                <div className="space-y-1.5">
                  <label className="text-xs font-semibold text-stone-300">Institution / University (Optional)</label>
                  <div className="relative">
                    <Building className="w-4 h-4 text-stone-400 absolute left-3.5 top-1/2 -translate-y-1/2" />
                    <input
                      type="text"
                      value={school}
                      onChange={(e) => setSchool(e.target.value)}
                      placeholder="e.g. University of Ibadan, UNILAG, ABU Zaria, UNN"
                      className="w-full bg-[#1c1c1c] border border-white/10 rounded-xl pl-10 pr-3.5 py-2.5 text-xs sm:text-sm text-white placeholder:text-stone-500 focus:outline-none focus:border-emerald-500 transition-colors"
                    />
                  </div>
                </div>
              </div>
            )}

            {/* AI & Exam Vision Tab */}
            {activeNav === 'model' && (
              <div className="space-y-5 max-w-xl animate-in fade-in-50 duration-150">
                {/* Active AI Engine */}
                <div className="p-4 rounded-xl bg-white/[0.02] border border-white/10 space-y-2">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <Sparkles className="w-4 h-4 text-emerald-400" />
                      <span className="text-xs font-bold text-white">EduMind Multimodal AI Engine</span>
                    </div>
                    <span className="px-2 py-0.5 rounded-full text-[10px] font-mono bg-emerald-500/15 border border-emerald-500/30 text-emerald-400">
                      Active
                    </span>
                  </div>
                  <p className="text-xs text-stone-400 leading-relaxed">
                    Multimodal AI tuned for Nigerian & global curricula, university degree programs, WAEC marking schemes, and clinical case drills.
                  </p>
                </div>

                {/* Past Question Photo Solving Card */}
                <div className="p-4 rounded-xl bg-cyan-950/20 border border-cyan-500/20 space-y-2">
                  <div className="flex items-center gap-2 text-cyan-300 font-semibold text-xs">
                    <Camera className="w-4 h-4" />
                    <span>Exam Past Question Vision</span>
                  </div>
                  <p className="text-xs text-stone-300 leading-relaxed">
                    Snap or upload past question papers, diagrams, and handwritten equations directly in chat. EduMind Brain extracts the text, identifies the concepts, and generates step-by-step working.
                  </p>
                </div>

                {/* Target Examination */}
                <div className="space-y-1.5">
                  <div className="flex items-center justify-between">
                    <label className="text-xs font-semibold text-stone-300">Exam Target Focus</label>
                    <Award className="w-4 h-4 text-amber-400" />
                  </div>
                  <input
                    type="text"
                    value={targetExam}
                    onChange={(e) => setTargetExam(e.target.value)}
                    placeholder="e.g. University Semester Exams, WAEC 2025, JAMB UTME, Post-UTME, MBBS"
                    className="w-full bg-[#1c1c1c] border border-white/10 rounded-xl px-3.5 py-2.5 text-xs sm:text-sm text-white placeholder:text-stone-500 focus:outline-none focus:border-emerald-500 transition-colors"
                  />
                  <p className="text-[11px] text-stone-400">
                    EduMind adapts its solution structure, grading style, and terminology to match your target exam board.
                  </p>
                </div>
              </div>
            )}

            {/* Appearance & Theme Tab */}
            {activeNav === 'appearance' && (
              <div className="space-y-5 max-w-xl animate-in fade-in-50 duration-150">
                <div className="space-y-1">
                  <div className="flex items-center justify-between">
                    <h3 className="text-sm sm:text-base font-bold text-white flex items-center gap-2">
                      <Sparkles className="w-4 h-4 text-emerald-400" />
                      <span>Themes & Atmosphere</span>
                    </h3>
                    <span className="text-[11px] font-mono text-stone-400">
                      {BACKGROUND_THEMES.length} Environments
                    </span>
                  </div>
                  <p className="text-xs text-stone-400">
                    Transform your entire study and conversation space into an eye-safe, immersive theme.
                  </p>
                </div>

                {/* Category Filters */}
                <div className="flex items-center gap-1.5 overflow-x-auto pb-1 scrollbar-none">
                  {THEME_CATEGORIES.map((cat) => {
                    const isCatActive = appearanceCategory === cat.id;
                    return (
                      <button
                        key={cat.id}
                        type="button"
                        onClick={() => setAppearanceCategory(cat.id)}
                        className={`px-3 py-1.5 rounded-lg text-xs font-medium whitespace-nowrap transition-colors cursor-pointer ${
                          isCatActive
                            ? 'bg-white/15 text-white font-semibold border border-white/20'
                            : 'text-stone-400 hover:text-stone-200 hover:bg-white/[0.04]'
                        }`}
                      >
                        {cat.label}
                      </button>
                    );
                  })}
                </div>

                {/* Theme Grid */}
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-1">
                  {(appearanceCategory === 'all'
                    ? BACKGROUND_THEMES
                    : BACKGROUND_THEMES.filter((t) => t.category === appearanceCategory)
                  ).map((theme: BackgroundTheme) => {
                    const isSelected = currentThemeId === theme.id;
                    return (
                      <button
                        key={theme.id}
                        type="button"
                        onClick={() => {
                          if (onSelectTheme) onSelectTheme(theme.id);
                        }}
                        className={`p-3 rounded-xl text-left border transition-all cursor-pointer flex flex-col justify-between group relative overflow-hidden ${
                          isSelected
                            ? 'border-white/40 bg-white/[0.06] ring-1 ring-white/20 shadow-md'
                            : 'border-white/[0.07] bg-white/[0.02] hover:bg-white/[0.04] hover:border-white/[0.15]'
                        }`}
                      >
                        {/* Micro UI Preview Wireframe */}
                        <div
                          className="w-full h-20 rounded-lg mb-2.5 border overflow-hidden relative p-1.5 flex flex-col justify-between"
                          style={{
                            backgroundColor: theme.canvasBg,
                            borderColor: theme.borderTone,
                          }}
                        >
                          <div
                            className="w-full h-3 rounded px-1.5 flex items-center justify-between border-b"
                            style={{
                              backgroundColor: theme.surfaceBg,
                              borderColor: theme.borderTone,
                            }}
                          >
                            <div className="flex items-center gap-1">
                              <span
                                className="w-1.5 h-1.5 rounded-full"
                                style={{ backgroundColor: theme.accentColor }}
                              />
                              <span
                                className="w-6 h-0.5 rounded-full"
                                style={{
                                  backgroundColor: theme.isLight ? '#cbd5e1' : '#334155',
                                }}
                              />
                            </div>
                            <span
                              className="text-[8px] font-mono"
                              style={{
                                color: theme.isLight ? '#64748b' : '#94a3b8',
                              }}
                            >
                              {theme.isLight ? 'Light' : 'Dark'}
                            </span>
                          </div>

                          <div className="flex-1 py-1 px-1 flex flex-col justify-center gap-1">
                            <div
                              className="w-2/3 p-1 rounded border flex flex-col gap-0.5"
                              style={{
                                backgroundColor: theme.surfaceBg,
                                borderColor: theme.borderTone,
                              }}
                            >
                              <span
                                className="w-12 h-0.5 rounded-full"
                                style={{
                                  backgroundColor: theme.isLight ? '#475569' : '#e2e8f0',
                                }}
                              />
                            </div>
                            <div className="self-end">
                              <div
                                className="px-1.5 py-0.5 rounded border"
                                style={{
                                  backgroundColor: theme.isLight ? '#e2e8f0' : '#27272a',
                                  borderColor: theme.borderTone,
                                }}
                              >
                                <span
                                  className="w-6 h-0.5 block rounded-full"
                                  style={{ backgroundColor: theme.accentColor }}
                                />
                              </div>
                            </div>
                          </div>

                          <div
                            className="w-full h-0.5 rounded-full"
                            style={{ backgroundColor: theme.accentColor }}
                          />
                        </div>

                        {/* Title & Swatches */}
                        <div className="space-y-1">
                          <div className="flex items-center justify-between gap-1.5">
                            <div className="flex items-center gap-1.5">
                              <span className="font-semibold text-xs text-white">
                                {theme.name}
                              </span>
                              <div className="flex items-center gap-1">
                                <span
                                  className="w-1.5 h-1.5 rounded-full"
                                  style={{ backgroundColor: theme.canvasBg }}
                                />
                                <span
                                  className="w-1.5 h-1.5 rounded-full"
                                  style={{ backgroundColor: theme.surfaceBg }}
                                />
                                <span
                                  className="w-1.5 h-1.5 rounded-full"
                                  style={{ backgroundColor: theme.accentColor }}
                                />
                              </div>
                            </div>

                            {isSelected && (
                              <div
                                className="w-4 h-4 rounded-full text-black flex items-center justify-center shadow-xs"
                                style={{ backgroundColor: theme.accentColor }}
                              >
                                <Check className="w-2.5 h-2.5 stroke-[3]" />
                              </div>
                            )}
                          </div>
                          <p className="text-[11px] text-stone-400 leading-snug line-clamp-1">
                            {theme.subtitle}
                          </p>
                        </div>
                      </button>
                    );
                  })}
                </div>
              </div>
            )}

            {/* Voice & Audio Tab */}
            {activeNav === 'preferences' && (
              <div className="space-y-5 max-w-xl animate-in fade-in-50 duration-150">
                <div className="p-4 rounded-xl bg-white/[0.02] border border-white/10 flex items-center justify-between">
                  <div className="space-y-0.5">
                    <span className="text-xs font-semibold text-white">Audio Read-Aloud</span>
                    <p className="text-[11px] text-stone-400">
                      Listen to step-by-step explanations with high-clarity voice narration
                    </p>
                  </div>
                  <input
                    type="checkbox"
                    checked={enableVoiceTutor}
                    onChange={(e) => setEnableVoiceTutor(e.target.checked)}
                    className="w-4 h-4 accent-emerald-500 rounded cursor-pointer"
                  />
                </div>

                <div className="p-4 rounded-xl bg-white/[0.02] border border-white/10 flex items-center justify-between">
                  <div className="space-y-0.5">
                    <span className="text-xs font-semibold text-white">Speech Speed</span>
                    <p className="text-[11px] text-stone-400">Rate of audio pronunciation</p>
                  </div>
                  <div className="flex items-center gap-1 bg-white/5 p-1 rounded-lg border border-white/10">
                    {(['slow', 'normal', 'fast'] as const).map((spd) => (
                      <button
                        key={spd}
                        type="button"
                        onClick={() => setVoiceSpeed(spd)}
                        className={`px-2.5 py-1 rounded text-xs capitalize transition-all cursor-pointer ${
                          voiceSpeed === spd
                            ? 'bg-emerald-500 text-black font-bold'
                            : 'text-stone-400 hover:text-white'
                        }`}
                      >
                        {spd}
                      </button>
                    ))}
                  </div>
                </div>

                <div className="p-4 rounded-xl bg-white/[0.02] border border-white/10 flex items-center justify-between">
                  <div className="space-y-0.5">
                    <span className="text-xs font-semibold text-white flex items-center gap-1.5">
                      <Mic className="w-3.5 h-3.5 text-cyan-400" />
                      <span>Voice Recording & Dictation</span>
                    </span>
                    <p className="text-[11px] text-stone-400">
                      Tap the microphone in the chat input to speak questions naturally
                    </p>
                  </div>
                  <span className="text-[11px] font-mono text-emerald-400">Active</span>
                </div>
              </div>
            )}

            {/* Feedback Tab */}
            {activeNav === 'feedback' && (
              <div className="space-y-4 max-w-xl animate-in fade-in-50 duration-150">
                <div className="p-4 rounded-xl bg-white/[0.02] border border-white/10 space-y-1.5">
                  <div className="flex items-center gap-2 text-white font-bold text-sm">
                    <MessageSquare className="w-4 h-4 text-emerald-400" />
                    <span>Share Your Feedback</span>
                  </div>
                  <p className="text-xs text-stone-400 leading-relaxed">
                    Help us improve EduMind AI. Your comments, feature requests, or bug reports go straight to our administrative dashboard and engineering team.
                  </p>
                </div>

                {feedbackSuccess && (
                  <div className="p-3.5 rounded-xl bg-emerald-500/10 border border-emerald-500/30 text-emerald-300 text-xs flex items-center gap-2.5 animate-in fade-in">
                    <Check className="w-4 h-4 text-emerald-400 shrink-0" />
                    <span>Thank you! Your feedback has been received and sent to the team.</span>
                  </div>
                )}

                {feedbackError && (
                  <div className="p-3 rounded-xl bg-rose-500/10 border border-rose-500/30 text-rose-300 text-xs">
                    {feedbackError}
                  </div>
                )}

                <form onSubmit={handleSubmitFeedback} className="space-y-4">
                  <div className="space-y-1.5">
                    <label className="text-xs font-semibold text-stone-300 block">
                      How satisfied are you with the platform?
                    </label>
                    <div className="flex items-center gap-1.5">
                      {[1, 2, 3, 4, 5].map((star) => (
                        <button
                          key={star}
                          type="button"
                          onClick={() => setFeedbackRating(star)}
                          className="p-1 text-stone-600 hover:text-amber-400 transition-colors cursor-pointer"
                        >
                          <span
                            className={`text-lg transition-all ${
                              star <= feedbackRating ? 'text-amber-400' : 'text-stone-600'
                            }`}
                          >
                            ★
                          </span>
                        </button>
                      ))}
                      <span className="ml-2 text-xs font-medium text-stone-400">
                        {feedbackRating === 5
                          ? 'Excellent (5/5)'
                          : feedbackRating === 4
                          ? 'Very Good (4/5)'
                          : feedbackRating === 3
                          ? 'Average (3/5)'
                          : feedbackRating === 2
                          ? 'Needs Improvement (2/5)'
                          : 'Poor (1/5)'}
                      </span>
                    </div>
                  </div>

                  <div className="space-y-1.5">
                    <label className="text-xs font-semibold text-stone-300 block">Feedback Category</label>
                    <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                      {[
                        'General Feedback',
                        'Feature Request',
                        'Bug Report',
                        'Exam / Curriculum',
                        'Speed & Accuracy',
                        'User Interface',
                      ].map((cat) => (
                        <button
                          key={cat}
                          type="button"
                          onClick={() => setFeedbackCategory(cat)}
                          className={`px-3 py-2 rounded-xl text-xs font-medium border text-left transition-all cursor-pointer ${
                            feedbackCategory === cat
                              ? 'bg-emerald-500/15 border-emerald-500/40 text-emerald-300 font-semibold'
                              : 'bg-white/[0.02] border-white/10 text-stone-400 hover:text-white hover:bg-white/5'
                          }`}
                        >
                          {cat}
                        </button>
                      ))}
                    </div>
                  </div>

                  <div className="space-y-1.5">
                    <label className="text-xs font-semibold text-stone-300 block">Your Comments or Suggestions</label>
                    <textarea
                      rows={4}
                      value={feedbackMessage}
                      onChange={(e) => setFeedbackMessage(e.target.value)}
                      placeholder="Tell us what you love or what we should add/fix..."
                      className="w-full bg-[#1c1c1c] border border-white/10 rounded-xl p-3 text-xs sm:text-sm text-white placeholder:text-stone-500 focus:outline-none focus:border-emerald-500 transition-colors resize-none"
                    />
                  </div>

                  <div className="flex items-center justify-between pt-1">
                    <p className="text-[11px] text-stone-500">
                      Submitting as <span className="text-stone-300 font-medium">{fullName || currentUser.fullName || currentUser.email}</span>
                    </p>
                    <button
                      type="submit"
                      disabled={feedbackSubmitting || !feedbackMessage.trim()}
                      className="px-4 py-2.5 rounded-xl bg-emerald-500 hover:bg-emerald-400 text-black font-bold text-xs transition-all cursor-pointer flex items-center gap-1.5 shadow-md disabled:opacity-50 disabled:cursor-not-allowed"
                    >
                      {feedbackSubmitting ? (
                        <span>Sending...</span>
                      ) : (
                        <>
                          <Send className="w-3.5 h-3.5" />
                          <span>Submit Feedback</span>
                        </>
                      )}
                    </button>
                  </div>
                </form>
              </div>
            )}

            {/* Account & Sign Out Tab */}
            {activeNav === 'account' && (
              <div className="space-y-5 max-w-xl animate-in fade-in-50 duration-150">
                <div className="p-4 rounded-xl bg-white/[0.02] border border-white/10 space-y-3">
                  <span className="text-xs font-semibold text-white">Account Information</span>
                  <div className="space-y-2 text-xs">
                    <div>
                      <label className="text-[11px] text-stone-400 block mb-1">
                        {isGeneralActive ? 'Registered User' : 'Registered Student'}
                      </label>
                      <div className="px-3.5 py-2.5 rounded-xl bg-white/5 border border-white/10 text-white font-medium">
                        {fullName || currentUser.fullName || (isGeneralActive ? 'User' : 'Student')}
                      </div>
                    </div>
                    <div>
                      <label className="text-[11px] text-stone-400 block mb-1">Email Address</label>
                      <div className="px-3.5 py-2.5 rounded-xl bg-white/5 border border-white/10 text-stone-400 font-mono text-xs">
                        {currentUser.email}
                      </div>
                    </div>
                    <div>
                      <label className="text-[11px] text-stone-400 block mb-1">Current Active Mode</label>
                      <div className="px-3.5 py-2.5 rounded-xl bg-white/5 border border-white/10 text-white font-medium flex items-center justify-between">
                        <span>{isGeneralActive ? 'General Assistant Mode' : `Student Mode (${selectedLevel})`}</span>
                        <button
                          type="button"
                          onClick={() => setActiveNav('mode')}
                          className="text-xs text-cyan-400 hover:underline cursor-pointer"
                        >
                          Change Mode
                        </button>
                      </div>
                    </div>
                  </div>
                </div>

                {/* Sign Out Card */}
                {onLogout && (
                  <div className="p-4 rounded-xl bg-rose-500/5 border border-rose-500/20 flex items-center justify-between">
                    <div className="space-y-0.5">
                      <span className="text-xs font-semibold text-rose-300">Sign Out of Session</span>
                      <p className="text-[11px] text-stone-400">Log out safely on this device</p>
                    </div>
                    <button
                      type="button"
                      onClick={() => {
                        onClose();
                        onLogout();
                      }}
                      className="px-3.5 py-2 rounded-xl bg-rose-500 hover:bg-rose-600 text-white font-bold text-xs transition-colors cursor-pointer flex items-center gap-1.5"
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

        {/* Clean Footer */}
        <div className="px-5 py-3.5 border-t border-white/10 bg-[#111] flex items-center justify-between shrink-0">
          <span className="text-[11px] text-stone-500 hidden sm:inline">
            Active: <strong className="text-stone-300">{isGeneralActive ? 'General AI' : `Student (${selectedLevel})`}</strong>
          </span>
          <div className="flex items-center gap-2.5 ml-auto">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 rounded-xl text-xs font-semibold text-stone-400 hover:text-white hover:bg-white/5 transition-colors cursor-pointer"
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={handleSave}
              className="px-4 py-2 rounded-xl bg-emerald-400 hover:bg-emerald-300 text-black font-bold text-xs transition-all cursor-pointer flex items-center gap-1.5 shadow-md active:scale-95"
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
