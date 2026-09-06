"use client";

import { useEffect, useState, type ReactNode } from "react";
import {
  Activity,
  BarChart3,
  Bell,
  Bot,
  Box,
  CalendarDays,
  CircleCheckBig,
  Cpu,
  Ellipsis,
  FileText,
  Folder,
  GitBranch,
  Home,
  Layers3,
  LibraryBig,
  List,
  MessageSquare,
  Palette,
  Puzzle,
  Search,
  X,
} from "lucide-react";
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
  legacyMode?: boolean;
  onOpenAnalytics?: () => void;
  onOpenModels?: () => void;
  onOpenSkills?: () => void;
  skillsDisabled?: boolean;
  onOpenExtensions?: () => void;
  onOpenAppearance: () => void;
  onOpenDesignMode?: () => void;
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
      aria-label={label}
    >
      <span aria-hidden>{icon}</span>
      <span>{label}</span>
      {badge ? <span className={s.mobileActionBadge}>{Math.min(badge, 99)}</span> : null}
    </button>
  );
}

const iconProps = { size: 20, strokeWidth: 1.8, "aria-hidden": true } as const;

export function MobileNavigation({
  panelView,
  homeActive,
  panelOpen,
  filePanelOpen,
  onShowHome,
  onShowChat,
  onSelectView,
  legacyMode = false,
  onOpenAnalytics,
  onOpenModels,
  onOpenSkills,
  skillsDisabled = false,
  onOpenExtensions,
  onOpenAppearance,
  onOpenDesignMode,
  attentionUnreadCount = 0,
}: Props) {
  const [moreOpen, setMoreOpen] = useState(false);
  const { t } = useI18n();
  const secondaryViewActive = panelOpen && (legacyMode
    ? ["sessions", "schedule", "files", "search", "changes", "tgd"].includes(panelView)
    : ["sessions", "knowledge"].includes(panelView));

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
      <nav
        className={s.mobileNav}
        data-legacy={legacyMode || undefined}
        aria-label={t("navigation.primary")}
        aria-hidden={moreOpen || undefined}
        inert={moreOpen ? true : undefined}
      >
        <NavButton active={homeActive && !moreOpen} label={t("mobile.home")} onClick={onShowHome} icon={<Home {...iconProps} />} />
        {legacyMode ? (
          <>
            <NavButton active={panelOpen && panelView === "sessions"} label={t("sidebar.sessions")} onClick={() => onSelectView("sessions")} icon={<List {...iconProps} />} />
            <NavButton active={panelOpen && panelView === "files"} label={t("mobile.files")} onClick={() => onSelectView("files")} icon={<Folder {...iconProps} />} />
            <NavButton active={panelOpen && panelView === "search"} label={t("search.title")} onClick={() => onSelectView("search")} icon={<Search {...iconProps} />} />
          </>
        ) : (
          <>
            <NavButton active={panelOpen && panelView === "agents"} label={t("mobile.agents")} onClick={() => onSelectView("agents")} icon={<Activity {...iconProps} />} />
            <NavButton active={panelOpen && panelView === "attention"} label={t("mobile.reviews")} badge={attentionUnreadCount} onClick={() => onSelectView("attention")} icon={<CircleCheckBig {...iconProps} />} />
          </>
        )}
        <NavButton active={!homeActive && !panelOpen && !filePanelOpen && !moreOpen} label={legacyMode ? t("mobile.codingChat") : t("mobile.chat")} onClick={onShowChat} icon={<MessageSquare {...iconProps} />} />
        <NavButton active={moreOpen || secondaryViewActive} expanded={moreOpen} label={t("mobile.more")} onClick={() => setMoreOpen((open) => !open)} icon={<Ellipsis {...iconProps} />} />
      </nav>

      {moreOpen && (
        <section className={s.mobileMoreSheet} aria-label={t("mobile.moreActions")}>
          <div className={s.mobileSheetHandle} aria-hidden />
          <div className={s.mobileSheetHeader}>
            <strong>{t("mobile.moreActions")}</strong>
            <button type="button" onClick={() => setMoreOpen(false)} aria-label={t("mobile.closeMore")}><X size={18} strokeWidth={2} aria-hidden /></button>
          </div>
          <div className={s.mobileMoreGroup}>
            <div className={s.mobileMoreGroupTitle}>{t("mobile.work")}</div>
            <div className={s.mobileMoreGrid}>
              {legacyMode && <MoreAction label={t("attention.title")} badge={attentionUnreadCount} active={panelOpen && panelView === "attention"} onClick={() => run(() => onSelectView("attention"))} icon={<Bell {...iconProps} />} />}
              {legacyMode && <MoreAction label={t("agents.title")} active={panelOpen && panelView === "agents"} onClick={() => run(() => onSelectView("agents"))} icon={<Bot {...iconProps} />} />}
              <MoreAction label={t("mobile.sessions")} active={panelOpen && panelView === "sessions"} onClick={() => run(() => onSelectView("sessions"))} icon={<List {...iconProps} />} />
              {legacyMode ? (
                <>
                  <MoreAction label={t("mobile.files")} active={panelOpen && panelView === "files"} onClick={() => run(() => onSelectView("files"))} icon={<Folder {...iconProps} />} />
                  <MoreAction label={t("search.title")} active={panelOpen && panelView === "search"} onClick={() => run(() => onSelectView("search"))} icon={<Search {...iconProps} />} />
                  <MoreAction label={t("schedule.title")} active={panelOpen && panelView === "schedule"} onClick={() => run(() => onSelectView("schedule"))} icon={<CalendarDays {...iconProps} />} />
                  <MoreAction label={t("mobile.changes")} active={panelOpen && panelView === "changes"} onClick={() => run(() => onSelectView("changes"))} icon={<GitBranch {...iconProps} />} />
                  <MoreAction label={t("tgd.artifacts")} active={panelOpen && panelView === "tgd"} onClick={() => run(() => onSelectView("tgd"))} icon={<FileText {...iconProps} />} />
                  {onOpenAnalytics && <MoreAction label={t("topbar.analytics")} onClick={() => run(onOpenAnalytics)} icon={<BarChart3 {...iconProps} />} />}
                </>
              ) : (
                <MoreAction label={t("mobile.search")} active={panelOpen && panelView === "knowledge"} onClick={() => run(() => onSelectView("knowledge"))} icon={<LibraryBig {...iconProps} />} />
              )}
            </div>
          </div>
          <div className={s.mobileMoreGroup}>
            <div className={s.mobileMoreGroupTitle}>{t("mobile.settings")}</div>
            <div className={s.mobileMoreGrid}>
              {legacyMode && onOpenModels && <MoreAction label={t("sidebar.models")} onClick={() => run(onOpenModels)} icon={<Cpu {...iconProps} />} />}
              {legacyMode && onOpenSkills && <MoreAction label={t("sidebar.skills")} disabled={skillsDisabled} onClick={() => run(onOpenSkills)} icon={<Layers3 {...iconProps} />} />}
              {legacyMode && onOpenExtensions && <MoreAction label={t("extensions.title")} onClick={() => run(onOpenExtensions)} icon={<Puzzle {...iconProps} />} />}
              <MoreAction label={t("appearance.title")} onClick={() => run(onOpenAppearance)} icon={<Palette {...iconProps} />} />
              {legacyMode && onOpenDesignMode && <MoreAction label={t("topbar.designMode")} onClick={() => run(onOpenDesignMode)} icon={<Box {...iconProps} />} />}
            </div>
          </div>
        </section>
      )}
    </>
  );
}
