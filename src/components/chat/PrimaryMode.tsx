import React, { useState, useRef, useEffect } from 'react';
import { User, Message, ChatSession } from '../../types';
import {
  Send,
  Sparkles,
  LogOut,
  Volume2,
  SlidersHorizontal,
  Settings,
  ChevronDown,
  Plus,
  MessageSquare,
  Trash2,
  Menu,
  X,
  PanelLeft,
  Square,
  UserCheck,
  BookOpen,
  Image as ImageIcon,
  Mic,
  MicOff,
} from 'lucide-react';
import { MarkdownMessage } from './MarkdownMessage';
import { BackgroundWatermark } from './BackgroundWatermark';
import { createSpeechRecognizer } from '../../lib/speech';

interface PrimaryModeProps {
  user: User;
  messages: Message[];
  onSendMessage: (text: string, image?: { data: string; mimeType: string }) => void;
  onStopGeneration?: () => void;
  isThinking: boolean;
  onLogout: () => void;
  onOpenSettings: () => void;
  onOpenProfile?: () => void;
  currentThemeId?: string;
  sessions: ChatSession[];
  currentSessionId: string;
  onSelectSession: (sessionId: string) => void;
  onNewChat: () => void;
  onDeleteSession: (sessionId: string) => void;
}

export const PrimaryMode: React.FC<PrimaryModeProps> = ({
  user,
  messages,
  onSendMessage,
  onStopGeneration,
  isThinking,
  onLogout,
  onOpenSettings,
  onOpenProfile,
  currentThemeId,
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

  const chatContainerRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const imageInputRef = useRef<HTMLInputElement>(null);
  const recognizerRef = useRef<any>(null);
  const voicePrefixRef = useRef<string>('');

  const handleImageSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (!file.type.startsWith('image/')) {
      alert('Please select an image file (PNG, JPG, WebP, etc.).');
      return;
    }

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

  const speakText = (text: string) => {
    if ('speechSynthesis' in window) {
      window.speechSynthesis.cancel();
      const clean = text.replace(/[*#_`]/g, '').slice(0, 300);
      const utterance = new SpeechSynthesisUtterance(clean);
      utterance.rate = 1.0;
      window.speechSynthesis.speak(utterance);
    }
  };

  return (
    <div className="flex h-full w-full bg-transparent text-white overflow-hidden font-sans select-text">
      {/* Mobile Drawer Overlay */}
      {sidebarOpen && (
        <div
          onClick={() => setSidebarOpen(false)}
          className="fixed inset-0 bg-black/75 backdrop-blur-xs z-40 lg:hidden"
          aria-hidden="true"
        />
      )}

      {/* Sidebar */}
      <aside
        className={`fixed lg:static top-0 bottom-0 left-0 z-50 flex flex-col justify-between bg-[#141414] border-r border-white/10 transition-all duration-300 ease-in-out h-full ${
          sidebarOpen
            ? 'w-72 max-w-[85vw] translate-x-0'
            : '-translate-x-full lg:w-0 lg:border-r-0 lg:overflow-hidden'
        }`}
      >
        <div className="p-3 border-b border-white/10 space-y-2">
          <div className="flex items-center justify-between">
            <button
              onClick={() => {
                onNewChat();
                setSidebarOpen(false);
              }}
              className="flex-1 flex items-center justify-center gap-2 py-2 px-3 rounded-xl bg-white hover:bg-stone-200 text-black font-bold text-xs transition-colors cursor-pointer shadow-sm"
            >
              <Plus className="w-4 h-4 stroke-[2.5]" />
              <span>New Topic</span>
            </button>

            <button
              onClick={() => setSidebarOpen(false)}
              className="p-2 ml-2 rounded-lg text-stone-400 hover:text-white lg:hidden"
            >
              <X className="w-4 h-4" />
            </button>
          </div>

          <button
            onClick={onOpenSettings}
            className="w-full flex items-center justify-between p-2 rounded-xl bg-white/[0.04] hover:bg-white/[0.08] border border-white/10 text-left transition-all cursor-pointer group"
          >
            <div className="flex items-center gap-2 min-w-0">
              <div className="w-6 h-6 rounded-lg bg-emerald-500/20 text-emerald-400 flex items-center justify-center text-xs shrink-0">
                ⭐
              </div>
              <div className="min-w-0">
                <div className="flex items-center gap-1">
                  <span className="text-[11px] font-semibold text-white truncate">{user.educationLevel}</span>
                  <span className="text-[10px] text-stone-400 truncate">({user.classYear})</span>
                </div>
                <p className="text-[10px] text-stone-500 truncate">{user.course || 'Primary'}</p>
              </div>
            </div>
            <SlidersHorizontal className="w-3.5 h-3.5 text-stone-400 group-hover:text-emerald-400 shrink-0" />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto p-3 space-y-1">
          <div className="text-[11px] font-semibold tracking-wider text-stone-500 uppercase px-2 mb-2">
            Previous Questions
          </div>

          {sessions.length === 0 ? (
            <div className="p-4 text-center text-xs text-stone-500 italic">
              No questions asked yet. Ask anything!
            </div>
          ) : (
            <div className="space-y-1">
              {sessions.map((session) => {
                const isActive = session.id === currentSessionId;
                return (
                  <div
                    key={session.id}
                    className={`flex items-center justify-between px-3 py-2.5 rounded-xl text-xs transition-colors cursor-pointer group ${
                      isActive
                        ? 'bg-white/10 text-white font-medium border border-white/10'
                        : 'text-stone-300 hover:text-white hover:bg-white/5'
                    }`}
                    onClick={() => {
                      onSelectSession(session.id);
                      setSidebarOpen(false);
                    }}
                  >
                    <div className="flex items-center gap-2 min-w-0 flex-1">
                      <MessageSquare className="w-3.5 h-3.5 text-emerald-400 shrink-0" />
                      <span className="truncate flex-1">{session.title || 'Topic'}</span>
                    </div>

                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        onDeleteSession(session.id);
                      }}
                      className="p-1 text-stone-500 hover:text-rose-400 opacity-0 group-hover:opacity-100 transition-opacity ml-1 cursor-pointer shrink-0"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        <div className="p-3.5 border-t border-white/10 bg-[#121212] space-y-2.5">
          <div
            onClick={onOpenSettings}
            className="flex items-center gap-2 overflow-hidden cursor-pointer hover:opacity-85 transition-opacity"
            title="Settings & Student Profile"
          >
            <div className="w-9 h-9 rounded-xl bg-emerald-500/20 border border-emerald-500/40 text-emerald-400 flex items-center justify-center text-xs font-bold shrink-0">
              {user.fullName ? user.fullName[0].toUpperCase() : 'P'}
            </div>
            <div className="overflow-hidden text-left flex-1 min-w-0">
              <p className="text-xs font-semibold text-white truncate">{user.fullName}</p>
              <p className="text-[11px] text-emerald-400 font-medium truncate">{user.classYear}</p>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-2 pt-0.5">
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
      </aside>

      {/* Main Area */}
      <div className="flex-1 flex flex-col h-full overflow-hidden relative w-full min-w-0">
        {/* Background Watermark */}
        <BackgroundWatermark />

        <header className="sticky top-0 z-30 bg-black/40 backdrop-blur-md border-b border-white/10 px-3 sm:px-4 py-2.5 flex items-center justify-between">
          <div className="flex items-center gap-2.5 min-w-0">
            <button
              onClick={() => setSidebarOpen(!sidebarOpen)}
              className="p-2 rounded-xl border border-white/15 bg-white/5 hover:bg-white/10 text-stone-300 hover:text-white transition-all cursor-pointer shrink-0 shadow-xs active:scale-95"
              title={sidebarOpen ? "Close menu" : "Open menu"}
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

        <main ref={chatContainerRef} className="flex-1 overflow-y-auto w-full p-4 min-h-0 relative z-10">
          {messages.length === 0 ? (
            <div className="max-w-2xl mx-auto w-full py-10 text-center space-y-5">
              <div className="w-12 h-12 rounded-2xl bg-emerald-500/10 border border-emerald-500/20 flex items-center justify-center mx-auto text-emerald-400">
                <Sparkles className="w-6 h-6" />
              </div>
              <div className="space-y-1">
                <h2 className="text-2xl font-bold text-white tracking-tight">
                  Welcome, {user.fullName || 'Student'}
                </h2>
                <p className="text-stone-400 text-sm max-w-md mx-auto">
                  How can EduMind help you with your studies today? Select a topic or type below.
                </p>
              </div>

              {/* Starter Suggested Questions */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5 max-w-lg mx-auto text-left pt-2">
                {[
                  { title: 'Multiplication Tables', prompt: 'Help me practice multiplication tables with fun examples and tricks.' },
                  { title: 'Science & Nature', prompt: 'Explain the water cycle simply with everyday examples.' },
                  { title: 'Grammar & English', prompt: 'Explain the difference between nouns, verbs, and adjectives with fun sentences.' },
                  { title: 'History & Places', prompt: 'Tell me about the continents and oceans on Earth in an interesting story.' }
                ].map((item, idx) => (
                  <button
                    key={idx}
                    type="button"
                    onClick={() => {
                      setInputText(item.prompt);
                      textareaRef.current?.focus();
                    }}
                    className="p-3 rounded-2xl bg-white/[0.04] hover:bg-white/[0.08] border border-white/10 hover:border-emerald-500/40 text-left transition-all cursor-pointer group"
                    title="Load question into input"
                  >
                    <div className="flex items-center gap-2 mb-1">
                      <BookOpen className="w-3.5 h-3.5 text-emerald-400" />
                      <span className="text-xs font-bold text-white">{item.title}</span>
                    </div>
                    <p className="text-[11px] text-stone-400 line-clamp-1 group-hover:text-stone-300">
                      {item.prompt}
                    </p>
                  </button>
                ))}
              </div>
            </div>
          ) : (
            <div className="max-w-3xl mx-auto w-full space-y-4 pb-6">
              {messages.map((msg, index) => {
                const isUser = msg.role === 'user';
                return (
                  <div
                    key={index}
                    className={`flex ${isUser ? 'justify-end' : 'justify-start'} animate-in fade-in duration-200`}
                  >
                    <div
                      className={`p-4 md:p-5 rounded-2xl max-w-[88%] md:max-w-2xl text-sm leading-relaxed ${
                        isUser
                          ? 'bg-[#262626] text-white border border-white/10 rounded-br-sm font-medium'
                          : 'bg-[#141414] text-stone-200 border border-white/10 rounded-bl-sm shadow-sm'
                      }`}
                    >
                      {/* Attached past question image */}
                      {isUser && (msg.imageUrl || msg.image?.data) && (
                        <div className="mb-3 rounded-xl overflow-hidden border border-white/15 max-w-sm">
                          <img
                            src={msg.imageUrl || msg.image?.data}
                            alt="Attached past question / worksheet"
                            className="max-h-60 w-auto object-contain bg-black/40 rounded-lg"
                          />
                        </div>
                      )}

                      {!isUser && (
                        <div className="flex items-center justify-between pb-2 mb-2 border-b border-white/10 text-xs font-semibold text-emerald-400">
                          <span className="flex items-center gap-1.5">
                            <Sparkles className="w-3.5 h-3.5" />
                            <span>EduMind AI</span>
                          </span>
                          <button
                            onClick={() => speakText(msg.content)}
                            className="p-1 rounded hover:bg-white/10 text-stone-400 hover:text-stone-200 transition-colors cursor-pointer"
                            title="Read aloud"
                          >
                            <Volume2 className="w-3.5 h-3.5" />
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
                  <div className="bg-[#141414] border border-white/10 p-3 px-4 rounded-2xl rounded-bl-sm flex items-center gap-2.5">
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
        </main>

        <footer className="shrink-0 bg-black/30 backdrop-blur-md border-t border-white/10 p-3 md:p-4 z-20 space-y-2">
          {/* Selected image preview */}
          {selectedImage && (
            <div className="max-w-3xl mx-auto flex items-center gap-3 p-2 bg-white/5 border border-white/15 rounded-2xl">
              <div className="w-12 h-12 rounded-xl overflow-hidden bg-black/40 border border-white/10 shrink-0">
                <img
                  src={selectedImage.data}
                  alt="Selected Question"
                  className="w-full h-full object-cover"
                />
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-xs font-medium text-white truncate">{selectedImage.name}</p>
                <p className="text-[11px] text-emerald-400">Past question photo attached</p>
              </div>
              <button
                type="button"
                onClick={() => setSelectedImage(null)}
                className="p-1.5 rounded-lg hover:bg-white/10 text-stone-400 hover:text-white transition-colors"
                title="Remove photo"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
          )}

          {speechError && (
            <div className="max-w-3xl mx-auto text-xs text-rose-300 bg-rose-500/10 border border-rose-500/20 px-3 py-1.5 rounded-xl">
              {speechError}
            </div>
          )}

          <input
            ref={imageInputRef}
            type="file"
            accept="image/png,image/jpeg,image/jpg,image/webp"
            onChange={handleImageSelect}
            className="hidden"
          />

          <form
            onSubmit={handleSubmit}
            className="max-w-3xl mx-auto bg-[#181818] border border-white/10 focus-within:border-emerald-500/50 rounded-2xl p-2 shadow-2xl flex items-center gap-2 transition-colors"
          >
            {/* Attach Image Button */}
            <button
              type="button"
              onClick={() => imageInputRef.current?.click()}
              className="p-2 rounded-xl text-stone-400 hover:text-emerald-400 hover:bg-white/5 transition-colors cursor-pointer shrink-0"
              title="Attach Exam Past Question Photo"
            >
              <ImageIcon className="w-4 h-4" />
            </button>

            {/* Voice Dictation Button */}
            <button
              type="button"
              onClick={toggleVoiceRecording}
              className={`p-2 rounded-xl transition-all cursor-pointer shrink-0 ${
                isListening
                  ? 'bg-rose-500 text-white animate-pulse shadow-md'
                  : 'text-stone-400 hover:text-cyan-400 hover:bg-white/5'
              }`}
              title={isListening ? 'Stop recording voice' : 'Speak your thoughts (Voice dictation)'}
            >
              {isListening ? <MicOff className="w-4 h-4" /> : <Mic className="w-4 h-4" />}
            </button>

            <textarea
              ref={textareaRef}
              rows={1}
              value={inputText}
              onChange={(e) => setInputText(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder={isListening ? 'Listening to your voice...' : 'Ask a question or attach a past question photo...'}
              className="flex-1 bg-transparent border-0 outline-none text-sm text-white placeholder:text-stone-500 px-2 py-2 resize-none max-h-32 leading-relaxed"
            />

            {isThinking ? (
              <button
                type="button"
                onClick={onStopGeneration}
                className="h-9 px-3 rounded-xl bg-rose-500/25 hover:bg-rose-500/35 border border-rose-500/45 text-rose-200 flex items-center gap-1.5 text-xs font-bold transition-all cursor-pointer shadow-md active:scale-95"
                title="Stop AI Generation"
              >
                <Square className="w-3.5 h-3.5 fill-current" />
                <span>Stop</span>
              </button>
            ) : (
              <button
                type="submit"
                disabled={!inputText.trim() && !selectedImage}
                className="p-2.5 rounded-xl bg-white text-black hover:bg-stone-200 disabled:opacity-30 disabled:hover:bg-white active:scale-95 transition-all cursor-pointer shrink-0 font-medium"
                title="Send"
              >
                <Send className="w-4 h-4" />
              </button>
            )}
          </form>
        </footer>
      </div>
    </div>
  );
};
