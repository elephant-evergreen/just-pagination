import { afterEach, expect, test } from "bun:test";

type Direction = "previous" | "next";
type Group = { currentPage?: number };

class FakeElement {
  attributes: Record<string, string> = {};
  children: FakeElement[] = [];
  isConnected = true;
  textContent = "";
  ariaLabel: string | undefined;

  constructor(text = "", ariaLabel?: string) {
    this.textContent = text;
    this.ariaLabel = ariaLabel;
  }

  closest() { return null; }
  getClientRects() { return [{}]; }
  getAttribute(name: string) { return name === "aria-label" ? this.ariaLabel ?? null : this.attributes[name] ?? null; }
  hasAttribute() { return false; }
  matches() { return true; }
}

class FakeAnchor extends FakeElement {
  href: string;

  constructor(href: string, text = "", ariaLabel?: string, rel?: string) {
    super(text, ariaLabel);
    this.href = href;
    if (rel) this.attributes.rel = rel;
  }
}

class FakeButton extends FakeElement {}

type Policy = {
  inferredPage(controls: FakeElement[], current: URL): number | undefined;
  routeEvidence(controls: FakeElement[], currentPage?: number): boolean;
  pageDirection(control: FakeElement, group?: Group): Direction | undefined;
  automatic(group: Group, control: FakeElement): boolean;
  activationEvidence(group: Group | undefined, target: FakeElement, direction: Direction): boolean;
};

class FakeObserver {
  observe() {}
  disconnect() {}
}

const source = await Bun.file(new URL("../src/content.ts", import.meta.url)).text();

function installPage(href: string) {
  const documentStub = {
    head: { querySelectorAll: () => [] },
    querySelectorAll: () => [],
    documentElement: {},
    fullscreenElement: null,
  };
  const windowStub = {
    addEventListener() {},
    getSelection() { return undefined; },
    setTimeout: globalThis.setTimeout,
  };
  Object.defineProperties(globalThis, {
    location: { value: new URL(href), configurable: true },
    document: { value: documentStub, configurable: true },
    window: { value: windowStub, configurable: true },
    chrome: {
      value: {
        runtime: {
          onMessage: { addListener() {} },
          sendMessage: async () => false,
        },
      },
      configurable: true,
    },
    MutationObserver: { value: FakeObserver, configurable: true },
    HTMLElement: { value: FakeElement, configurable: true },
    HTMLAnchorElement: { value: FakeAnchor, configurable: true },
    HTMLButtonElement: { value: FakeButton, configurable: true },
    HTMLVideoElement: { value: class {}, configurable: true },
    Element: { value: FakeElement, configurable: true },
    getComputedStyle: { value: () => ({ visibility: "visible" }), configurable: true },
  });
}

async function policy(href: string): Promise<Policy> {
  installPage(href);
  Reflect.deleteProperty(globalThis, "justPaginationInstalled");
  Reflect.deleteProperty(globalThis, "__justPaginationPolicy");
  const js = new Bun.Transpiler({ loader: "ts" }).transformSync(source);
  const end = js.lastIndexOf("\n})();");
  if (end < 0) throw new Error("Could not expose content policy");
  const instrumented = js.slice(0, end) +
    "\n  Object.assign(globalThis, { __justPaginationPolicy: { inferredPage, routeEvidence, pageDirection, automatic, activationEvidence } });" +
    js.slice(end);
  new Function(instrumented)();
  return (globalThis as typeof globalThis & { __justPaginationPolicy: Policy }).__justPaginationPolicy;
}

const group = (currentPage?: number): Group => ({ currentPage });

afterEach(() => {
  for (const name of ["location", "document", "window", "chrome", "MutationObserver", "HTMLElement",
    "HTMLAnchorElement", "HTMLButtonElement", "HTMLVideoElement", "Element", "getComputedStyle"]) {
    Reflect.deleteProperty(globalThis, name);
  }
  Reflect.deleteProperty(globalThis, "justPaginationInstalled");
  Reflect.deleteProperty(globalThis, "__justPaginationPolicy");
});

test("known same-list routes stay directional in both directions", async () => {
  const content = await policy("https://example.test/list?page=2");
  expect(content.pageDirection(new FakeAnchor("https://example.test/list?page=3"))).toBe("next");
  expect(content.pageDirection(new FakeAnchor("https://example.test/list?page=1"))).toBe("previous");
  expect(content.pageDirection(new FakeAnchor("https://example.test/elsewhere"))).toBeUndefined();

  await policy("https://example.test/list/2");
  expect(content.pageDirection(new FakeAnchor("https://example.test/list/3", "3"), group(2))).toBe("next");
  expect(content.pageDirection(new FakeAnchor("https://example.test/list/1", "1"), group(2))).toBe("previous");
  expect(content.pageDirection(new FakeAnchor("https://example.test/list", "1", undefined, "prev"), group(2))).toBe("previous");
  expect(content.pageDirection(new FakeAnchor("https://example.test/other", "1", undefined, "prev"), group(2))).toBeUndefined();
  expect(content.pageDirection(new FakeAnchor("https://example.test/workflow/3", "3"), group(2))).toBeUndefined();
});

