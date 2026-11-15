import { classify, parseClassification, verifyKey } from "./jev.js";
import { arrowKeys, enteredHost, isRecord, siteHost } from "./protocol.js";
import type { Classification, Decisions, SetupStatus, SiteInfo } from "./protocol.js";

const settings = chrome.runtime.getURL("settings.html");
const popup = chrome.runtime.getURL("popup.html");
const local = chrome.storage.local;
const protectedStorage = local.setAccessLevel({ accessLevel: "TRUSTED_CONTEXTS" });
let connectionRevision = 0;
let siteUpdates = Promise.resolve();

async function preferences() {
  await protectedStorage;
  const { jevKey, jevConnection, pausedSites } = await local.get(["jevKey", "jevConnection", "pausedSites"]);
  return {
    key: typeof jevKey === "string" && jevKey.length > 0 ? jevKey : undefined,
    connection: typeof jevConnection === "string" ? jevConnection : "",
    disabled: Array.isArray(pausedSites) ? [...new Set(pausedSites.flatMap(site => {
      const host = typeof site === "string" ? enteredHost(site) : undefined;
      return host ? [host] : [];
    }))] : [],
  };
}

async function siteStatus(url?: string): Promise<SiteInfo> {
  const host = siteHost(url);
  if (!host || !url) return { status: "unsupported" };
  const { disabled } = await preferences();
  if (disabled.includes(host)) return { host, status: "disabled" };
  const { protocol, hostname } = new URL(url);
  const permitted = await chrome.permissions.contains({ origins: [protocol + "//" + hostname + "/*"] });
  return { host, status: permitted ? "ready" : "no-access" };
}

function setDisabled(host: string, disabled: boolean) {
  const update = siteUpdates.catch(() => {}).then(async () => {
    const { disabled: saved } = await preferences();
    const next = new Set(saved);
    if (disabled) next.add(host);
    else next.delete(host);
    await local.set({ pausedSites: [...next] });
    void refreshTabs();
  });
  siteUpdates = update;
  return update.then(() => true);
}

async function refreshTabs(jevChanged = false) {
  const tabs = await chrome.tabs.query({});
  await Promise.allSettled(tabs.filter(tab => tab.id !== undefined).map(tab =>
    chrome.tabs.sendMessage(tab.id!, { type: "refresh", jevChanged }),
  ));
}

chrome.permissions.onAdded.addListener(() => { void refreshTabs().catch(() => {}); });
chrome.permissions.onRemoved.addListener(() => { void refreshTabs().catch(() => {}); });
chrome.runtime.onInstalled.addListener(details => {
  if (details.reason === "install") void chrome.tabs.create({ url: settings });
});

let classificationQueue = Promise.resolve();
const pendingClassifications = new Map<string, Promise<Decisions>>();

async function cachedClassification(key: string, documentId: string, data: Classification, cacheKey: string, revision: number): Promise<Decisions> {
  const pending = pendingClassifications.get(cacheKey);
  if (pending) return pending;
  const operation = (async () => {
    const storageKey = "jev:" + cacheKey;
    const saved = (await chrome.storage.session.get(storageKey))[storageKey];
    if (revision !== connectionRevision) return {};
    if (isRecord(saved) && typeof saved.until === "number" && saved.until > Date.now() && isRecord(saved.decisions)) {
      return saved.decisions as Decisions;
    }
    if (!await reserveClassification(documentId) || revision !== connectionRevision) return {};
    const decisions = await classify(key, data);
    if (revision !== connectionRevision) return {};
    if (data.needed.every(direction => Object.hasOwn(decisions, direction))) {
      await chrome.storage.session.set({ [storageKey]: { until: Date.now() + 3600_000, decisions } });
    }
    return decisions;
  })();
  pendingClassifications.set(cacheKey, operation);
  try {
    return await operation;
  } finally {
    pendingClassifications.delete(cacheKey);
  }
}

async function classificationKey(url: URL, layout: string, data: Classification, connection: string) {
  const bytes = new TextEncoder().encode(JSON.stringify([url.origin, layout, data, connection]));
  const digest = new Uint8Array(await crypto.subtle.digest("SHA-256", bytes));
  return Array.from(digest, value => value.toString(16).padStart(2, "0")).join("");
}

