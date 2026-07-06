"use client";

import type { Pluggable, PluggableList } from "unified";
import { useEffect, useMemo, useState, type ReactNode } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
// PrismAsync keeps the full language set but splits refractor + languages into
// a lazily-loaded chunk, so the highlighter never blocks the initial bundle.
import { PrismAsync as SyntaxHighlighter } from "react-syntax-highlighter";
import { vs, vscDarkPlus } from "react-syntax-highlighter/dist/esm/styles/prism";
import { useTheme } from "@/hooks/useTheme";
import styles from "./MarkdownBody.module.css";

interface MarkdownBodyProps {
  children: string;
  className?: string;
  isStreaming?: boolean;
}

type MathPlugins = {
  remarkMath: typeof import("remark-math").default;
  rehypeKatex: typeof import("rehype-katex").default;
};

/**
 * Heuristic: does this markdown contain LaTeX math?
 * - Block: $$...$$ on its own line
 * - Inline: $...$ (avoid matching $$ as the delimiter; require non-space inside)
 * If no math is present, we skip the (large) remark-math + rehype-katex bundle entirely.
 */
function containsMath(markdown: string): boolean {
  if (/^\s{0,3}\$\$.*\$\$\s*$/m.test(markdown)) return true;
  if (/\$\$[\s\S]+?\$\$/.test(markdown)) return true;
  if(/(^|[^\\$])\$[^$\n]+\$/.test(markdown)) return true;
  return false;
}

function copyText(text: string): Promise<void> {
  if (navigator.clipboard?.writeText) {
    return navigator.clipboard.writeText(text);
  }
  try {
    const ta = document.createElement("textarea");
    ta.value = text;
    ta.style.position = "fixed";
    ta.style.opacity = "0";
    document.body.appendChild(ta);
    ta.select();
    document.execCommand("copy");
    document.body.removeChild(ta);
    return Promise.resolve();
  } catch {
    return Promise.reject();
  }
}

export function MarkdownBody({ children, className, isStreaming }: MarkdownBodyProps) {
  const normalizedMarkdown = useMemo(() => normalizeDisplayMath(children), [children]);
  const needsMath = useMemo(() => containsMath(normalizedMarkdown), [normalizedMarkdown]);
  const [mathPlugins, setMathPlugins] = useState<MathPlugins | null>(null);

  useEffect(() => {
    if (!needsMath) {
      setMathPlugins(null);
      return;
    }
    let cancelled = false;
    Promise.all([import("remark-math"), import("rehype-katex")])
      .then(([remarkMathMod, rehypeKatexMod]) => {
        if (cancelled) return;
        setMathPlugins({
          remarkMath: remarkMathMod.default,
          rehypeKatex: rehypeKatexMod.default,
        });
      })
      .catch(() => {
        // If plugin load fails, fall back to no math (better than crashing the message)
        if (!cancelled) setMathPlugins(null);
      });
    return () => {
      cancelled = true;
    };
  }, [needsMath]);

  const remarkPlugins: PluggableList = useMemo(
    () => (mathPlugins ? [remarkGfm, mathPlugins.remarkMath] : [remarkGfm]),
    [mathPlugins],
  );
  const rehypePlugins: PluggableList = useMemo(
    () =>
      mathPlugins
        ? [[mathPlugins.rehypeKatex, { throwOnError: false, strict: false }] as Pluggable]
        : [],
    [mathPlugins],
  );

  return (
    <div className={["markdown-body", className].filter(Boolean).join(" ")}>
      <ReactMarkdown
        remarkPlugins={remarkPlugins}
        rehypePlugins={rehypePlugins}
        components={{
          code({ className, children, ...props }) {
            const lang = className?.replace("language-", "").toLowerCase() ?? "";
            const raw = String(children);
            const isBlock = className?.includes("language-") || raw.includes("\n");
            if (isBlock) {
              if (lang === "mermaid") {
                return <MermaidBlock code={raw.replace(/\n$/, "")} isStreaming={isStreaming} />;
              }
              return <CodeBlock code={raw.replace(/\n$/, "")} lang={lang} />;
            }
            return (
              <code
                className={styles.inlineCode}
                {...props}
              >
                {children}
              </code>
            );
          },
          pre({ children }) {
            return <>{children}</>;
          },
        }}
      >
        {normalizedMarkdown}
      </ReactMarkdown>
    </div>
  );
}

