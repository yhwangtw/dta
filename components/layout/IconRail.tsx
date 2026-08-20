"use client";

import { useI18n } from "@/lib/i18n";
import {
  Activity,
  BarChart3,
  Bell,
  Bot,
  CalendarClock,
  CircleCheckBig,
  FileText,
  Folder,
  GitBranch,
  Layers3,
  LibraryBig,
  MessageSquare,
  Palette,
  Puzzle,
  Search,
} from "lucide-react";
import s from "./AppShell.module.css";

export type PanelView = "home" | "sessions" | "attention" | "agents" | "knowledge" | "schedule" | "files" | "search" | "changes" | "tgd";

interface IconRailProps {
  panelView: PanelView;
  homeActive: boolean;
  sidebarOpen: boolean;
  onSelectView: (view: PanelView) => void;
  legacyMode?: boolean;
  onOpenAnalytics?: () => void;
  onOpenModels?: () => void;
  onOpenSkills?: () => void;
  skillsDisabled?: boolean;
  onOpenExtensions?: () => void;
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
  legacyMode = false,
  onOpenAnalytics,
  onOpenModels,
  onOpenSkills,
  skillsDisabled = false,
  onOpenExtensions,
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
      {legacyMode ? (
        <>
          <RailButton view="sessions" label={t("sidebar.sessions")} panelView={panelView} sidebarOpen={sidebarOpen} onSelectView={onSelectView}><MessageSquare /></RailButton>
          <RailButton view="attention" label={t("attention.title")} panelView={panelView} sidebarOpen={sidebarOpen} onSelectView={onSelectView} badge={attentionUnreadCount}><Bell /></RailButton>
          <RailButton view="agents" label={t("agents.title")} panelView={panelView} sidebarOpen={sidebarOpen} onSelectView={onSelectView}><Bot /></RailButton>
          <RailButton view="schedule" label={t("schedule.title")} panelView={panelView} sidebarOpen={sidebarOpen} onSelectView={onSelectView}><CalendarClock /></RailButton>
          <div className={s.railDivider} aria-hidden />
          <RailButton view="files" label={t("sidebar.explorer")} panelView={panelView} sidebarOpen={sidebarOpen} onSelectView={onSelectView}><Folder /></RailButton>
          <RailButton view="search" label={t("search.title")} panelView={panelView} sidebarOpen={sidebarOpen} onSelectView={onSelectView}><Search /></RailButton>
          <RailButton view="changes" label={t("mobile.changes")} panelView={panelView} sidebarOpen={sidebarOpen} onSelectView={onSelectView}><GitBranch /></RailButton>
          <RailButton view="tgd" label={t("tgd.artifacts")} panelView={panelView} sidebarOpen={sidebarOpen} onSelectView={onSelectView}><FileText /></RailButton>
          <div className={s.railDivider} aria-hidden />
          <button type="button" onClick={onOpenAnalytics} title={t("topbar.analyticsTitle")} aria-label={t("topbar.analyticsTitle")} className={s.railButton}><BarChart3 className={s.railIcon} aria-hidden /></button>
          <div className={s.railSpacer} />
          <button type="button" onClick={onOpenModels} title={`${t("sidebar.models")} (⇧⌘M)`} aria-label={t("sidebar.models")} className={s.railButton}><Bot className={s.railIcon} aria-hidden /></button>
          <button type="button" onClick={onOpenSkills} disabled={skillsDisabled} title={`${t("sidebar.skills")} (⌘/)`} aria-label={t("sidebar.skills")} className={s.railButton}><Layers3 className={s.railIcon} aria-hidden /></button>
          <button type="button" onClick={onOpenExtensions} title={t("extensions.title")} aria-label={t("extensions.title")} className={s.railButton}><Puzzle className={s.railIcon} aria-hidden /></button>
        </>
      ) : (
        <>
          <RailButton view="sessions" label={t("dta.nav.meetings")} panelView={panelView} sidebarOpen={sidebarOpen} onSelectView={onSelectView}><FileText /></RailButton>
          <RailButton view="attention" label={t("dta.nav.review")} panelView={panelView} sidebarOpen={sidebarOpen} onSelectView={onSelectView} badge={attentionUnreadCount}><CircleCheckBig /></RailButton>
          <RailButton view="agents" label={t("dta.nav.processing")} panelView={panelView} sidebarOpen={sidebarOpen} onSelectView={onSelectView}><Activity /></RailButton>
          <div className={s.railDivider} aria-hidden />
          <RailButton view="knowledge" label={t("dta.nav.search")} panelView={panelView} sidebarOpen={sidebarOpen} onSelectView={onSelectView}><LibraryBig /></RailButton>
          <div className={s.railSpacer} />
        </>
      )}
      <button
        type="button"
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

function RailButton({
  view,
  label,
  panelView,
  sidebarOpen,
  onSelectView,
  badge = 0,
  children,
}: {
  view: PanelView;
  label: string;
  panelView: PanelView;
  sidebarOpen: boolean;
  onSelectView: (view: PanelView) => void;
  badge?: number;
  children: React.ReactElement;
}) {
  return (
    <button
      type="button"
      onClick={() => onSelectView(view)}
      title={label}
      aria-label={`${label}${badge > 0 ? ` · ${badge}` : ""}`}
      aria-pressed={panelView === view && sidebarOpen}
      className={`${s.railButton} ${panelView === view && sidebarOpen ? s.railButtonActive : ""}`}
    >
      <span className={s.railIcon} aria-hidden>{children}</span>
      {badge > 0 && <span className={s.railBadge}>{Math.min(badge, 99)}</span>}
    </button>
  );
}
