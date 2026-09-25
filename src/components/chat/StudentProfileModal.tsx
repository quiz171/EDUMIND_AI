import React, { useState } from 'react';
import { 
  X, 
  User as UserIcon, 
  Mail, 
  GraduationCap, 
  BookOpen, 
  Calendar, 
  ShieldCheck, 
  Flame, 
  MessageSquare, 
  FileText, 
  LogOut, 
  Check, 
  Edit3, 
  Save,
} from 'lucide-react';
import { User, ChatSession, RagDocument } from '../../types';

interface StudentProfileModalProps {
  isOpen: boolean;
  onClose: () => void;
  user: User;
  onUpdateUser: (updatedUser: User) => void;
  onLogout: () => void;
  sessionsCount?: number;
  activeDoc?: RagDocument | null;
  onOpenSettings?: () => void;
}

export const StudentProfileModal: React.FC<StudentProfileModalProps> = ({
  isOpen,
  onClose,
  user,
  onUpdateUser,
  onLogout,
  sessionsCount = 0,
  activeDoc,
  onOpenSettings,
}) => {
  const [isEditing, setIsEditing] = useState(false);
  const [fullName, setFullName] = useState(user.fullName || '');
  const [course, setCourse] = useState(user.course || '');
  const [classYear, setClassYear] = useState(user.classYear || '');
  const [isSaved, setIsSaved] = useState(false);

  if (!isOpen) return null;

  const handleSave = (e: React.FormEvent) => {
    e.preventDefault();
    const updated: User = {
      ...user,
      fullName: fullName.trim() || user.fullName,
      course: course.trim() || user.course,
      classYear: classYear.trim() || user.classYear,
    };
    onUpdateUser(updated);
    setIsSaved(true);
    setIsEditing(false);
    setTimeout(() => setIsSaved(false), 2000);
  };

  const getInitials = (name: string) => {
    if (!name) return 'S';
    const parts = name.trim().split(' ');
    if (parts.length >= 2) {
      return (parts[0][0] + parts[1][0]).toUpperCase();
    }
    return parts[0][0].toUpperCase();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-black/80 backdrop-blur-sm animate-in fade-in duration-200">
      <div 
        className="glass-panel border border-white/15 rounded-3xl w-full max-w-lg overflow-hidden shadow-2xl flex flex-col max-h-[92vh] text-stone-200"
        role="dialog"
        aria-label="Student Profile"
      >
        {/* Modal Header */}
        <div className="p-4 sm:p-5 border-b border-white/10 flex items-center justify-between bg-white/[0.02]">
          <div className="flex items-center gap-2.5">
            <div className="w-9 h-9 rounded-2xl bg-emerald-500/15 border border-emerald-500/30 flex items-center justify-center text-emerald-400">
              <GraduationCap className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-base font-bold text-white tracking-tight">Student Profile</h2>
              <p className="text-xs text-stone-400">Manage your second brain identity & academic settings</p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-2 rounded-xl text-stone-400 hover:text-white hover:bg-white/10 transition-colors cursor-pointer"
            title="Close modal"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Modal Body */}
        <div className="p-4 sm:p-6 overflow-y-auto space-y-5">
          {/* Avatar & Core Identity Banner */}
          <div className="flex flex-col sm:flex-row items-center sm:items-start gap-4 p-4 rounded-2xl bg-white/[0.03] border border-white/10">
            <div className="w-16 h-16 rounded-2xl bg-gradient-to-tr from-emerald-600 to-teal-400 flex items-center justify-center text-white text-xl font-bold shadow-lg shrink-0">
              {getInitials(user.fullName)}
            </div>

            <div className="text-center sm:text-left min-w-0 flex-1 space-y-1">
              <div className="flex items-center justify-center sm:justify-start gap-2">
                <h3 className="text-lg font-bold text-white truncate">{user.fullName || 'Student'}</h3>
                <span className="px-2 py-0.5 rounded-full text-[10px] font-semibold bg-emerald-500/20 text-emerald-400 border border-emerald-500/30">
                  {user.educationLevel || 'Active Student'}
                </span>
              </div>
              <p className="text-xs text-stone-400 flex items-center justify-center sm:justify-start gap-1.5 truncate">
                <Mail className="w-3.5 h-3.5 shrink-0 text-stone-500" />
                <span className="truncate">{user.email}</span>
              </p>
              <p className="text-xs text-stone-300">
                <strong className="text-white">{user.classYear}</strong> • {user.course}
              </p>
            </div>

            <button
              onClick={() => setIsEditing(!isEditing)}
              className="px-3 py-1.5 rounded-xl bg-white/10 hover:bg-white/20 border border-white/15 text-xs font-semibold text-stone-200 transition-colors flex items-center gap-1.5 cursor-pointer shrink-0"
            >
              <Edit3 className="w-3.5 h-3.5" />
              <span>{isEditing ? 'Cancel' : 'Edit'}</span>
            </button>
          </div>

          {/* Quick Edit Form */}
          {isEditing && (
            <form onSubmit={handleSave} className="p-4 rounded-2xl bg-stone-900 border border-emerald-500/30 space-y-3 animate-in fade-in duration-200">
              <h4 className="text-xs font-bold uppercase tracking-wider text-emerald-400">Edit Student Details</h4>
              
              <div>
                <label className="block text-[11px] font-semibold text-stone-400 mb-1">Full Name</label>
                <input
                  type="text"
                  value={fullName}
                  onChange={(e) => setFullName(e.target.value)}
                  className="w-full px-3 py-2 rounded-xl bg-black/50 border border-white/15 text-xs text-white placeholder:text-stone-600 focus:outline-hidden focus:border-emerald-400"
                  required
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-[11px] font-semibold text-stone-400 mb-1">Class / Year</label>
                  <input
                    type="text"
                    value={classYear}
                    onChange={(e) => setClassYear(e.target.value)}
                    placeholder="e.g. 600L, 500L, 400L, SS3"
                    className="w-full px-3 py-2 rounded-xl bg-black/50 border border-white/15 text-xs text-white placeholder:text-stone-600 focus:outline-hidden focus:border-emerald-400"
                    required
                  />
                </div>
                <div>
                  <label className="block text-[11px] font-semibold text-stone-400 mb-1">Course / Dept</label>
                  <input
                    type="text"
                    value={course}
                    onChange={(e) => setCourse(e.target.value)}
                    placeholder="e.g. MBBS, Vet Medicine, Comp Science"
                    className="w-full px-3 py-2 rounded-xl bg-black/50 border border-white/15 text-xs text-white placeholder:text-stone-600 focus:outline-hidden focus:border-emerald-400"
                    required
                  />
                </div>
              </div>

              <div className="flex justify-end gap-2 pt-1">
                <button
                  type="button"
                  onClick={() => setIsEditing(false)}
                  className="px-3 py-1.5 rounded-xl text-stone-400 hover:text-white text-xs cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-4 py-1.5 rounded-xl bg-emerald-400 hover:bg-emerald-300 text-black font-bold text-xs shadow-md transition-all flex items-center gap-1 cursor-pointer"
                >
                  <Save className="w-3.5 h-3.5" />
                  <span>Save Profile</span>
                </button>
              </div>
            </form>
          )}

          {isSaved && (
            <div className="p-2.5 rounded-xl bg-emerald-950/40 border border-emerald-500/40 text-emerald-300 text-xs flex items-center gap-2">
              <Check className="w-4 h-4" />
              <span>Profile details updated successfully!</span>
            </div>
          )}

          {/* Academic Stats Grid */}
          <div className="grid grid-cols-3 gap-2.5">
            <div className="p-3 rounded-2xl bg-white/[0.02] border border-white/10 text-center space-y-1">
              <div className="flex items-center justify-center text-amber-400">
                <Flame className="w-4 h-4" />
              </div>
              <div className="text-lg font-bold text-white">5 Days</div>
              <div className="text-[10px] text-stone-400 uppercase font-medium">Study Streak</div>
            </div>

            <div className="p-3 rounded-2xl bg-white/[0.02] border border-white/10 text-center space-y-1">
              <div className="flex items-center justify-center text-emerald-400">
                <MessageSquare className="w-4 h-4" />
              </div>
              <div className="text-lg font-bold text-white">{sessionsCount}</div>
              <div className="text-[10px] text-stone-400 uppercase font-medium">Study Sessions</div>
            </div>

            <div className="p-3 rounded-2xl bg-white/[0.02] border border-white/10 text-center space-y-1">
              <div className="flex items-center justify-center text-sky-400">
                <FileText className="w-4 h-4" />
              </div>
              <div className="text-lg font-bold text-white">{activeDoc ? '1 Active' : '0 Notes'}</div>
              <div className="text-[10px] text-stone-400 uppercase font-medium">Active Docs</div>
            </div>
          </div>

          {/* Safety & Child Protection Compliance Badge */}
          <div className="p-3.5 rounded-2xl bg-emerald-950/25 border border-emerald-500/30 flex items-start gap-3">
            <div className="p-2 rounded-xl bg-emerald-500/15 text-emerald-400 shrink-0 mt-0.5">
              <ShieldCheck className="w-4 h-4" />
            </div>
            <div className="space-y-1 text-xs">
              <h4 className="font-semibold text-white flex items-center gap-1.5">
                <span>Child Protection & Safety Shield Active</span>
                <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
              </h4>
              <p className="text-stone-300 text-[11px] leading-relaxed">
                EduMind AI enforces strict academic standards. All video uploads, adult imagery, explicit media, and non-academic queries are automatically blocked to protect students of all ages.
              </p>
            </div>
          </div>
        </div>

        {/* Modal Footer */}
        <div className="p-4 sm:p-5 border-t border-white/10 bg-white/[0.02] flex items-center justify-between gap-3 flex-wrap">
          <div className="flex items-center gap-3">
            {onOpenSettings && (
              <button
                onClick={() => {
                  onClose();
                  onOpenSettings();
                }}
                className="text-xs text-stone-300 hover:text-white underline underline-offset-4 cursor-pointer font-medium"
              >
                Settings & Education Stage
              </button>
            )}
          </div>

          <div className="flex items-center gap-2 ml-auto">
            <button
              onClick={onLogout}
              className="px-3 py-2 rounded-xl bg-rose-500/10 hover:bg-rose-500/20 border border-rose-500/30 text-rose-300 text-xs font-semibold transition-colors flex items-center gap-1.5 cursor-pointer"
            >
              <LogOut className="w-3.5 h-3.5" />
              <span>Sign Out</span>
            </button>
            <button
              onClick={onClose}
              className="px-4 py-2 rounded-xl bg-white text-black hover:bg-stone-200 text-xs font-bold transition-all shadow-md cursor-pointer"
            >
              Done
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
