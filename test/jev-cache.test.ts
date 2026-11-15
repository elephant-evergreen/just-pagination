import { afterEach, expect, mock, spyOn, test } from "bun:test";
import type { Classification, Decisions } from "../src/protocol.js";

const data: Classification = {
  hasCurrent: false,
  needed: ["next"],
  candidates: [{ id: 1, position: 0, relation: 0, kind: "link", cue: "unknown" }],
};
const site = "https://example.test";
const event = { addListener() {} };

afterEach(() => {
  mock.restore();
  Reflect.deleteProperty(globalThis, "chrome");
});

type MessageListener = Parameters<typeof chrome.runtime.onMessage.addListener>[0];

function storage(values: Record<string, unknown>) {
  return {
    async get(keys: string | string[] = Object.keys(values)) {
      const names = typeof keys === "string" ? [keys] : keys;
      return Object.fromEntries(names.map(key => [key, values[key]]));
    },
    async set(entries: Record<string, unknown>) {
      Object.assign(values, entries);
    },
    async remove(keys: string | string[]) {
      for (const key of typeof keys === "string" ? [keys] : keys) delete values[key];
    },
    async setAccessLevel() {},
  };
}

async function mockWorker(respond: (request: number) => Response, saved: Record<string, unknown> = {}) {
  let receive: MessageListener | undefined;
  let requests = 0;
  let documents = 0;
  const session: Record<string, unknown> = {};
  const fetchMock = Object.assign(async (url: Parameters<typeof fetch>[0], options?: RequestInit) => {
    expect(url).toBe("https://api.typesafe.ai/v1/systemone");
    const payload = options?.body;
    if (typeof payload !== "string") throw new TypeError("Expected a JSON request body");
    const body = JSON.parse(payload);
    expect(body.state).toStrictEqual({ has_current: data.hasCurrent, controls: data.candidates });
    return respond(++requests);
  }, { preconnect: fetch.preconnect });
  spyOn(globalThis, "fetch").mockImplementation(fetchMock);
  const mockChrome = {
    storage: { local: storage({ jevKey: "test-key", ...saved }), session: storage(session) },
    permissions: { contains: async () => true, onAdded: event, onRemoved: event },
    tabs: { query: async () => [] },
    runtime: {
      id: "test",
      getURL: (path: string) => `chrome-extension://test/${path}`,
      onInstalled: event,
      onMessage: { addListener(listener: MessageListener) { receive = listener; } },
    },
  };
  Object.defineProperty(globalThis, "chrome", { value: mockChrome, configurable: true });
  await import(`../dist/background.js?test=${crypto.randomUUID()}`);
  const listener = receive;
  if (!listener) throw new Error("Expected a browser message listener");
  return {
    session,
    requestCount: () => requests,
    send(path: string, message: Record<string, unknown>) {
      const sender = { id: mockChrome.runtime.id, url: mockChrome.runtime.getURL(path) };
      return new Promise<unknown>(resolve => listener(message, sender, resolve));
    },
    classify(url: string, layout = "/list") {
      const sender: chrome.runtime.MessageSender = {
        id: mockChrome.runtime.id,
        frameId: 0,
        tab: { id: 1, groupId: -1, index: 0, pinned: false,
          highlighted: false, windowId: 1, active: true, incognito: false, selected: true,
          discarded: false, autoDiscardable: true, frozen: false },
        url,
        documentId: String(++documents),
      };
      return new Promise<Decisions | null>(resolve => listener({ type: "classify", data, layout }, sender, resolve));
    },
  };
}

function answer(choice: string, probability = 0.98) {
  return Response.json({ answers: { next: { type: "choice", choice, confidence: 0.97, probabilities: { [choice]: probability } } } });
}

test("reuses decisions across pages and keeps origins and layouts independent", async () => {
  const worker = await mockWorker(() => answer("c1"));
  expect(await worker.classify(`${site}/list?page=1`)).toStrictEqual({ next: 1 });
  expect(await worker.classify(`${site}/list?page=2`)).toStrictEqual({ next: 1 });
  expect(worker.requestCount()).toBe(1);

  expect(await Promise.all([
    worker.classify(`${site}/list?page=3`, "changed controls"),
    worker.classify(`${site}/list?page=4`, "changed controls"),
  ])).toStrictEqual([{ next: 1 }, { next: 1 }]);
  expect(worker.requestCount()).toBe(2);

  expect(await worker.classify("https://other.test/list?page=1")).toStrictEqual({ next: 1 });
  expect(worker.requestCount()).toBe(3);
  const cacheEntries = Object.keys(worker.session).filter(key => key.startsWith("jev:"));
  expect(cacheEntries).toHaveLength(3);
  for (const key of cacheEntries) expect(key).toMatch(/^jev:[a-f0-9]{64}$/);
});

test("reuses confident no-match decisions and retries incomplete results on later pages", async () => {
  const worker = await mockWorker(call => {
    if (call === 1) return new Response(null, { status: 503 });
    return answer("none", call === 2 ? 0.6 : 0.98);
  });
  expect(await worker.classify(`${site}/list?page=1`)).toStrictEqual({});
  expect(await worker.classify(`${site}/list?page=2`)).toStrictEqual({});
  expect(await worker.classify(`${site}/list?page=3`)).toStrictEqual({ next: null });
  expect(await worker.classify(`${site}/list?page=4`)).toStrictEqual({ next: null });
  expect(worker.requestCount()).toBe(3);
});


test("migrates disabled sites to exact hosts and preserves parallel changes", async () => {
  const worker = await mockWorker(() => answer("c1"), { pausedSites: ["https://example.test/*", "http://example.test/*"] });
  const list = () => worker.send("settings.html", { type: "disabled-sites" });
  expect(await list()).toStrictEqual(["example.test"]);
  expect(await worker.classify(`${site}/list?page=2`)).toStrictEqual({});
  expect(worker.requestCount()).toBe(0);
  const set = (host: string, disabled: boolean) =>
    worker.send("settings.html", { type: "set-site-disabled", host, disabled });
  expect(await Promise.all([set("other.test", true), set("example.test", false)])).toStrictEqual([true, true]);
  expect(await list()).toStrictEqual(["other.test"]);
  expect(await worker.classify(`${site}/list?page=2`)).toStrictEqual({ next: 1 });
  expect(await worker.send("popup.html", { type: "site-status", url: "http://other.test/list" })).toStrictEqual({
    host: "other.test", status: "disabled",
  });
  expect(await worker.send("popup.html", { type: "site-status", url: "http://sub.other.test/list" })).toStrictEqual({
    host: "sub.other.test", status: "ready",
  });
});
