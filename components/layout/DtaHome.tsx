"use client";

import { useI18n } from "@/lib/i18n";
import s from "./DtaHome.module.css";

interface DtaHomeProps {
  attentionCount: number;
  hasWorkspace: boolean;
  onOpenAgents: () => void;
  onOpenMeetingAgent: () => void;
  onOpenReviews: () => void;
  onOpenSessions: () => void;
  onOpenWorkflows: () => void;
  onOpenKnowledge: () => void;
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
  hasWorkspace,
  onOpenAgents,
  onOpenMeetingAgent,
  onOpenReviews,
  onOpenSessions,
  onOpenWorkflows,
  onOpenKnowledge,
}: DtaHomeProps) {
  const { t } = useI18n();

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

        {!hasWorkspace && (
          <section className={s.workspaceNotice} aria-label={t("dta.home.workspaceTitle")}>
            <svg {...iconProps}><path d="M3 7h6l2 3h10v9a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z" /><path d="M3 7V5a2 2 0 0 1 2-2h4l2 3" /></svg>
            <div>
              <strong>{t("dta.home.workspaceTitle")}</strong>
              <span>{t("dta.home.workspaceHint")}</span>
            </div>
            <button type="button" onClick={onOpenSessions}>{t("dta.home.chooseWorkspace")}</button>
          </section>
        )}

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

            <button type="button" className={s.agentCard} onClick={onOpenWorkflows}>
              <span className={`${s.agentIcon} ${s.agentIconCyan}`}>
                <svg {...iconProps}><path d="M6 3v12M18 9v12" /><circle cx="6" cy="18" r="3" /><circle cx="18" cy="6" r="3" /><path d="M9 18h3a6 6 0 0 0 6-6V9" /></svg>
              </span>
              <span className={s.status}>{t("dta.status.foundation")}</span>
              <strong>{t("dta.agent.pdlc")}</strong>
              <p>{t("dta.agent.pdlcHint")}</p>
              <span className={s.cardAction}>{t("dta.agent.openWorkflow")} <span aria-hidden>→</span></span>
            </button>

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
