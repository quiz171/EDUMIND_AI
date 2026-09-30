import React, { useState, useEffect, useRef } from 'react';
import { User, Message, RagDocument, ChatSession } from '../../types';
import { PrimaryMode } from './PrimaryMode';
import { JssSssChat } from './JssSssChat';
import { UniversityChat } from './UniversityChat';
import { GeneralChat } from './GeneralChat';
import { EducationSettingsModal, SettingsTab } from './EducationSettingsModal';
import { LogoutConfirmModal } from './LogoutConfirmModal';
import { getThemeById, getUserStoredTheme, setUserStoredTheme } from '../../lib/theme';
import { AlertTriangle, X } from 'lucide-react';

interface ChatAppShellProps {
  onNavigate: (route: string) => void;
}

// Helper to strip robotic diagnostic banners or unrequested perspective appendices
function stripVerboseDiagnostics(raw: string): string {
  if (!raw) return '';
  let cleaned = raw;
  cleaned = cleaned.replace(/^#*\s*\**ACADEMIC DIAGNOSTIC[^\n]*\**\n*/gim, '');
  cleaned = cleaned.replace(/^\**Status:\**\s*\**[^\n]*\**\n*/gim, '');
  cleaned = cleaned.replace(/\n+#*\s*\**ACADEMIC DIAGNOSTIC[^\n]*\**\n*/gim, '\n\n');
  cleaned = cleaned.replace(/\n+\**Status:\**\s*\**[^\n]*\**\n*/gim, '\n\n');
  cleaned = cleaned.replace(/\**EduMind AI Policy:\**\s*Under my \**Zero Speculation\**[^\n]*\n*/gi, '');
  cleaned = cleaned.replace(/\n*---\n*#*\s*\**[A-Za-z\s]+ PERSPECTIVE:[^\n]*\**[\s\S]*$/i, (match) => {
    if (/data integrity|gigo|garbage in|case study|input sanitization|validation function|check_date_validity/i.test(match)) {
      return '';
    }
    return match;
  });
  cleaned = cleaned.replace(/\n+#*\s*\**[A-Za-z\s]+ PERSPECTIVE:[^\n]*\**[\s\S]*$/i, (match) => {
    if (/data integrity|gigo|garbage in|case study|input sanitization|validation function|check_date_validity/i.test(match)) {
      return '';
    }
    return match;
  });
  cleaned = cleaned.replace(/\n+\**Would you like to explore how to implement a validation function[^\n]*\**\??\s*$/gi, '');
  return cleaned.trim();
}

