"use client";

import { PrismAsync as SyntaxHighlighter } from "react-syntax-highlighter";
import { vs, vscDarkPlus } from "react-syntax-highlighter/dist/esm/styles/prism";
import { useTheme } from "@/hooks/useTheme";

interface Props {
  content: string;
  language: string;
  wrapLines: boolean;
}

export function SourceView({ content, language, wrapLines }: Props) {
  const { isDark } = useTheme();
  return (
    <SyntaxHighlighter
      language={language === "text" ? "plaintext" : language}
      style={isDark ? vscDarkPlus : vs}
      showLineNumbers
      lineNumberStyle={LINE_NUMBER_STYLE}
      customStyle={CUSTOM_STYLE}
      codeTagProps={CODE_TAG_STYLE}
      wrapLongLines={wrapLines}
    >
      {content}
    </SyntaxHighlighter>
  );
}

const LINE_NUMBER_STYLE: React.CSSProperties = {
  color: "var(--text-dim)",
  fontStyle: "normal",
  minWidth: "3em",
  paddingRight: "1em",
};

const CUSTOM_STYLE: React.CSSProperties = {
  margin: 0,
  padding: "12px 0",
  background: "var(--bg)",
  fontSize: 13,
  lineHeight: 1.6,
  fontFamily: "var(--font-mono)",
  minHeight: "100%",
};

const CODE_TAG_STYLE = { style: { fontFamily: "var(--font-mono)" } };