function normalizeDisplayMath(markdown: string): string {
  const lineBreak = markdown.includes("\r\n") ? "\r\n" : "\n";
  const lines = markdown.split(/\r?\n/);
  let fence: { marker: string; size: number } | null = null;

  return lines
    .map((line) => {
      const fenceMatch = line.match(/^ {0,3}(`{3,}|~{3,})/);
      if (fenceMatch) {
        const marker = fenceMatch[1][0];
        const size = fenceMatch[1].length;
        if (!fence) fence = { marker, size };
        else if (marker === fence.marker && size >= fence.size) fence = null;
        return line;
      }

      if (fence) return line;

      const displayMathMatch = line.match(/^([ \t]{0,3})\$\$(.+)\$\$[ \t]*$/);
      if (!displayMathMatch) return line;

      const math = displayMathMatch[2].trim();
      if (!math) return line;

      return `${displayMathMatch[1]}$$${lineBreak}${math}${lineBreak}${displayMathMatch[1]}$$`;
    })
    .join(lineBreak);
}

function MermaidBlock({ code, isStreaming }: { code: string; isStreaming?: boolean }) {
  const { isDark } = useTheme();
  const [showPreview, setShowPreview] = useState(false);
  const [svg, setSvg] = useState<string | null>(null);
  const [renderedKey, setRenderedKey] = useState("");
  const [failedKey, setFailedKey] = useState<string | null>(null);
  const currentKey = `${isDark ? "dark" : "light"}\n${code}`;

  useEffect(() => {
    if (!showPreview || isStreaming) return;

    let cancelled = false;
    setFailedKey(null);

    const render = async () => {
      const { default: mermaid } = await import("mermaid");
      mermaid.initialize({
        startOnLoad: false,
        securityLevel: "strict",
        suppressErrorRendering: true,
        theme: isDark ? "dark" : "default",
      });

      const parsed = await mermaid.parse(code, { suppressErrors: true });
      if (!parsed) throw new Error("Invalid Mermaid diagram");

      const id =
        typeof crypto !== "undefined" && "randomUUID" in crypto
          ? `mermaid-${crypto.randomUUID()}`
          : `mermaid-${Date.now()}-${Math.random().toString(36).slice(2)}`;
      const result = await mermaid.render(id, code);
      if (!cancelled) {
        setSvg(result.svg);
        setRenderedKey(currentKey);
      }
    };

    render().catch(() => {
      if (!cancelled) setFailedKey(currentKey);
    });

    return () => {
      cancelled = true;
    };
  }, [code, currentKey, isDark, isStreaming, showPreview]);

  const previewBtnClass = [
    styles.previewBtn,
    showPreview ? styles.previewBtnActive : "",
    isStreaming ? styles.previewBtnStreaming : "",
  ].filter(Boolean).join(" ");

  const previewButton = (
    <button
      onClick={() => setShowPreview((v) => !v)}
      disabled={isStreaming}
      title={isStreaming ? "Preview available after streaming" : (showPreview ? "Show Mermaid source" : "Preview Mermaid diagram")}
      className={previewBtnClass}
    >
      {showPreview ? "Source" : "Preview"}
    </button>
  );

  if (!showPreview || isStreaming) {
    return <CodeBlock code={code} lang="mermaid" headerAction={previewButton} />;
  }

  const body =
    failedKey === currentKey ? (
      <div className="mermaid-block mermaid-block-error">Invalid Mermaid diagram</div>
    ) : !svg || renderedKey !== currentKey ? (
      <div className="mermaid-block mermaid-block-loading" aria-label="Rendering Mermaid diagram" />
    ) : (
      <div
        className="mermaid-block"
        dangerouslySetInnerHTML={{ __html: svg }}
      />
    );

  return (
    <div className={styles.blockContainer}>
      <div className={styles.blockHeader}>
        <span>mermaid</span>
        {previewButton}
      </div>
      {body}
    </div>
  );
}

function CodeBlock({ code, lang, headerAction }: { code: string; lang: string; headerAction?: ReactNode }) {
  const { isDark } = useTheme();
  const [copied, setCopied] = useState(false);

  const copy = () => {
    copyText(code).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    });
  };

  return (
    <div className={styles.blockContainer}>
      <div className={styles.blockHeader}>
        <span>{lang}</span>
        <div className={styles.headerActions}>
          {headerAction}
          <button
            onClick={copy}
            className={styles.copyBtn}
          >
            {copied ? "copied" : "copy"}
          </button>
        </div>
      </div>
      <SyntaxHighlighter
        language={lang || "text"}
        style={isDark ? vscDarkPlus : vs}
        showLineNumbers
        lineNumberStyle={{ color: "var(--text-dim)", fontStyle: "normal" }}
        customStyle={{
          margin: 0,
          padding: "10px 12px",
          fontSize: 12.5,
          lineHeight: 1.6,
          borderRadius: 0,
          // Both forms: the highlighter themes mix `background` (vscDarkPlus)
          // and `backgroundColor` (vs); pinning both keeps the merged style
          // stable across theme switches (React warns when one form is
          // removed while the other is set).
          background: "var(--bg)",
          backgroundColor: "var(--bg)",
        }}
        codeTagProps={{ style: { fontFamily: "var(--font-mono)" } }}
      >
        {code}
      </SyntaxHighlighter>
    </div>
  );
}
