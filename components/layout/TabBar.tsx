"use client";

import { getFileIcon } from "../sidebar/FileIcons";
import styles from "./TabBar.module.css";

export interface Tab {
  id: string;
  label: string;
  filePath: string;
  /** Line to jump to when opened from a search hit. */
  gotoLine?: number;
  /** Bumped each time the file is (re)opened at a line, to re-trigger the jump. */
  gotoNonce?: number;
}

interface Props {
  tabs: Tab[];
  activeTabId: string;
  onSelectTab: (id: string) => void;
  onCloseTab: (id: string) => void;
}

export function TabBar({ tabs, activeTabId, onSelectTab, onCloseTab }: Props) {
  return (
    <div className={styles.tabBar}>
      {tabs.map((tab) => {
        const isActive = tab.id === activeTabId;
        return (
          <div
            key={tab.id}
            onClick={() => onSelectTab(tab.id)}
            className={`${styles.tab} ${isActive ? styles.tabActive : styles.tabInactive}`}
          >
            <span className={`${styles.tabIcon} ${isActive ? styles.tabIconActive : styles.tabIconInactive}`}>
              {getFileIcon(tab.label, 13)}
            </span>
            <span
              className={`${styles.tabLabel} ${isActive ? styles.tabLabelActive : styles.tabLabelInactive}`}
              title={tab.filePath}
            >
              {tab.label}
            </span>
            <button
              onClick={(e) => { e.stopPropagation(); onCloseTab(tab.id); }}
              className={`bg-none text-dim hover-bg-text ${styles.closeBtn}`}
              title="Close"
            >
              <svg width="10" height="10" viewBox="0 0 10 10" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round">
                <line x1="2" y1="2" x2="8" y2="8" />
                <line x1="8" y1="2" x2="2" y2="8" />
              </svg>
            </button>
          </div>
        );
      })}
    </div>
  );
}