export const ChatAppShell: React.FC<ChatAppShellProps> = ({ onNavigate }) => {
  const [user, setUser] = useState<User | null>(null);
  const [token, setToken] = useState<string>('');
  const [messages, setMessages] = useState<Message[]>([]);
  const [isThinking, setIsThinking] = useState<boolean>(false);
  const [activeDoc, setActiveDoc] = useState<RagDocument | null>(null);
  const [sessions, setSessions] = useState<ChatSession[]>([]);
  const [currentSessionId, setCurrentSessionId] = useState<string>('');
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [showSettingsModal, setShowSettingsModal] = useState<boolean>(false);
  const [settingsDefaultTab, setSettingsDefaultTab] = useState<SettingsTab>('profile');
  const [showLogoutConfirm, setShowLogoutConfirm] = useState<boolean>(false);
  const [currentTheme, setCurrentTheme] = useState<string>('obsidian');
  const abortControllerRef = useRef<AbortController | null>(null);
  const messagesRef = useRef<Message[]>(messages);

  const handleOpenSettings = (tab: SettingsTab = 'profile') => {
    setSettingsDefaultTab(tab);
    setShowSettingsModal(true);
  };

  useEffect(() => {
    messagesRef.current = messages;
  }, [messages]);

  // Messages ref for ongoing state tracking
  useEffect(() => {
    messagesRef.current = messages;
  }, [messages]);

  // Load user, token, background theme and session history from localStorage
  useEffect(() => {
    try {
      const storedUser = localStorage.getItem('edumind_user') || localStorage.getItem('vortex_user');
      const storedToken = localStorage.getItem('edumind_token') || localStorage.getItem('vortex_token');

      if (!storedUser || !storedToken) {
        onNavigate('/sign-up-login-screen');
        return;
      }

      const parsedUser: User = JSON.parse(storedUser);
      setUser(parsedUser);
      setToken(storedToken);

      // Save under edumind keys as well for migration
      localStorage.setItem('edumind_user', storedUser);
      localStorage.setItem('edumind_token', storedToken);

      // Initialize individual user background theme
      const storedTheme = getUserStoredTheme(parsedUser.email);
      setCurrentTheme(storedTheme);

      // Load saved sessions from local storage
      const storedSessions = localStorage.getItem(`edumind_sessions_${parsedUser.email}`) || localStorage.getItem(`vortex_sessions_${parsedUser.email}`);
      let parsedSessions: ChatSession[] = [];
      if (storedSessions) {
        try {
          parsedSessions = JSON.parse(storedSessions);
          parsedSessions = parsedSessions.map((s) => ({
            ...s,
            messages: (s.messages || []).map((m) =>
              m.role === 'assistant' ? { ...m, content: stripVerboseDiagnostics(m.content) } : m
            ),
          }));
          setSessions(parsedSessions);
        } catch {
          parsedSessions = [];
        }
      }

      // Check for any initial prompt set by landing page prompt cards
      const initialPrompt = localStorage.getItem('edumind_initial_prompt') || localStorage.getItem('vortex_initial_prompt');
      if (initialPrompt) {
        localStorage.removeItem('edumind_initial_prompt');
        localStorage.removeItem('vortex_initial_prompt');
        const freshId = `session_${Date.now()}`;
        setCurrentSessionId(freshId);
        setMessages([]);
        setActiveDoc(null);
        setTimeout(() => {
          handleSendMessageWithUser(initialPrompt, parsedUser, storedToken);
        }, 400);
        return;
      }

      // Work like real AI platforms (ChatGPT, Claude, Gemini):
      // On login / application start, always start in a clean new chat session with starter prompts.
      // All past conversations remain safely preserved in the sidebar history for the user to open anytime.
      const freshId = `session_${Date.now()}`;
      setCurrentSessionId(freshId);
      setMessages([]);
      setActiveDoc(null);
    } catch (e) {
      onNavigate('/sign-up-login-screen');
    }
  }, []);

  // Persist sessions whenever messages, activeDoc, or currentSessionId changes
  const saveCurrentSession = (
    newMessages: Message[],
    doc: RagDocument | null,
    sessionId: string,
    currentUser: User
  ) => {
    if (!sessionId || !currentUser) return;
    if (newMessages.length === 0) return;

    setSessions((prev) => {
      const firstUserMsg = newMessages.find((m) => m.role === 'user');
      const title = firstUserMsg ? firstUserMsg.content.slice(0, 42) : 'Study Session';

      const existingIndex = prev.findIndex((s) => s.id === sessionId);
      let updated: ChatSession[];

      if (existingIndex >= 0) {
        updated = [...prev];
        updated[existingIndex] = {
          ...updated[existingIndex],
          title: updated[existingIndex].title || title,
          messages: newMessages,
          activeDoc: doc,
          updatedAt: new Date().toISOString(),
        };
        // Bring active session to top
        const [target] = updated.splice(existingIndex, 1);
        updated.unshift(target);
      } else {
        const newSession: ChatSession = {
          id: sessionId,
          title,
          messages: newMessages,
          activeDoc: doc,
          updatedAt: new Date().toISOString(),
        };
        updated = [newSession, ...prev];
      }

      try {
        localStorage.setItem(`edumind_sessions_${currentUser.email}`, JSON.stringify(updated));
        localStorage.setItem(`edumind_last_session_${currentUser.email}`, sessionId);
      } catch (err) {
        console.warn('Failed to persist chat sessions:', err);
      }

      return updated;
    });
  };

  const handleSelectSession = (sessionId: string) => {
    const found = sessions.find((s) => s.id === sessionId);
    if (found) {
      setCurrentSessionId(found.id);
      setMessages(found.messages || []);
      setActiveDoc(found.activeDoc || null);
      setErrorMessage(null);
      if (user) {
        try {
          localStorage.setItem(`edumind_last_session_${user.email}`, found.id);
        } catch {
          // ignore
        }
      }
    }
  };

  const handleDeleteSession = (sessionId: string) => {
    if (!user) return;
    const updated = sessions.filter((s) => s.id !== sessionId);
    setSessions(updated);
    try {
      localStorage.setItem(`edumind_sessions_${user.email}`, JSON.stringify(updated));
      localStorage.setItem(`vortex_sessions_${user.email}`, JSON.stringify(updated));
    } catch {
      // ignore
    }

    if (currentSessionId === sessionId) {
      const remaining = updated[0];
      if (remaining) {
        setCurrentSessionId(remaining.id);
        setMessages(remaining.messages || []);
        setActiveDoc(remaining.activeDoc || null);
        try {
          localStorage.setItem(`edumind_last_session_${user.email}`, remaining.id);
        } catch {
          // ignore
        }
      } else {
        const newId = `session_${Date.now()}`;
        setCurrentSessionId(newId);
        setMessages([]);
        setActiveDoc(null);
        try {
          localStorage.setItem(`edumind_last_session_${user.email}`, newId);
        } catch {
          // ignore
        }
      }
    }
  };

  const handleNewChat = () => {
    const newId = `session_${Date.now()}`;
    setCurrentSessionId(newId);
    setMessages([]);
    setActiveDoc(null);
    setErrorMessage(null);
    if (user) {
      try {
        localStorage.setItem(`edumind_last_session_${user.email}`, newId);
      } catch {
        // ignore
      }
    }
  };

  const handleUpdateUser = (updatedUser: User) => {
    setUser(updatedUser);
    localStorage.setItem('edumind_user', JSON.stringify(updatedUser));
    localStorage.setItem('vortex_user', JSON.stringify(updatedUser));
    if (token) {
      fetch('/api/profile', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify(updatedUser),
      }).catch((err) => console.warn('Sync profile error:', err));
    }
  };

  const handleStopGeneration = () => {
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
      abortControllerRef.current = null;
    }
    setIsThinking(false);
    setMessages((prev) => [
      ...prev,
      {
        role: 'assistant',
        content: '⏹️ *Generation stopped by user.*',
        timestamp: new Date().toISOString(),
      },
    ]);
  };

  const handleSendMessageWithUser = async (
    text: string,
    currentUser: User,
    currentToken: string,
    currentDoc: RagDocument | null = activeDoc,
    image?: { data: string; mimeType: string } | null
  ) => {
    if (!text.trim() && !image) return;

    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
    }
    const controller = new AbortController();
    abortControllerRef.current = controller;

    const userMessage: Message = {
      role: 'user',
      content: text.trim() || (image ? '📷 [Attached Exam Past Question Photo]' : ''),
      timestamp: new Date().toISOString(),
      attachedDoc: currentDoc?.fileName,
      image: image || undefined,
      imageUrl: image?.data || undefined,
    };

    const nextMessages = [...messages, userMessage];
    setMessages(nextMessages);
    setIsThinking(true);
    setErrorMessage(null);

    const activeSessionId = currentSessionId || `session_${Date.now()}`;
    if (!currentSessionId) setCurrentSessionId(activeSessionId);

    // Save immediately with user message
    saveCurrentSession(nextMessages, currentDoc, activeSessionId, currentUser);

    try {
      let response = await fetch('/api/chat', {
        method: 'POST',
        signal: controller.signal,
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${currentToken}`,
        },
        body: JSON.stringify({
          message: text.trim(),
          image: image || undefined,
          educationLevel: currentUser.educationLevel,
          classYear: currentUser.classYear,
          course: currentUser.course,
          theme: currentTheme,
        }),
      });

      // Automatic 15-minute access token refresh via HttpOnly refresh token cookie
      if (response.status === 401) {
        try {
          const refreshRes = await fetch('/api/auth/refresh', {
            method: 'POST',
            credentials: 'include',
          });
          if (refreshRes.ok) {
            const refreshData = await refreshRes.json();
            if (refreshData.token) {
              currentToken = refreshData.token;
              localStorage.setItem('edumind_token', refreshData.token);
              localStorage.setItem('vortex_token', refreshData.token);
              response = await fetch('/api/chat', {
                method: 'POST',
                signal: controller.signal,
                headers: {
                  'Content-Type': 'application/json',
                  Authorization: `Bearer ${refreshData.token}`,
                },
                body: JSON.stringify({
                  message: text.trim(),
                  image: image || undefined,
                  educationLevel: currentUser.educationLevel,
                  classYear: currentUser.classYear,
                  course: currentUser.course,
                  theme: currentTheme,
                }),
              });
            }
          }
        } catch {
          // Fall through to error handling
        }
      }

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || 'Failed to communicate with EduMind AI');
      }

      const rawContent = data.reply || data.response || 'No response generated';
      const cleanContent = stripVerboseDiagnostics(rawContent);

      const aiMessage: Message = {
        role: 'assistant',
        content: cleanContent,
        timestamp: new Date().toISOString(),
        ragSource: Boolean(data.ragSourceUsed),
        verification: data.verification,
      };

      const finalMessages = [...nextMessages, aiMessage];
      setMessages(finalMessages);
      saveCurrentSession(finalMessages, currentDoc, activeSessionId, currentUser);
    } catch (err: any) {
      if (err.name === 'AbortError') {
        return;
      }
      const rawMsg = err.message || '';
      const isDemandError = rawMsg.includes('503') || rawMsg.includes('demand') || rawMsg.includes('Unavailable');
      const friendlyNotice = isDemandError
        ? `⚠️ **Notice**: Google AI servers are experiencing temporary high demand spikes. EduMind AI is ready to re-query your question with 1 click.`
        : `⚠️ **Notice**: ${rawMsg || 'Failed to receive reply.'}\n\nPlease try asking again.`;

      setErrorMessage(isDemandError ? 'Google AI is experiencing high demand. Click "Re-query EduMind AI" below.' : (rawMsg || 'Unable to connect to EduMind AI. Please try again.'));
      const errAiMessage: Message = {
        role: 'assistant',
        content: `${friendlyNotice}\n\n*Click **Re-query EduMind AI** below to retry automatically.*`,
        timestamp: new Date().toISOString(),
      };
      const finalMessages = [...nextMessages, errAiMessage];
      setMessages(finalMessages);
      saveCurrentSession(finalMessages, currentDoc, activeSessionId, currentUser);
    } finally {
      setIsThinking(false);
      abortControllerRef.current = null;
    }
  };

  const handleSendMessage = (text: string, image?: { data: string; mimeType: string }) => {
    if (!user || !token) return;
    handleSendMessageWithUser(text, user, token, activeDoc, image);
  };

  const handleUploadSuccess = (info: {
    fileName: string;
    chunksCount: number;
    textPreview?: string;
    fullText?: string;
  }) => {
    const docRecord: RagDocument = {
      fileName: info.fileName,
      chunksCount: info.chunksCount,
      textPreview: info.textPreview,
      fullText: info.fullText,
      uploadedAt: new Date().toISOString(),
    };
    setActiveDoc(docRecord);
  };

  const handleClearDoc = () => {
    setActiveDoc(null);
  };

  const handleLogout = () => {
    handleConfirmLogout();
  };

  const handleConfirmLogout = () => {
    fetch('/api/auth/logout', {
      method: 'POST',
      credentials: 'include',
    }).catch(() => {});

    localStorage.removeItem('vortex_user');
    localStorage.removeItem('vortex_token');
    localStorage.removeItem('edumind_user');
    localStorage.removeItem('edumind_token');
    localStorage.removeItem('vortex_initial_prompt');
    localStorage.setItem('vortex_auth_mode', 'login');
    window.location.hash = 'login';
    onNavigate('/sign-up-login-screen#login');
  };

  const handleSelectTheme = (themeId: string) => {
    setCurrentTheme(themeId);
    setUserStoredTheme(themeId, user?.email);
    if (user) {
      const updatedUser = { ...user, theme: themeId };
      setUser(updatedUser);
      try {
        localStorage.setItem('vortex_user', JSON.stringify(updatedUser));
      } catch {
        // ignore
      }
    }
  };

  if (!user) {
    return (
      <div className="min-h-screen bg-[#0a0a0a] flex items-center justify-center text-white">
        <div className="flex flex-col items-center gap-3">
          <div className="w-10 h-10 border-2 border-emerald-500 border-t-transparent rounded-full animate-spin" />
          <p className="text-sm font-medium text-stone-400">Loading Assistant...</p>
        </div>
      </div>
    );
  }

  const normalizedLevel = (user.educationLevel || '').toLowerCase();
  const isGeneralUser =
    user.userType === 'others' ||
    normalizedLevel === 'general' ||
    normalizedLevel === 'others' ||
    normalizedLevel === 'other' ||
    normalizedLevel.includes('general') ||
    normalizedLevel.includes('other');

  return (
    <div className={`relative h-full w-full overflow-hidden transition-all duration-300 theme-${currentTheme}`}>
      {/* Global Education Settings Modal (Includes Student Profile, Academic Stage & Themes) */}
      <EducationSettingsModal
        isOpen={showSettingsModal}
        onClose={() => setShowSettingsModal(false)}
        currentUser={user}
        onUpdateUser={handleUpdateUser}
        onLogout={handleLogout}
        currentThemeId={currentTheme}
        onSelectTheme={handleSelectTheme}
        sessionsCount={sessions.length}
        activeDoc={activeDoc}
        defaultTab={settingsDefaultTab}
      />

      {/* Global Error Toast */}
      {errorMessage && (
        <div className="fixed top-4 right-4 z-50 max-w-md bg-rose-950/90 border border-rose-600 text-rose-200 px-4 py-3 rounded-2xl shadow-2xl backdrop-blur-md flex items-center justify-between gap-3 animate-in fade-in slide-in-from-top-4">
          <div className="flex items-center gap-2">
            <AlertTriangle className="w-5 h-5 text-rose-400 shrink-0" />
            <span className="text-xs font-medium">{errorMessage}</span>
          </div>
          <button
            onClick={() => setErrorMessage(null)}
            className="text-rose-400 hover:text-rose-100 p-1 cursor-pointer"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
      )}

      {/* Adaptive Render Based on Role & Education Level */}
      {isGeneralUser ? (
        <GeneralChat
          user={user}
          messages={messages}
          onSendMessage={handleSendMessage}
          onStopGeneration={handleStopGeneration}
          isThinking={isThinking}
          onLogout={handleLogout}
          token={token}
          activeDoc={activeDoc}
          onUploadSuccess={handleUploadSuccess}
          onClearDoc={handleClearDoc}
          onNewChat={handleNewChat}
          onOpenSettings={() => handleOpenSettings('mode')}
          currentThemeId={currentTheme}
          sessions={sessions}
          currentSessionId={currentSessionId}
          onSelectSession={handleSelectSession}
          onDeleteSession={handleDeleteSession}
        />
      ) : normalizedLevel.includes('primary') ? (
        <PrimaryMode
          user={user}
          messages={messages}
          onSendMessage={handleSendMessage}
          onStopGeneration={handleStopGeneration}
          isThinking={isThinking}
          onLogout={handleLogout}
          onOpenSettings={() => handleOpenSettings('mode')}
          currentThemeId={currentTheme}
          sessions={sessions}
          currentSessionId={currentSessionId}
          onSelectSession={handleSelectSession}
          onNewChat={handleNewChat}
          onDeleteSession={handleDeleteSession}
        />
      ) : normalizedLevel.includes('jss') || normalizedLevel.includes('sss') || normalizedLevel.includes('secondary') ? (
        <JssSssChat
          user={user}
          messages={messages}
          onSendMessage={handleSendMessage}
          onStopGeneration={handleStopGeneration}
          isThinking={isThinking}
          onLogout={handleLogout}
          token={token}
          activeDoc={activeDoc}
          onUploadSuccess={handleUploadSuccess}
          onClearDoc={handleClearDoc}
          onOpenSettings={() => handleOpenSettings('mode')}
          currentThemeId={currentTheme}
          sessions={sessions}
          currentSessionId={currentSessionId}
          onSelectSession={handleSelectSession}
          onNewChat={handleNewChat}
          onDeleteSession={handleDeleteSession}
        />
      ) : (
        <UniversityChat
          user={user}
          messages={messages}
          onSendMessage={handleSendMessage}
          onStopGeneration={handleStopGeneration}
          isThinking={isThinking}
          onLogout={handleLogout}
          token={token}
          activeDoc={activeDoc}
          onUploadSuccess={handleUploadSuccess}
          onClearDoc={handleClearDoc}
          onNewChat={handleNewChat}
          onOpenSettings={() => handleOpenSettings('mode')}
          currentThemeId={currentTheme}
          sessions={sessions}
          currentSessionId={currentSessionId}
          onSelectSession={handleSelectSession}
          onDeleteSession={handleDeleteSession}
        />
      )}
    </div>
  );
};
