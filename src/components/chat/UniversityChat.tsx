import React, { useState, useRef, useEffect } from 'react';
import { User, Message, RagDocument, ChatSession } from '../../types';
import {
  Plus,
  MessageSquare,
  LogOut,
  ArrowUp,
  X,
  Sparkles,
  Trash2,
  FileText,
  Copy,
  Check,
  BookOpen,
  Settings,
  SlidersHorizontal,
  ChevronDown,
  PanelLeft,
  PanelLeftClose,
  Square,
  UserCheck,
  Camera,
  Image as ImageIcon,
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
import {
  createSpeechRecognizer,
  speakText,
  stopSpeaking,
} from '../../lib/speech';

interface UniversityChatProps {
  user: User;
  messages: Message[];
  onSendMessage: (text: string, image?: { data: string; mimeType: string }) => void;
  isThinking: boolean;
  onLogout: () => void;
  token: string;
  activeDoc: RagDocument | null;
  onUploadSuccess: (info: any) => void;
  onClearDoc: () => void;
  onNewChat: () => void;
  onOpenSettings: () => void;
  onOpenProfile?: () => void;
  currentThemeId?: string;
  onStopGeneration?: () => void;
  sessions: ChatSession[];
  currentSessionId: string;
  onSelectSession: (sessionId: string) => void;
  onDeleteSession: (sessionId: string) => void;
}

export const UniversityChat: React.FC<UniversityChatProps> = ({
  user,
  messages,
  onSendMessage,
  isThinking,
  onLogout,
  token,
  activeDoc,
  onUploadSuccess,
  onClearDoc,
  onNewChat,
  onOpenSettings,
  onOpenProfile,
  currentThemeId,
  onStopGeneration,
  sessions,
  currentSessionId,
  onSelectSession,
  onDeleteSession,
}) => {
  const [inputText, setInputText] = useState('');
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [copiedMessageIndex, setCopiedMessageIndex] = useState<number | null>(null);
  const [selectedImage, setSelectedImage] = useState<{
    data: string;
    mimeType: string;
    name: string;
  } | null>(null);
  const [isListening, setIsListening] = useState(false);
  const [speechError, setSpeechError] = useState<string | null>(null);
  const [speakingIndex, setSpeakingIndex] = useState<number | null>(null);
  const [previewModalImage, setPreviewModalImage] = useState<string | null>(null);

  const chatContainerRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const imageInputRef = useRef<HTMLInputElement>(null);
  const recognizerRef = useRef<any>(null);
  const voicePrefixRef = useRef<string>('');

  // Default to open on large screens only
  useEffect(() => {
    if (typeof window !== 'undefined' && window.innerWidth >= 1024) {
      setSidebarOpen(true);
    }
  }, []);

  const scrollToBottom = (smooth = true) => {
    if (chatContainerRef.current) {
      chatContainerRef.current.scrollTo({
        top: chatContainerRef.current.scrollHeight,
        behavior: smooth ? 'smooth' : 'auto',
      });
    }
  };

  useEffect(() => {
    if (messages.length > 0 || isThinking) {
      scrollToBottom(true);
    }
  }, [messages.length, isThinking]);

  // Clean up speech recognition & audio synthesis on unmount
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
        if (textareaRef.current) {
          textareaRef.current.style.height = 'auto';
          textareaRef.current.style.height = `${Math.min(textareaRef.current.scrollHeight, 180)}px`;
        }
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
      } catch (err: any) {
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

  const handleSubmit = (e?: React.FormEvent) => {
    if (e) e.preventDefault();
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
    if (textareaRef.current) {
      textareaRef.current.style.height = 'auto';
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSubmit();
    }
  };

  const handleCopyMessage = (text: string, index: number) => {
    navigator.clipboard.writeText(text);
    setCopiedMessageIndex(index);
    setTimeout(() => setCopiedMessageIndex(null), 2000);
  };

  return (
    <div className="flex h-full w-full overflow-hidden bg-transparent text-stone-200">
      {/* Hidden file input for unified attachments (Documents or Past Question images) */}
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

      {/* Left Sidebar Backdrop on Mobile */}
      {sidebarOpen && (
        <div
          onClick={() => setSidebarOpen(false)}
          className="fixed inset-0 bg-black/70 backdrop-blur-xs z-30 lg:hidden"
        />
      )}

      {/* Left Sidebar */}
      <aside
        className={`fixed lg:static top-0 bottom-0 left-0 z-40 w-72 bg-[#121212] border-r border-white/10 flex flex-col transition-transform duration-200 ease-in-out ${
          sidebarOpen ? 'translate-x-0' : '-translate-x-full lg:hidden'
        }`}
      >
        {/* Top Branding & New Chat */}
        <div className="p-3.5 border-b border-white/10 flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <VortexLogo size="xs" showText={false} />
            <div className="leading-tight">
              <span className="font-bold text-white text-sm tracking-tight block">EduMind AI</span>
              <span className="text-[10px] text-cyan-400 font-semibold block uppercase tracking-wider">
                {user.classYear?.includes('600L') ? '600L Clinical / MBBS' : user.classYear || 'University'}
              </span>
            </div>
          </div>
          <button
            onClick={() => setSidebarOpen(false)}
            className="p-1.5 text-stone-400 hover:text-white rounded-lg hover:bg-white/5 cursor-pointer lg:hidden"
            title="Close sidebar"
          >
            <PanelLeftClose className="w-5 h-5" />
          </button>
        </div>

        {/* New Session Button */}
        <div className="p-3">
          <button
            onClick={() => {
              onNewChat();
              if (window.innerWidth < 1024) setSidebarOpen(false);
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
              No previous study sessions. Start a discussion!
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
                      if (window.innerWidth < 1024) setSidebarOpen(false);
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
                {activeDoc.chunksCount} knowledge chunks indexed into memory.
              </p>
            </div>
          )}
        </div>

        {/* Bottom User Avatar, Profile, Settings & Explicit Logout */}
        <div className="p-3.5 border-t border-white/10 bg-[#141414] space-y-2.5">
          <div
            onClick={onOpenSettings}
            className="flex items-center gap-2.5 overflow-hidden cursor-pointer hover:opacity-85 transition-opacity"
            title="Settings & Student Profile"
          >
            <div className="w-9 h-9 rounded-xl bg-emerald-500/20 border border-emerald-500/40 flex items-center justify-center text-emerald-400 text-xs font-bold shrink-0">
              {user.fullName ? user.fullName[0].toUpperCase() : 'U'}
            </div>
            <div className="overflow-hidden text-left flex-1 min-w-0">
              <p className="text-xs font-semibold text-white truncate">{user.fullName || 'University Student'}</p>
              <p className="text-[11px] text-emerald-400 font-medium truncate">
                {user.classYear || '600L'} • {user.course || 'Medicine & Surgery'}
              </p>
            </div>
          </div>

          <div className="space-y-1.5">
            <div className="grid grid-cols-2 gap-2">
              <button
                type="button"
                onClick={onOpenSettings}
                className="px-2.5 py-1.5 rounded-xl bg-white/5 hover:bg-white/10 border border-white/10 text-stone-300 hover:text-white transition-colors cursor-pointer text-xs font-semibold flex items-center justify-center gap-1.5"
                title="Academic Settings & Persona"
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

      {/* Main Chat Area */}
      <div className="flex-1 flex flex-col h-full overflow-hidden relative w-full min-w-0">
        {/* Background Watermark */}
        <BackgroundWatermark />

        {/* Top bar with 3-dash menu toggle and logout */}
        <header className="h-14 border-b border-white/10 flex items-center justify-between px-3 sm:px-4 shrink-0 bg-black/40 backdrop-blur-md z-20">
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

        {/* Chat Stream / Empty Hero State */}
        <div ref={chatContainerRef} className="flex-1 overflow-y-auto w-full min-h-0 relative z-10">
          {messages.length === 0 ? (
            <div className="max-w-2xl mx-auto w-full px-4 py-8 flex flex-col items-center justify-center min-h-full space-y-5 sm:space-y-6">
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
                    Ask any question, attach exam past questions for step-by-step working, or dictate your thoughts with voice.
                  </p>
                </div>
              </div>

              {/* High-Yield AI Prompt Suggestions */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5 w-full">
                {[
                  {
                    title: '📎 Upload Notes or Past Question Photo',
                    desc: 'Upload lecture slides, PDF documents, or snap a photo of any exam past question to solve.',
                  },
                  {
                    title: '🎙️ Voice Dictate My Thoughts',
                    desc: 'Tap the microphone to speak your question or explain what you find confusing.',
                  },
                  {
                    title: '🔬 Derive Step-by-Step Solutions',
                    desc: 'Break down complex mathematical, clinical, engineering, and scientific problems.',
                  },
                  {
                    title: '🎯 Generate Exam Practice Drill',
                    desc: 'Create targeted multiple-choice and theoretical questions aligned with your syllabus.',
                  },
                ].map((item, idx) => (
                  <button
                    key={idx}
                    type="button"
                    onClick={() => {
                      if (item.title.includes('Upload Notes or Past Question')) {
                        imageInputRef.current?.click();
                      } else if (item.title.includes('Voice Dictate')) {
                        toggleVoiceRecording();
                      } else {
                        onSendMessage(item.desc);
                      }
                    }}
                    className="p-3.5 rounded-2xl bg-[#141414] hover:bg-[#1a1a1a] border border-white/10 hover:border-emerald-500/40 text-left transition-all cursor-pointer group flex flex-col justify-between shadow-xs hover:shadow-md"
                  >
                    <span className="text-xs font-bold text-white group-hover:text-emerald-400 transition-colors">
                      {item.title}
                    </span>
                    <span className="text-[11px] text-stone-400 mt-1 leading-relaxed">{item.desc}</span>
                  </button>
                ))}
              </div>
            </div>
          ) : (
            <div className="max-w-3xl mx-auto w-full p-3 sm:p-4 space-y-6 pb-6">
              {messages.map((msg, index) => {
                const isUser = msg.role === 'user';
                return (
                  <div
                    key={index}
                    className={`flex ${isUser ? 'justify-end' : 'justify-start'} animate-in fade-in duration-200`}
                  >
                    {isUser ? (
                      <div className="flex flex-col items-end max-w-[88%] sm:max-w-[80%] space-y-1.5">
                        {/* Attached Past Question Image preview */}
                        {(msg.imageUrl || msg.image?.data) && (
                          <div
                            onClick={() => setPreviewModalImage(msg.imageUrl || msg.image?.data || null)}
                            className="relative overflow-hidden rounded-2xl border border-white/20 max-w-xs shadow-md cursor-pointer group"
                            title="Click to enlarge past question photo"
                          >
                            <img
                              src={msg.imageUrl || msg.image?.data}
                              alt="Exam past question / diagram"
                              className="max-h-60 object-contain rounded-2xl bg-black/50 transition-transform group-hover:scale-[1.02]"
                            />
                            <div className="absolute bottom-1.5 right-1.5 bg-black/80 backdrop-blur-xs text-[10px] text-stone-200 px-2 py-0.5 rounded-md flex items-center gap-1 border border-white/10">
                              <Maximize2 className="w-3 h-3 text-emerald-400" />
                              <span>Exam Past Question</span>
                            </div>
                          </div>
                        )}

                        {msg.attachedDoc && (
                          <div className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-xl bg-white/10 border border-white/15 text-stone-300 text-xs">
                            <FileText className="w-3.5 h-3.5 text-emerald-400 shrink-0" />
                            <span className="truncate max-w-[180px] sm:max-w-xs">{msg.attachedDoc}</span>
                          </div>
                        )}
                        <div className="bg-[#2f2f2f] text-white rounded-3xl rounded-br-md px-4 sm:px-5 py-3 sm:py-3.5 text-sm md:text-base leading-relaxed border border-white/10 font-normal shadow-sm">
                          {msg.content}
                        </div>
                      </div>
                    ) : (
                      <div className="w-full space-y-2">
                        <div className="flex items-center gap-2 text-xs font-semibold text-white">
                          <div className="w-5 h-5 rounded-md bg-emerald-500/20 border border-emerald-500/30 flex items-center justify-center text-emerald-400">
                            <Sparkles className="w-3 h-3" />
                          </div>
                          <span className="font-bold tracking-tight">EduMind AI</span>
                          {msg.ragSource && (
                            <span className="text-[10px] bg-emerald-950/60 text-emerald-300 border border-emerald-500/30 px-2 py-0.5 rounded-full">
                              Grounded
                            </span>
                          )}
                        </div>
                        <div className="pl-2 sm:pl-7">
                          <MarkdownMessage content={msg.content} isLightMode={false} />
                          {/* Message Action Footer (Copy + Read Aloud) */}
                          <div className="flex items-center gap-3 mt-2.5 pt-1 text-xs text-stone-400">
                            <button
                              onClick={() => handleCopyMessage(msg.content, index)}
                              className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg text-stone-400 hover:text-white hover:bg-white/10 transition-colors cursor-pointer text-[11px]"
                              title="Copy full answer"
                            >
                              {copiedMessageIndex === index ? (
                                <>
                                  <Check className="w-3.5 h-3.5 text-emerald-400" />
                                  <span className="text-emerald-400">Copied</span>
                                </>
                              ) : (
                                <>
                                  <Copy className="w-3.5 h-3.5" />
                                  <span>Copy</span>
                                </>
                              )}
                            </button>

                            {/* Voice Read Aloud Button */}
                            <button
                              type="button"
                              onClick={() => toggleReadAloud(msg.content, index)}
                              className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-lg text-[11px] font-medium transition-colors cursor-pointer ${
                                speakingIndex === index
                                  ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/40'
                                  : 'text-stone-400 hover:text-white hover:bg-white/10'
                              }`}
                              title={speakingIndex === index ? 'Stop Voice Narration' : 'Listen to Voice Explanation'}
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

                            {/* One-Click Re-query Button for Notices/Fallbacks */}
                            {(msg.content.includes('Notice') || msg.content.includes('503') || msg.content.includes('Re-query')) && (
                              <button
                                type="button"
                                onClick={() => {
                                  const lastUserMsg = [...messages.slice(0, index)].reverse().find((m) => m.role === 'user');
                                  if (lastUserMsg && lastUserMsg.content) {
                                    onSendMessage(lastUserMsg.content);
                                  }
                                }}
                                className="inline-flex items-center gap-1.5 px-3 py-1 rounded-lg text-[11px] font-bold bg-amber-500/20 hover:bg-amber-500/30 border border-amber-500/40 text-amber-300 hover:text-amber-100 transition-colors cursor-pointer shadow-xs active:scale-95"
                                title="Re-query EduMind AI live engines"
                              >
                                <Sparkles className="w-3 h-3 text-amber-400" />
                                <span>Re-query EduMind AI</span>
                              </button>
                            )}
                          </div>
                        </div>
                      </div>
                    )}
                  </div>
                );
              })}

              {isThinking && (
                <div className="flex items-center pl-2 sm:pl-7 py-2 pr-4">
                  <div className="flex items-center gap-2.5">
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
            </div>
          )}
        </div>

        {/* Bottom Input Area */}
        <footer className="shrink-0 bg-black/30 backdrop-blur-md border-t border-white/10 p-2.5 sm:p-4 z-20">
          <div className="max-w-3xl mx-auto w-full">
            <form
              onSubmit={handleSubmit}
              className="bg-[#18181b]/80 backdrop-blur-md border border-white/15 rounded-3xl p-2.5 sm:p-3 shadow-2xl focus-within:border-emerald-500/50 focus-within:ring-1 focus-within:ring-emerald-500/30 transition-all flex flex-col gap-2"
            >
              {/* Attached Document Pill inside the box */}
              {activeDoc && (
                <div className="px-1 pt-0.5">
                  <UploadZone
                    onUploadSuccess={onUploadSuccess}
                    token={token}
                    activeDoc={activeDoc}
                    onClearDoc={onClearDoc}
                  />
                </div>
              )}

              {/* Attached Past Question Image Thumbnail inside the box */}
              {selectedImage && (
                <div className="flex items-center justify-between p-2 rounded-2xl bg-black/40 border border-emerald-500/40 text-xs text-emerald-300">
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

              {/* Voice Recording In-Progress Banner */}
              {isListening && (
                <div className="flex items-center justify-between px-3 py-2 rounded-xl bg-rose-950/40 border border-rose-500/50 text-rose-300 text-xs animate-pulse">
                  <div className="flex items-center gap-2">
                    <span className="w-2.5 h-2.5 rounded-full bg-rose-500 animate-ping" />
                    <span className="font-semibold">🎙️ Listening... Speak your thoughts or past question</span>
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

              {/* Textarea */}
              <textarea
                ref={textareaRef}
                rows={1}
                value={inputText}
                onChange={(e) => {
                  setInputText(e.target.value);
                  e.target.style.height = 'auto';
                  e.target.style.height = `${Math.min(e.target.scrollHeight, 180)}px`;
                }}
                onKeyDown={handleKeyDown}
                placeholder={
                  selectedImage
                    ? 'Add any notes or specific question numbers, or press send to solve...'
                    : 'Ask anything, attach past question photo, or speak your question...'
                }
                className="w-full bg-transparent text-white placeholder:text-stone-400 outline-none text-sm md:text-base px-2 resize-none max-h-44 leading-relaxed"
              />

              {/* Bottom Controls Row */}
              <div className="flex items-center justify-between pt-1">
                <div className="flex items-center gap-1.5">
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
                    className={`p-1.5 sm:px-2.5 sm:py-1.5 rounded-xl transition-all cursor-pointer flex items-center gap-1.5 text-xs ${
                      isListening
                        ? 'bg-rose-500 text-white font-bold animate-pulse shadow-md'
                        : 'bg-white/5 hover:bg-white/10 border border-white/10 text-stone-300 hover:text-cyan-300'
                    }`}
                    title={isListening ? 'Stop recording voice' : 'Voice Dictation: Talk to explain your question'}
                  >
                    {isListening ? <MicOff className="w-4 h-4" /> : <Mic className="w-4 h-4 text-cyan-400" />}
                    <span className="hidden sm:inline font-medium">
                      {isListening ? 'Listening...' : 'Voice'}
                    </span>
                  </button>
                </div>

                {isThinking ? (
                  <button
                    type="button"
                    onClick={onStopGeneration}
                    className="h-8 px-3 rounded-full bg-rose-500/25 hover:bg-rose-500/35 border border-rose-500/45 text-rose-200 flex items-center gap-1.5 text-xs font-bold transition-all cursor-pointer shadow-md active:scale-95"
                    title="Stop AI Generation"
                  >
                    <Square className="w-3 h-3 fill-current" />
                    <span>Stop</span>
                  </button>
                ) : (
                  <button
                    type="submit"
                    disabled={!inputText.trim() && !selectedImage}
                    className="w-8 h-8 rounded-full bg-white hover:bg-stone-200 disabled:opacity-20 disabled:hover:bg-white text-black flex items-center justify-center transition-all cursor-pointer shrink-0 shadow-md font-bold"
                    title="Send message"
                  >
                    <ArrowUp className="w-4 h-4 stroke-[2.5]" />
                  </button>
                )}
              </div>
            </form>
            <p className="text-center text-[11px] text-stone-500 pt-1.5 select-none">
              EduMind AI with Pre-Delivery Verification Guard. All academic responses audited against curriculum standards.
            </p>
          </div>
        </footer>
      </div>
    </div>
  );
};
