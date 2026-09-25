import React, { useState, useRef, useEffect } from 'react';
import { UploadCloud, FileText, CheckCircle2, AlertCircle, Loader2, X, Paperclip, Camera, ChevronDown } from 'lucide-react';

interface UploadZoneProps {
  onUploadSuccess: (info: { fileName: string; chunksCount: number; textPreview?: string; fullText?: string }) => void;
  onImageSelect?: (image: { data: string; mimeType: string; name: string }) => void;
  token: string;
  activeDoc?: { fileName: string; chunksCount: number } | null;
  onClearDoc?: () => void;
  compact?: boolean;
}

export const UploadZone: React.FC<UploadZoneProps> = ({
  onUploadSuccess,
  onImageSelect,
  token,
  activeDoc,
  onClearDoc,
  compact = false,
}) => {
  const [isDragging, setIsDragging] = useState(false);
  const [isUploading, setIsUploading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState(0);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [showMenu, setShowMenu] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const imageInputRef = useRef<HTMLInputElement>(null);
  const docInputRef = useRef<HTMLInputElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);

  // Close menu when clicking outside
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setShowMenu(false);
      }
    };
    if (showMenu) {
      document.addEventListener('mousedown', handleClickOutside);
    }
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, [showMenu]);

  const handleFile = async (file: File) => {
    setErrorMsg(null);
    const lowerName = file.name.toLowerCase();

    // 1. Image handling (Exam Past Question Photo, diagram, or problem snapshot)
    const isImage =
      file.type.startsWith('image/') ||
      ['.png', '.jpg', '.jpeg', '.gif', '.webp', '.bmp', '.tiff', '.svg', '.heic', '.raw', '.ico'].some((ext) =>
        lowerName.endsWith(ext)
      );

    if (isImage) {
      if (onImageSelect) {
        const reader = new FileReader();
        reader.onload = () => {
          onImageSelect({
            data: reader.result as string,
            mimeType: file.type || 'image/jpeg',
            name: file.name,
          });
        };
        reader.readAsDataURL(file);
        return;
      } else {
        setErrorMsg('Image past questions cannot be attached in this mode.');
        return;
      }
    }

    // 2. Video Child Protection Constraint
    const isVideo =
      file.type.startsWith('video/') ||
      ['.mp4', '.avi', '.mov', '.mkv', '.webm', '.flv', '.3gp', '.wmv', '.m4v'].some((ext) =>
        lowerName.endsWith(ext)
      );

    if (isVideo) {
      setErrorMsg(
        'Child Safety Guard: Video uploads are restricted. EduMind AI accepts academic study texts (PDF, DOCX, TXT) and past question photos.'
      );
      return;
    }

    // 3. Prohibited adult / explicit keyword inspection
    const prohibitedKeywords = ['porn', 'xxx', 'nsfw', 'hentai', 'nude', 'nudity', 'erotic', 'sex'];
    if (prohibitedKeywords.some((w) => lowerName.includes(w))) {
      setErrorMsg(
        'Policy Restriction: The selected file contains restricted terms. Adult content is strictly forbidden.'
      );
      return;
    }

    // Max 120MB for documents
    const maxBytes = 120 * 1024 * 1024;
    if (file.size > maxBytes) {
      setErrorMsg('File size exceeds the 120MB limit. Please upload a smaller file.');
      return;
    }

    setIsUploading(true);
    setUploadProgress(20);

    const formData = new FormData();
    formData.append('file', file);

    const progressTimer = setInterval(() => {
      setUploadProgress((prev) => (prev < 90 ? prev + 15 : prev));
    }, 200);

    const effectiveToken =
      token ||
      (typeof window !== 'undefined' ? localStorage.getItem('vortex_token') || '' : '') ||
      'session_user_token';

    try {
      const response = await fetch('/api/upload', {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${effectiveToken}`,
        },
        body: formData,
      });

      clearInterval(progressTimer);
      setUploadProgress(100);

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || 'Failed to upload document to Second Brain');
      }

      onUploadSuccess({
        fileName: data.fileName || file.name,
        chunksCount: data.chunksCreated || 1,
        textPreview: data.textPreview,
        fullText: data.textPreview,
      });
    } catch (err: any) {
      clearInterval(progressTimer);
      setErrorMsg(err.message || 'Error processing file');
    } finally {
      setIsUploading(false);
      setTimeout(() => setUploadProgress(0), 1000);
    }
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
    if (e.dataTransfer.files && e.dataTransfer.files[0]) {
      handleFile(e.dataTransfer.files[0]);
    }
  };

  if (activeDoc) {
    return (
      <div className="inline-flex items-center gap-2.5 px-3 py-1.5 rounded-xl bg-[#222222] border border-white/15 text-stone-200 text-xs shadow-md max-w-full group animate-in fade-in zoom-in-95">
        <div className="w-6 h-6 rounded-lg bg-emerald-500/15 border border-emerald-500/30 text-emerald-400 flex items-center justify-center shrink-0">
          <FileText className="w-3.5 h-3.5" />
        </div>
        <div className="flex flex-col min-w-0 pr-1">
          <span className="font-medium text-xs text-stone-200 truncate max-w-[200px] sm:max-w-xs">{activeDoc.fileName}</span>
          <span className="text-[10px] text-stone-400 font-mono">
            {activeDoc.chunksCount} {activeDoc.chunksCount === 1 ? 'chunk' : 'chunks'} ready
          </span>
        </div>
        {onClearDoc && (
          <button
            onClick={(e) => {
              e.stopPropagation();
              onClearDoc();
            }}
            className="p-1 text-stone-400 hover:text-white hover:bg-white/10 rounded-full transition-colors cursor-pointer ml-1"
            title="Remove attachment"
          >
            <X className="w-3.5 h-3.5" />
          </button>
        )}
      </div>
    );
  }

  if (compact) {
    return (
      <div className="relative" ref={menuRef}>
        {showMenu && (
          <div className="absolute bottom-full left-0 mb-2 w-56 rounded-2xl bg-[#18181b] border border-white/15 shadow-2xl p-1.5 z-40 animate-in fade-in zoom-in-95 duration-150 space-y-1">
            <div className="px-2.5 py-1 text-[10px] font-bold text-stone-400 uppercase tracking-wider flex items-center justify-between border-b border-white/5 pb-1.5">
              <span>Attach to Chat</span>
              <Paperclip className="w-3 h-3 text-emerald-400" />
            </div>

            {onImageSelect && (
              <button
                type="button"
                onClick={() => {
                  setShowMenu(false);
                  imageInputRef.current?.click();
                }}
                className="w-full flex items-center gap-2.5 px-2.5 py-2 rounded-xl hover:bg-white/10 text-stone-200 hover:text-white text-xs text-left transition-colors cursor-pointer group"
              >
                <div className="w-7 h-7 rounded-lg bg-emerald-500/15 border border-emerald-500/30 flex items-center justify-center text-emerald-400 group-hover:scale-105 transition-transform">
                  <Camera className="w-3.5 h-3.5" />
                </div>
                <div>
                  <p className="font-semibold text-white">Photo / Question</p>
                  <p className="text-[10px] text-stone-400">Past question photo, screenshot</p>
                </div>
              </button>
            )}

            <button
              type="button"
              onClick={() => {
                setShowMenu(false);
                docInputRef.current?.click();
              }}
              className="w-full flex items-center gap-2.5 px-2.5 py-2 rounded-xl hover:bg-white/10 text-stone-200 hover:text-white text-xs text-left transition-colors cursor-pointer group"
            >
              <div className="w-7 h-7 rounded-lg bg-cyan-500/15 border border-cyan-500/30 flex items-center justify-center text-cyan-400 group-hover:scale-105 transition-transform">
                <FileText className="w-3.5 h-3.5" />
              </div>
              <div>
                <p className="font-semibold text-white">Study Document</p>
                <p className="text-[10px] text-stone-400">PDF, Word DOCX, text notes</p>
              </div>
            </button>
          </div>
        )}

        {/* Hidden File Inputs */}
        <input
          ref={imageInputRef}
          type="file"
          accept="image/*"
          className="hidden"
          onChange={(e) => {
            if (e.target.files && e.target.files[0]) {
              handleFile(e.target.files[0]);
            }
            e.target.value = '';
          }}
        />
        <input
          ref={docInputRef}
          type="file"
          accept=".pdf,.txt,.doc,.docx,.ppt,.pptx,.md"
          className="hidden"
          onChange={(e) => {
            if (e.target.files && e.target.files[0]) {
              handleFile(e.target.files[0]);
            }
            e.target.value = '';
          }}
        />
        <input
          ref={fileInputRef}
          type="file"
          accept=".pdf,.txt,.doc,.docx,.ppt,.pptx,image/png,image/jpeg,image/jpg,image/webp,image/heic,image/*"
          className="hidden"
          onChange={(e) => {
            if (e.target.files && e.target.files[0]) {
              handleFile(e.target.files[0]);
            }
            e.target.value = '';
          }}
        />

        <button
          type="button"
          onClick={() => setShowMenu(!showMenu)}
          disabled={isUploading}
          className={`p-1.5 sm:px-2.5 sm:py-1.5 rounded-xl transition-all cursor-pointer flex items-center gap-1.5 text-xs disabled:opacity-50 border ${
            showMenu
              ? 'bg-emerald-500/20 text-emerald-300 border-emerald-500/40'
              : 'bg-white/5 hover:bg-white/10 border-white/10 text-stone-300 hover:text-emerald-400'
          }`}
          title="Attach photo, past question or study document"
        >
          {isUploading ? (
            <Loader2 className="w-4 h-4 text-emerald-400 animate-spin" />
          ) : (
            <Paperclip className="w-4 h-4 text-emerald-400" />
          )}
          <span className="hidden sm:inline font-medium">Attach</span>
          <ChevronDown className={`w-3 h-3 text-stone-400 transition-transform ${showMenu ? 'rotate-180' : ''}`} />
        </button>

        {errorMsg && (
          <div className="absolute bottom-full left-0 mb-2 w-64 p-2 bg-rose-950/90 border border-rose-800 text-rose-300 text-[11px] rounded-xl shadow-xl z-50">
            {errorMsg}
          </div>
        )}
      </div>
    );
  }

  return (
    <div className="w-full">
      <input
        ref={fileInputRef}
        type="file"
        accept=".pdf,.txt,.doc,.docx,.ppt,.pptx,image/png,image/jpeg,image/jpg,image/webp,image/heic,image/*"
        className="hidden"
        onChange={(e) => {
          if (e.target.files && e.target.files[0]) {
            handleFile(e.target.files[0]);
          }
          e.target.value = '';
        }}
      />

      <div
        onDragOver={(e) => {
          e.preventDefault();
          setIsDragging(true);
        }}
        onDragLeave={() => setIsDragging(false)}
        onDrop={handleDrop}
        onClick={() => fileInputRef.current?.click()}
        className={`border-2 border-dashed rounded-2xl p-4 transition-all duration-200 text-center cursor-pointer select-none ${
          isDragging
            ? 'border-emerald-400 bg-emerald-950/30'
            : 'border-white/15 bg-white/[0.02] hover:border-white/30 hover:bg-white/[0.04]'
        }`}
      >
        {isUploading ? (
          <div className="flex flex-col items-center justify-center py-2 space-y-2">
            <Loader2 className="w-7 h-7 text-emerald-400 animate-spin" />
            <p className="text-xs text-stone-300 font-medium">Extracting knowledge chunks from document...</p>
            <div className="w-48 bg-stone-800 rounded-full h-1.5 overflow-hidden">
              <div
                className="bg-emerald-400 h-full transition-all duration-300 rounded-full"
                style={{ width: `${uploadProgress}%` }}
              />
            </div>
          </div>
        ) : (
          <div className="flex flex-col items-center justify-center py-2 sm:py-3 space-y-1.5">
            <div className="w-10 h-10 rounded-2xl bg-white/5 border border-white/10 flex items-center justify-center text-emerald-400 mb-1">
              <UploadCloud className="w-5 h-5" />
            </div>
            <p className="text-sm font-semibold text-stone-200">
              Upload Notes or Past Questions
            </p>
            <p className="text-xs text-stone-400 max-w-sm mx-auto">
              PDF textbooks, lecture slides, or exam past question photos (JPG, PNG)
            </p>
          </div>
        )}
      </div>

      {errorMsg && (
        <div className="mt-2 flex items-center gap-1.5 text-xs text-rose-400 bg-rose-950/30 border border-rose-800/40 p-2 rounded-xl">
          <AlertCircle className="w-4 h-4 shrink-0" />
          <span>{errorMsg}</span>
        </div>
      )}
    </div>
  );
};
