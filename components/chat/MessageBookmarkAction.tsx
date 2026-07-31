"use client";

import { useI18n } from "@/lib/i18n";
import styles from "./MessageBookmarkAction.module.css";

function BookmarkIcon({ filled, size }: { filled: boolean; size: number }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill={filled ? "currentColor" : "none"}
      stroke="currentColor"
      strokeWidth="1.9"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
    >
      <polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2" />
    </svg>
  );
}

export function MessageBookmarkAction({
  isBookmarked,
  onToggle,
  className,
}: {
  isBookmarked: boolean;
  onToggle: () => void;
  className?: string;
}) {
  const { t } = useI18n();
  const title = isBookmarked ? t("chat.unbookmark") : t("chat.bookmark");

  return (
    <button
      type="button"
      onClick={onToggle}
      title={title}
      aria-label={title}
      aria-pressed={isBookmarked}
      data-bookmark-action
      className={`${className ?? ""} ${styles.action} ${isBookmarked ? styles.actionActive : ""}`}
    >
      <BookmarkIcon filled={isBookmarked} size={13} />
      <span>{isBookmarked ? t("chat.removeBookmarkAction") : t("chat.bookmarkAction")}</span>
    </button>
  );
}

export function MessageBookmarkIndicator({ isBookmarked }: { isBookmarked: boolean }) {
  const { t } = useI18n();
  if (!isBookmarked) return null;

  return (
    <span
      className={styles.indicator}
      title={t("chat.bookmarked")}
      aria-label={t("chat.bookmarked")}
      data-bookmark-indicator
    >
      <BookmarkIcon filled size={11} />
    </span>
  );
}
