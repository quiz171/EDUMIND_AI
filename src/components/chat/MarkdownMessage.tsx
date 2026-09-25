import React, { useState } from 'react';
import Markdown from 'react-markdown';
import remarkMath from 'remark-math';
import rehypeKatex from 'rehype-katex';
import { Check, Copy, FileText } from 'lucide-react';

interface MarkdownMessageProps {
  content: string;
  isLightMode?: boolean;
}

export const MarkdownMessage: React.FC<MarkdownMessageProps> = ({ content, isLightMode = false }) => {
  const [copiedCodeIndex, setCopiedCodeIndex] = useState<number | null>(null);

  const handleCopy = (text: string, index: number) => {
    navigator.clipboard.writeText(text);
    setCopiedCodeIndex(index);
    setTimeout(() => setCopiedCodeIndex(null), 2000);
  };

  // Custom renderer for code blocks and sources
  const renderers = {
    code({ node, inline, className, children, ...props }: any) {
      const match = /language-(\w+)/.exec(className || '');
      const language = match ? match[1] : '';
      const codeString = String(children).replace(/\n$/, '');

      if (inline) {
        return (
          <code
            className={`px-1.5 py-0.5 rounded text-sm font-mono font-medium ${
              isLightMode
                ? 'bg-amber-100 text-amber-950 border border-amber-200'
                : 'bg-[#1e1e1e] text-emerald-400 border border-white/10'
            }`}
            {...props}
          >
            {children}
          </code>
        );
      }

      const codeIndex = Math.random();

      return (
        <div className="my-3 overflow-hidden rounded-xl border border-white/10 shadow-lg">
          <div
            className={`flex items-center justify-between px-4 py-1.5 text-xs font-mono select-none ${
              isLightMode ? 'bg-stone-200 text-stone-700' : 'bg-[#181818] text-stone-400'
            }`}
          >
            <span className="font-semibold uppercase tracking-wider">{language || 'CODE'}</span>
            <button
              onClick={() => handleCopy(codeString, codeIndex as any)}
              className="flex items-center gap-1.5 px-2 py-0.5 rounded text-xs transition-colors hover:bg-white/10 cursor-pointer"
              title="Copy code"
            >
              {copiedCodeIndex === codeIndex ? (
                <>
                  <Check className="w-3.5 h-3.5 text-emerald-400" />
                  <span className="text-emerald-400 font-sans">Copied!</span>
                </>
              ) : (
                <>
                  <Copy className="w-3.5 h-3.5" />
                  <span className="font-sans">Copy</span>
                </>
              )}
            </button>
          </div>
          <pre
            className={`p-4 overflow-x-auto text-sm font-mono leading-relaxed ${
              isLightMode ? 'bg-amber-50 text-stone-900' : 'bg-[#101010] text-emerald-300'
            }`}
          >
            <code>{children}</code>
          </pre>
        </div>
      );
    },
    blockquote({ children }: any) {
      return (
        <blockquote
          className={`my-3 pl-4 border-l-4 py-1 italic rounded-r ${
            isLightMode
              ? 'border-amber-400 bg-amber-50/70 text-stone-800'
              : 'border-emerald-500 bg-emerald-950/20 text-emerald-200'
          }`}
        >
          {children}
        </blockquote>
      );
    },
    h1({ children }: any) {
      return <h1 className="text-xl font-bold mt-4 mb-2 tracking-tight">{children}</h1>;
    },
    h2({ children }: any) {
      return <h2 className="text-lg font-bold mt-3 mb-2 tracking-tight">{children}</h2>;
    },
    h3({ children }: any) {
      return <h3 className="text-base font-semibold mt-2 mb-1">{children}</h3>;
    },
    ul({ children }: any) {
      return <ul className="list-disc list-inside my-2 space-y-1">{children}</ul>;
    },
    ol({ children }: any) {
      return <ol className="list-decimal list-inside my-2 space-y-1">{children}</ol>;
    },
    li({ children }: any) {
      return <li className="leading-relaxed">{children}</li>;
    },
    p({ children }: any) {
      return <p className="mb-2 leading-relaxed last:mb-0">{children}</p>;
    },
  };

  // Enhance source citation tags like [Source: my notes] or [Source: ...]
  const formatSourceBadges = (raw: string) => {
    return raw;
  };

  return (
    <div
      className={`prose max-w-none break-words ${
        isLightMode ? 'text-stone-900 font-sans text-base' : 'text-stone-100 font-sans text-sm md:text-base'
      }`}
    >
      <Markdown
        remarkPlugins={[remarkMath]}
        rehypePlugins={[rehypeKatex]}
        components={renderers}
      >
        {formatSourceBadges(content)}
      </Markdown>
    </div>
  );
};
