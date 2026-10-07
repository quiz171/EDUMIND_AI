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
  Paperclip,
  Copy,
  Check,
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
  Briefcase,
  GraduationCap,
  Compass,
  Zap,
  HelpCircle,
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

interface GeneralChatProps {
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

export const GeneralChat: React.FC<GeneralChatProps> = ({
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
  const [showAttachMenu, setShowAttachMenu] = useState(false);

  const chatContainerRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const imageInputRef = useRef<HTMLInputElement>(null);
  const docInputRef = useRef<HTMLInputElement>(null);
  const unifiedInputRef = useRef<HTMLInputElement>(null);
  const attachMenuRef = useRef<HTMLDivElement>(null);
  const recognizerRef = useRef<any>(null);
  const voicePrefixRef = useRef<string>('');

  // Close attach menu when clicking outside
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (attachMenuRef.current && !attachMenuRef.current.contains(e.target as Node)) {
        setShowAttachMenu(false);
      }
    };
    if (showAttachMenu) {
      document.addEventListener('mousedown', handleClickOutside);
    }
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, [showAttachMenu]);

  const handleDocUpload = async (file: File) => {
    if (!file) return;
    const formData = new FormData();
    formData.append('document', file);
    try {
      const res = await fetch('/api/upload', {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}` },
        body: formData,
      });
      const data = await res.json();
      if (res.ok) {
        onUploadSuccess(data);
      } else {
        alert(data.error || 'Upload failed');
      }
    } catch {
      alert('Upload failed. Try again.');
    }
  };

  const handleUnifiedFileSelect = (file: File) => {
    if (!file) return;
    if (file.type.startsWith('image/')) {
      const reader = new FileReader();
      reader.onload = (e) => {
        setSelectedImage({
          data: e.target?.result as string,
          mimeType: file.type || 'image/jpeg',
          name: file.name,
        });
      };
      reader.readAsDataURL(file);
    } else {
      handleDocUpload(file);
    }
  };

  // Default to open on large screens
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
  }, [messages, isThinking]);

  // Clean up speech synthesis & recognition on unmount
  useEffect(() => {
    return () => {
      stopSpeaking();
      if (recognizerRef.current) {
        recognizerRef.current.abort();
      }
    };
  }, []);

  // Textarea auto-resize
  useEffect(() => {
    if (textareaRef.current) {
      textareaRef.current.style.height = 'auto';
      textareaRef.current.style.height = `${Math.min(textareaRef.current.scrollHeight, 180)}px`;
    }
  }, [inputText]);

  // Voice Speech Recognition toggle
  const toggleVoiceRecording = () => {
    if (isListening) {
      if (recognizerRef.current) {
        recognizerRef.current.stop();
      }
      setIsListening(false);
      return;
    }

    setSpeechError(null);
    voicePrefixRef.current = inputText ? `${inputText.trim()} ` : '';

    const recognizer = createSpeechRecognizer(
      (transcript) => {
        const prefix = voicePrefixRef.current;
        const spoken = transcript.full;
        const updated = prefix ? `${prefix}${spoken}` : spoken;
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

    if (!recognizer) {
      setSpeechError('Speech recognition is not supported in this browser. Try Google Chrome or Edge.');
      return;
    }

    recognizerRef.current = recognizer;
    try {
      recognizer.start();
      setIsListening(true);
    } catch (err: any) {
      setSpeechError('Could not access microphone.');
      setIsListening(false);
    }
  };

  // Text to Speech Read Aloud toggle
  const toggleReadAloud = (text: string, index: number) => {
    if (speakingIndex === index) {
      stopSpeaking();
      setSpeakingIndex(null);
      return;
    }

    stopSpeaking();
    setSpeakingIndex(index);
    speakText(
      text,
      () => setSpeakingIndex(null),
      () => setSpeakingIndex(null)
    );
  };

  const handleCopyMessage = (content: string, index: number) => {
    navigator.clipboard.writeText(content);
    setCopiedMessageIndex(index);
    setTimeout(() => setCopiedMessageIndex(null), 2000);
  };

  const handleImageSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (!file.type.startsWith('image/')) {
      alert('Please upload an image file (PNG, JPG, WEBP).');
      return;
    }

    if (file.size > 12 * 1024 * 1024) {
      alert('Image file size must be less than 12MB.');
      return;
    }

    const reader = new FileReader();
    reader.onload = () => {
      setSelectedImage({
        data: reader.result as string,
        mimeType: file.type,
        name: file.name,
      });
    };
    reader.readAsDataURL(file);
    e.target.value = '';
  };

  const removeSelectedImage = () => {
    setSelectedImage(null);
  };

  const handleSubmit = (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    if (isThinking) return;

    const trimmed = inputText.trim();
    if (!trimmed && !selectedImage) return;

    if (isListening && recognizerRef.current) {
      recognizerRef.current.stop();
      setIsListening(false);
    }

    onSendMessage(trimmed, selectedImage ? { data: selectedImage.data, mimeType: selectedImage.mimeType } : undefined);
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

  return (
    <div className="flex h-screen w-full overflow-hidden bg-transparent text-stone-100 font-sans select-text">
      {/* Background Watermark */}
      <BackgroundWatermark />

      {/* Image Preview Modal */}
      {previewModalImage && (
        <div
          className="fixed inset-0 z-50 bg-black/85 backdrop-blur-md flex items-center justify-center p-4 animate-in fade-in duration-150"
          onClick={() => setPreviewModalImage(null)}
        >
          <div className="relative max-w-4xl max-h-[90vh] flex flex-col items-center">
            <button
              onClick={() => setPreviewModalImage(null)}
              className="absolute -top-12 right-0 p-2 text-stone-300 hover:text-white bg-white/10 hover:bg-white/20 rounded-full transition-colors cursor-pointer"
            >
              <X className="w-6 h-6" />
            </button>
            <img
              src={previewModalImage}
              alt="Enlarged attachment preview"
              className="max-h-[82vh] w-auto object-contain rounded-2xl border border-white/20 shadow-2xl"
              onClick={(e) => e.stopPropagation()}
            />
          </div>
        </div>
      )}

      {/* Mobile Sidebar Backdrop */}
      {sidebarOpen && (
        <div
          onClick={() => setSidebarOpen(false)}
          className="fixed inset-0 bg-black/60 backdrop-blur-xs z-30 lg:hidden"
        />
      )}

      {/* Left Sidebar */}
      <aside
        className={`fixed lg:static top-0 bottom-0 left-0 z-40 w-72 flex flex-col border-r border-white/10 bg-[#09090b]/95 lg:bg-[#0c0c0e]/85 backdrop-blur-xl transition-all duration-300 ease-in-out shrink-0 ${
          sidebarOpen ? 'translate-x-0' : '-translate-x-full lg:hidden'
        }`}
      >
        {/* Sidebar Header */}
        <div className="p-4 border-b border-white/10 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <VortexLogo size="sm" showText={false} />
            <div>
              <span className="font-bold text-sm text-white tracking-tight">Vortex AI</span>
              <span className="block text-[10px] text-cyan-400 font-medium">General Assistant</span>
            </div>
          </div>
          <button
            onClick={() => setSidebarOpen(false)}
            className="p-1.5 rounded-lg text-stone-400 hover:text-white hover:bg-white/10 lg:hidden cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* New Chat Button */}
        <div className="p-3">
          <button
            type="button"
            onClick={() => {
              onNewChat();
              if (window.innerWidth < 1024) setSidebarOpen(false);
            }}
            className="w-full flex items-center justify-center gap-2 py-2.5 px-4 rounded-xl bg-gradient-to-r from-cyan-500/20 to-indigo-500/20 hover:from-cyan-500/30 hover:to-indigo-500/30 border border-cyan-500/30 text-white font-semibold text-xs tracking-wide transition-all shadow-sm hover:shadow-cyan-500/10 cursor-pointer active:scale-98"
          >
            <Plus className="w-4 h-4 text-cyan-400" />
            <span>New Chat</span>
          </button>
        </div>

        {/* Chat Sessions History List */}
        <div className="flex-1 overflow-y-auto px-3 py-2 space-y-1">
          <div className="text-[10px] uppercase font-bold text-stone-500 tracking-wider px-2 py-1 flex items-center justify-between">
            <span>Conversations</span>
            <span className="text-[9px] bg-white/10 px-1.5 py-0.5 rounded-full">{sessions.length}</span>
          </div>

          {sessions.length === 0 ? (
            <div className="text-center py-8 px-4 text-xs text-stone-500">
              <MessageSquare className="w-6 h-6 mx-auto mb-2 opacity-40 text-stone-400" />
              <p>No conversations yet</p>
              <p className="text-[11px] text-stone-600 mt-1">Start a new chat to begin</p>
            </div>
          ) : (
            sessions.map((sess) => {
              const isActive = sess.id === currentSessionId;
              return (
                <div
                  key={sess.id}
                  className={`group relative flex items-center justify-between rounded-xl px-3 py-2 text-xs transition-all cursor-pointer ${
                    isActive
                      ? 'bg-white/15 text-white font-medium border border-white/20 shadow-xs'
                      : 'text-stone-400 hover:text-stone-200 hover:bg-white/5'
                  }`}
                  onClick={() => {
                    onSelectSession(sess.id);
                    if (window.innerWidth < 1024) setSidebarOpen(false);
                  }}
                >
                  <div className="flex items-center gap-2 overflow-hidden pr-2">
                    <MessageSquare className={`w-3.5 h-3.5 shrink-0 ${isActive ? 'text-cyan-400' : 'text-stone-500'}`} />
                    <span className="truncate">{sess.title || 'Conversation'}</span>
                  </div>
                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      onDeleteSession(sess.id);
                    }}
                    className="opacity-0 group-hover:opacity-100 p-1 rounded-md text-stone-400 hover:text-rose-400 hover:bg-rose-500/10 transition-all cursor-pointer"
                    title="Delete conversation"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                </div>
              );
            })
          )}
        </div>

        {/* Sidebar Footer / User Profile */}
        <div className="p-3 border-t border-white/10 space-y-2 bg-black/20">
          <div className="flex items-center justify-between">
            <div
              onClick={onOpenProfile || onOpenSettings}
              className="flex items-center gap-2.5 overflow-hidden cursor-pointer hover:opacity-85 transition-opacity"
            >
              <div className="w-8 h-8 rounded-full bg-gradient-to-tr from-cyan-600 to-indigo-600 flex items-center justify-center font-bold text-xs text-white shrink-0 shadow-md">
                {(user.fullName || user.email || 'U').charAt(0).toUpperCase()}
              </div>
              <div className="overflow-hidden text-left">
                <p className="text-xs font-semibold text-white truncate">{user.fullName || 'User'}</p>
                <p className="text-[10px] text-stone-400 truncate">{user.email}</p>
              </div>
            </div>

            <button
              type="button"
              onClick={onOpenSettings}
              className="p-1.5 rounded-lg text-stone-400 hover:text-white hover:bg-white/10 transition-colors cursor-pointer"
              title="Settings & Themes"
            >
              <Settings className="w-4 h-4" />
            </button>
          </div>

          <div className="grid grid-cols-2 gap-2 pt-1">
            <button
              type="button"
              onClick={onOpenSettings}
              className="w-full py-1.5 px-2 rounded-lg bg-white/5 hover:bg-white/10 text-stone-300 text-[11px] font-medium flex items-center justify-center gap-1.5 transition-colors cursor-pointer border border-white/5"
            >
              <SlidersHorizontal className="w-3.5 h-3.5 text-stone-400" />
              <span>Settings</span>
            </button>
            <button
              type="button"
              onClick={onLogout}
              className="w-full py-1.5 px-2 rounded-lg bg-rose-500/10 hover:bg-rose-500/20 text-rose-300 text-[11px] font-medium flex items-center justify-center gap-1.5 transition-colors cursor-pointer border border-rose-500/20"
            >
              <LogOut className="w-3.5 h-3.5 text-rose-400" />
              <span>Log Out</span>
            </button>
          </div>
        </div>
      </aside>

      {/* Main Chat Workspace */}
      <main className="flex-1 flex flex-col h-full min-w-0 relative">
        {/* Top Header */}
        <header className="h-14 border-b border-white/10 flex items-center justify-between px-3 sm:px-6 bg-black/20 backdrop-blur-md shrink-0 z-20">
          <div className="flex items-center gap-3">
            <button
              type="button"
              onClick={() => setSidebarOpen(!sidebarOpen)}
              className="p-2 rounded-xl text-stone-400 hover:text-white hover:bg-white/10 transition-colors cursor-pointer"
              title={sidebarOpen ? 'Close sidebar' : 'Open sidebar'}
            >
              {sidebarOpen ? <PanelLeftClose className="w-5 h-5" /> : <PanelLeft className="w-5 h-5" />}
            </button>

            <div className="flex items-center gap-2">
              <VortexLogo size="sm" showText={false} />
              <span className="font-bold text-sm text-white tracking-tight">Vortex AI</span>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={onLogout}
              className="p-2 rounded-xl text-stone-400 hover:text-rose-400 hover:bg-rose-500/10 transition-colors cursor-pointer"
              title="Log Out"
            >
              <LogOut className="w-4 h-4" />
            </button>
          </div>
        </header>

        {/* Messages Container / Empty Hero State */}
        <div ref={chatContainerRef} className="flex-1 overflow-y-auto w-full min-h-0 relative z-10">
          {messages.length === 0 ? (
            <div className="max-w-2xl mx-auto w-full px-4 py-8 flex flex-col items-center justify-center min-h-full space-y-6">
              {/* Hero Logo and Title */}
              <div className="text-center space-y-3 flex flex-col items-center">
                <div className="relative">
                  <VortexLogo size="lg" showText={false} />
                  <div className="absolute -inset-1 rounded-full bg-cyan-500/20 blur-xl pointer-events-none" />
                </div>

                <div className="space-y-1.5">
                  <h1 className="text-2xl sm:text-3.5xl font-extrabold tracking-tight text-white">
                    How can I help you today?
                  </h1>
                  <p className="text-stone-400 text-xs sm:text-sm max-w-md mx-auto leading-relaxed">
                    Your versatile AI assistant for professional work, everyday questions, writing, coding, brainstorming, and research.
                  </p>
                </div>
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
                        {/* Attached Image preview */}
                        {(msg.imageUrl || msg.image?.data) && (
                          <div
                            onClick={() => setPreviewModalImage(msg.imageUrl || msg.image?.data || null)}
                            className="relative overflow-hidden rounded-2xl border border-white/20 max-w-xs shadow-md cursor-pointer group"
                            title="Click to enlarge image"
                          >
                            <img
                              src={msg.imageUrl || msg.image?.data}
                              alt="Attachment preview"
                              className="max-h-60 object-contain rounded-2xl bg-black/50 transition-transform group-hover:scale-[1.02]"
                            />
                            <div className="absolute bottom-1.5 right-1.5 bg-black/80 backdrop-blur-xs text-[10px] text-stone-200 px-2 py-0.5 rounded-md flex items-center gap-1 border border-white/10">
                              <Maximize2 className="w-3 h-3 text-cyan-400" />
                              <span>Attached Image</span>
                            </div>
                          </div>
                        )}

                        {/* Attached document badge */}
                        {msg.attachedDoc && (
                          <div className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-xl bg-white/10 border border-white/15 text-stone-300 text-xs">
                            <FileText className="w-3.5 h-3.5 text-cyan-400 shrink-0" />
                            <span className="truncate max-w-[180px] sm:max-w-xs">{msg.attachedDoc}</span>
                          </div>
                        )}

                        {Boolean(
                          msg.content &&
                            msg.content.trim() &&
                            !msg.content.includes('[Attached Exam Past Question Photo]') &&
                            !msg.content.includes('[Attached Image]')
                        ) && (
                          <div className="bg-gradient-to-r from-cyan-600 to-indigo-600 text-white px-4 py-2.5 rounded-3xl rounded-br-xs text-sm leading-relaxed shadow-md">
                            <p className="whitespace-pre-wrap select-text">{msg.content}</p>
                          </div>
                        )}
                      </div>
                    ) : (
                      <div className="flex flex-col items-start max-w-[92%] sm:max-w-[88%] space-y-1">
                        {/* AI Header */}
                        <div className="flex items-center gap-2 mb-1 pl-1">
                          <div className="w-5 h-5 rounded-full bg-gradient-to-tr from-cyan-500 to-indigo-500 flex items-center justify-center text-[10px] font-bold text-white shadow-xs">
                            <Compass className="w-3 h-3" />
                          </div>
                          <span className="text-xs font-semibold text-white tracking-wide">Vortex AI</span>
                          <span className="text-[10px] text-stone-400">General</span>
                        </div>

                        {/* AI Content */}
                        <div className="pl-2 sm:pl-7 w-full">
                          <MarkdownMessage content={msg.content} isLightMode={false} />

                          {/* Message Action Footer (Copy + Read Aloud) */}
                          <div className="flex items-center gap-3 mt-2.5 pt-1 text-xs text-stone-400">
                            <button
                              onClick={() => handleCopyMessage(msg.content, index)}
                              className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg text-stone-400 hover:text-white hover:bg-white/10 transition-colors cursor-pointer text-[11px]"
                              title="Copy answer"
                            >
                              {copiedMessageIndex === index ? (
                                <>
                                  <Check className="w-3.5 h-3.5 text-cyan-400" />
                                  <span className="text-cyan-400">Copied</span>
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
                                  ? 'bg-cyan-500/20 text-cyan-300 border border-cyan-500/40'
                                  : 'text-stone-400 hover:text-white hover:bg-white/10'
                              }`}
                              title={speakingIndex === index ? 'Stop Voice Narration' : 'Listen to Voice Explanation'}
                            >
                              {speakingIndex === index ? (
                                <>
                                  <VolumeX className="w-3.5 h-3.5 text-cyan-400 animate-pulse" />
                                  <span>Stop Voice</span>
                                </>
                              ) : (
                                <>
                                  <Volume2 className="w-3.5 h-3.5 text-stone-400" />
                                  <span>Read Aloud</span>
                                </>
                              )}
                            </button>

                            {/* One-Click Re-query */}
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
                              >
                                <Sparkles className="w-3 h-3 text-amber-400" />
                                <span>Re-query AI</span>
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
                      <span className="w-2 h-2 rounded-full bg-cyan-400 animate-pulse" />
                      <span className="w-2 h-2 rounded-full bg-cyan-400 animate-pulse [animation-delay:200ms]" />
                      <span className="w-2 h-2 rounded-full bg-cyan-400 animate-pulse [animation-delay:400ms]" />
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
              className="bg-[#18181b]/80 backdrop-blur-md border border-white/15 rounded-3xl p-2.5 sm:p-3 shadow-2xl focus-within:border-cyan-500/50 focus-within:ring-1 focus-within:ring-cyan-500/30 transition-all flex flex-col gap-2"
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

              {/* Attached Image Thumbnail */}
              {selectedImage && (
                <div className="flex items-center justify-between p-2 rounded-2xl bg-black/40 border border-cyan-500/40 text-xs text-cyan-300">
                  <div className="flex items-center gap-2 overflow-hidden">
                    <img
                      src={selectedImage.data}
                      alt="Attachment Preview"
                      className="w-10 h-10 object-cover rounded-xl border border-white/20 shrink-0"
                    />
                    <div className="overflow-hidden">
                      <p className="font-semibold text-white truncate text-xs">{selectedImage.name}</p>
                      <p className="text-[11px] text-cyan-400">📷 Image attached for AI analysis</p>
                    </div>
                  </div>
                  <button
                    type="button"
                    onClick={removeSelectedImage}
                    className="p-1 rounded-lg text-stone-400 hover:text-white hover:bg-white/10 transition-colors cursor-pointer"
                  >
                    <X className="w-4 h-4" />
                  </button>
                </div>
              )}

              {/* Textarea Input */}
              <div className="relative flex items-end">
                <textarea
                  ref={textareaRef}
                  value={inputText}
                  onChange={(e) => setInputText(e.target.value)}
                  onKeyDown={handleKeyDown}
                  placeholder={
                    isListening
                      ? 'Listening to your voice... Speak clearly'
                      : 'Ask anything, draft emails, write code, or request assistance... (Enter to send)'
                  }
                  rows={1}
                  className="w-full bg-transparent text-white placeholder:text-stone-500 text-sm sm:text-base resize-none focus:outline-none px-2 py-1 max-h-44 leading-relaxed"
                />
              </div>

              {/* Speech Error Banner */}
              {speechError && (
                <div className="px-2 py-1 text-xs text-rose-400 flex items-center justify-between">
                  <span>{speechError}</span>
                  <button
                    type="button"
                    onClick={() => setSpeechError(null)}
                    className="text-stone-400 hover:text-white text-[11px] ml-2 underline"
                  >
                    dismiss
                  </button>
                </div>
              )}

              {/* Action Toolbar */}
              <div className="flex items-center justify-between pt-1 border-t border-white/5">
                <div className="flex items-center gap-1">
                  {/* Unified Attach (Photo & Document Together) */}
                  <div className="relative" ref={attachMenuRef}>
                    {showAttachMenu && (
                      <div className="absolute bottom-full left-0 mb-2 w-56 rounded-2xl bg-[#18181b] border border-white/15 shadow-2xl p-1.5 z-40 animate-in fade-in zoom-in-95 duration-150 space-y-1">
                        <div className="px-2.5 py-1 text-[10px] font-bold text-stone-400 uppercase tracking-wider flex items-center justify-between border-b border-white/5 pb-1.5">
                          <span>Attach to Chat</span>
                          <Paperclip className="w-3 h-3 text-cyan-400" />
                        </div>

                        <button
                          type="button"
                          onClick={() => {
                            setShowAttachMenu(false);
                            imageInputRef.current?.click();
                          }}
                          className="w-full flex items-center gap-2.5 px-2.5 py-2 rounded-xl hover:bg-white/10 text-stone-200 hover:text-white text-xs text-left transition-colors cursor-pointer group"
                        >
                          <div className="w-7 h-7 rounded-lg bg-cyan-500/15 border border-cyan-500/30 flex items-center justify-center text-cyan-400 group-hover:scale-105 transition-transform">
                            <Camera className="w-3.5 h-3.5" />
                          </div>
                          <div>
                            <p className="font-semibold text-white">Photo / Image</p>
                            <p className="text-[10px] text-stone-400">JPG, PNG, WebP, diagrams</p>
                          </div>
                        </button>

                        <button
                          type="button"
                          onClick={() => {
                            setShowAttachMenu(false);
                            docInputRef.current?.click();
                          }}
                          className="w-full flex items-center gap-2.5 px-2.5 py-2 rounded-xl hover:bg-white/10 text-stone-200 hover:text-white text-xs text-left transition-colors cursor-pointer group"
                        >
                          <div className="w-7 h-7 rounded-lg bg-indigo-500/15 border border-indigo-500/30 flex items-center justify-center text-indigo-400 group-hover:scale-105 transition-transform">
                            <FileText className="w-3.5 h-3.5" />
                          </div>
                          <div>
                            <p className="font-semibold text-white">Document</p>
                            <p className="text-[10px] text-stone-400">PDF, Word, Text notes</p>
                          </div>
                        </button>
                      </div>
                    )}

                    {/* Hidden Inputs */}
                    <input
                      type="file"
                      ref={imageInputRef}
                      onChange={handleImageSelect}
                      accept="image/*"
                      className="hidden"
                    />
                    <input
                      type="file"
                      ref={docInputRef}
                      accept=".pdf,.txt,.doc,.docx,.md"
                      className="hidden"
                      onChange={(e) => {
                        const file = e.target.files?.[0];
                        if (file) handleDocUpload(file);
                        e.target.value = '';
                      }}
                    />
                    <input
                      type="file"
                      ref={unifiedInputRef}
                      accept="image/*,.pdf,.txt,.doc,.docx,.md"
                      className="hidden"
                      onChange={(e) => {
                        const file = e.target.files?.[0];
                        if (file) handleUnifiedFileSelect(file);
                        e.target.value = '';
                      }}
                    />

                    {/* Unified Button */}
                    <button
                      type="button"
                      onClick={() => setShowAttachMenu(!showAttachMenu)}
                      className={`inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-xl text-xs font-medium cursor-pointer transition-all border ${
                        showAttachMenu
                          ? 'bg-cyan-500/20 text-cyan-300 border-cyan-500/40'
                          : 'bg-white/5 hover:bg-white/10 text-stone-300 hover:text-white border-white/5'
                      }`}
                      title="Attach photo or document"
                    >
                      <Paperclip className="w-3.5 h-3.5 text-cyan-400" />
                      <span>Attach</span>
                      <ChevronDown className={`w-3 h-3 text-stone-400 transition-transform ${showAttachMenu ? 'rotate-180' : ''}`} />
                    </button>
                  </div>

                  {/* Voice Microphone Dictation Button */}
                  <button
                    type="button"
                    onClick={toggleVoiceRecording}
                    className={`inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-xl text-xs font-medium transition-colors cursor-pointer ${
                      isListening
                        ? 'bg-rose-500/20 text-rose-300 border border-rose-500/40 animate-pulse'
                        : 'bg-white/5 hover:bg-white/10 text-stone-300 hover:text-white border border-white/5'
                    }`}
                    title={isListening ? 'Stop Listening' : 'Voice Dictate'}
                  >
                    {isListening ? (
                      <>
                        <MicOff className="w-3.5 h-3.5 text-rose-400" />
                        <span className="text-[11px] font-bold">Listening...</span>
                      </>
                    ) : (
                      <>
                        <Mic className="w-3.5 h-3.5 text-cyan-400" />
                        <span className="hidden sm:inline">Voice</span>
                      </>
                    )}
                  </button>
                </div>

                {/* Send / Stop Button */}
                <div className="flex items-center gap-2">
                  {isThinking ? (
                    <button
                      type="button"
                      onClick={onStopGeneration}
                      className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-2xl bg-rose-500/20 hover:bg-rose-500/30 text-rose-300 text-xs font-semibold border border-rose-500/30 transition-colors cursor-pointer"
                      title="Stop generating response"
                    >
                      <Square className="w-3.5 h-3.5 fill-current" />
                      <span>Stop</span>
                    </button>
                  ) : (
                    <button
                      type="submit"
                      disabled={!inputText.trim() && !selectedImage}
                      className="p-2 sm:px-3.5 sm:py-2 rounded-2xl bg-cyan-500 hover:bg-cyan-400 active:scale-95 text-black font-bold text-xs flex items-center gap-1.5 transition-all shadow-md shadow-cyan-500/20 disabled:opacity-40 disabled:cursor-not-allowed cursor-pointer"
                      title="Send message"
                    >
                      <span className="hidden sm:inline">Send</span>
                      <ArrowUp className="w-4 h-4" />
                    </button>
                  )}
                </div>
              </div>
            </form>
          </div>
        </footer>
      </main>
    </div>
  );
};
