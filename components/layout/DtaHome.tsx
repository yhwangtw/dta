"use client";

import { useState, type FormEvent, type KeyboardEvent } from "react";
import { useI18n } from "@/lib/i18n";
import type { DepartmentAgentSummary } from "./DepartmentAgentDialog";
import s from "./DtaHome.module.css";

interface DtaHomeProps {
  attentionCount: number;
  onOpenAgents: () => void;
  onOpenMeetingAgent: () => void;
  onOpenPMAgent: () => void;
  departmentAgents: DepartmentAgentSummary[];
  onOpenDepartmentAgent: (agent: DepartmentAgentSummary) => void;
  onOpenReviews: () => void;
  onOpenKnowledge: () => void;
  onStartConversation: (message: string) => Promise<void>;
}

const iconProps = {
  width: 22,
  height: 22,
  viewBox: "0 0 24 24",
  fill: "none",
  stroke: "currentColor",
  strokeWidth: 1.7,
  strokeLinecap: "round" as const,
  strokeLinejoin: "round" as const,
  "aria-hidden": true,
};

export function DtaHome({
  attentionCount,
  onOpenAgents,
  onOpenMeetingAgent,
  onOpenPMAgent,
  departmentAgents,
  onOpenDepartmentAgent,
  onOpenReviews,
  onOpenKnowledge,
  onStartConversation,
}: DtaHomeProps) {
  const { t } = useI18n();
  const [message, setMessage] = useState("");
  const [sending, setSending] = useState(false);
  const [sendError, setSendError] = useState("");

  const submitConversation = async (event: FormEvent) => {
    event.preventDefault();
    const prompt = message.trim();
    if (!prompt || sending) return;
    setSending(true);
    setSendError("");
    try {
      await onStartConversation(prompt);
    } catch (error) {
      setSendError(error instanceof Error ? error.message : t("dta.chat.error"));
      setSending(false);
    }
  };

  const handleComposerKeyDown = (event: KeyboardEvent<HTMLTextAreaElement>) => {
    if (event.key === "Enter" && !event.shiftKey && !event.nativeEvent.isComposing) {
      event.preventDefault();
      event.currentTarget.form?.requestSubmit();
    }
  };

  return (
    <main className={s.root} aria-labelledby="dta-home-title" data-testid="dta-home">
      <div className={s.canvas}>
        <section className={s.hero}>
          <div className={s.heroCopy}>
            <div className={s.eyebrow}>
              <span className={s.mark} aria-hidden>DTA</span>
              <span>{t("dta.home.eyebrow")}</span>
            </div>
            <h1 id="dta-home-title">{t("dta.home.title")}</h1>
            <p>{t("dta.home.subtitle")}</p>
            <form className={s.conversationComposer} onSubmit={submitConversation}>
              <label htmlFor="dta-meeting-message">{t("dta.chat.label")}</label>
              <textarea
                id="dta-meeting-message"
                value={message}
                onChange={(event) => setMessage(event.target.value)}
                onKeyDown={handleComposerKeyDown}
                placeholder={t("dta.chat.placeholder")}
                rows={3}
                maxLength={20_000}
              />
              <div className={s.composerFooter}>
                <div className={s.composerTools}>
                  <button type="button" onClick={onOpenMeetingAgent} aria-label={t("dta.chat.attach")} title={t("dta.chat.attach")}>
                    <svg {...iconProps}><path d="m21.4 11.6-8.9 8.9a6 6 0 0 1-8.5-8.5l9.4-9.4a4 4 0 0 1 5.7 5.7l-9.4 9.4a2 2 0 1 1-2.8-2.8l8.7-8.7" /></svg>
                  </button>
                  <button type="button" onClick={onOpenMeetingAgent} aria-label={t("dta.chat.dictate")} title={t("dta.chat.dictate")}>
                    <svg {...iconProps}><rect x="9" y="2" width="6" height="12" rx="3" /><path d="M5 10a7 7 0 0 0 14 0M12 17v5M8 22h8" /></svg>
                  </button>
                  <span>{t("dta.chat.hint")}</span>
                </div>
                <button type="submit" className={s.sendButton} disabled={!message.trim() || sending} aria-label={t("dta.chat.send")}>
                  <span>{sending ? t("dta.chat.starting") : t("dta.chat.send")}</span>
                  <svg {...iconProps}><path d="m5 12 14-7-4 14-3-6-7-1Z" /><path d="m12 13 7-8" /></svg>
                </button>
              </div>
              {sendError && <p className={s.composerError} role="alert">{sendError}</p>}
            </form>
            <div className={s.heroActions}>
              <button type="button" className={s.primaryAction} onClick={onOpenMeetingAgent}>
                <svg {...iconProps}><path d="M12 3v18M3 12h18" /></svg>
                {t("dta.home.start")}
              </button>
              <button type="button" className={s.secondaryAction} onClick={onOpenReviews}>
                <svg {...iconProps}><path d="M20 6 9 17l-5-5" /></svg>
                {t("dta.home.review")}
                {attentionCount > 0 && <span className={s.count}>{Math.min(attentionCount, 99)}</span>}
              </button>
            </div>
          </div>

          <aside className={s.controlCard} aria-label={t("dta.home.controlTitle")}>
            <div className={s.controlHeader}>
              <span className={s.signal} aria-hidden />
              <strong>{t("dta.home.controlTitle")}</strong>
            </div>
            <div className={s.controlFlow}>
              <div><span>01</span><p><strong>{t("dta.home.machine")}</strong>{t("dta.home.machineHint")}</p></div>
              <div><span>02</span><p><strong>{t("dta.home.agentLayer")}</strong>{t("dta.home.agentLayerHint")}</p></div>
              <div><span>03</span><p><strong>{t("dta.home.human")}</strong>{t("dta.home.humanHint")}</p></div>
            </div>
            <p className={s.controlHint}>{t("dta.home.controlHint")}</p>
          </aside>
        </section>

        <section className={s.catalog} aria-labelledby="dta-agent-catalog-title">
          <div className={s.sectionHeading}>
            <div>
              <span>{t("dta.home.catalogEyebrow")}</span>
              <h2 id="dta-agent-catalog-title">{t("dta.home.catalogTitle")}</h2>
            </div>
            <button type="button" onClick={onOpenAgents}>{t("dta.home.viewRuns")}</button>
          </div>

          <div className={s.agentGrid}>
            <button type="button" className={s.agentCard} onClick={onOpenMeetingAgent}>
              <span className={`${s.agentIcon} ${s.agentIconPrimary}`}>
                <svg {...iconProps}><path d="M21 15a3 3 0 0 1-3 3H8l-5 3V6a3 3 0 0 1 3-3h12a3 3 0 0 1 3 3z" /><path d="M8 8h8M8 12h5" /></svg>
              </span>
              <span className={s.status}>{t("dta.status.beta")}</span>
              <strong>{t("dta.agent.meeting")}</strong>
              <p>{t("dta.agent.meetingHint")}</p>
              <span className={s.cardAction}>{t("dta.agent.open")} <span aria-hidden>→</span></span>
            </button>

            <button type="button" className={s.agentCard} onClick={onOpenPMAgent}>
              <span className={`${s.agentIcon} ${s.agentIconCyan}`}>
                <svg {...iconProps}><path d="M6 3v12M18 9v12" /><circle cx="6" cy="18" r="3" /><circle cx="18" cy="6" r="3" /><path d="M9 18h3a6 6 0 0 0 6-6V9" /></svg>
              </span>
              <span className={s.status}>{t("dta.status.foundation")}</span>
              <strong>{t("dta.agent.pdlc")}</strong>
              <p>{t("dta.agent.pdlcHint")}</p>
              <span className={s.cardAction}>{t("dta.agent.openMeetings")} <span aria-hidden>→</span></span>
            </button>

            {departmentAgents.map((agent) => (
              <button type="button" className={s.agentCard} onClick={() => onOpenDepartmentAgent(agent)} key={agent.id}>
                <span className={`${s.agentIcon} ${s.agentIconCyan}`}>
                  <svg {...iconProps}><rect x="4" y="4" width="16" height="16" rx="3" /><path d="M9 9h6M9 13h4" /><path d="M8 2v2M16 2v2" /></svg>
                </span>
                <span className={s.status}>{t("dta.status.foundation")}</span>
                <strong>{agent.displayName}</strong>
                <p>{agent.description}</p>
                <span className={s.cardAction}>{t("dta.agent.open")} <span aria-hidden>→</span></span>
              </button>
            ))}

            <button type="button" className={s.agentCard} onClick={onOpenReviews}>
              <span className={s.agentIcon}>
                <svg {...iconProps}><path d="M9 11l3 3L22 4" /><path d="M21 12v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11" /></svg>
              </span>
              <span className={s.status}>{t("dta.status.foundation")}</span>
              <strong>{t("dta.agent.actions")}</strong>
              <p>{t("dta.agent.actionsHint")}</p>
              <span className={s.cardAction}>{t("dta.agent.reviewQueue")} <span aria-hidden>→</span></span>
            </button>

            <button type="button" className={s.agentCard} onClick={onOpenKnowledge}>
              <span className={s.agentIcon}>
                <svg {...iconProps}><path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20" /><path d="M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2z" /></svg>
              </span>
              <span className={s.status}>{t("dta.status.planned")}</span>
              <strong>{t("dta.agent.knowledge")}</strong>
              <p>{t("dta.agent.knowledgeHint")}</p>
              <span className={s.cardAction}>{t("dta.agent.search")} <span aria-hidden>→</span></span>
            </button>
          </div>
        </section>
      </div>
    </main>
  );
}
