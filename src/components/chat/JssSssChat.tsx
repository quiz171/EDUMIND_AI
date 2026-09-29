import React, { useState, useRef, useEffect } from 'react';
import { User, Message, RagDocument, ChatSession } from '../../types';
import {
  Send,
  Flame,
  Star,
  BookOpen,
  GraduationCap,
  FileText,
  Sparkles,
  LogOut,
  ArrowRight,
  Plus,
  MessageSquare,
  Trash2,
  SlidersHorizontal,
  ChevronDown,
  X,
  PanelLeft,
  PanelLeftClose,
  Square,
  UserCheck,
  Settings,
  Camera,
  Mic,
  MicOff,
  Volume2,
  VolumeX,
  Maximize2,
  Menu,
  Shield,
  Compass,
} from 'lucide-react';
import { MarkdownMessage } from './MarkdownMessage';
import { UploadZone } from './UploadZone';
import { BackgroundWatermark } from './BackgroundWatermark';
import { VortexLogo } from '../common/VortexLogo';
import { PWAInstallButton } from '../pwa/PWAInstallButton';
import {
  createSpeechRecognizer,
  speakText,
  stopSpeaking,
} from '../../lib/speech';

interface JssSssChatProps {
  user: User;
  messages: Message[];
  onSendMessage: (text: string, image?: { data: string; mimeType: string }) => void;
  isThinking: boolean;
  onLogout: () => void;
  token: string;
  activeDoc: RagDocument | null;
  onUploadSuccess: (info: any) => void;
  onClearDoc: () => void;
  onOpenSettings: () => void;
  onOpenProfile?: () => void;
  currentThemeId?: string;
  onStopGeneration?: () => void;
  sessions: ChatSession[];
  currentSessionId: string;
  onSelectSession: (sessionId: string) => void;
  onNewChat: () => void;
  onDeleteSession: (sessionId: string) => void;
}

