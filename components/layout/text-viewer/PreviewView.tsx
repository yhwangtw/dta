"use client";

import { MarkdownBody } from "@/components/chat/MarkdownBody";
import styles from "../TextFileViewer.module.css";

interface Props {
  content: string;
  language: string;
}

export function PreviewView({ content, language }: Props) {
  if (language === "html") {
    return (
      <iframe
        srcDoc={content}
        sandbox="allow-scripts"
        className={styles.htmlPreview}
        title="HTML preview"
      />
    );
  }
  if (language === "markdown") {
    // Same renderer as chat messages — math, mermaid, code highlighting,
    // table wrappers, and external-link handling all come along for free.
    return (
      <div className={styles.markdownPreview}>
        <MarkdownBody className="markdown-file-preview">{content}</MarkdownBody>
      </div>
    );
  }
  return null;
}
