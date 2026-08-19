"use client";

import { useEffect, useMemo, useState } from "react";
import type { AttentionItem } from "@/lib/attention-center";
import { useI18n } from "@/lib/i18n";
import s from "./AttentionPanel.module.css";

type Filter = "all" | "unread" | "waiting" | "failed";

interface Props {
  items: AttentionItem[];
  readIds: ReadonlySet<string>;
  loading: boolean;
  error: string | null;
  onRefresh: () => void;
  onMarkRead: (id: string) => void;
  onMarkAllRead: () => void;
  onOpenSession: (sessionId: string) => void | Promise<void>;
  onOpenSource: (source: "agent" | "schedule") => void;
}

const FILTERS: Filter[] = ["all", "unread", "waiting", "failed"];

function friendlySummary(summary: string, locale: "en" | "zh"): string {
  const normalized = summary.toLowerCase();
  if (normalized.includes("without publishing a structured result")) {
    return locale === "zh"
      ? "這場會議尚未產生可審核的結構化成果，可以回到對話繼續補充資料。"
      : "This meeting does not have a reviewable structured result yet. Continue the conversation to add context.";
  }
  if (normalized.includes("model is not supported")) {
    return locale === "zh"
      ? "目前選用的 AI 模型無法使用，請開啟對話並切換模型。"
      : "The selected AI model is unavailable. Open the conversation and choose another model.";
  }
  if (normalized.includes("usage limit has been reached")) {
    return locale === "zh"
      ? "AI 服務目前已達用量上限，請稍後再試或切換模型。"
      : "The AI service reached its usage limit. Try again later or choose another model.";
  }
  return summary;
}

function friendlyTitle(item: AttentionItem, locale: "en" | "zh"): string {
  if (item.source === "meeting" && item.title === "Meeting result needs review") {
    return locale === "zh" ? "會議成果尚待確認" : "Meeting result needs review";
  }
  return item.title;
}

function pushKey(value: string): Uint8Array<ArrayBuffer> {
  const padding = "=".repeat((4 - value.length % 4) % 4);
  const raw = atob((value + padding).replaceAll("-", "+").replaceAll("_", "/"));
  const bytes = new Uint8Array(new ArrayBuffer(raw.length));
  for (let index = 0; index < raw.length; index++) bytes[index] = raw.charCodeAt(index);
  return bytes;
}

