"use client";

import { DiffView, type DiffAnnotation } from "../DiffView";

interface Props {
  oldContent: string;
  newContent: string;
  language: string;
  onAnnotate?: (annotation: DiffAnnotation) => void;
}

export function DiffViewMode({ oldContent, newContent, language, onAnnotate }: Props) {
  return <DiffView oldContent={oldContent} newContent={newContent} language={language} onAnnotate={onAnnotate} />;
}