function reserveClassification(documentId: string) {
  let permitted = false;
  classificationQueue = classificationQueue.catch(() => {}).then(async () => {
    const { jevBudget } = await chrome.storage.session.get("jevBudget");
    const now = Date.now();
    const { since, documents } = isRecord(jevBudget) && typeof jevBudget.since === "number" &&
      Array.isArray(jevBudget.documents) && now - jevBudget.since < 3600_000
      ? { since: jevBudget.since, documents: jevBudget.documents as string[] }
      : { since: now, documents: [] };
    if (documents.length >= 20 || documents.includes(documentId)) return;
    if (!documents.length) {
      const stored = await chrome.storage.session.get();
      const expired = Object.entries(stored).filter(([name, value]) =>
        name.startsWith("jev:") && (!isRecord(value) || typeof value.until !== "number" || value.until <= now));
      if (expired.length) await chrome.storage.session.remove(expired.map(([name]) => name));
    }
    await chrome.storage.session.set({ jevBudget: { since, documents: [...documents, documentId] } });
    permitted = true;
  });
  return classificationQueue.then(() => permitted);
}

async function handle(message: Record<string, unknown>, sender: chrome.runtime.MessageSender): Promise<unknown> {
  if (sender.id !== chrome.runtime.id) return;
  if (sender.url === settings) {
    if (message.type === "connect" && typeof message.key === "string") {
      const revision = ++connectionRevision;
      const key = message.key.trim();
      const result = await verifyKey(key);
      if (revision !== connectionRevision) return "unavailable";
      if (result === "connected") {
        await protectedStorage;
        if (revision !== connectionRevision) return "unavailable";
        await local.set({ jevKey: key, jevConnection: crypto.randomUUID() });
        void refreshTabs(true);
      }
      return result;
    }
    if (message.type === "disconnect") {
      connectionRevision++;
      await protectedStorage;
      await local.remove(["jevKey", "jevConnection"]);
      void refreshTabs(true);
      return true;
    }
    if (message.type === "tried-arrow" && (message.key === "ArrowLeft" || message.key === "ArrowRight")) {
      await protectedStorage;
      await local.set({ [message.key]: true });
      return true;
    }
    if (message.type === "setup-status") {
      await protectedStorage;
      const saved = await local.get(["jevKey", ...arrowKeys]);
      return {
        connected: typeof saved.jevKey === "string" && saved.jevKey.length > 0,
        tried: arrowKeys.filter(key => saved[key] === true),
      } satisfies SetupStatus;
    }
  }
  if (sender.url === settings || sender.url === popup) {
    if (message.type === "disabled-sites" && sender.url === settings) return (await preferences()).disabled;
    if (message.type === "site-status" && sender.url === popup && typeof message.url === "string") return siteStatus(message.url);
    if (message.type === "set-site-disabled" && typeof message.host === "string" && typeof message.disabled === "boolean") {
      const host = enteredHost(message.host);
      if (host && host === message.host) return setDisabled(host, message.disabled);
    }
  }
  if (!sender.tab || sender.frameId !== 0 || !siteHost(sender.url)) return;
  if (message.type === "content-status") return (await siteStatus(sender.url)).status === "ready";
  if (message.type === "classify") {
    const revision = connectionRevision;
    const data = parseClassification(message.data);
    if (!data || !sender.documentId || (await siteStatus(sender.url)).status !== "ready") return {};
    const { key, connection } = await preferences();
    if (!key || revision !== connectionRevision) return {};
    if (typeof message.layout === "string" && message.layout.length > 0 && message.layout.length <= 8192 && sender.url) {
      const cacheKey = await classificationKey(new URL(sender.url), message.layout, data, connection);
      if (revision !== connectionRevision) return {};
      return cachedClassification(key, sender.documentId, data, cacheKey, revision);
    }
    if (!await reserveClassification(sender.documentId) || revision !== connectionRevision) return {};
    const decisions = await classify(key, data);
    return revision === connectionRevision ? decisions : {};
  }
}

chrome.runtime.onMessage.addListener((message: unknown, sender, reply) => {
  if (!isRecord(message)) return;
  void handle(message, sender).then(reply, () => reply(null));
  return true;
});
