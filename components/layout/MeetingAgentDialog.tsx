"use client";

import { useEffect, useState, type FormEvent } from "react";
import { useI18n } from "@/lib/i18n";
import { buildMeetingMinutesPrompt, type MeetingOutputLanguage } from "@/lib/meeting-agent";
import s from "./MeetingAgentDialog.module.css";

interface Props {
  cwd: string | null;
  onClose: () => void;
  onChooseWorkspace: () => void;
  onLaunch: (prompt: string) => void;
}

function workspaceName(cwd: string): string {
  return cwd.split(/[\\/]/).filter(Boolean).pop() ?? cwd;
}

export function MeetingAgentDialog({ cwd, onClose, onChooseWorkspace, onLaunch }: Props) {
  const { locale, t } = useI18n();
  const [title, setTitle] = useState("");
  const [date, setDate] = useState("");
  const [participants, setParticipants] = useState("");
  const [objective, setObjective] = useState("");
  const [source, setSource] = useState("");
  const [outputLanguage, setOutputLanguage] = useState<MeetingOutputLanguage>(locale === "zh" ? "zh-TW" : "en");

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  const submit = (event: FormEvent) => {
    event.preventDefault();
    if (!cwd || !source.trim()) return;
    onLaunch(buildMeetingMinutesPrompt({ title, date, participants, objective, source, outputLanguage }));
  };

  return (
    <div className={s.overlay} onMouseDown={(event) => { if (event.target === event.currentTarget) onClose(); }}>
      <section className={s.dialog} role="dialog" aria-modal="true" aria-labelledby="meeting-agent-title" data-testid="meeting-agent-dialog">
        <header className={s.header}>
          <div className={s.headingGroup}>
            <span className={s.badge}>DTA · MEETING INTELLIGENCE</span>
            <h2 id="meeting-agent-title">{t("meetingAgent.title")}</h2>
            <p>{t("meetingAgent.description")}</p>
          </div>
          <button type="button" className={s.close} onClick={onClose} aria-label={t("common.close")}>×</button>
        </header>

        <form className={s.form} onSubmit={submit}>
          <div className={s.workspace}>
            <div>
              <span>{t("meetingAgent.workspace")}</span>
              <strong>{cwd ? workspaceName(cwd) : t("meetingAgent.noWorkspace")}</strong>
              {cwd && <small title={cwd}>{cwd}</small>}
            </div>
            {!cwd && <button type="button" onClick={onChooseWorkspace}>{t("meetingAgent.chooseWorkspace")}</button>}
          </div>

          <div className={s.twoColumns}>
            <label className={s.field}>
              <span>{t("meetingAgent.meetingTitle")}</span>
              <input autoFocus value={title} onChange={(event) => setTitle(event.target.value)} maxLength={160} placeholder={t("meetingAgent.meetingTitlePlaceholder")} />
            </label>
            <label className={s.field}>
              <span>{t("meetingAgent.date")}</span>
              <input type="date" value={date} onChange={(event) => setDate(event.target.value)} />
            </label>
          </div>

          <label className={s.field}>
            <span>{t("meetingAgent.participants")}</span>
            <input value={participants} onChange={(event) => setParticipants(event.target.value)} maxLength={1000} placeholder={t("meetingAgent.participantsPlaceholder")} />
          </label>

          <label className={s.field}>
            <span>{t("meetingAgent.objective")}</span>
            <input value={objective} onChange={(event) => setObjective(event.target.value)} maxLength={1000} placeholder={t("meetingAgent.objectivePlaceholder")} />
          </label>

          <label className={s.field}>
            <span>{t("meetingAgent.source")}</span>
            <textarea
              required
              value={source}
              onChange={(event) => setSource(event.target.value)}
              maxLength={200_000}
              placeholder={t("meetingAgent.sourcePlaceholder")}
            />
            <small>{t("meetingAgent.sourceHint")}</small>
          </label>

          <div className={s.outputRow}>
            <div>
              <span>{t("meetingAgent.outputIncludes")}</span>
              <p>{t("meetingAgent.outputList")}</p>
            </div>
            <label className={s.language}>
              <span>{t("meetingAgent.language")}</span>
              <select value={outputLanguage} onChange={(event) => setOutputLanguage(event.target.value as MeetingOutputLanguage)}>
                <option value="zh-TW">繁體中文</option>
                <option value="en">English</option>
              </select>
            </label>
          </div>

          <footer className={s.footer}>
            <p>{t("meetingAgent.reviewNote")}</p>
            <div>
              <button type="button" className={s.secondary} onClick={onClose}>{t("common.cancel")}</button>
              <button type="submit" className={s.primary} disabled={!cwd || !source.trim()}>{t("meetingAgent.launch")}</button>
            </div>
          </footer>
        </form>
      </section>
    </div>
  );
}
