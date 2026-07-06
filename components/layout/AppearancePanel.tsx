"use client";

import { useEffect, useRef } from "react";
import { SKINS, SKIN_LABELS, SKIN_PREVIEWS, useSkin } from "@/lib/skin";
import { useTheme } from "@/hooks/useTheme";
import { useI18n } from "@/lib/i18n";
import styles from "./AppearancePanel.module.css";

interface Props {
  onClose: () => void;
}

/**
 * Appearance picker popover (rail → palette icon): theme toggle + the five
 * skins as swatch cards. Skins apply instantly on click so users can preview
 * live; Esc or clicking outside closes.
 */
export function AppearancePanel({ onClose }: Props) {
  const { skin, setSkin } = useSkin();
  const { isDark, toggleTheme } = useTheme();
  const { t } = useI18n();
  const ref = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    const onDown = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) onClose();
    };
    window.addEventListener("keydown", onKey);
    // Defer the outside-click listener so the opening click doesn't
    // immediately close the panel.
    const id = setTimeout(() => window.addEventListener("mousedown", onDown), 0);
    return () => {
      window.removeEventListener("keydown", onKey);
      clearTimeout(id);
      window.removeEventListener("mousedown", onDown);
    };
  }, [onClose]);

  return (
    <div ref={ref} className={`glass ${styles.panel}`} role="dialog" aria-label={t("appearance.title")}>
      <div className={styles.title}>{t("appearance.title")}</div>

      <div className={styles.themeRow} role="group" aria-label={t("appearance.title")}>
        <button
          type="button"
          className={`${styles.themeBtn} ${!isDark ? styles.themeBtnActive : ""}`}
          aria-pressed={!isDark}
          onClick={() => { if (isDark) toggleTheme(); }}
        >
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden>
            <circle cx="12" cy="12" r="5" />
            <line x1="12" y1="1" x2="12" y2="3" /><line x1="12" y1="21" x2="12" y2="23" />
            <line x1="4.22" y1="4.22" x2="5.64" y2="5.64" /><line x1="18.36" y1="18.36" x2="19.78" y2="19.78" />
            <line x1="1" y1="12" x2="3" y2="12" /><line x1="21" y1="12" x2="23" y2="12" />
            <line x1="4.22" y1="19.78" x2="5.64" y2="18.36" /><line x1="18.36" y1="5.64" x2="19.78" y2="4.22" />
          </svg>
          {t("appearance.light")}
        </button>
        <button
          type="button"
          className={`${styles.themeBtn} ${isDark ? styles.themeBtnActive : ""}`}
          aria-pressed={isDark}
          onClick={() => { if (!isDark) toggleTheme(); }}
        >
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
            <path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z" />
          </svg>
          {t("appearance.dark")}
        </button>
      </div>

      <div className={styles.skinList}>
        {SKINS.map((sk) => (
          <button
            key={sk}
            type="button"
            className={`${styles.skinRow} ${sk === skin ? styles.skinRowActive : ""}`}
            aria-pressed={sk === skin}
            onClick={() => setSkin(sk)}
          >
            <span className={styles.swatches} aria-hidden>
              <span style={{ background: SKIN_PREVIEWS[sk].light }} />
              <span style={{ background: SKIN_PREVIEWS[sk].accent }} />
              <span style={{ background: SKIN_PREVIEWS[sk].dark }} />
            </span>
            <span className={styles.skinLabel}>{SKIN_LABELS[sk]}</span>
            {sk === skin && (
              <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" className={styles.check} aria-hidden>
                <polyline points="20 6 9 17 4 12" />
              </svg>
            )}
          </button>
        ))}
      </div>
    </div>
  );
}
