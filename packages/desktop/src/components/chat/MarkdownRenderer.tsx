import React, { useState, useEffect, useCallback } from "react";
import Markdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { highlightCode } from "../../lib/shiki.js";
import { Copy, Check } from "lucide-react";

interface Props {
  content: string;
}

export function MarkdownRenderer({ content }: Props) {
  return (
    <Markdown
      remarkPlugins={[remarkGfm]}
      // @ts-expect-error className works at runtime but types don't include it
      className="prose-anton"
      components={{
        code: CodeBlock,
        a: ({ href, children }) => (
          <a
            href={href}
            target="_blank"
            rel="noopener noreferrer"
            className="text-green-400 hover:text-green-300 underline underline-offset-2 transition-colors"
          >
            {children}
          </a>
        ),
        ul: ({ children }) => (
          <ul className="list-disc list-inside space-y-1 my-2 text-zinc-300">{children}</ul>
        ),
        ol: ({ children }) => (
          <ol className="list-decimal list-inside space-y-1 my-2 text-zinc-300">{children}</ol>
        ),
        blockquote: ({ children }) => (
          <blockquote className="border-l-2 border-zinc-700 pl-3 my-2 text-zinc-400 italic">
            {children}
          </blockquote>
        ),
        table: ({ children }) => (
          <div className="overflow-x-auto my-3">
            <table className="w-full text-xs border-collapse">{children}</table>
          </div>
        ),
        th: ({ children }) => (
          <th className="border border-zinc-700 px-3 py-1.5 bg-zinc-800/50 text-left text-zinc-300 font-medium">
            {children}
          </th>
        ),
        td: ({ children }) => (
          <td className="border border-zinc-800 px-3 py-1.5 text-zinc-400">{children}</td>
        ),
        h1: ({ children }) => <h1 className="text-lg font-semibold text-zinc-100 mt-4 mb-2">{children}</h1>,
        h2: ({ children }) => <h2 className="text-base font-semibold text-zinc-100 mt-3 mb-2">{children}</h2>,
        h3: ({ children }) => <h3 className="text-sm font-semibold text-zinc-200 mt-3 mb-1">{children}</h3>,
        p: ({ children }) => <p className="my-1.5 leading-relaxed">{children}</p>,
        hr: () => <hr className="border-zinc-800 my-4" />,
      }}
    />
  );
}

function CodeBlock({
  className,
  children,
  ...props
}: React.HTMLAttributes<HTMLElement> & { children?: React.ReactNode }) {
  const match = /language-(\w+)/.exec(className || "");
  const lang = match?.[1] || "";
  const code = String(children).replace(/\n$/, "");
  const isInline = !match && !code.includes("\n");

  if (isInline) {
    return (
      <code className="bg-zinc-800 px-1.5 py-0.5 rounded text-[13px] font-mono text-zinc-200">
        {children}
      </code>
    );
  }

  return <HighlightedBlock code={code} lang={lang} />;
}

function HighlightedBlock({ code, lang }: { code: string; lang: string }) {
  const [html, setHtml] = useState<string>("");
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    highlightCode(code, lang).then(setHtml);
  }, [code, lang]);

  const handleCopy = useCallback(() => {
    navigator.clipboard.writeText(code);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }, [code]);

  return (
    <div className="group relative my-3 rounded-lg overflow-hidden border border-zinc-800 bg-[#121212]">
      {/* Header */}
      <div className="flex items-center justify-between px-3 py-1.5 bg-zinc-900/80 border-b border-zinc-800">
        <span className="text-[11px] text-zinc-500 font-mono">{lang || "text"}</span>
        <button
          onClick={handleCopy}
          className="flex items-center gap-1 text-[11px] text-zinc-500 hover:text-zinc-300 transition-colors"
        >
          {copied ? (
            <>
              <Check className="w-3 h-3" />
              Copied
            </>
          ) : (
            <>
              <Copy className="w-3 h-3" />
              Copy
            </>
          )}
        </button>
      </div>

      {/* Code */}
      {html ? (
        <div
          className="overflow-x-auto p-3 text-[13px] leading-relaxed [&_pre]:!bg-transparent [&_pre]:!m-0 [&_pre]:!p-0 [&_code]:!bg-transparent"
          dangerouslySetInnerHTML={{ __html: html }}
        />
      ) : (
        <pre className="overflow-x-auto p-3 text-[13px] leading-relaxed">
          <code className="text-zinc-300 font-mono">{code}</code>
        </pre>
      )}
    </div>
  );
}
