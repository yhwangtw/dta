"use client";

import { useTheme } from "@/hooks/useTheme";
import { useI18n } from "@/lib/i18n";
import s from "./AppShell.module.css";

export type PanelView = "sessions" | "files" | "changes" | "tgd";

interface IconRailProps {
  panelView: PanelView;
  sidebarOpen: boolean;
  onSelectView: (view: PanelView) => void;
  onOpenPalette: () => void;
  onOpenAnalytics: () => void;
  onOpenModels: () => void;
  onOpenSkills: () => void;
  skillsDisabled: boolean;
  appearanceOpen: boolean;
  onToggleAppearance: () => void;
}

/**
 * Left icon rail — global navigation, always visible. Pure presentation:
 * every click is delegated to the parent, except theme/locale which use
 * their global stores directly.
 */
export function IconRail({
  panelView,
  sidebarOpen,
  onSelectView,
  onOpenPalette,
  onOpenAnalytics,
  onOpenModels,
  onOpenSkills,
  skillsDisabled,
  appearanceOpen,
  onToggleAppearance,
}: IconRailProps) {
  const { isDark, toggleTheme } = useTheme();
  const { locale, setLocale, t } = useI18n();

  return (
    <nav className={s.rail} aria-label="Primary">
      <button
        onClick={() => onSelectView("sessions")}
        title="Sessions"
        aria-pressed={panelView === "sessions" && sidebarOpen}
        className={`${s.railButton} ${panelView === "sessions" && sidebarOpen ? s.railButtonActive : ""}`}
      >
        <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
          <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
        </svg>
      </button>
      <button
        onClick={() => onSelectView("files")}
        title={t("sidebar.explorer")}
        aria-pressed={panelView === "files" && sidebarOpen}
        className={`${s.railButton} ${panelView === "files" && sidebarOpen ? s.railButtonActive : ""}`}
      >
        <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
          <path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z" />
        </svg>
      </button>
      <button
        onClick={() => onSelectView("changes")}
        title="Changes"
        aria-pressed={panelView === "changes" && sidebarOpen}
        className={`${s.railButton} ${panelView === "changes" && sidebarOpen ? s.railButtonActive : ""}`}
      >
        <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
          <line x1="6" y1="3" x2="6" y2="15" /><circle cx="18" cy="6" r="3" /><circle cx="6" cy="18" r="3" />
          <path d="M18 9a9 9 0 0 1-9 9" />
        </svg>
      </button>
      <button
        onClick={() => onSelectView("tgd")}
        title="tGD artifacts"
        aria-pressed={panelView === "tgd" && sidebarOpen}
        className={`${s.railButton} ${panelView === "tgd" && sidebarOpen ? s.railButtonActive : ""}`}
      >
        <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
          <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" /><polyline points="14 2 14 8 20 8" />
          <line x1="9" y1="13" x2="15" y2="13" /><line x1="9" y1="17" x2="13" y2="17" />
        </svg>
      </button>
      <button onClick={onOpenPalette} title={`${t("topbar.searchTitle")}`} className={s.railButton}>
        <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
          <circle cx="11" cy="11" r="8" /><line x1="21" y1="21" x2="16.65" y2="16.65" />
        </svg>
      </button>
      <button onClick={onOpenAnalytics} title={t("topbar.analyticsTitle")} className={s.railButton}>
        <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
          <line x1="18" y1="20" x2="18" y2="10" /><line x1="12" y1="20" x2="12" y2="4" /><line x1="6" y1="20" x2="6" y2="14" />
        </svg>
      </button>
      <div className={s.railSpacer} />
      <button onClick={onOpenModels} title={`${t("sidebar.models")} (⇧⌘M)`} className={s.railButton}>
        <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
          <rect x="4" y="4" width="16" height="16" rx="2" /><rect x="9" y="9" width="6" height="6" />
          <line x1="9" y1="1" x2="9" y2="4" /><line x1="15" y1="1" x2="15" y2="4" />
          <line x1="9" y1="20" x2="9" y2="23" /><line x1="15" y1="20" x2="15" y2="23" />
          <line x1="20" y1="9" x2="23" y2="9" /><line x1="20" y1="14" x2="23" y2="14" />
          <line x1="1" y1="9" x2="4" y2="9" /><line x1="1" y1="14" x2="4" y2="14" />
        </svg>
      </button>
      <button
        onClick={onOpenSkills}
        disabled={skillsDisabled}
        title={`${t("sidebar.skills")} (⌘/)`}
        className={s.railButton}
      >
        <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
          <path d="M12 2L2 7l10 5 10-5-10-5z" /><path d="M2 17l10 5 10-5" /><path d="M2 12l10 5 10-5" />
        </svg>
      </button>
      <button
        onClick={onToggleAppearance}
        title={t("appearance.title")}
        aria-pressed={appearanceOpen}
        className={`${s.railButton} ${appearanceOpen ? s.railButtonActive : ""}`}
      >
        <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
          <circle cx="13.5" cy="6.5" r="0.6" fill="currentColor" />
          <circle cx="17.5" cy="10.5" r="0.6" fill="currentColor" />
          <circle cx="8.5" cy="7.5" r="0.6" fill="currentColor" />
          <circle cx="6.5" cy="12.5" r="0.6" fill="currentColor" />
          <path d="M12 2C6.5 2 2 6.5 2 12s4.5 10 10 10c.926 0 1.648-.746 1.648-1.688 0-.437-.18-.835-.437-1.125-.29-.289-.438-.652-.438-1.125a1.64 1.64 0 0 1 1.668-1.668h1.996c3.051 0 5.555-2.503 5.555-5.554C21.965 6.012 17.461 2 12 2z" />
        </svg>
      </button>
      <button onClick={() => setLocale(locale === "en" ? "zh" : "en")} title={t("topbar.language")} className={s.railButton}>
        <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
          <circle cx="12" cy="12" r="10" /><line x1="2" y1="12" x2="22" y2="12" />
          <path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z" />
        </svg>
      </button>
      <button
        onClick={(e) => {
          const rect = e.currentTarget.getBoundingClientRect();
          toggleTheme({ x: rect.left + rect.width / 2, y: rect.top + rect.height / 2 });
        }}
        title={isDark ? t("topbar.lightMode") : t("topbar.darkMode")}
        aria-pressed={isDark}
        className={s.railButton}
      >
        {isDark ? (
          <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
            <circle cx="12" cy="12" r="5" />
            <line x1="12" y1="1" x2="12" y2="3" /><line x1="12" y1="21" x2="12" y2="23" />
            <line x1="4.22" y1="4.22" x2="5.64" y2="5.64" /><line x1="18.36" y1="18.36" x2="19.78" y2="19.78" />
            <line x1="1" y1="12" x2="3" y2="12" /><line x1="21" y1="12" x2="23" y2="12" />
            <line x1="4.22" y1="19.78" x2="5.64" y2="18.36" /><line x1="18.36" y1="5.64" x2="19.78" y2="5.64" />
          </svg>
        ) : (
          <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
            <path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z" />
          </svg>
        )}
      </button>
    </nav>
  );
}
