import { randomUUID } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import webpush, { type PushSubscription } from "web-push";
import { getAgentDir } from "@earendil-works/pi-coding-agent";

interface VapidConfig { publicKey: string; privateKey: string; subject: string }
interface OwnedPushSubscription { ownerId?: string; subscription: PushSubscription }
interface SubscriptionStore { version: 2; subscriptions: OwnedPushSubscription[] }
const vapidPath = () => join(getAgentDir(), "web-push-vapid.json");
const subscriptionsPath = () => join(getAgentDir(), "web-push-subscriptions.json");

function atomicWrite(path: string, value: unknown): void {
  mkdirSync(dirname(path), { recursive: true });
  const temp = `${path}.${process.pid}.${randomUUID()}.tmp`;
  writeFileSync(temp, `${JSON.stringify(value, null, 2)}\n`, { mode: 0o600 });
  renameSync(temp, path);
}

export function pushEnrollmentAllowed(request: Request): boolean {
  const host = new URL(request.url).hostname.toLocaleLowerCase();
  return Boolean(process.env.PIWEB_ACCESS_PASSWORD) || host === "localhost" || host === "127.0.0.1" || host === "::1";
}

export function getVapidConfig(): VapidConfig {
  const envPublic = process.env.PIWEB_VAPID_PUBLIC_KEY;
  const envPrivate = process.env.PIWEB_VAPID_PRIVATE_KEY;
  const subject = process.env.PIWEB_VAPID_SUBJECT || "mailto:local@dta.invalid";
  if (envPublic && envPrivate) return { publicKey: envPublic, privateKey: envPrivate, subject };
  const path = vapidPath();
  if (existsSync(path)) {
    try {
      const stored = JSON.parse(readFileSync(path, "utf8")) as VapidConfig;
      if (stored.publicKey && stored.privateKey) return stored;
    } catch { /* regenerate corrupt local state */ }
  }
  const config = { ...webpush.generateVAPIDKeys(), subject };
  atomicWrite(path, config);
  return config;
}

function readSubscriptions(): SubscriptionStore {
  try {
    const parsed = JSON.parse(readFileSync(subscriptionsPath(), "utf8")) as { subscriptions?: unknown[] };
    const subscriptions = Array.isArray(parsed.subscriptions) ? parsed.subscriptions.flatMap((item): OwnedPushSubscription[] => {
      if (!item || typeof item !== "object") return [];
      if ("subscription" in item) {
        const record = item as { ownerId?: unknown; subscription?: PushSubscription };
        if (!record.subscription?.endpoint) return [];
        return [{ ...(typeof record.ownerId === "string" ? { ownerId: record.ownerId } : {}), subscription: record.subscription }];
      }
      const legacy = item as PushSubscription;
      return legacy.endpoint ? [{ subscription: legacy }] : [];
    }) : [];
    return { version: 2, subscriptions };
  } catch { return { version: 2, subscriptions: [] }; }
}

export function savePushSubscription(ownerId: string, subscription: PushSubscription): number {
  const store = readSubscriptions();
  store.subscriptions = [
    { ownerId, subscription },
    ...store.subscriptions.filter((item) => item.subscription.endpoint !== subscription.endpoint),
  ].slice(0, 200);
  atomicWrite(subscriptionsPath(), store);
  return store.subscriptions.filter((item) => item.ownerId === ownerId).length;
}

export function removePushSubscription(ownerId: string, endpoint: string): number {
  const store = readSubscriptions();
  store.subscriptions = store.subscriptions.filter((item) => item.ownerId !== ownerId || item.subscription.endpoint !== endpoint);
  atomicWrite(subscriptionsPath(), store);
  return store.subscriptions.filter((item) => item.ownerId === ownerId).length;
}

export function pushSubscriptionCount(ownerId: string): number {
  return readSubscriptions().subscriptions.filter((item) => item.ownerId === ownerId).length;
}

/** Pushes only a generic state signal; prompts, errors, paths, and repo names never leave the server. */
export async function sendWebPush(ownerId: string | undefined, url = "/?panel=attention"): Promise<void> {
  const config = getVapidConfig();
  webpush.setVapidDetails(config.subject, config.publicKey, config.privateKey);
  const store = readSubscriptions();
  const stale = new Set<string>();
  const payload = JSON.stringify({ title: "Digital Transformation Agent", body: "An agent needs your attention", url, tag: "dta-attention" });
  const recipients = store.subscriptions.filter((item) => ownerId ? item.ownerId === ownerId : !item.ownerId);
  await Promise.allSettled(recipients.map(async ({ subscription }) => {
    try { await webpush.sendNotification(subscription, payload, { TTL: 86_400, urgency: "normal" }); }
    catch (error) {
      const status = (error as { statusCode?: number }).statusCode;
      if (status === 404 || status === 410) stale.add(subscription.endpoint);
      else console.error("Web push delivery failed", status ?? error);
    }
  }));
  if (stale.size > 0) {
    store.subscriptions = store.subscriptions.filter((item) => !stale.has(item.subscription.endpoint));
    atomicWrite(subscriptionsPath(), store);
  }
}
