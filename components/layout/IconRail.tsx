"use client";

import {
  Activity,
  BarChart3,
  Bell,
  Bot,
  CalendarClock,
  CircleCheckBig,
  Cpu,
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
import { useI18n } from "@/lib/i18n";
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

const iconProps = { size: 17, strokeWidth: 1.8, "aria-hidden": true } as const;

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
    <nav className={s.rail} aria-label={t("navigation.primary")}>
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
          <RailButton view="sessions" label={t("sidebar.sessions")} panelView={panelView} sidebarOpen={sidebarOpen} onSelectView={onSelectView}><MessageSquare {...iconProps} /></RailButton>
          <RailButton view="attention" label={t("attention.title")} panelView={panelView} sidebarOpen={sidebarOpen} onSelectView={onSelectView} badge={attentionUnreadCount}><Bell {...iconProps} /></RailButton>
          <RailButton view="agents" label={t("agents.title")} panelView={panelView} sidebarOpen={sidebarOpen} onSelectView={onSelectView}><Bot {...iconProps} /></RailButton>
          <RailButton view="schedule" label={t("schedule.title")} panelView={panelView} sidebarOpen={sidebarOpen} onSelectView={onSelectView}><CalendarClock {...iconProps} /></RailButton>
          <div className={s.railDivider} aria-hidden />
          <RailButton view="files" label={t("sidebar.explorer")} panelView={panelView} sidebarOpen={sidebarOpen} onSelectView={onSelectView}><Folder {...iconProps} /></RailButton>
          <RailButton view="search" label={t("search.title")} panelView={panelView} sidebarOpen={sidebarOpen} onSelectView={onSelectView}><Search {...iconProps} /></RailButton>
          <RailButton view="changes" label={t("mobile.changes")} panelView={panelView} sidebarOpen={sidebarOpen} onSelectView={onSelectView}><GitBranch {...iconProps} /></RailButton>
          <RailButton view="tgd" label={t("tgd.artifacts")} panelView={panelView} sidebarOpen={sidebarOpen} onSelectView={onSelectView}><FileText {...iconProps} /></RailButton>
          <div className={s.railDivider} aria-hidden />
          {onOpenAnalytics && <IconAction label={t("topbar.analyticsTitle")} onClick={onOpenAnalytics}><BarChart3 {...iconProps} /></IconAction>}
          <div className={s.railSpacer} />
          {onOpenModels && <IconAction label={`${t("sidebar.models")} (⇧⌘M)`} ariaLabel={t("sidebar.models")} onClick={onOpenModels}><Cpu {...iconProps} /></IconAction>}
          {onOpenSkills && <IconAction label={`${t("sidebar.skills")} (⌘/)`} ariaLabel={t("sidebar.skills")} onClick={onOpenSkills} disabled={skillsDisabled}><Layers3 {...iconProps} /></IconAction>}
          {onOpenExtensions && <IconAction label={t("extensions.title")} onClick={onOpenExtensions}><Puzzle {...iconProps} /></IconAction>}
        </>
      ) : (
        <>
          <RailButton view="sessions" label={t("dta.nav.meetings")} panelView={panelView} sidebarOpen={sidebarOpen} onSelectView={onSelectView}><FileText {...iconProps} /></RailButton>
          <RailButton view="attention" label={t("dta.nav.review")} panelView={panelView} sidebarOpen={sidebarOpen} onSelectView={onSelectView} badge={attentionUnreadCount}><CircleCheckBig {...iconProps} /></RailButton>
          <RailButton view="agents" label={t("dta.nav.processing")} panelView={panelView} sidebarOpen={sidebarOpen} onSelectView={onSelectView}><Activity {...iconProps} /></RailButton>
          <div className={s.railDivider} aria-hidden />
          <RailButton view="knowledge" label={t("dta.nav.search")} panelView={panelView} sidebarOpen={sidebarOpen} onSelectView={onSelectView}><LibraryBig {...iconProps} /></RailButton>
          <div className={s.railSpacer} />
        </>
      )}
      <IconAction
        label={t("appearance.title")}
        onClick={onToggleAppearance}
        pressed={appearanceOpen}
      >
        <Palette {...iconProps} />
      </IconAction>
    </nav>
  );
}

function IconAction({ label, ariaLabel, onClick, disabled, pressed, children }: {
  label: string;
  ariaLabel?: string;
  onClick: () => void;
  disabled?: boolean;
  pressed?: boolean;
  children: React.ReactElement;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      title={label}
      aria-label={ariaLabel ?? label}
      aria-pressed={pressed}
      className={`${s.railButton} ${pressed ? s.railButtonActive : ""}`}
    >
      <span className={s.railIcon} aria-hidden>{children}</span>
    </button>
  );
}

function RailButton({ view, label, panelView, sidebarOpen, onSelectView, badge = 0, children }: {
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
