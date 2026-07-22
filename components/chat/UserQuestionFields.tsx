"use client";

import type { Dispatch, RefObject, SetStateAction } from "react";
import { useI18n } from "@/lib/i18n";
import type { AskUserOption, WebExtensionUIDialogRequest } from "@/lib/web-extension-ui-types";
import styles from "./ExtensionUIPanel.module.css";

interface ChoiceListProps {
  questionId?: string;
  options: AskUserOption[];
  selected?: string;
  firstRef?: RefObject<HTMLButtonElement | null>;
  onSelect: (value: string) => void;
}

export function QuestionChoiceList({ questionId, options, selected, firstRef, onSelect }: ChoiceListProps) {
  return (
    <div className={styles.choices} role="listbox">
      {options.map((option, index) => (
        <button
          key={option.label}
          ref={index === 0 ? firstRef : undefined}
          type="button"
          role="option"
          aria-selected={selected === option.label}
          data-question-id={questionId}
          data-value={option.label}
          className={`${styles.choice} ${selected === option.label ? styles.choiceSelected : ""}`}
          onClick={() => onSelect(option.label)}
        >
          <span className={styles.choiceMark} aria-hidden>{selected === option.label ? "●" : "○"}</span>
          <span className={styles.choiceCopy}>
            <span className={styles.choiceLabel}>{option.label}</span>
            {option.description && <span className={styles.choiceDescription}>{option.description}</span>}
          </span>
        </button>
      ))}
    </div>
  );
}

export function AskUserFields({ request, answers, setAnswers, customAnswers, setCustomAnswers, firstControlRef, firstInputRef }: {
  request: Extract<WebExtensionUIDialogRequest, { method: "ask_user" }>;
  answers: Record<string, string>;
  setAnswers: Dispatch<SetStateAction<Record<string, string>>>;
  customAnswers: Set<string>;
  setCustomAnswers: Dispatch<SetStateAction<Set<string>>>;
  firstControlRef: RefObject<HTMLButtonElement | null>;
  firstInputRef: RefObject<HTMLInputElement | HTMLTextAreaElement | null>;
}) {
  const { t } = useI18n();
  return request.questions.map((question, index) => (
    <fieldset key={question.id} className={styles.questionGroup}>
      <legend className={styles.questionLegend}>
        {question.header && <span className={styles.questionHeader}>{question.header}</span>}
        <span>{question.question}</span>
      </legend>
      {question.options.length > 0 && (
        <QuestionChoiceList
          questionId={question.id}
          options={question.options}
          selected={customAnswers.has(question.id) ? undefined : answers[question.id]}
          firstRef={index === 0 ? firstControlRef : undefined}
          onSelect={(value) => {
            setCustomAnswers((current) => { const next = new Set(current); next.delete(question.id); return next; });
            setAnswers((current) => ({ ...current, [question.id]: value }));
          }}
        />
      )}
      {question.allowOther && question.options.length > 0 && (
        <button
          type="button"
          className={`${styles.choice} ${customAnswers.has(question.id) ? styles.choiceSelected : ""}`}
          onClick={() => {
            setCustomAnswers((current) => new Set(current).add(question.id));
            setAnswers((current) => ({ ...current, [question.id]: "" }));
          }}
        >
          <span className={styles.choiceMark} aria-hidden>{customAnswers.has(question.id) ? "●" : "○"}</span>
          <span className={styles.choiceLabel}>{t("extensionUI.other")}</span>
        </button>
      )}
      {question.allowOther && (question.options.length === 0 || customAnswers.has(question.id)) && (
        <input
          ref={index === 0 ? firstInputRef as RefObject<HTMLInputElement> : undefined}
          data-question-id={question.id}
          className={styles.textInput}
          aria-label={question.question}
          value={answers[question.id] ?? ""}
          placeholder={t("extensionUI.typeAnswer")}
          onChange={(event) => setAnswers((current) => ({ ...current, [question.id]: event.target.value }))}
        />
      )}
    </fieldset>
  ));
}