export function AttentionPanel({
  items,
  readIds,
  loading,
  error,
  onRefresh,
  onMarkRead,
  onMarkAllRead,
  onOpenSession,
  onOpenSource,
}: Props) {
  const { locale, t } = useI18n();
  const [filter, setFilter] = useState<Filter>("all");
  const [pushState, setPushState] = useState<"loading" | "enabled" | "disabled" | "unavailable">("loading");
  const [pushBusy, setPushBusy] = useState(false);
  const [pushPublicKey, setPushPublicKey] = useState("");
  useEffect(() => {
    if (!("serviceWorker" in navigator) || !("PushManager" in window) || !("Notification" in window)) { setPushState("unavailable"); return; }
    let cancelled = false;
    Promise.all([
      fetch("/api/push", { cache: "no-store" }),
      navigator.serviceWorker.register("/pi-service-worker.js"),
    ]).then(async ([response, registration]) => {
      if (!response.ok) throw new Error(String(response.status));
      const config = await response.json() as { publicKey?: string };
      const subscription = await registration.pushManager.getSubscription();
      if (!cancelled) { setPushPublicKey(config.publicKey ?? ""); setPushState(subscription ? "enabled" : "disabled"); }
    }).catch(() => { if (!cancelled) setPushState("unavailable"); });
    return () => { cancelled = true; };
  }, []);
  const togglePush = async () => {
    if (pushBusy || pushState === "unavailable") return;
    setPushBusy(true);
    try {
      const registration = await navigator.serviceWorker.ready;
      const current = await registration.pushManager.getSubscription();
      if (current) {
        await fetch("/api/push", { method: "DELETE", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ endpoint: current.endpoint }) });
        await current.unsubscribe(); setPushState("disabled");
      } else {
        const permission = await Notification.requestPermission();
        if (permission !== "granted") { setPushState("disabled"); return; }
        const subscription = await registration.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: pushKey(pushPublicKey) });
        const response = await fetch("/api/push", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(subscription) });
        if (!response.ok) { await subscription.unsubscribe(); throw new Error(`HTTP ${response.status}`); }
        setPushState("enabled");
      }
    } catch { setPushState("unavailable"); }
    finally { setPushBusy(false); }
  };
  const unreadCount = items.reduce((count, item) => count + (readIds.has(item.id) ? 0 : 1), 0);
  const visibleItems = useMemo(() => items.filter((item) => {
    if (filter === "unread") return !readIds.has(item.id);
    if (filter === "waiting") return item.status === "waiting_for_input";
    if (filter === "failed") return item.status !== "waiting_for_input";
    return true;
  }), [filter, items, readIds]);
  const filterCounts = useMemo<Record<Filter, number>>(() => ({
    all: items.length,
    unread: items.filter((item) => !readIds.has(item.id)).length,
    waiting: items.filter((item) => item.status === "waiting_for_input").length,
    failed: items.filter((item) => item.status !== "waiting_for_input").length,
  }), [items, readIds]);

  const open = async (item: AttentionItem) => {
    onMarkRead(item.id);
    if (item.sessionId) {
      await onOpenSession(item.sessionId);
      return;
    }
    if (item.source === "agent" || item.source === "schedule") onOpenSource(item.source);
  };

  return (
    <section className={s.root} aria-label={t("attention.title")}>
      <header className={s.header}>
        <div className={s.heading}>
          <span className={s.headingIcon} aria-hidden>
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
              <path d="M9 11l3 3L22 4" /><path d="M21 12v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11" />
            </svg>
          </span>
          <div>
            <strong>{t("attention.title")}</strong>
            <span>{unreadCount > 0 ? t("attention.subtitleUnread").replace("{count}", String(unreadCount)) : t("attention.caughtUp")}</span>
          </div>
        </div>
        <div className={s.headerActions}>
          <button
            type="button"
            className={s.pushButton}
            onClick={() => void togglePush()}
            disabled={pushBusy || pushState === "loading" || pushState === "unavailable"}
            aria-pressed={pushState === "enabled"}
            aria-label={pushState === "enabled" ? t("attention.pushDisable") : t("attention.pushEnable")}
            title={pushState === "enabled" ? t("attention.pushDisable") : t("attention.pushEnable")}
          >
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
              <path d="M18 8a6 6 0 0 0-12 0c0 7-3 7-3 9h18c0-2-3-2-3-9" /><path d="M10 21h4" />
            </svg>
          </button>
          <button type="button" className={s.iconButton} onClick={onRefresh} disabled={loading} aria-label={t("attention.refresh")} title={t("attention.refresh")}>
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden><path d="M20 11a8.1 8.1 0 1 0 2.2 5.5" /><path d="M20 4v7h-7" /></svg>
          </button>
          <button type="button" className={s.readAllButton} onClick={onMarkAllRead} disabled={unreadCount === 0}>
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden><path d="m3 12 4 4L17 6" /><path d="m11 16 2 2 8-8" /></svg>
            {t("attention.markAllRead")}
          </button>
        </div>
      </header>
      <div className={s.filters} aria-label={t("attention.filters")}>
        {FILTERS.map((item) => (
          <button key={item} type="button" aria-pressed={filter === item} onClick={() => setFilter(item)}>
            <span>{t(`attention.filter.${item}`)}</span>
            <small>{filterCounts[item]}</small>
          </button>
        ))}
      </div>
      {error && <div className={s.error} role="alert">{error}</div>}
      <div className={s.list} aria-busy={loading}>
        {loading && items.length === 0 ? (
          <div className={s.empty}>{t("common.loading")}</div>
        ) : visibleItems.length === 0 ? (
          <div className={s.empty}>
            <span aria-hidden>✓</span>
            <strong>{t("attention.empty")}</strong>
            <p>{t("attention.emptyHint")}</p>
          </div>
        ) : visibleItems.map((item) => {
          const read = readIds.has(item.id);
          const sourceLabel = item.source === "meeting"
            ? t("attention.meeting")
            : item.source === "agent"
              ? t("attention.agentRun")
            : item.source === "schedule"
              ? t("attention.automation")
              : t("attention.meetingConversation");
          const statusLabel = item.status === "waiting_for_input"
            ? t("attention.status.waiting")
            : item.status === "interrupted"
              ? t("attention.status.interrupted")
              : t("attention.status.failed");
          const time = new Intl.DateTimeFormat(locale === "zh" ? "zh-TW" : "en", {
            month: "short", day: "numeric",
          }).format(new Date(item.occurredAt));
          return (
            <article key={item.id} className={`${s.card} ${read ? s.cardRead : ""}`} data-severity={item.severity}>
              <div className={s.cardIcon} data-status={item.status} aria-hidden>
                {item.status === "waiting_for_input" ? "?" : "!"}
              </div>
              <div className={s.cardBody}>
                <div className={s.cardTop}>
                  <span className={s.statusBadge} data-status={item.status}>{statusLabel}</span>
                  <time dateTime={item.occurredAt}>{time}</time>
                  {!read && <i className={s.unreadDot} aria-label={t("attention.unreadItem")} />}
                </div>
                <strong className={s.title} title={item.title}>{friendlyTitle(item, locale)}</strong>
                <p className={s.summary}>{friendlySummary(item.summary, locale)}</p>
                <div className={s.cardMeta}>
                  <span>{sourceLabel}</span>
                </div>
                <div className={s.actions}>
                  <button type="button" className={s.primaryAction} onClick={() => void open(item)}>
                    {item.sessionId ? t("attention.review") : t("attention.openSource")}
                    <span aria-hidden>→</span>
                  </button>
                  {!read && <button type="button" className={s.secondary} onClick={() => onMarkRead(item.id)}>{t("attention.markRead")}</button>}
                </div>
              </div>
            </article>
          );
        })}
      </div>
    </section>
  );
}