export const JssSssChat: React.FC<JssSssChatProps> = ({
  user,
  messages,
  onSendMessage,
  isThinking,
  onLogout,
  token,
  activeDoc,
  onUploadSuccess,
  onClearDoc,
  onOpenSettings,
  onOpenProfile,
  currentThemeId,
  onStopGeneration,
  sessions,
  currentSessionId,
  onSelectSession,
  onNewChat,
  onDeleteSession,
}) => {
  const [inputText, setInputText] = useState('');
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [selectedImage, setSelectedImage] = useState<{
    data: string;
    mimeType: string;
    name: string;
  } | null>(null);
  const [isListening, setIsListening] = useState(false);
  const [speechError, setSpeechError] = useState<string | null>(null);
  const [speakingIndex, setSpeakingIndex] = useState<number | null>(null);
  const [previewModalImage, setPreviewModalImage] = useState<string | null>(null);

  const messagesEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const imageInputRef = useRef<HTMLInputElement>(null);
  const recognizerRef = useRef<any>(null);
  const voicePrefixRef = useRef<string>('');

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, isThinking]);

  useEffect(() => {
    return () => {
      if (recognizerRef.current) {
        try {
          recognizerRef.current.stop();
        } catch {
          // ignore
        }
      }
      stopSpeaking();
    };
  }, []);

  const handleImageSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (file.type.startsWith('image/')) {
      const reader = new FileReader();
      reader.onload = () => {
        const result = reader.result as string;
        setSelectedImage({
          data: result,
          mimeType: file.type,
          name: file.name,
        });
      };
      reader.readAsDataURL(file);
    } else {
      // Document upload
      try {
        const formData = new FormData();
        formData.append('file', file);
        const res = await fetch('/api/upload', {
          method: 'POST',
          headers: { Authorization: `Bearer ${token || 'session_user_token'}` },
          body: formData,
        });
        const data = await res.json();
        if (res.ok) {
          onUploadSuccess({
            fileName: data.fileName || file.name,
            chunksCount: data.chunksCreated || 1,
            textPreview: data.textPreview,
            fullText: data.textPreview,
          });
        }
      } catch {
        // ignore
      }
    }
    e.target.value = '';
  };

  const toggleVoiceRecording = () => {
    if (isListening) {
      if (recognizerRef.current) {
        try {
          recognizerRef.current.stop();
        } catch {
          // ignore
        }
        recognizerRef.current = null;
      }
      setIsListening(false);
      return;
    }

    setSpeechError(null);
    voicePrefixRef.current = inputText.trim();

    const recognizer = createSpeechRecognizer(
      (transcript) => {
        const prefix = voicePrefixRef.current;
        const spoken = transcript.full;
        const updated = prefix ? `${prefix} ${spoken}` : spoken;
        setInputText(updated);
      },
      (error) => {
        setSpeechError(error);
        setIsListening(false);
      },
      () => {
        setIsListening(false);
      }
    );

    if (recognizer) {
      recognizerRef.current = recognizer;
      try {
        recognizer.start();
        setIsListening(true);
      } catch (err) {
        setSpeechError('Microphone could not be started.');
        setIsListening(false);
      }
    }
  };

  const toggleReadAloud = (text: string, index: number) => {
    if (speakingIndex === index) {
      stopSpeaking();
      setSpeakingIndex(null);
      return;
    }
    setSpeakingIndex(index);
    speakText(
      text,
      () => setSpeakingIndex(index),
      () => setSpeakingIndex(null)
    );
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if ((!inputText.trim() && !selectedImage) || isThinking) return;

    if (isListening && recognizerRef.current) {
      try {
        recognizerRef.current.stop();
      } catch {
        // ignore
      }
      setIsListening(false);
    }

    onSendMessage(
      inputText.trim(),
      selectedImage ? { data: selectedImage.data, mimeType: selectedImage.mimeType } : undefined
    );
    setInputText('');
    setSelectedImage(null);
  };

  const isSSS = (user.educationLevel || '').toLowerCase().includes('sss') || (user.classYear || '').toLowerCase().includes('ss');

  const trendingCards = isSSS
    ? [
        {
          title: 'JAMB CBT 2026 Speed Drills & High-Yield Calculations',
          prompt: 'Give me 5 high-yield Physics and Chemistry calculation past questions with step-by-step WAEC/JAMB formulas.',
          tag: 'JAMB / WAEC',
        },
        {
          title: 'WAEC Theory Marking Scheme & Examiner Tips',
          prompt: 'How do WAEC examiners award marks for chemical equations, biology definitions, and step-by-step working?',
          tag: 'Marking Scheme',
        },
        {
          title: 'Mathematics Quadratic & Trigonometry Shortcuts',
          prompt: 'Explain the fastest methods to solve trigonometry and quadratic equations under exam pressure.',
          tag: 'Math Speed',
        },
        {
          title: 'English Language Lexis & Structure Drills',
          prompt: 'Drill me on 5 difficult JAMB sentence completion questions with grammatical rules explained.',
          tag: 'English Prep',
        },
      ]
    : [
        {
          title: 'BECE Junior WAEC Mathematics Formulas',
          prompt: 'Explain simple interest, algebraic expansion, and angles in parallel lines step-by-step for BECE.',
          tag: 'BECE Prep',
        },
        {
          title: 'Basic Science & Technology Foundational Drills',
          prompt: 'Explain kinetic vs potential energy and living vs non-living characteristics in clear, friendly terms.',
          tag: 'Basic Science',
        },
        {
          title: 'Junior Secondary English Composition Outline',
          prompt: 'Give me an easy 4-paragraph outline for writing an essay: "A Day I Will Never Forget".',
          tag: 'Essay Writing',
        },
        {
          title: 'Step-by-Step Word Problems Practice',
          prompt: 'Give me 3 everyday math word problems with step-by-step solutions.',
          tag: 'Math Problems',
        },
      ];

  return (
    <div className="flex h-full w-full overflow-hidden bg-transparent text-stone-200">
      {/* Hidden file input for unified attachments (notes or past questions) */}
      <input
        ref={imageInputRef}
        type="file"
        accept=".pdf,.txt,.doc,.docx,.ppt,.pptx,image/png,image/jpeg,image/jpg,image/webp,image/heic,image/*"
        onChange={handleImageSelect}
        className="hidden"
      />

      {/* Full-screen Past Question Image Lightbox */}
      {previewModalImage && (
        <div
          onClick={() => setPreviewModalImage(null)}
          className="fixed inset-0 z-50 bg-black/90 backdrop-blur-md flex items-center justify-center p-4 cursor-zoom-out animate-in fade-in"
        >
          <div className="relative max-w-4xl max-h-[90vh] overflow-hidden rounded-2xl">
            <img
              src={previewModalImage}
              alt="Enlarged Exam Past Question"
              className="max-h-[85vh] max-w-full object-contain rounded-xl border border-white/20 shadow-2xl"
            />
            <button
              onClick={() => setPreviewModalImage(null)}
              className="absolute top-3 right-3 p-2 rounded-full bg-black/75 text-white hover:bg-white/20 transition-colors cursor-pointer"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>
      )}

      {/* Mobile Sidebar Overlay */}
      {sidebarOpen && (
        <div
          onClick={() => setSidebarOpen(false)}
          className="fixed inset-0 bg-black/70 backdrop-blur-xs z-30 md:hidden"
        />
      )}

      {/* Sidebar */}
      <aside
        className={`fixed md:static top-0 bottom-0 left-0 z-40 w-72 bg-[#141414] border-r border-white/10 flex flex-col transition-transform duration-200 ease-in-out ${
          sidebarOpen ? 'translate-x-0' : '-translate-x-full md:hidden'
        }`}
      >
        {/* Sidebar Header */}
        <div className="p-3.5 border-b border-white/10 flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <VortexLogo size="xs" showText={false} />
            <div className="leading-tight">
              <span className="font-bold text-white text-sm tracking-tight block">EduMind AI</span>
              <span className="text-[10px] text-cyan-400 font-semibold block uppercase tracking-wider">
                {user.classYear || 'Secondary'} Exam Prep
              </span>
            </div>
          </div>
          <button
            onClick={() => setSidebarOpen(false)}
            className="p-1.5 text-stone-400 hover:text-white rounded-lg hover:bg-white/5 cursor-pointer md:hidden"
          >
            <PanelLeftClose className="w-5 h-5" />
          </button>
        </div>

        {/* New Session Button */}
        <div className="p-3">
          <button
            onClick={() => {
              onNewChat();
              if (window.innerWidth < 768) setSidebarOpen(false);
            }}
            className="w-full flex items-center gap-2 px-3 py-2.5 rounded-xl bg-white/5 hover:bg-white/10 border border-white/10 text-white font-medium text-xs transition-colors cursor-pointer"
          >
            <Plus className="w-4 h-4 text-emerald-400" />
            <span>New Study Session</span>
          </button>
        </div>

        {/* Previous Chat Sessions */}
        <div className="flex-1 overflow-y-auto px-3 py-1 space-y-1">
          <div className="text-[11px] font-semibold text-stone-500 px-2 py-1 uppercase tracking-wider">
            Study History
          </div>
          {sessions.length === 0 ? (
            <div className="px-2 py-4 text-xs text-stone-500 text-center">
              No previous sessions. Ask a question to get started!
            </div>
          ) : (
            <div className="space-y-0.5">
              {sessions.map((sess) => {
                const isActive = sess.id === currentSessionId;
                return (
                  <div
                    key={sess.id}
                    onClick={() => {
                      onSelectSession(sess.id);
                      if (window.innerWidth < 768) setSidebarOpen(false);
                    }}
                    className={`group flex items-center justify-between px-2.5 py-2 rounded-xl text-xs cursor-pointer transition-colors ${
                      isActive
                        ? 'bg-emerald-500/15 text-emerald-300 font-medium border border-emerald-500/30'
                        : 'text-stone-400 hover:bg-white/5 hover:text-stone-200'
                    }`}
                  >
                    <div className="flex items-center gap-2 overflow-hidden">
                      <MessageSquare className="w-3.5 h-3.5 shrink-0 text-stone-500 group-hover:text-stone-300" />
                      <span className="truncate max-w-[170px]">{sess.title || 'Untitled Session'}</span>
                    </div>
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        onDeleteSession(sess.id);
                      }}
                      className="opacity-0 group-hover:opacity-100 p-1 text-stone-500 hover:text-rose-400 rounded transition-opacity"
                      title="Delete session"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>
                );
              })}
            </div>
          )}

          {/* Active Knowledge Base Info */}
          {activeDoc && (
            <div className="mt-4 p-3 rounded-xl bg-emerald-950/40 border border-emerald-500/30 text-xs space-y-1.5">
              <div className="flex items-center justify-between text-emerald-400 font-semibold">
                <span className="flex items-center gap-1.5 truncate">
                  <FileText className="w-3.5 h-3.5" />
                  <span className="truncate">{activeDoc.fileName}</span>
                </span>
                <button
                  onClick={onClearDoc}
                  className="text-stone-400 hover:text-rose-400 p-1 cursor-pointer"
                  title="Remove from active context"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                </button>
              </div>
              <p className="text-[11px] text-emerald-300/80">
                {activeDoc.chunksCount} notes chunks indexed into memory.
              </p>
            </div>
          )}
        </div>

        {/* Sidebar Footer with Explicit Settings & Logout */}
        <div className="p-3.5 border-t border-white/10 bg-[#121212] space-y-2.5">
          <div
            onClick={onOpenSettings}
            className="flex items-center gap-2 overflow-hidden cursor-pointer hover:opacity-85 transition-opacity"
            title="Settings & Student Profile"
          >
            <div className="w-9 h-9 rounded-xl bg-emerald-500/20 border border-emerald-500/40 flex items-center justify-center text-emerald-400 text-xs font-bold shrink-0">
              {user.fullName ? user.fullName[0].toUpperCase() : 'S'}
            </div>
            <div className="overflow-hidden text-left flex-1 min-w-0">
              <p className="text-xs font-semibold text-white truncate">{user.fullName || 'Student'}</p>
              <p className="text-[11px] text-emerald-400 font-medium truncate">
                {user.classYear || 'Secondary'} • {user.course || 'Science'}
              </p>
            </div>
          </div>

          <div className="space-y-1.5">
            <div className="grid grid-cols-2 gap-2">
              <button
                type="button"
                onClick={onOpenSettings}
                className="px-2.5 py-1.5 rounded-xl bg-white/5 hover:bg-white/10 border border-white/10 text-stone-300 hover:text-white transition-colors cursor-pointer text-xs font-semibold flex items-center justify-center gap-1.5"
                title="Academic Settings"
              >
                <Settings className="w-3.5 h-3.5 text-stone-400" />
                <span>Settings</span>
              </button>
              <button
                type="button"
                onClick={onLogout}
                className="px-2.5 py-1.5 rounded-xl bg-rose-500/15 hover:bg-rose-500/25 border border-rose-500/30 text-rose-300 hover:text-rose-100 transition-colors cursor-pointer text-xs font-bold flex items-center justify-center gap-1.5 shadow-xs"
                title="Logout & end session"
              >
                <LogOut className="w-3.5 h-3.5" />
                <span>Logout</span>
              </button>
            </div>
          </div>
        </div>
      </aside>

      {/* Main Content Area */}
      <div className="flex-1 flex flex-col h-full overflow-hidden relative w-full min-w-0">
        {/* Background Watermark */}
        <BackgroundWatermark />

        {/* Top Header */}
        <header className="sticky top-0 z-30 bg-black/40 backdrop-blur-md border-b border-white/10 px-3 sm:px-4 py-2.5 flex items-center justify-between">
          <div className="flex items-center gap-2.5 min-w-0">
            <button
              onClick={() => setSidebarOpen(!sidebarOpen)}
              className="p-2 rounded-xl border border-white/15 bg-white/5 hover:bg-white/10 text-stone-300 hover:text-white transition-all cursor-pointer shrink-0 shadow-xs active:scale-95"
              title={sidebarOpen ? 'Close menu' : 'Open menu'}
              aria-label="Toggle menu"
            >
              <Menu className="w-5 h-5 text-stone-300 hover:text-white" />
            </button>
          </div>

          <div className="flex items-center gap-2">
            <PWAInstallButton variant="header" />
            <button
              type="button"
              onClick={onLogout}
              className="flex items-center gap-1 px-2.5 py-1.5 rounded-xl bg-rose-500/15 hover:bg-rose-500/25 border border-rose-500/30 text-rose-300 hover:text-rose-100 text-xs font-bold transition-colors cursor-pointer"
              title="Logout"
            >
              <LogOut className="w-3.5 h-3.5" />
              <span className="hidden sm:inline">Logout</span>
            </button>
          </div>
        </header>

        {/* Chat Stream */}
        <div className="flex-1 overflow-y-auto p-3 sm:p-4 space-y-4 relative z-10">
          {messages.length === 0 ? (
            <div className="max-w-2xl mx-auto py-6 sm:py-10 space-y-6">
              {/* Center AI Hero */}
              <div className="text-center space-y-4 flex flex-col items-center">
                {/* Official VORTEX AI Logo */}
                <div className="relative">
                  <VortexLogo size="lg" showText={false} />
                </div>

                <div className="space-y-1.5">
                  <h1 className="text-2xl sm:text-3.5xl font-extrabold tracking-tight text-white">
                    What would you like to solve today?
                  </h1>
                  <p className="text-stone-400 text-xs sm:text-sm max-w-md mx-auto leading-relaxed">
                    Snap pictures of past questions to solve, practice step-by-step calculations, or dictate with your voice.
                  </p>
                </div>
              </div>

              {/* Starter Drill Cards */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                {trendingCards.map((item, idx) => (
                  <button
                    key={idx}
                    type="button"
                    onClick={() => {
                      setInputText(item.prompt);
                      inputRef.current?.focus();
                    }}
                    className="bg-[#181818] hover:bg-[#202020] border border-white/10 hover:border-emerald-500/40 p-4 rounded-2xl text-left transition-all duration-200 group cursor-pointer"
                    title="Load question into input"
                  >
                    <div className="flex items-center justify-between mb-2">
                      <span className="text-[11px] font-bold uppercase tracking-wider text-emerald-400 bg-emerald-500/10 px-2 py-0.5 rounded-full border border-emerald-500/20">
                        {item.tag}
                      </span>
                      <ArrowRight className="w-4 h-4 text-stone-500 group-hover:text-emerald-400 transition-colors" />
                    </div>
                    <h3 className="text-xs sm:text-sm font-semibold text-stone-200 group-hover:text-white line-clamp-2">
                      {item.title}
                    </h3>
                  </button>
                ))}
              </div>

              {/* Upload Drop Zone */}
              <div className="border border-white/10 rounded-2xl p-4 bg-[#141414]">
                <UploadZone
                  onUploadSuccess={onUploadSuccess}
                  token={token}
                  activeDoc={activeDoc}
                  onClearDoc={onClearDoc}
                />
              </div>
            </div>
          ) : (
            <div className="max-w-3xl mx-auto w-full space-y-5 pb-6">
              {messages.map((msg, index) => {
                const isUser = msg.role === 'user';
                return (
                  <div
                    key={index}
                    className={`flex ${isUser ? 'justify-end' : 'justify-start'} animate-in fade-in duration-200`}
                  >
                    <div
                      className={`p-4 md:p-5 rounded-2xl max-w-[88%] md:max-w-2xl text-sm md:text-base leading-relaxed ${
                        isUser
                          ? 'bg-[#2a2a2a] text-white border border-white/10 rounded-br-none font-medium'
                          : 'bg-[#181818] text-stone-200 border border-white/10 rounded-bl-none shadow-md'
                      }`}
                    >
                      {isUser && (msg.imageUrl || msg.image?.data) && (
                        <div
                          onClick={() => setPreviewModalImage(msg.imageUrl || msg.image?.data || null)}
                          className="relative overflow-hidden rounded-xl border border-white/20 max-w-xs mb-2.5 shadow-md cursor-pointer group"
                          title="Click to enlarge past question photo"
                        >
                          <img
                            src={msg.imageUrl || msg.image?.data}
                            alt="Past Question Photo"
                            className="max-h-56 object-contain rounded-xl bg-black/50 transition-transform group-hover:scale-[1.02]"
                          />
                          <div className="absolute bottom-1 right-1 bg-black/80 backdrop-blur-xs text-[10px] text-stone-200 px-2 py-0.5 rounded-md flex items-center gap-1 border border-white/10">
                            <Maximize2 className="w-3 h-3 text-emerald-400" />
                            <span>Exam Past Question</span>
                          </div>
                        </div>
                      )}

                      {!isUser && (
                        <div className="flex items-center justify-between text-xs font-bold text-emerald-400 mb-2 pb-1.5 border-b border-white/10">
                          <div className="flex items-center gap-1.5">
                            <span>🧠</span>
                            <span>EduMind Second Brain</span>
                            {msg.ragSource && (
                              <span className="text-[10px] bg-emerald-950 text-emerald-300 px-2 py-0.5 rounded-full border border-emerald-500/30">
                                Document Grounded
                              </span>
                            )}
                          </div>

                          {/* Read Aloud Button */}
                          <button
                            type="button"
                            onClick={() => toggleReadAloud(msg.content, index)}
                            className={`flex items-center gap-1 px-2 py-0.5 rounded-lg text-[11px] font-medium transition-colors cursor-pointer ${
                              speakingIndex === index
                                ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/40'
                                : 'text-stone-400 hover:text-white'
                            }`}
                            title={speakingIndex === index ? 'Stop Voice' : 'Read Aloud'}
                          >
                            {speakingIndex === index ? (
                              <>
                                <VolumeX className="w-3.5 h-3.5 text-emerald-400 animate-pulse" />
                                <span>Stop Voice</span>
                              </>
                            ) : (
                              <>
                                <Volume2 className="w-3.5 h-3.5 text-stone-400" />
                                <span>Read Aloud</span>
                              </>
                            )}
                          </button>
                        </div>
                      )}
                      <MarkdownMessage content={msg.content} isLightMode={false} />
                    </div>
                  </div>
                );
              })}

              {isThinking && (
                <div className="flex justify-start items-center gap-3">
                  <div className="bg-[#181818] border border-white/10 p-3 px-4 rounded-2xl rounded-bl-none flex items-center gap-2.5 shadow-md">
                    <div className="flex items-center gap-1.5">
                      <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
                      <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse [animation-delay:200ms]" />
                      <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse [animation-delay:400ms]" />
                    </div>
                    <span className="text-sm font-medium text-stone-300 tracking-wide">
                      Thinking...
                    </span>
                  </div>
                </div>
              )}
              <div ref={messagesEndRef} />
            </div>
          )}
        </div>

        {/* Bottom Input Bar */}
        <footer className="shrink-0 bg-black/30 backdrop-blur-md border-t border-white/10 p-3 md:p-4 z-20">
          <div className="max-w-3xl mx-auto space-y-2">
            {/* Attached Past Question Thumbnail inside input box */}
            {selectedImage && (
              <div className="flex items-center justify-between p-2 rounded-2xl bg-black/50 border border-emerald-500/40 text-xs text-emerald-300">
                <div className="flex items-center gap-2 overflow-hidden">
                  <img
                    src={selectedImage.data}
                    alt="Past Question Preview"
                    className="w-10 h-10 object-cover rounded-xl border border-white/20 shrink-0"
                  />
                  <div className="overflow-hidden">
                    <p className="font-semibold text-white truncate text-xs">{selectedImage.name}</p>
                    <p className="text-[11px] text-emerald-400">📷 Exam past question attached for analysis</p>
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => setSelectedImage(null)}
                  className="p-1.5 text-stone-400 hover:text-rose-400 hover:bg-white/10 rounded-lg cursor-pointer"
                  title="Remove attached photo"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>
            )}

            {/* Voice Dictation Banner */}
            {isListening && (
              <div className="flex items-center justify-between px-3 py-2 rounded-xl bg-rose-950/40 border border-rose-500/50 text-rose-300 text-xs animate-pulse">
                <div className="flex items-center gap-2">
                  <span className="w-2.5 h-2.5 rounded-full bg-rose-500 animate-ping" />
                  <span className="font-semibold">🎙️ Listening... Speak your past question</span>
                </div>
                <button
                  type="button"
                  onClick={toggleVoiceRecording}
                  className="text-rose-400 hover:text-white text-xs underline cursor-pointer"
                >
                  Done Speaking
                </button>
              </div>
            )}

            {speechError && (
              <div className="px-3 py-1.5 rounded-xl bg-amber-950/40 border border-amber-500/40 text-amber-300 text-[11px] flex items-center justify-between">
                <span>⚠️ {speechError}</span>
                <button onClick={() => setSpeechError(null)} className="text-amber-400 hover:text-white cursor-pointer ml-2">
                  <X className="w-3 h-3" />
                </button>
              </div>
            )}

            <form
              onSubmit={handleSubmit}
              className="bg-[#1c1c1c] border border-white/15 rounded-full flex items-center px-3 py-1.5 gap-2 shadow-xl focus-within:border-emerald-500/50"
            >
              {/* Single Unified Upload & Past Question Button */}
              <UploadZone
                onUploadSuccess={onUploadSuccess}
                onImageSelect={setSelectedImage}
                token={token}
                compact={true}
              />

              {/* Voice Dictation Button */}
              <button
                type="button"
                onClick={toggleVoiceRecording}
                className={`p-1.5 rounded-full transition-all cursor-pointer ${
                  isListening
                    ? 'bg-rose-500 text-white animate-pulse shadow-md'
                    : 'hover:bg-white/10 text-stone-400 hover:text-cyan-300'
                }`}
                title={isListening ? 'Stop recording voice' : 'Voice Dictation: Talk to explain your question'}
              >
                {isListening ? <MicOff className="w-4 h-4" /> : <Mic className="w-4 h-4 text-cyan-400" />}
              </button>

              <input
                ref={inputRef}
                type="text"
                value={inputText}
                onChange={(e) => setInputText(e.target.value)}
                placeholder={
                  selectedImage
                    ? 'Add any question details or press send to solve...'
                    : `Ask EduMind (${user.classYear || 'SS2'} ${user.course || 'Physics'})...`
                }
                className="flex-1 bg-transparent text-white placeholder:text-stone-500 outline-none text-sm md:text-base px-2 font-normal"
              />

              {isThinking ? (
                <button
                  type="button"
                  onClick={onStopGeneration}
                  className="h-9 px-3 rounded-full bg-rose-500/25 hover:bg-rose-500/35 border border-rose-500/45 text-rose-200 flex items-center gap-1.5 text-xs font-bold transition-all cursor-pointer shadow-md active:scale-95"
                  title="Stop AI Generation"
                >
                  <Square className="w-3.5 h-3.5 fill-current" />
                  <span>Stop</span>
                </button>
              ) : (
                <button
                  type="submit"
                  disabled={!inputText.trim() && !selectedImage}
                  className="w-9 h-9 rounded-full bg-emerald-500 hover:bg-emerald-400 disabled:opacity-40 text-black flex items-center justify-center transition-all cursor-pointer shrink-0 font-bold"
                  title="Send"
                >
                  <Send className="w-4 h-4" />
                </button>
              )}
            </form>
          </div>
        </footer>
      </div>
    </div>
  );
};
