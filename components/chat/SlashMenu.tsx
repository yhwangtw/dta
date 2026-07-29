"use client";

import { useRef } from "react";
import type { SlashItem } from "./chat-input-constants";
import styles from "./SlashMenu.module.css";
import { useI18n } from "@/lib/i18n";

interface SlashMenuProps {
  show: boolean;
  items: SlashItem[];
  filter: string;
  selectedIndex: number;
  /** Called with the text to insert into the composer (item.insert). */
  onSelect: (insert: string) => void;
  onHover: (index: number) => void;
  onLeave: () => void;
  onClose: () => void;
}

export function filterSlashItems(items: SlashItem[], filter: string): SlashItem[] {
  const f = filter.toLowerCase();
  return items.filter((it) => it.name.toLowerCase().includes(f));
}

export function SlashMenu({ show, items, filter, selectedIndex, onSelect, onHover, onLeave }: SlashMenuProps) {
  const { t } = useI18n();
  const menuRef = useRef<HTMLDivElement>(null);

  const filtered = filterSlashItems(items, filter);

  if (!show || filtered.length === 0) return null;

  return (
    <div
      ref={menuRef}
      className={styles.menu}
    >
      {filtered.map((item, i) => (
        <button
          key={item.name + (item.isTemplate ? ":tpl" : "")}
          onClick={() => onSelect(item.insert)}
          onMouseEnter={() => onHover(i)}
          onMouseLeave={() => { if (i === selectedIndex) onLeave(); }}
          className={`${styles.item} ${i === selectedIndex ? "bg-selected" : "bg-none hover-bg-text text-muted"} ${i === selectedIndex ? styles.itemSelected : ""}`}
        >
          <span className={styles.commandName}>
            {item.name}
            {item.isTemplate && <span className={styles.templateTag}>{t("input.template")}</span>}
          </span>
          <span className={styles.description}>
            {item.description}
          </span>
        </button>
      ))}
    </div>
  );
}
