"use client";

import { useI18n } from "@/lib/i18n";
import { Activity, CircleCheckBig, FileText, LibraryBig, Palette } from "lucide-react";
import s from "./AppShell.module.css";

export type PanelView = "home" | "sessions" | "attention" | "agents" | "knowledge" | "schedule" | "files" | "search" | "changes" | "tgd";

interface IconRailProps {
  panelView: PanelView;
  homeActive: boolean;
  sidebarOpen: boolean;
  onSelectView: (view: PanelView) => void;
  appearanceOpen: boolean;
  attentionUnreadCount?: number;
  onToggleAppearance: () => void;
}

/**
 * Left icon rail — global navigation, always visible. Pure presentation:
 * every click is delegated to the parent. Theme, language, typography, and
 * density intentionally live together in the Appearance panel.
 */
export function IconRail({
  panelView,
  homeActive,
  sidebarOpen,
  onSelectView,
  appearanceOpen,
  attentionUnreadCount = 0,
  onToggleAppearance,
}: IconRailProps) {
  const { t } = useI18n();

  return (
    <nav className={s.rail} aria-label="Primary">
      <button
        type="button"
        onClick={() => onSelectView("home")}
        title={t("dta.nav.home")}
        aria-label={t("dta.nav.home")}
        aria-current={homeActive ? "page" : undefined}
        className={`${s.railBrand} ${homeActive ? s.railBrandActive : ""}`}
      >
        DTA
      </button>
      <div className={s.railDivider} aria-hidden />
      <button
        onClick={() => onSelectView("sessions")}
        title={t("dta.nav.meetings")}
        aria-label={t("dta.nav.meetings")}
        aria-pressed={panelView === "sessions" && sidebarOpen}
        className={`${s.railButton} ${panelView === "sessions" && sidebarOpen ? s.railButtonActive : ""}`}
      >
        <FileText className={s.railIcon} aria-hidden />
      </button>
      <button
        onClick={() => onSelectView("attention")}
        title={t("dta.nav.review")}
        aria-label={`${t("dta.nav.review")}${attentionUnreadCount > 0 ? ` · ${attentionUnreadCount}` : ""}`}
        aria-pressed={panelView === "attention" && sidebarOpen}
        className={`${s.railButton} ${panelView === "attention" && sidebarOpen ? s.railButtonActive : ""}`}
      >
        <CircleCheckBig className={s.railIcon} aria-hidden />
        {attentionUnreadCount > 0 && <span className={s.railBadge}>{Math.min(attentionUnreadCount, 99)}</span>}
      </button>
      <button
        onClick={() => onSelectView("agents")}
        title={t("dta.nav.processing")}
        aria-label={t("dta.nav.processing")}
        aria-pressed={panelView === "agents" && sidebarOpen}
        className={`${s.railButton} ${panelView === "agents" && sidebarOpen ? s.railButtonActive : ""}`}
      >
        <Activity className={s.railIcon} aria-hidden />
      </button>
      <div className={s.railDivider} aria-hidden />
      <button
        onClick={() => onSelectView("knowledge")}
        title={t("dta.nav.search")}
        aria-label={t("dta.nav.search")}
        aria-pressed={panelView === "knowledge" && sidebarOpen}
        className={`${s.railButton} ${panelView === "knowledge" && sidebarOpen ? s.railButtonActive : ""}`}
      >
        <LibraryBig className={s.railIcon} aria-hidden />
      </button>
      <div className={s.railSpacer} />
      <button
        onClick={onToggleAppearance}
        title={t("appearance.title")}
        aria-pressed={appearanceOpen}
        className={`${s.railButton} ${appearanceOpen ? s.railButtonActive : ""}`}
      >
        <Palette className={s.railIcon} aria-hidden />
      </button>
    </nav>
  );
}
