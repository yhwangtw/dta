"use client";

import { useState, type FormEvent, type KeyboardEvent } from "react";
import { BookOpen, Bot, Check, GitBranch, ListChecks, MessageSquare, Mic, Paperclip, Plus, Send } from "lucide-react";
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
  size: 22,
  strokeWidth: 1.7,
  "aria-hidden": true as const,
} as const;

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
                    <Paperclip {...iconProps} />
                  </button>
                  <button type="button" onClick={onOpenMeetingAgent} aria-label={t("dta.chat.dictate")} title={t("dta.chat.dictate")}>
                    <Mic {...iconProps} />
                  </button>
                  <span>{t("dta.chat.hint")}</span>
                </div>
                <button type="submit" className={s.sendButton} disabled={!message.trim() || sending} aria-label={t("dta.chat.send")}>
                  <span>{sending ? t("dta.chat.starting") : t("dta.chat.send")}</span>
                  <Send {...iconProps} />
                </button>
              </div>
              {sendError && <p className={s.composerError} role="alert">{sendError}</p>}
            </form>
            <div className={s.heroActions}>
              <button type="button" className={s.primaryAction} onClick={onOpenMeetingAgent}>
                <Plus {...iconProps} />
                {t("dta.home.start")}
              </button>
              <button type="button" className={s.secondaryAction} onClick={onOpenReviews}>
                <Check {...iconProps} />
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
                <MessageSquare {...iconProps} />
              </span>
              <span className={s.status}>{t("dta.status.beta")}</span>
              <strong>{t("dta.agent.meeting")}</strong>
              <p>{t("dta.agent.meetingHint")}</p>
              <span className={s.cardAction}>{t("dta.agent.open")} <span aria-hidden>→</span></span>
            </button>

            <button type="button" className={s.agentCard} onClick={onOpenPMAgent}>
              <span className={`${s.agentIcon} ${s.agentIconCyan}`}>
                <GitBranch {...iconProps} />
              </span>
              <span className={s.status}>{t("dta.status.foundation")}</span>
              <strong>{t("dta.agent.pdlc")}</strong>
              <p>{t("dta.agent.pdlcHint")}</p>
              <span className={s.cardAction}>{t("dta.agent.openMeetings")} <span aria-hidden>→</span></span>
            </button>

            {departmentAgents.map((agent) => (
              <button type="button" className={s.agentCard} onClick={() => onOpenDepartmentAgent(agent)} key={agent.id}>
                <span className={`${s.agentIcon} ${s.agentIconCyan}`}>
                  <Bot {...iconProps} />
                </span>
                <span className={s.status}>{t("dta.status.foundation")}</span>
                <strong>{agent.displayName}</strong>
                <p>{agent.description}</p>
                <span className={s.cardAction}>{t("dta.agent.open")} <span aria-hidden>→</span></span>
              </button>
            ))}

            <button type="button" className={s.agentCard} onClick={onOpenReviews}>
              <span className={s.agentIcon}>
                <ListChecks {...iconProps} />
              </span>
              <span className={s.status}>{t("dta.status.foundation")}</span>
              <strong>{t("dta.agent.actions")}</strong>
              <p>{t("dta.agent.actionsHint")}</p>
              <span className={s.cardAction}>{t("dta.agent.reviewQueue")} <span aria-hidden>→</span></span>
            </button>

            <button type="button" className={s.agentCard} onClick={onOpenKnowledge}>
              <span className={s.agentIcon}>
                <BookOpen {...iconProps} />
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
