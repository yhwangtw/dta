"use client";

import { useEffect, useState, type ReactNode } from "react";
import { useI18n } from "@/lib/i18n";
import type { PanelView } from "./IconRail";
import s from "./AppShell.module.css";

interface Props {
  panelView: PanelView;
  homeActive: boolean;
  panelOpen: boolean;
  filePanelOpen: boolean;
  onShowHome: () => void;
  onShowChat: () => void;
  onSelectView: (view: PanelView) => void;
  onOpenAppearance: () => void;
  attentionUnreadCount?: number;
}

interface NavButtonProps {
  active?: boolean;
  icon: ReactNode;
  label: string;
  onClick: () => void;
  expanded?: boolean;
  badge?: number;
}

function NavButton({ active, icon, label, onClick, expanded, badge }: NavButtonProps) {
  return (
    <button
      type="button"
      className={`${s.mobileNavButton} ${active ? s.mobileNavButtonActive : ""}`}
      onClick={onClick}
      aria-current={active ? "page" : undefined}
      aria-expanded={expanded}
    >
      <span className={s.mobileNavIcon} aria-hidden>
        {icon}
        {badge ? <span className={s.mobileNavBadge}>{Math.min(badge, 99)}</span> : null}
      </span>
      <span>{label}</span>
    </button>
  );
}

interface MoreActionProps {
  icon: ReactNode;
  label: string;
  onClick: () => void;
  disabled?: boolean;
  active?: boolean;
  badge?: number;
}

function MoreAction({ icon, label, onClick, disabled, active, badge }: MoreActionProps) {
  return (
    <button
      type="button"
      className={`${s.mobileMoreAction} ${active ? s.mobileMoreActionActive : ""}`}
      onClick={onClick}
      disabled={disabled}
    >
      <span aria-hidden>{icon}</span>
      <span>{label}</span>
      {badge ? <span className={s.mobileActionBadge}>{Math.min(badge, 99)}</span> : null}
    </button>
  );
}

const iconProps = {
  width: 20,
  height: 20,
  viewBox: "0 0 24 24",
  fill: "none",
  stroke: "currentColor",
  strokeWidth: 1.8,
  strokeLinecap: "round" as const,
  strokeLinejoin: "round" as const,
};

export function MobileNavigation({
  panelView,
  homeActive,
  panelOpen,
  filePanelOpen,
  onShowHome,
  onShowChat,
  onSelectView,
  onOpenAppearance,
  attentionUnreadCount = 0,
}: Props) {
  const [moreOpen, setMoreOpen] = useState(false);
  const { t } = useI18n();
  const secondaryViewActive = panelOpen && ["sessions", "knowledge"].includes(panelView);

  useEffect(() => {
    if (!moreOpen) return;
    const close = (event: KeyboardEvent) => {
      if (event.key === "Escape") setMoreOpen(false);
    };
    window.addEventListener("keydown", close);
    return () => window.removeEventListener("keydown", close);
  }, [moreOpen]);

  const run = (action: () => void) => {
    setMoreOpen(false);
    action();
  };

  return (
    <>
      {moreOpen && (
        <button
          type="button"
          className={s.mobileSheetBackdrop}
          onClick={() => setMoreOpen(false)}
          aria-label={t("mobile.closeMore")}
        />
      )}
      <nav className={s.mobileNav} aria-label="Primary">
        <NavButton
          active={homeActive && !moreOpen}
          label={t("mobile.home")}
          onClick={onShowHome}
          icon={<svg {...iconProps}><path d="m3 11 9-8 9 8" /><path d="M5 10v10h14V10M9 20v-6h6v6" /></svg>}
        />
        <NavButton
          active={panelOpen && panelView === "agents"}
          label={t("mobile.agents")}
          onClick={() => onSelectView("agents")}
          icon={<svg {...iconProps}><rect x="4" y="4" width="16" height="16" rx="3" /><path d="M9 9h6M9 13h4" /><path d="M8 2v2M16 2v2" /></svg>}
        />
        <NavButton
          active={panelOpen && panelView === "attention"}
          label={t("mobile.reviews")}
          badge={attentionUnreadCount}
          onClick={() => onSelectView("attention")}
          icon={<svg {...iconProps}><path d="M20 6 9 17l-5-5" /><path d="M21 12v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11" /></svg>}
        />
        <NavButton
          active={!homeActive && !panelOpen && !filePanelOpen && !moreOpen}
          label={t("mobile.chat")}
          onClick={onShowChat}
          icon={<svg {...iconProps}><path d="M21 15a2 2 0 0 1-2 2H8l-5 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" /></svg>}
        />
        <NavButton
          active={moreOpen || secondaryViewActive}
          expanded={moreOpen}
          label={t("mobile.more")}
          onClick={() => setMoreOpen((open) => !open)}
          icon={<svg {...iconProps}><circle cx="5" cy="12" r="1" fill="currentColor" /><circle cx="12" cy="12" r="1" fill="currentColor" /><circle cx="19" cy="12" r="1" fill="currentColor" /></svg>}
        />
      </nav>

      {moreOpen && (
        <section className={s.mobileMoreSheet} aria-label={t("mobile.moreActions")}>
          <div className={s.mobileSheetHandle} aria-hidden />
          <div className={s.mobileSheetHeader}>
            <strong>{t("mobile.moreActions")}</strong>
            <button type="button" onClick={() => setMoreOpen(false)} aria-label={t("mobile.closeMore")}>×</button>
          </div>
          <div className={s.mobileMoreGroup}>
            <div className={s.mobileMoreGroupTitle}>{t("mobile.work")}</div>
            <div className={s.mobileMoreGrid}>
              <MoreAction label={t("mobile.sessions")} active={panelOpen && panelView === "sessions"} onClick={() => run(() => onSelectView("sessions"))} icon={<svg {...iconProps}><rect x="4" y="4" width="16" height="16" rx="3" /><path d="M8 9h8M8 13h6M8 17h4" /></svg>} />
              <MoreAction label={t("mobile.search")} active={panelOpen && panelView === "knowledge"} onClick={() => run(() => onSelectView("knowledge"))} icon={<svg {...iconProps}><path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20" /><path d="M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2z" /><circle cx="14" cy="10" r="3" /></svg>} />
            </div>
          </div>
          <div className={s.mobileMoreGroup}>
            <div className={s.mobileMoreGroupTitle}>{t("mobile.settings")}</div>
            <div className={s.mobileMoreGrid}>
              <MoreAction label={t("appearance.title")} onClick={() => run(onOpenAppearance)} icon={<svg {...iconProps}><circle cx="12" cy="12" r="9" /><path d="M8 15h8M9 9h.01M12 7h.01M15 9h.01" /></svg>} />
            </div>
          </div>
        </section>
      )}
    </>
  );
}
