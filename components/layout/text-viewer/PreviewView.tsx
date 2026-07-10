"use client";

import { MarkdownBody } from "@/components/chat/MarkdownBody";
import { encodeFilePathForApi } from "@/lib/file-paths";
import styles from "../TextFileViewer.module.css";

interface Props {
  content: string;
  language: string;
  /** Absolute path of the previewed file — HTML preview renders via URL. */
  filePath?: string;
}

export function PreviewView({ content, language, filePath }: Props) {
  if (language === "html" && filePath) {
    // src (not srcDoc) so the browser streams the document itself — HTML
    // preview works at any size, independent of the text-preview cap.
    // Same sandbox as before: scripts run, no same-origin access.
    return (
      <iframe
        src={`/api/files/${encodeFilePathForApi(filePath)}?type=raw`}
        sandbox="allow-scripts"
        className={styles.htmlPreview}
        title="HTML preview"
      />
    );
  }
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
