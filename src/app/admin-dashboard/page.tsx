import React, { useState, useEffect } from 'react';
import {
  Shield,
  Users,
  Search,
  KeyRound,
  RefreshCw,
  ArrowLeft,
  Check,
  Copy,
  Lock,
  GraduationCap,
  Calendar,
  AlertCircle,
  Trash2,
  Edit3,
  Server,
  Download,
  Eye,
  EyeOff,
  CheckCircle2,
  UserCheck,
  UserPlus,
  ShieldCheck,
  ShieldAlert,
  MessageSquare,
  Star,
} from 'lucide-react';
import { VortexLogo } from '../../components/common/VortexLogo';

interface AdminUser {
  id: string;
  fullName: string;
  email: string;
  educationLevel: string;
  classYear: string;
  course: string;
  createdAt: string;
  role: 'admin' | 'student';
  password?: string;
}

interface FeedbackItem {
  id: string;
  userId?: string;
  email?: string;
  fullName?: string;
  rating: number;
  category: string;
  message: string;
  createdAt: string;
}

interface AdminDashboardPageProps {
  onNavigate: (route: string) => void;
}

export const AdminDashboardPage: React.FC<AdminDashboardPageProps> = ({ onNavigate }) => {
  const [activeTab, setActiveTab] = useState<'users' | 'feedback'>('users');
  const [users, setUsers] = useState<AdminUser[]>([]);
  const [filteredUsers, setFilteredUsers] = useState<AdminUser[]>([]);
  const [feedbackList, setFeedbackList] = useState<FeedbackItem[]>([]);
  const [filteredFeedback, setFilteredFeedback] = useState<FeedbackItem[]>([]);
  
  // Search & Filters
  const [searchQuery, setSearchQuery] = useState('');
  const [educationFilter, setEducationFilter] = useState('ALL');
  const [roleFilter, setRoleFilter] = useState('ALL');
  const [feedbackCategoryFilter, setFeedbackCategoryFilter] = useState('ALL');

  // Loading & Alerts
  const [isLoading, setIsLoading] = useState(true);
  const [isLoadingFeedback, setIsLoadingFeedback] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);
  const [copiedId, setCopiedId] = useState<string | null>(null);

  // Password visibility map (userId -> boolean)
  const [visiblePasswords, setVisiblePasswords] = useState<Record<string, boolean>>({});
  const [allPasswordsVisible, setAllPasswordsVisible] = useState(false);

  // Role toggle loading state
  const [roleUpdatingId, setRoleUpdatingId] = useState<string | null>(null);

  // Add admin modal
  const [showAddAdminModal, setShowAddAdminModal] = useState(false);
  const [selectedUserToPromote, setSelectedUserToPromote] = useState('');

  // Password reset modal state
  const [selectedUserForReset, setSelectedUserForReset] = useState<AdminUser | null>(null);
  const [newPasswordInput, setNewPasswordInput] = useState('');
  const [isResetting, setIsResetting] = useState(false);
  const [showResetPasswordText, setShowResetPasswordText] = useState(false);

  // Delete modal state
  const [userToDelete, setUserToDelete] = useState<AdminUser | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);

  // Strict Admin Authorization Check
  const [isAuthorizedAdmin, setIsAuthorizedAdmin] = useState<boolean>(false);

  const fetchUsers = async () => {
    setIsLoading(true);
    setError(null);
    try {
      const token = localStorage.getItem('edumind_token') || '';
      const res = await fetch('/api/admin/users', {
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
      });

      if (!res.ok) {
        if (res.status === 403) {
          throw new Error('Access denied. Administrator privileges required.');
        }
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error || 'Failed to fetch registered users');
      }

      const data = await res.json();
      setUsers(data.users || []);
      setFilteredUsers(data.users || []);
    } catch (err: any) {
      setError(err.message || 'Error connecting to admin service');
    } finally {
      setIsLoading(false);
    }
  };

  const fetchFeedback = async () => {
    setIsLoadingFeedback(true);
    try {
      const token = localStorage.getItem('edumind_token') || '';
      const res = await fetch('/api/admin/feedback', {
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
      });

      if (res.ok) {
        const data = await res.json();
        setFeedbackList(data.feedback || []);
        setFilteredFeedback(data.feedback || []);
      }
    } catch {
      // Non-blocking
    } finally {
      setIsLoadingFeedback(false);
    }
  };

  useEffect(() => {
    try {
      const raw = localStorage.getItem('edumind_user') || localStorage.getItem('vortex_user');
      if (!raw) {
        onNavigate('/chat-app');
        return;
      }
      const user = JSON.parse(raw);
      const email = (user?.email || '').toLowerCase().trim();
      const isAdmin =
        user?.role === 'admin' ||
        email === 'codevortex@gmail.com' ||
        email === 'nelsonwazini@gmail.com' ||
        email.includes('admin');

      if (!isAdmin) {
        onNavigate('/chat-app');
        return;
      }

      setIsAuthorizedAdmin(true);
      fetchUsers();
      fetchFeedback();
    } catch {
      onNavigate('/chat-app');
    }
  }, []);

  // Filter users based on search, education level & role
  useEffect(() => {
    let result = users;

    if (educationFilter !== 'ALL') {
      result = result.filter((u) => u.educationLevel.toUpperCase() === educationFilter.toUpperCase());
    }

    if (roleFilter !== 'ALL') {
      result = result.filter((u) => u.role.toUpperCase() === roleFilter.toUpperCase());
    }

    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase().trim();
      result = result.filter(
        (u) =>
          u.fullName.toLowerCase().includes(q) ||
          u.email.toLowerCase().includes(q) ||
          u.course.toLowerCase().includes(q) ||
          u.classYear.toLowerCase().includes(q)
      );
    }

    setFilteredUsers(result);
  }, [searchQuery, educationFilter, roleFilter, users]);

  // Filter feedback
  useEffect(() => {
    let result = feedbackList;

    if (feedbackCategoryFilter !== 'ALL') {
      result = result.filter((f) => f.category.toLowerCase() === feedbackCategoryFilter.toLowerCase());
    }

    if (searchQuery.trim() && activeTab === 'feedback') {
      const q = searchQuery.toLowerCase().trim();
      result = result.filter(
        (f) =>
          (f.fullName && f.fullName.toLowerCase().includes(q)) ||
          (f.email && f.email.toLowerCase().includes(q)) ||
          (f.message && f.message.toLowerCase().includes(q)) ||
          (f.category && f.category.toLowerCase().includes(q))
      );
    }

    setFilteredFeedback(result);
  }, [feedbackCategoryFilter, searchQuery, activeTab, feedbackList]);

  const handleCopy = (text: string, id: string) => {
    navigator.clipboard.writeText(text);
    setCopiedId(id);
    setTimeout(() => setCopiedId(null), 2000);
  };

  const togglePasswordVisibility = (userId: string) => {
    setVisiblePasswords((prev) => ({
      ...prev,
      [userId]: !prev[userId],
    }));
  };

  const toggleAllPasswords = () => {
    const nextState = !allPasswordsVisible;
    setAllPasswordsVisible(nextState);
    const updated: Record<string, boolean> = {};
    users.forEach((u) => {
      updated[u.id] = nextState;
    });
    setVisiblePasswords(updated);
  };

  // Toggle user role: Only Admin can add others as Admin
  const handleToggleAdminRole = async (targetUser: AdminUser) => {
    const isCurrentlyAdmin = targetUser.role === 'admin';
    const newRole: 'admin' | 'student' = isCurrentlyAdmin ? 'student' : 'admin';

    if (targetUser.email.toLowerCase() === 'codevortex@gmail.com') {
      setError('The primary root admin account cannot have its admin privileges modified.');
      return;
    }

    setRoleUpdatingId(targetUser.id);
    setError(null);
    try {
      const token = localStorage.getItem('edumind_token') || '';
      const res = await fetch('/api/admin/users/set-role', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          userId: targetUser.id,
          role: newRole,
        }),
      });

      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || 'Failed to update user role');
      }

      setSuccessMessage(
        newRole === 'admin'
          ? `Administrator access granted to ${targetUser.fullName}.`
          : `Role updated for ${targetUser.fullName}.`
      );
      fetchUsers();
      setTimeout(() => setSuccessMessage(null), 4000);
    } catch (err: any) {
      setError(err.message || 'Failed to update role');
    } finally {
      setRoleUpdatingId(null);
    }
  };

  const handlePromoteFromModal = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedUserToPromote) return;

    const user = users.find((u) => u.id === selectedUserToPromote);
    if (!user) return;

    setShowAddAdminModal(false);
    await handleToggleAdminRole(user);
    setSelectedUserToPromote('');
  };

  const handleResetPassword = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedUserForReset || !newPasswordInput) return;

    if (newPasswordInput.length < 6) {
      setError('New password must be at least 6 characters.');
      return;
    }

    setIsResetting(true);
    setError(null);
    try {
      const token = localStorage.getItem('edumind_token') || '';
      const res = await fetch('/api/admin/users/reset-password', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          userId: selectedUserForReset.id,
          newPassword: newPasswordInput,
        }),
      });

      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || 'Failed to reset user password');
      }

      setSuccessMessage(`Password updated for ${selectedUserForReset.fullName}.`);
      setSelectedUserForReset(null);
      setNewPasswordInput('');
      fetchUsers();
      setTimeout(() => setSuccessMessage(null), 4000);
    } catch (err: any) {
      setError(err.message || 'Failed to update password');
    } finally {
      setIsResetting(false);
    }
  };

  const handleDeleteUser = async () => {
    if (!userToDelete) return;

    if (userToDelete.email.toLowerCase() === 'codevortex@gmail.com') {
      setError('Cannot delete the root administrator account.');
      setUserToDelete(null);
      return;
    }

    setIsDeleting(true);
    setError(null);
    try {
      const token = localStorage.getItem('edumind_token') || '';
      const res = await fetch(`/api/admin/users/${userToDelete.id}`, {
        method: 'DELETE',
        headers: {
          Authorization: `Bearer ${token}`,
        },
      });

      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || 'Failed to delete user');
      }

      setSuccessMessage(`User ${userToDelete.email} deleted.`);
      setUserToDelete(null);
      fetchUsers();
      setTimeout(() => setSuccessMessage(null), 4000);
    } catch (err: any) {
      setError(err.message || 'Failed to delete user');
    } finally {
      setIsDeleting(false);
    }
  };

  const exportCSV = () => {
    const headers = ['Full Name', 'Email', 'Password', 'Education Level', 'Class / Year', 'Course', 'Role', 'Registration Date'];
    const rows = filteredUsers.map((u) => [
      `"${u.fullName.replace(/"/g, '""')}"`,
      `"${u.email}"`,
      `"${u.password || ''}"`,
      `"${u.educationLevel}"`,
      `"${u.classYear}"`,
      `"${u.course.replace(/"/g, '""')}"`,
      `"${u.role}"`,
      `"${u.createdAt}"`,
    ]);

    const csvContent = 'data:text/csv;charset=utf-8,' + [headers.join(','), ...rows.map((e) => e.join(','))].join('\n');
    const encodedUri = encodeURI(csvContent);
    const link = document.createElement('a');
    link.setAttribute('href', encodedUri);
    link.setAttribute('download', `edumind_users_${new Date().toISOString().split('T')[0]}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  const universityCount = users.filter((u) => u.educationLevel.toLowerCase().includes('university')).length;
  const adminCount = users.filter((u) => u.role === 'admin').length;
  const nonAdminUsers = users.filter((u) => u.role !== 'admin');

  // The ONLY time you see an admin page is when you are an admin
  if (!isAuthorizedAdmin) {
    return null;
  }

  return (
    <div className="min-h-screen bg-[#090a0f] text-stone-100 flex flex-col selection:bg-emerald-500/30">
      {/* Top Navigation Bar */}
      <header className="border-b border-white/10 bg-[#0f111a]/80 backdrop-blur-md sticky top-0 z-30 px-4 sm:px-8 py-3.5 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <button
            onClick={() => onNavigate('/chat-app')}
            className="p-2 rounded-xl bg-white/5 hover:bg-white/10 border border-white/10 text-stone-300 hover:text-white transition-all cursor-pointer flex items-center gap-2 text-xs font-semibold"
            title="Return to Student Chat"
          >
            <ArrowLeft className="w-4 h-4 text-emerald-400" />
            <span className="hidden sm:inline">Back to Study Chat</span>
          </button>
          <div className="h-5 w-px bg-white/10 hidden sm:block" />
          <div className="flex items-center gap-2.5">
            <VortexLogo size="sm" showText={false} />
            <div>
              <div className="flex items-center gap-2">
                <span className="font-bold text-sm text-white tracking-wide">EduMind AI</span>
                <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-amber-500/20 text-amber-400 border border-amber-500/30 flex items-center gap-1">
                  <Shield className="w-3 h-3" /> Admin Console
                </span>
              </div>
            </div>
          </div>
        </div>

        {/* Tab Switcher & Action Buttons */}
        <div className="flex items-center gap-2">
          {/* View Tab Buttons */}
          <div className="flex items-center p-1 bg-white/5 rounded-xl border border-white/10">
            <button
              onClick={() => setActiveTab('users')}
              className={`px-3 py-1 rounded-lg text-xs font-bold transition-all cursor-pointer flex items-center gap-1.5 ${
                activeTab === 'users'
                  ? 'bg-emerald-500 text-black shadow-xs'
                  : 'text-stone-400 hover:text-white'
              }`}
            >
              <Users className="w-3.5 h-3.5" />
              <span>Users ({users.length})</span>
            </button>
            <button
              onClick={() => setActiveTab('feedback')}
              className={`px-3 py-1 rounded-lg text-xs font-bold transition-all cursor-pointer flex items-center gap-1.5 ${
                activeTab === 'feedback'
                  ? 'bg-emerald-500 text-black shadow-xs'
                  : 'text-stone-400 hover:text-white'
              }`}
            >
              <MessageSquare className="w-3.5 h-3.5" />
              <span>Feedback ({feedbackList.length})</span>
            </button>
          </div>

          {activeTab === 'users' && (
            <>
              <button
                onClick={() => setShowAddAdminModal(true)}
                className="px-3 py-1.5 rounded-xl bg-amber-500/15 hover:bg-amber-500/25 border border-amber-500/30 text-amber-300 hover:text-amber-100 text-xs font-bold transition-all cursor-pointer flex items-center gap-1.5 shadow-xs"
                title="Grant Admin Privileges to a user"
              >
                <UserPlus className="w-3.5 h-3.5 text-amber-400" />
                <span className="hidden sm:inline">Add Admin</span>
              </button>

              <button
                onClick={exportCSV}
                className="px-3 py-1.5 rounded-xl bg-white/5 hover:bg-white/10 border border-white/10 text-stone-300 hover:text-white text-xs font-semibold transition-all cursor-pointer flex items-center gap-1.5"
                title="Export user directory as CSV"
              >
                <Download className="w-3.5 h-3.5" />
                <span className="hidden sm:inline">Export CSV</span>
              </button>
            </>
          )}

          <button
            onClick={() => {
              fetchUsers();
              fetchFeedback();
            }}
            disabled={isLoading || isLoadingFeedback}
            className="p-2 rounded-xl bg-white/5 hover:bg-white/10 border border-white/10 text-stone-300 hover:text-white transition-all cursor-pointer"
            title="Refresh Directory"
          >
            <RefreshCw className={`w-4 h-4 ${isLoading || isLoadingFeedback ? 'animate-spin text-emerald-400' : ''}`} />
          </button>
        </div>
      </header>

      {/* Main Content Container */}
      <main className="flex-1 max-w-7xl w-full mx-auto px-4 sm:px-8 py-6 space-y-6">
        {/* Alerts & Messages */}
        {error && (
          <div className="p-4 rounded-2xl bg-rose-500/10 border border-rose-500/20 text-rose-300 text-xs flex items-center justify-between animate-in fade-in">
            <div className="flex items-center gap-2">
              <AlertCircle className="w-4 h-4 shrink-0 text-rose-400" />
              <span>{error}</span>
            </div>
            <button onClick={() => setError(null)} className="text-rose-400 hover:text-white font-bold p-1">
              ✕
            </button>
          </div>
        )}

        {successMessage && (
          <div className="p-4 rounded-2xl bg-emerald-500/10 border border-emerald-500/20 text-emerald-300 text-xs flex items-center justify-between animate-in fade-in">
            <div className="flex items-center gap-2">
              <Check className="w-4 h-4 shrink-0 text-emerald-400" />
              <span>{successMessage}</span>
            </div>
            <button onClick={() => setSuccessMessage(null)} className="text-emerald-400 hover:text-white font-bold p-1">
              ✕
            </button>
          </div>
        )}

        {/* Clean Metric Stats Cards */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          <div className="p-4 rounded-2xl bg-[#121422] border border-white/10 shadow-sm flex items-center gap-4">
            <div className="p-3 rounded-xl bg-emerald-500/15 border border-emerald-500/25 text-emerald-400">
              <Users className="w-6 h-6" />
            </div>
            <div>
              <p className="text-xs text-stone-400 font-medium">Registered Accounts</p>
              <p className="text-2xl font-bold text-white">{users.length}</p>
              <p className="text-[11px] text-emerald-400/80 font-medium">Direct database sync</p>
            </div>
          </div>

          <div className="p-4 rounded-2xl bg-[#121422] border border-white/10 shadow-sm flex items-center gap-4">
            <div className="p-3 rounded-xl bg-amber-500/15 border border-amber-500/25 text-amber-400">
              <ShieldCheck className="w-6 h-6" />
            </div>
            <div>
              <p className="text-xs text-stone-400 font-medium">Active Administrators</p>
              <p className="text-2xl font-bold text-amber-300">{adminCount}</p>
              <p className="text-[11px] text-stone-400">Exclusive access controls</p>
            </div>
          </div>

          <div className="p-4 rounded-2xl bg-[#121422] border border-white/10 shadow-sm flex items-center gap-4">
            <div className="p-3 rounded-xl bg-blue-500/15 border border-blue-500/25 text-blue-400">
              <GraduationCap className="w-6 h-6" />
            </div>
            <div>
              <p className="text-xs text-stone-400 font-medium">University / Higher Ed</p>
              <p className="text-2xl font-bold text-blue-300">{universityCount}</p>
              <p className="text-[11px] text-stone-400">Undergrad & Clinical stages</p>
            </div>
          </div>

          <div className="p-4 rounded-2xl bg-[#121422] border border-white/10 shadow-sm flex items-center gap-4">
            <div className="p-3 rounded-xl bg-purple-500/15 border border-purple-500/25 text-purple-400">
              <MessageSquare className="w-6 h-6" />
            </div>
            <div>
              <p className="text-xs text-stone-400 font-medium">User Feedback Received</p>
              <p className="text-2xl font-bold text-purple-300">{feedbackList.length}</p>
              <p className="text-[11px] text-stone-400">In-app settings submissions</p>
            </div>
          </div>
        </div>

        {/* Tab 1: Users Directory */}
        {activeTab === 'users' && (
          <div className="space-y-4">
            {/* Filter & Search Bar */}
            <div className="flex flex-col sm:flex-row gap-3 items-stretch sm:items-center justify-between">
              <div className="relative flex-1 max-w-md">
                <Search className="w-4 h-4 text-stone-400 absolute left-3.5 top-1/2 -translate-y-1/2" />
                <input
                  type="text"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  placeholder="Search by student name, email, department, or level..."
                  className="w-full pl-10 pr-4 py-2.5 rounded-xl bg-white/5 border border-white/10 text-white placeholder-stone-500 text-xs focus:outline-hidden focus:border-emerald-500 transition-colors"
                />
              </div>

              <div className="flex items-center gap-2 flex-wrap">
                <select
                  value={roleFilter}
                  onChange={(e) => setRoleFilter(e.target.value)}
                  className="px-3 py-2.5 rounded-xl bg-[#141624] border border-white/10 text-stone-200 text-xs focus:outline-hidden focus:border-emerald-500 cursor-pointer"
                >
                  <option value="ALL">All Roles</option>
                  <option value="ADMIN">Admins Only</option>
                  <option value="STUDENT">Students Only</option>
                </select>

                <select
                  value={educationFilter}
                  onChange={(e) => setEducationFilter(e.target.value)}
                  className="px-3 py-2.5 rounded-xl bg-[#141624] border border-white/10 text-stone-200 text-xs focus:outline-hidden focus:border-emerald-500 cursor-pointer"
                >
                  <option value="ALL">All Education Levels</option>
                  <option value="UNIVERSITY">University</option>
                  <option value="SSS">Senior Secondary (SSS)</option>
                  <option value="JSS">Junior Secondary (JSS)</option>
                  <option value="PRIMARY">Primary School</option>
                  <option value="POLYTECHNIC">Polytechnic</option>
                </select>

                <button
                  onClick={toggleAllPasswords}
                  className="px-3 py-2.5 rounded-xl bg-white/5 hover:bg-white/10 border border-white/10 text-stone-300 hover:text-white text-xs font-semibold flex items-center gap-1.5 transition-colors cursor-pointer"
                  title="Toggle visibility of all passwords in table"
                >
                  {allPasswordsVisible ? <EyeOff className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5 text-emerald-400" />}
                  <span>{allPasswordsVisible ? 'Hide All Passwords' : 'Reveal All Passwords'}</span>
                </button>
              </div>
            </div>

            {/* Users Table */}
            <div className="rounded-2xl border border-white/10 bg-[#0f111a] overflow-hidden shadow-xl">
              <div className="overflow-x-auto">
                <table className="w-full text-left text-xs text-stone-300">
                  <thead className="bg-[#141724] border-b border-white/10 text-[11px] font-bold uppercase tracking-wider text-stone-400">
                    <tr>
                      <th className="py-3.5 px-4">Student / User</th>
                      <th className="py-3.5 px-4">Email Address</th>
                      <th className="py-3.5 px-4">Password</th>
                      <th className="py-3.5 px-4">Role & Privileges</th>
                      <th className="py-3.5 px-4">Education Level</th>
                      <th className="py-3.5 px-4">Joined Date</th>
                      <th className="py-3.5 px-4 text-right">Actions</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-white/5 font-normal">
                    {isLoading ? (
                      <tr>
                        <td colSpan={7} className="py-12 text-center text-stone-400">
                          <RefreshCw className="w-6 h-6 animate-spin mx-auto text-emerald-400 mb-2" />
                          <p>Loading registered accounts...</p>
                        </td>
                      </tr>
                    ) : filteredUsers.length === 0 ? (
                      <tr>
                        <td colSpan={7} className="py-12 text-center text-stone-400">
                          <p className="text-sm">No registered accounts found matching your filter.</p>
                        </td>
                      </tr>
                    ) : (
                      filteredUsers.map((u) => {
                        const isRoot = u.email.toLowerCase() === 'codevortex@gmail.com';
                        const isAdmin = u.role === 'admin';
                        const isPasswordVisible = Boolean(visiblePasswords[u.id] || allPasswordsVisible);
                        const userPassword = u.password || 'nelson';

                        return (
                          <tr key={u.id} className="hover:bg-white/[0.03] transition-colors">
                            {/* Name & Avatar */}
                            <td className="py-3.5 px-4">
                              <div className="flex items-center gap-3">
                                <div
                                  className={`w-8 h-8 rounded-xl border flex items-center justify-center font-bold shrink-0 ${
                                    isAdmin
                                      ? 'bg-amber-500/20 border-amber-500/30 text-amber-400'
                                      : 'bg-emerald-500/20 border-emerald-500/30 text-emerald-400'
                                  }`}
                                >
                                  {u.fullName ? u.fullName.charAt(0).toUpperCase() : 'S'}
                                </div>
                                <div>
                                  <div className="flex items-center gap-1.5">
                                    <span className="font-semibold text-white">{u.fullName || 'Student'}</span>
                                    {isRoot ? (
                                      <span className="px-1.5 py-0.2 rounded text-[9px] font-bold bg-amber-500/20 text-amber-400 border border-amber-500/40">
                                        ROOT ADMIN
                                      </span>
                                    ) : isAdmin ? (
                                      <span className="px-1.5 py-0.2 rounded text-[9px] font-bold bg-blue-500/20 text-blue-400 border border-blue-500/30">
                                        ADMIN
                                      </span>
                                    ) : null}
                                  </div>
                                  <span className="text-[10px] text-stone-500 font-mono">{u.id}</span>
                                </div>
                              </div>
                            </td>

                            {/* Email */}
                            <td className="py-3.5 px-4 font-mono text-stone-300 select-all">
                              {u.email}
                            </td>

                            {/* Password Display (Clean with show/hide and copy) */}
                            <td className="py-3.5 px-4 font-mono">
                              <div className="flex items-center gap-2">
                                <span className={`px-2 py-1 rounded-md bg-white/[0.04] border border-white/10 select-all text-xs font-medium ${
                                  isPasswordVisible ? 'text-emerald-300 font-mono' : 'text-stone-400'
                                }`}>
                                  {isPasswordVisible ? userPassword : '••••••••'}
                                </span>
                                
                                <button
                                  type="button"
                                  onClick={() => togglePasswordVisibility(u.id)}
                                  className="p-1 rounded text-stone-400 hover:text-white transition-colors cursor-pointer"
                                  title={isPasswordVisible ? 'Hide password' : 'Show password'}
                                >
                                  {isPasswordVisible ? <EyeOff className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}
                                </button>

                                <button
                                  type="button"
                                  onClick={() => handleCopy(userPassword, `pw_${u.id}`)}
                                  className="p-1 rounded text-stone-400 hover:text-emerald-400 transition-colors cursor-pointer"
                                  title="Copy password"
                                >
                                  {copiedId === `pw_${u.id}` ? (
                                    <Check className="w-3.5 h-3.5 text-emerald-400" />
                                  ) : (
                                    <Copy className="w-3.5 h-3.5" />
                                  )}
                                </button>
                              </div>
                            </td>

                            {/* Role & Access (With promotion / toggle ability) */}
                            <td className="py-3.5 px-4">
                              {isRoot ? (
                                <span className="px-2 py-0.5 rounded-lg text-[10px] font-bold bg-amber-500/15 border border-amber-500/30 text-amber-300">
                                  Root Administrator
                                </span>
                              ) : (
                                <button
                                  onClick={() => handleToggleAdminRole(u)}
                                  disabled={roleUpdatingId === u.id}
                                  className={`px-2.5 py-1 rounded-lg text-[10px] font-bold transition-all cursor-pointer border flex items-center gap-1.5 ${
                                    isAdmin
                                      ? 'bg-blue-500/15 hover:bg-rose-500/20 border-blue-500/30 hover:border-rose-500/40 text-blue-300 hover:text-rose-300'
                                      : 'bg-white/5 hover:bg-amber-500/20 border-white/10 hover:border-amber-500/40 text-stone-400 hover:text-amber-300'
                                  }`}
                                  title={isAdmin ? 'Click to revoke admin privileges' : 'Click to make this user an Administrator'}
                                >
                                  {roleUpdatingId === u.id ? (
                                    <RefreshCw className="w-3 h-3 animate-spin" />
                                  ) : isAdmin ? (
                                    <ShieldCheck className="w-3 h-3 text-blue-400" />
                                  ) : (
                                    <UserPlus className="w-3 h-3" />
                                  )}
                                  <span>{isAdmin ? 'Admin (Revoke)' : '+ Make Admin'}</span>
                                </button>
                              )}
                            </td>

                            {/* Education Level */}
                            <td className="py-3.5 px-4">
                              <span className="px-2 py-0.5 rounded-lg text-[11px] font-medium bg-white/5 border border-white/10 text-stone-300">
                                {u.educationLevel} ({u.classYear})
                              </span>
                            </td>

                            {/* Registration Date */}
                            <td className="py-3.5 px-4 text-stone-400 text-[11px]">
                              {new Date(u.createdAt).toLocaleDateString(undefined, {
                                month: 'short',
                                day: 'numeric',
                                year: 'numeric',
                              })}
                            </td>

                            {/* Actions */}
                            <td className="py-3.5 px-4 text-right">
                              <div className="flex items-center justify-end gap-2">
                                <button
                                  onClick={() => setSelectedUserForReset(u)}
                                  className="p-1.5 rounded-lg bg-white/5 hover:bg-white/10 text-stone-300 hover:text-emerald-400 transition-colors cursor-pointer border border-white/5"
                                  title="Reset student password"
                                >
                                  <KeyRound className="w-3.5 h-3.5" />
                                </button>
                                {!isRoot && (
                                  <button
                                    onClick={() => setUserToDelete(u)}
                                    className="p-1.5 rounded-lg bg-rose-500/10 hover:bg-rose-500/20 text-rose-400 hover:text-rose-300 transition-colors cursor-pointer border border-rose-500/20"
                                    title="Delete user account"
                                  >
                                    <Trash2 className="w-3.5 h-3.5" />
                                  </button>
                                )}
                              </div>
                            </td>
                          </tr>
                        );
                      })
                    )}
                  </tbody>
                </table>
              </div>

              <div className="p-3.5 border-t border-white/10 bg-white/[0.02] flex items-center justify-between text-xs text-stone-400">
                <span>
                  Showing {filteredUsers.length} of {users.length} registered accounts
                </span>
                <span className="text-[11px] text-stone-500">
                  EduMind Enterprise Administration Console
                </span>
              </div>
            </div>
          </div>
        )}

        {/* Tab 2: User Feedback */}
        {activeTab === 'feedback' && (
          <div className="space-y-4">
            {/* Feedback Filters & Search */}
            <div className="flex flex-col sm:flex-row gap-3 items-stretch sm:items-center justify-between">
              <div className="relative flex-1 max-w-md">
                <Search className="w-4 h-4 text-stone-400 absolute left-3.5 top-1/2 -translate-y-1/2" />
                <input
                  type="text"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  placeholder="Search feedback by text, student name or email..."
                  className="w-full pl-10 pr-4 py-2.5 rounded-xl bg-white/5 border border-white/10 text-white placeholder-stone-500 text-xs focus:outline-hidden focus:border-emerald-500 transition-colors"
                />
              </div>

              <div className="flex items-center gap-2">
                <select
                  value={feedbackCategoryFilter}
                  onChange={(e) => setFeedbackCategoryFilter(e.target.value)}
                  className="px-3 py-2.5 rounded-xl bg-[#141624] border border-white/10 text-stone-200 text-xs focus:outline-hidden focus:border-emerald-500 cursor-pointer"
                >
                  <option value="ALL">All Categories</option>
                  <option value="General Feedback">General Feedback</option>
                  <option value="Feature Request">Feature Request</option>
                  <option value="Bug Report">Bug Report</option>
                  <option value="Exam / Curriculum">Exam / Curriculum</option>
                  <option value="Speed & Accuracy">Speed & Accuracy</option>
                  <option value="User Interface">User Interface</option>
                </select>

                <button
                  onClick={fetchFeedback}
                  className="px-3 py-2.5 rounded-xl bg-white/5 hover:bg-white/10 border border-white/10 text-stone-300 hover:text-white text-xs font-semibold flex items-center gap-1.5 transition-colors cursor-pointer"
                >
                  <RefreshCw className={`w-3.5 h-3.5 ${isLoadingFeedback ? 'animate-spin' : ''}`} />
                  <span>Refresh</span>
                </button>
              </div>
            </div>

            {/* Feedback Cards List */}
            {isLoadingFeedback ? (
              <div className="p-12 text-center text-stone-400 rounded-2xl border border-white/10 bg-[#0f111a]">
                <RefreshCw className="w-6 h-6 animate-spin mx-auto text-emerald-400 mb-2" />
                <p>Loading feedback submissions...</p>
              </div>
            ) : filteredFeedback.length === 0 ? (
              <div className="p-12 text-center text-stone-400 rounded-2xl border border-white/10 bg-[#0f111a] space-y-2">
                <MessageSquare className="w-8 h-8 text-stone-600 mx-auto" />
                <p className="text-sm font-semibold text-white">No feedback submitted yet</p>
                <p className="text-xs text-stone-500">
                  When students submit comments or suggestions in Settings &gt; Site Feedback, they will appear right here.
                </p>
              </div>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {filteredFeedback.map((fb) => (
                  <div
                    key={fb.id}
                    className="p-5 rounded-2xl bg-[#0f111a] border border-white/10 shadow-sm hover:border-white/20 transition-all flex flex-col justify-between space-y-3.5"
                  >
                    <div className="space-y-2.5">
                      {/* Header with Category and Stars */}
                      <div className="flex items-center justify-between flex-wrap gap-2">
                        <span className="px-2.5 py-1 rounded-full text-[10px] font-bold bg-emerald-500/15 text-emerald-400 border border-emerald-500/30">
                          {fb.category || 'General Feedback'}
                        </span>

                        <div className="flex items-center gap-0.5">
                          {[1, 2, 3, 4, 5].map((st) => (
                            <Star
                              key={st}
                              className={`w-3.5 h-3.5 ${
                                st <= fb.rating
                                  ? 'text-amber-400 fill-amber-400'
                                  : 'text-stone-700'
                              }`}
                            />
                          ))}
                        </div>
                      </div>

                      {/* Message Content */}
                      <p className="text-xs text-stone-200 leading-relaxed whitespace-pre-wrap bg-white/[0.02] p-3 rounded-xl border border-white/5">
                        "{fb.message}"
                      </p>
                    </div>

                    {/* Footer with Student Name, Email & Timestamp */}
                    <div className="pt-2 border-t border-white/5 flex items-center justify-between text-[11px] text-stone-400">
                      <div>
                        <span className="font-semibold text-white">{fb.fullName || 'Student'}</span>{' '}
                        <span className="text-stone-500 font-mono">({fb.email || 'Anonymous'})</span>
                      </div>
                      <span className="text-stone-500">
                        {new Date(fb.createdAt).toLocaleDateString(undefined, {
                          month: 'short',
                          day: 'numeric',
                          hour: '2-digit',
                          minute: '2-digit',
                        })}
                      </span>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
      </main>

      {/* Add / Promote Admin Modal */}
      {showAddAdminModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70 backdrop-blur-xs">
          <div className="w-full max-w-md rounded-2xl bg-[#141624] border border-amber-500/30 p-6 shadow-2xl space-y-4">
            <div className="flex items-center justify-between border-b border-white/10 pb-3">
              <div className="flex items-center gap-2 text-white font-bold text-base">
                <Shield className="w-5 h-5 text-amber-400" />
                <span>Grant Administrator Access</span>
              </div>
              <button
                onClick={() => setShowAddAdminModal(false)}
                className="text-stone-400 hover:text-white p-1 text-sm font-bold"
              >
                ✕
              </button>
            </div>

            <p className="text-xs text-stone-300 leading-relaxed">
              Select a registered student or educator to grant full administrative privileges to the EduMind dashboard.
            </p>

            <form onSubmit={handlePromoteFromModal} className="space-y-4">
              <div>
                <label className="block text-xs font-semibold text-stone-300 mb-1.5">
                  Select User to Promote
                </label>
                <select
                  value={selectedUserToPromote}
                  onChange={(e) => setSelectedUserToPromote(e.target.value)}
                  required
                  className="w-full px-3.5 py-2.5 rounded-xl bg-black/40 border border-white/15 text-white text-xs focus:outline-hidden focus:border-amber-500"
                >
                  <option value="">-- Choose Registered User --</option>
                  {nonAdminUsers.map((u) => (
                    <option key={u.id} value={u.id}>
                      {u.fullName} ({u.email}) - {u.educationLevel}
                    </option>
                  ))}
                </select>
              </div>

              <div className="flex items-center justify-end gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setShowAddAdminModal(false)}
                  className="px-3.5 py-2 rounded-xl bg-white/5 hover:bg-white/10 text-stone-300 text-xs font-semibold cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={!selectedUserToPromote}
                  className="px-4 py-2 rounded-xl bg-amber-500 hover:bg-amber-400 text-black text-xs font-bold transition-colors cursor-pointer flex items-center gap-1.5 disabled:opacity-50"
                >
                  <ShieldCheck className="w-3.5 h-3.5" />
                  <span>Grant Admin Privileges</span>
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Password Reset Modal */}
      {selectedUserForReset && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70 backdrop-blur-xs">
          <div className="w-full max-w-md rounded-2xl bg-[#141624] border border-white/15 p-6 shadow-2xl space-y-4">
            <div className="flex items-center justify-between border-b border-white/10 pb-3">
              <div className="flex items-center gap-2 text-white font-bold text-base">
                <KeyRound className="w-5 h-5 text-emerald-400" />
                <span>Override / Reset User Password</span>
              </div>
              <button
                onClick={() => setSelectedUserForReset(null)}
                className="text-stone-400 hover:text-white p-1 text-sm font-bold"
              >
                ✕
              </button>
            </div>

            <div className="p-3 bg-white/5 rounded-xl border border-white/10 text-xs space-y-1">
              <p className="text-stone-400">Target Student Account:</p>
              <p className="text-white font-semibold">
                {selectedUserForReset.fullName} ({selectedUserForReset.email})
              </p>
            </div>

            <form onSubmit={handleResetPassword} className="space-y-4">
              <div>
                <label className="block text-xs font-semibold text-stone-300 mb-1.5">
                  New Password (Minimum 6 characters)
                </label>
                <div className="relative">
                  <input
                    type={showResetPasswordText ? 'text' : 'password'}
                    value={newPasswordInput}
                    onChange={(e) => setNewPasswordInput(e.target.value)}
                    placeholder="Enter new account password..."
                    required
                    minLength={6}
                    className="w-full pl-3.5 pr-10 py-2.5 rounded-xl bg-black/40 border border-white/15 text-white text-xs focus:outline-hidden focus:border-emerald-500 font-mono"
                  />
                  <button
                    type="button"
                    onClick={() => setShowResetPasswordText(!showResetPasswordText)}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-stone-400 hover:text-white"
                  >
                    {showResetPasswordText ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                  </button>
                </div>
              </div>

              <div className="flex items-center justify-end gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setSelectedUserForReset(null)}
                  className="px-3.5 py-2 rounded-xl bg-white/5 hover:bg-white/10 text-stone-300 text-xs font-semibold cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={isResetting || !newPasswordInput}
                  className="px-4 py-2 rounded-xl bg-emerald-500 hover:bg-emerald-400 text-black text-xs font-bold transition-colors cursor-pointer flex items-center gap-1.5 disabled:opacity-50"
                >
                  {isResetting ? <RefreshCw className="w-3.5 h-3.5 animate-spin" /> : <Check className="w-3.5 h-3.5" />}
                  <span>Save New Password</span>
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Delete User Confirmation Modal */}
      {userToDelete && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70 backdrop-blur-xs">
          <div className="w-full max-w-md rounded-2xl bg-[#141624] border border-rose-500/30 p-6 shadow-2xl space-y-4">
            <div className="flex items-center gap-2 text-rose-400 font-bold text-base border-b border-white/10 pb-3">
              <AlertCircle className="w-5 h-5 shrink-0" />
              <span>Confirm Account Removal</span>
            </div>

            <p className="text-xs text-stone-300 leading-relaxed">
              Are you sure you want to permanently delete the account for{' '}
              <strong className="text-white">{userToDelete.fullName}</strong> ({userToDelete.email})?
              This action cannot be undone.
            </p>

            <div className="flex items-center justify-end gap-2 pt-2">
              <button
                type="button"
                onClick={() => setUserToDelete(null)}
                className="px-3.5 py-2 rounded-xl bg-white/5 hover:bg-white/10 text-stone-300 text-xs font-semibold cursor-pointer"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleDeleteUser}
                disabled={isDeleting}
                className="px-4 py-2 rounded-xl bg-rose-500 hover:bg-rose-600 text-white text-xs font-bold transition-colors cursor-pointer flex items-center gap-1.5 disabled:opacity-50"
              >
                {isDeleting ? <RefreshCw className="w-3.5 h-3.5 animate-spin" /> : <Trash2 className="w-3.5 h-3.5" />}
                <span>Delete Account</span>
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default AdminDashboardPage;
