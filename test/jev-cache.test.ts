import assert from "node:assert/strict";
import { test } from "node:test";
import type { TestContext } from "node:test";
import type { Classification, Decisions } from "../src/protocol.js";

const data: Classification = {
  hasCurrent: false,
  needed: ["next"],
  candidates: [{ id: 1, position: 0, relation: 0, kind: "link", cue: "unknown" }],
};
const site = "https://example.test";
const event = { addListener() {} };
let moduleInstance = 0;

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

async function mockWorker(t: TestContext, respond: (request: number) => Response, saved: Record<string, unknown> = {}) {
  let receive: MessageListener | undefined;
  let requests = 0;
  let documents = 0;
  const session: Record<string, unknown> = {};
  t.mock.method(globalThis, "fetch", async (url: Parameters<typeof fetch>[0], options?: RequestInit) => {
    assert.equal(url, "https://api.typesafe.ai/v1/systemone");
    const payload = options?.body;
    assert.ok(typeof payload === "string");
    const body = JSON.parse(payload);
    assert.deepEqual(body.state, { has_current: data.hasCurrent, controls: data.candidates });
    return respond(++requests);
  });
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
  t.after(() => { Reflect.deleteProperty(globalThis, "chrome"); });
  await import(`../dist/background.js?test=${++moduleInstance}`);
  const listener = receive;
  assert.ok(listener);
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

test("reuses decisions across pages and keeps origins and layouts independent", async t => {
  const worker = await mockWorker(t, () => answer("c1"));
  assert.deepEqual(await worker.classify(`${site}/list?page=1`), { next: 1 });
  assert.deepEqual(await worker.classify(`${site}/list?page=2`), { next: 1 });
  assert.equal(worker.requestCount(), 1);

  assert.deepEqual(await Promise.all([
    worker.classify(`${site}/list?page=3`, "changed controls"),
    worker.classify(`${site}/list?page=4`, "changed controls"),
  ]), [{ next: 1 }, { next: 1 }]);
  assert.equal(worker.requestCount(), 2);

  assert.deepEqual(await worker.classify("https://other.test/list?page=1"), { next: 1 });
  assert.equal(worker.requestCount(), 3);
  const cacheEntries = Object.keys(worker.session).filter(key => key.startsWith("jev:"));
  assert.equal(cacheEntries.length, 3);
  assert.ok(cacheEntries.every(key => /^jev:[a-f0-9]{64}$/.test(key)));
});

test("reuses confident no-match decisions and retries incomplete results on later pages", async t => {
  const worker = await mockWorker(t, call => {
    if (call === 1) return new Response(null, { status: 503 });
    return answer("none", call === 2 ? 0.6 : 0.98);
  });
  assert.deepEqual(await worker.classify(`${site}/list?page=1`), {});
  assert.deepEqual(await worker.classify(`${site}/list?page=2`), {});
  assert.deepEqual(await worker.classify(`${site}/list?page=3`), { next: null });
  assert.deepEqual(await worker.classify(`${site}/list?page=4`), { next: null });
  assert.equal(worker.requestCount(), 3);
});


test("migrates disabled sites to exact hosts and preserves parallel changes", async t => {
  const worker = await mockWorker(t, () => answer("c1"), { pausedSites: ["https://example.test/*", "http://example.test/*"] });
  const list = () => worker.send("settings.html", { type: "disabled-sites" });
  assert.deepEqual(await list(), ["example.test"]);
  assert.deepEqual(await worker.classify(`${site}/list?page=2`), {});
  assert.equal(worker.requestCount(), 0);
  const set = (host: string, disabled: boolean) =>
    worker.send("settings.html", { type: "set-site-disabled", host, disabled });
  assert.deepEqual(await Promise.all([set("other.test", true), set("example.test", false)]), [true, true]);
  assert.deepEqual(await list(), ["other.test"]);
  assert.deepEqual(await worker.classify(`${site}/list?page=2`), { next: 1 });
  assert.deepEqual(await worker.send("popup.html", { type: "site-status", url: "http://other.test/list" }), {
    host: "other.test", status: "disabled",
  });
  assert.deepEqual(await worker.send("popup.html", { type: "site-status", url: "http://sub.other.test/list" }), {
    host: "sub.other.test", status: "ready",
  });
});