test("infers a missing current page from a numbered path series", async () => {
  const content = await policy("https://example.test/list/5");
  const five = [
    new FakeAnchor("https://example.test/list", "1"),
    new FakeAnchor("https://example.test/list/4", "4", undefined, "prev"),
    new FakeAnchor("https://example.test/list/6", "6", undefined, "next"),
    new FakeAnchor("https://example.test/list/20", "20"),
  ];
  expect(content.inferredPage(five, new URL("https://example.test/list/5"))).toBe(5);
  expect(content.pageDirection(five[1], group(5))).toBe("previous");
  expect(content.pageDirection(five[2], group(5))).toBe("next");

  await policy("https://example.test/list/2");
  const two = [
    new FakeAnchor("https://example.test/list", "1", undefined, "prev"),
    new FakeAnchor("https://example.test/list/3", "3", undefined, "next"),
    new FakeAnchor("https://example.test/list/20", "20"),
  ];
  expect(content.inferredPage(two, new URL("https://example.test/list/2"))).toBe(2);

  await policy("https://example.test/list/5");
  expect(content.inferredPage([
    new FakeAnchor("https://example.test/list/4", "Previous", undefined, "prev"),
    new FakeAnchor("https://example.test/list/6", "Next", undefined, "next"),
    new FakeAnchor("https://example.test/list/20", "20"),
  ], new URL("https://example.test/list/5"))).toBeUndefined();
  expect(content.inferredPage([
    new FakeAnchor("https://example.test/list/4", "4", undefined, "prev"),
    new FakeAnchor("https://example.test/list/6", "6", undefined, "next"),
  ], new URL("https://example.test/list/5"))).toBeUndefined();
});

test("buttons need numbered or routed pagination evidence", async () => {
  const content = await policy("https://example.test/list?page=2");
  const next = new FakeButton("Next");
  expect(content.automatic(group(), next)).toBe(true);
  expect(content.activationEvidence(undefined, next, "next")).toBe(false);
  expect(content.activationEvidence(group(), next, "next")).toBe(true);

  const three = new FakeButton("3");
  expect(content.activationEvidence(group(2), three, "next")).toBe(true);
  expect(content.activationEvidence(group(2), three, "previous")).toBe(false);
  expect(content.automatic(group(2), three)).toBe(true);
  expect(content.automatic(group(), three)).toBe(false);
});

test("route evidence stays on one page list and ignores unrelated links", async () => {
  const content = await policy("https://example.test/list");
  expect(content.routeEvidence([
    new FakeAnchor("https://example.test/list?page=1", "1"),
    new FakeAnchor("https://example.test/list?page=2", "2"),
  ])).toBe(true);
  expect(content.routeEvidence([
    new FakeAnchor("https://example.test/about", "About"),
    new FakeAnchor("https://example.test/contact", "Contact"),
  ])).toBe(false);
  expect(content.routeEvidence([
    new FakeAnchor("https://example.test/list?page=1", "1"),
    new FakeAnchor("https://example.test/other?page=2", "2"),
  ])).toBe(false);
  expect(content.routeEvidence([
    new FakeAnchor("https://example.test/other?page=1", "1"),
    new FakeAnchor("https://example.test/other?page=2", "2"),
  ])).toBe(false);
});

test("keyboard turns require trusted input and fresh eligibility", () => {
  expect(source).toContain('window.addEventListener("keydown", handleKeydown)');
  const keydown = source.slice(source.indexOf("function handleKeydown("));
  const trusted = keydown.indexOf("!event.isTrusted");
  const revalidate = keydown.indexOf("eligibleAtActuation(direction");
  const click = keydown.indexOf("target.click()");
  expect(trusted).toBeGreaterThan(-1);
  expect(revalidate).toBeGreaterThan(trusted);
  expect(click).toBeGreaterThan(revalidate);
  expect(source).toContain("const fresh = inspect();");
  expect(source).toContain("currentPage !== undefined || routeEvidence(controls, currentPage)");
  expect(source).toContain("found.candidates.length > 8");
  expect(source).toContain("label(control).slice(0, 4)");
  expect(source).toContain("innerHTML.slice(0, 512)");
});
