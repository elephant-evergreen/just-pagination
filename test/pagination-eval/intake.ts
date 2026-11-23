import { createInterface } from "node:readline";
import { Readable } from "node:stream";
import { mkdirSync, renameSync, rmSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { Window } from "happy-dom";
import {
  fixtureShapeDigest,
  pageKeys,
  sealFixture,
} from "./fixture.ts";
import type {
  ClassFlag,
  Expected,
  Fixture,
  FixtureNode,
  FixtureRole,
  Label,
  PageKey,
  Route,
  RouteShape,
} from "./fixture.ts";

type Direction = "previous" | "next";
type SourceRecord = {
  url?: unknown;
  html?: unknown;
  expected?: unknown;
  skip?: unknown;
};

export type IntakeResult =
  | { status: "written"; fixture: Fixture; shape: string }
  | { status: "skipped"; reason: string }
  | { status: "unsupported"; reason: string };

export type IntakeSummary = {
  read: number;
  written: number;
  duplicates: number;
  unsupported: number;
  skipped: number;
  positives: number;
  negatives: number;
  mixed: number;
  uniqueShapes: number;
  reasons: Record<string, number>;
  bytes: number;
};

const controlSelector = "a[href],button,[role=button]";
const pageParameter = /^(?:p|page|paged|pageno|pagenum|pagenumber|pg|start(?:_index|row)?|offset|skip|bsi)$/i;
const pagePath = /\/(?:page[\/=-]|p)\d{1,6}(?:\.html)?\/?$/i;
const numberedPath = /\/(\d{1,6})\/?$/;
const trackingParameter = /^(?:utm_.+|gclid|fbclid|ved)$/i;
const navWords = /paginat|paging|pager|page[ -]?nav|page numbers/i;
const currentClass = /(?:^|\s)(?:active|selected|current|is-current)(?:\s|$)|--current(?:\s|$)/i;
const disabledClass = /(?:^|\s)disabled(?:\s|$)/i;
const hiddenClass = /(?:^|\s)(?:hidden|d-none|is-hidden|u-hidden|display-none)(?:\s|$)/i;
const hiddenStyle = /(?:^|;)\s*(?:display\s*:\s*none|visibility\s*:\s*hidden)\b/i;
const maxHtmlLength = 2_000_000;
const maxNodes = 500;
const maxRoots = 3;

export class IntakeError extends Error {
  constructor(readonly code: string) {
    super(code);
    this.name = "IntakeError";
  }
}

export async function intakeRecord(value: unknown): Promise<IntakeResult> {
  const record = isRecord(value) ? value as SourceRecord : undefined;
  if (!record) return { status: "unsupported", reason: "record" };
  if (record.skip === true) return { status: "skipped", reason: "marked" };
  if (typeof record.url !== "string" || typeof record.html !== "string") {
    return { status: "unsupported", reason: "record" };
  }
  if (!record.html || record.html.length > maxHtmlLength) {
    return { status: "unsupported", reason: record.html ? "html-size" : "html-empty" };
  }
  let page: URL;
  try {
    page = new URL(record.url);
  } catch {
    return { status: "unsupported", reason: "url" };
  }
  if (!/^https?:$/.test(page.protocol) || page.username || page.password) {
    return { status: "unsupported", reason: "url" };
  }
  const expectedSource = parseExpected(record.expected, page);
  if (expectedSource === "invalid") return { status: "unsupported", reason: "expected" };
  if (expectedSource === undefined) return { status: "skipped", reason: "unlabeled" };
  const window = new Window({
    url: page.href,
    settings: {
      enableJavaScriptEvaluation: false,
      disableJavaScriptFileLoading: true,
      disableCSSFileLoading: true,
      disableIframePageLoading: true,
    },
  });
  try {
    const document = window.document as unknown as Document;
    document.write(await inertHtml(record.html));
    document.close();
    const links = [...document.querySelectorAll<HTMLAnchorElement>("a[href]")];
    const expectedAnchors: HTMLAnchorElement[] = [];
    for (const direction of ["previous", "next"] as const) {
      const destinations = expectedSource[direction];
      if (destinations === undefined) continue;
      for (const destination of destinations) {
        const matches = links.filter(link => linkDestination(link, page) === destination);
        if (matches.length === 0) return { status: "unsupported", reason: "expected-missing" };
        expectedAnchors.push(...matches);
      }
    }
    const roots = selectRoots(document, expectedAnchors);
    const routes = new RouteMap(page);
    const context: SanitizeContext = {
      document,
      page,
      routes,
      keys: new WeakMap(),
      keyCount: 0,
      nodeCount: 0,
    };
    const body: FixtureNode[] = [];
    for (const root of roots) {
      const node = sanitizeNode(root, context);
      if (node) body.push(node);
      if (context.nodeCount > maxNodes) return { status: "unsupported", reason: "nodes" };
    }
    const expected = expectedKeys(expectedAnchors, context, expectedSource);
    if (!expected) return { status: "unsupported", reason: "expected-captured" };
    const head: Array<{ rel: "prev" | "next"; href: Route }> = [];
    for (const link of document.head.querySelectorAll<HTMLLinkElement>("link[rel][href]")) {
      const rel = link.relList.contains("next") ? "next" : link.relList.contains("prev") ? "prev" : undefined;
      if (!rel) continue;
      const href = routes.routeFor(linkDestination(link, page));
      if (href && !head.some(entry => entry.rel === rel && sameRoute(entry.href, href))) head.push({ rel, href });
      if (head.length >= 4) break;
    }
    const payload = {
      version: 1 as const,
      url: routes.current(),
      head,
      body,
      expected,
    };
    const fixture = await sealFixture(payload);
    return { status: "written", fixture, shape: await fixtureShapeDigest(fixture) };
  } catch (error) {
    return {
      status: "unsupported",
      reason: error instanceof IntakeError ? error.code : "sanitize",
    };
  } finally {
    window.happyDOM.close();
  }
}


const inertAttributes = new Set([
  "aria-current", "aria-disabled", "aria-hidden", "aria-label", "class", "data-pagination", "disabled", "download",
  "hidden", "href", "inert", "rel", "role", "target", "title",
]);
const inertRemovals = [
  "script", "style", "iframe", "frame", "frameset", "object", "embed", "img", "picture", "source", "video", "audio",
  "canvas", "base", "meta", "title", "template", "noscript", "input", "textarea", "select", "option", "optgroup",
];

export async function inertHtml(html: string): Promise<string> {
  const rewriter = new HTMLRewriter();
  for (const selector of inertRemovals) {
    rewriter.on(selector, { element(element) { element.remove(); } });
  }
  rewriter.on("svg *", { element(element) { element.remove(); } });
  rewriter.on("svg", { element(element) { element.setInnerContent(""); } });
  rewriter.on("link", {
    element(element) {
      const rel = (element.getAttribute("rel") ?? "").toLowerCase().split(/\s+/);
      if (rel.includes("next")) element.setAttribute("rel", "next");
      else if (rel.includes("prev")) element.setAttribute("rel", "prev");
      else element.remove();
    },
  });
  rewriter.on("*", {
    element(element) {
      for (const [name, value] of [...element.attributes]) {
        if (name === "style") {
          if (/display\s*:\s*none/i.test(value)) element.setAttribute("style", "display:none");
          else if (/visibility\s*:\s*hidden/i.test(value)) element.setAttribute("style", "visibility:hidden");
          else element.removeAttribute("style");
          continue;
        }
        if (!inertAttributes.has(name)) element.removeAttribute(name);
      }
    },
  });
  return rewriter.transform(new Response(html)).text();
}

function parseExpected(value: unknown, page: URL):
  Record<Direction, string[] | undefined> | "invalid" | undefined {
  if (value === undefined) return;
  if (!isRecord(value)) return "invalid";
  const previous = parseExpectedValue(value.previous, page);
  const next = parseExpectedValue(value.next, page);
  if (previous === null || next === null) return "invalid";
  if (previous === undefined && next === undefined) return;
  return { previous, next };
}

function parseExpectedValue(value: unknown, page: URL): string[] | undefined | null {
  if (value === undefined) return;
  if (value === null) return [];
  if (typeof value === "string") return [normalizeDestination(value, page)];
  if (Array.isArray(value)) {
    const values = value.map(item => typeof item === "string" ? normalizeDestination(item, page) : undefined);
    if (values.some(item => item === undefined)) return null;
    return [...new Set(values as string[])];
  }
  return null;
}

function normalizeDestination(value: string, page: URL): string {
  try {
    const url = new URL(value, page);
    url.hash = "";
    return /^https?:$/.test(url.protocol) && !url.username && !url.password ? url.href : "";
  } catch {
    return "";
  }
}

function linkDestination(link: HTMLAnchorElement | HTMLLinkElement, page: URL): string | undefined {
  const raw = link.getAttribute("href");
  if (!raw) return;
  try {
    const url = new URL(raw, page);
    url.hash = "";
    return url.href;
  } catch {
    return;
  }
}

function selectRoots(document: Document, expectedAnchors: HTMLAnchorElement[]): Element[] {
  const candidates = new Set<Element>();
  const add = (element: Element | null | undefined) => {
    if (!element || element === document.body || element === document.documentElement) return;
    if (!element.matches("a,button,[role=button]") && element.querySelector(controlSelector)) candidates.add(element);
  };
  for (const element of document.querySelectorAll("nav,[role=navigation],[data-pagination]")) add(scopeFor(element));
  for (const element of document.querySelectorAll("[class]")) {
    if (navWords.test(element.getAttribute("class") ?? "")) add(scopeFor(element));
  }
  for (const element of document.querySelectorAll("[aria-label]")) {
    if (navWords.test(element.getAttribute("aria-label") ?? "")) add(scopeFor(element));
  }
  for (const current of document.querySelectorAll("[aria-current=page],[aria-current=true]")) {
    add(scopeFor(current));
  }
  for (const rel of document.querySelectorAll("a[rel~=next],a[rel~=prev],a[rel~=previous]")) add(scopeFor(rel));
  for (const anchor of document.querySelectorAll<HTMLAnchorElement>("a[href]")) {
    if (!isNumberedText(anchor.textContent)) continue;
    const group = anchor.parentElement;
    if (!group) continue;
    const numbered = [...group.querySelectorAll("a[href]")].filter(link => isNumberedText(link.textContent));
    if (numbered.length >= 3) add(scopeFor(group));
  }
  for (const anchor of expectedAnchors) {
    let element: Element | null = anchor;
    for (let depth = 0; depth < 4 && element; depth++, element = element.parentElement) add(scopeFor(element));
  }
  const selected: Element[] = [];
  const ranked = [...candidates].map(element => ({ element, score: rootScore(element) }))
    .filter(entry => entry.score >= 0)
    .sort((left, right) => right.score - left.score || controlCount(left.element) - controlCount(right.element));
  for (const { element } of ranked) {
    if (selected.some(root => root.contains(element) || element.contains(root))) continue;
    selected.push(element);
    if (selected.length >= maxRoots) break;
  }
  for (const anchor of expectedAnchors) {
    if (selected.some(root => root === anchor || root.contains(anchor))) continue;
    const extra = scopeFor(anchor);
    if (!extra) continue;
    for (let index = selected.length - 1; index >= 0; index--) {
      if (extra.contains(selected[index]) || selected[index].contains(extra)) selected.splice(index, 1);
    }
    selected.push(extra);
  }
  selected.sort((left, right) => {
    const position = left.compareDocumentPosition(right);
    return position & 4 ? -1 : position & 2 ? 1 : 0;
  });
  return selected.slice(0, maxRoots);
}

function scopeFor(element: Element): Element | undefined {
  let current: Element | null = element;
  let fallback: Element | undefined;
  for (let depth = 0; depth < 5 && current; depth++, current = current.parentElement) {
    if (current === element.ownerDocument.body || current === element.ownerDocument.documentElement) break;
    const controls = controlCount(current);
    if (controls < 1) continue;
    if (controls <= 96) fallback = current;
    if (current.matches("nav,[role=navigation],ul,ol,[data-pagination]") ||
        navWords.test(current.getAttribute("class") ?? "") ||
        navWords.test(current.getAttribute("aria-label") ?? "")) return current;
  }
  return fallback;
}

function rootScore(element: Element): number {
  const controls = controlCount(element);
  if (!controls || controls > 300) return -1;
  let score = 0;
  if (element.matches("[data-pagination]")) score += 40;
  const marker = `${element.getAttribute("class") ?? ""} ${element.getAttribute("aria-label") ?? ""}`;
  if (navWords.test(marker)) score += 30;
  if (element.matches("nav,[role=navigation]")) score += 10;
  if (element.querySelector("[aria-current=page],[aria-current=true]")) score += 8;
  if (element.querySelector("a[rel~=next],a[rel~=prev],a[rel~=previous]")) score += 8;
  const numbered = [...element.querySelectorAll("a[href],button,[role=button]")]
    .filter(control => isNumberedText(control.textContent)).length;
  if (numbered >= 3) score += 10;
  if (element.closest("[role=grid],[role=tablist],dialog")) score -= 30;
  if (controls > 128) score -= 10;
  return score;
}

function controlCount(element: Element): number {
  return element.querySelectorAll(controlSelector).length;
}

function isNumberedText(value: string | null | undefined): boolean {
  return /^\s*\d{1,6}\s*(?:\(current\))?\s*$/i.test(value ?? "");
}

type SanitizeContext = {
  document: Document;
  page: URL;
  routes: RouteMap;
  keys: WeakMap<Element, string>;
  keyCount: number;
  nodeCount: number;
};

function sanitizeNode(element: Element, context: SanitizeContext): FixtureNode | null {
  if (context.nodeCount++ > maxNodes) throw new IntakeError("nodes");
  if (element.matches("script,style,template,noscript,iframe,object,embed,img,picture,video,audio,canvas,svg")) return null;
  if (element.matches("a:not([href])")) return null;
  if (element.matches(controlSelector)) return sanitizeControl(element, context);
  const tag = containerTag(element);
  if (!tag) return null;
  const children = [...element.children].map(child => sanitizeNode(child, context)).filter((child): child is FixtureNode => child !== null);
  const text = children.length ? undefined : containerText(element);
  const flags = classFlagsOf(element);
  const ariaLabel = canonicalLabel(element.getAttribute("aria-label"), "attribute");
  const role = fixtureRole(element);
  const hidden = isHidden(element) || undefined;
  const inert = element.hasAttribute("inert") || undefined;
  const ariaHidden = element.getAttribute("aria-hidden") === "true" || undefined;
  const ariaDisabled = element.getAttribute("aria-disabled") === "true" || undefined;
  const ariaCurrent = element.getAttribute("aria-current");
  const dataPagination = element.hasAttribute("data-pagination") || undefined;
  if (!children.length && !text && !flags.length && !ariaLabel && !role && !hidden && !inert && !ariaHidden &&
      !ariaDisabled && !ariaCurrent && !dataPagination) {
    return null;
  }
  return {
    tag,
    ...(text === undefined ? {} : { text }),
    ...(ariaLabel === undefined ? {} : { ariaLabel }),
    ...(role === undefined ? {} : { role }),
    ...(flags.length ? { flags } : {}),
    ...(ariaCurrent === "page" || ariaCurrent === "true" ? { ariaCurrent } : {}),
    ...(ariaDisabled === undefined ? {} : { ariaDisabled: true as const }),
    ...(ariaHidden === undefined ? {} : { ariaHidden }),
    ...(hidden === undefined ? {} : { hidden }),
    ...(inert === undefined ? {} : { inert }),
    ...(dataPagination === undefined ? {} : { dataPagination }),
    ...(children.length ? { children } : {}),
  };
}

function sanitizeControl(element: Element, context: SanitizeContext): FixtureNode | null {
  const anchor = element.matches("a[href]") ? element as HTMLAnchorElement : undefined;
  const rawText = element.textContent ?? "";
  const rawLabel = canonicalLabel(rawText, "text");
  const ariaLabel = canonicalLabel(element.getAttribute("aria-label"), "attribute");
  const title = canonicalLabel(element.getAttribute("title"), "attribute");
  const svg = Boolean(element.querySelector("svg"));
  const text = rawLabel ?? (svg ? "icon" as const : undefined);
  const href = anchor ? context.routes.routeFor(linkDestination(anchor, context.page)) : undefined;
  const fixtureKey = context.keys.get(element) ?? (() => {
    const assigned = `c${++context.keyCount}`;
    context.keys.set(element, assigned);
    return assigned;
  })();
  const flags = classFlagsOf(element);
  const role = element.matches("[role=button]") || element.matches("button") ? "button" as const : undefined;
  const rel = (element.getAttribute("rel") ?? "").toLowerCase().split(/\s+/)
    .flatMap(value => value === "prev" || value === "previous" ? ["prev" as const] :
      value === "next" ? ["next" as const] : []);
  const ariaCurrent = element.getAttribute("aria-current");
  return {
    tag: element.matches("a") ? "a" : "button",
    key: fixtureKey,
    ...(text === undefined ? {} : { text }),
    ...(ariaLabel === undefined ? {} : { ariaLabel }),
    ...(title === undefined ? {} : { title }),
    ...(role === undefined ? {} : { role }),
    ...(flags.length ? { flags } : {}),
    ...(ariaCurrent === "page" || ariaCurrent === "true" ? { ariaCurrent } : {}),
    ...(element.getAttribute("aria-disabled") === "true" ? { ariaDisabled: true as const } : {}),
    ...(element.matches("button:disabled") ? { disabled: true as const } : {}),
    ...(isHidden(element) ? { hidden: true as const } : {}),
    ...(element.hasAttribute("inert") ? { inert: true as const } : {}),
    ...(element.getAttribute("aria-hidden") === "true" ? { ariaHidden: true as const } : {}),
    ...(rel.length ? { rel: [...new Set(rel)] } : {}),
    ...(href === undefined ? {} : { href }),
    ...(element.getAttribute("target") === "_blank" ? { targetBlank: true as const } :
      element.getAttribute("target") && element.getAttribute("target") !== "_self" ? { targetOther: true as const } : {}),
    ...(element.hasAttribute("download") ? { download: true as const } : {}),
    ...(element.closest("form") ? { inForm: true as const } : {}),
    ...(svg ? { svg: true as const } : {}),
  };
}

function containerTag(element: Element): FixtureNode["tag"] | undefined {
  const tag = element.tagName.toLowerCase();
  if (["a", "button", "div", "form", "li", "main", "nav", "ol", "p", "section", "span", "table", "tbody", "td", "tr", "ul"].includes(tag)) {
    return tag as FixtureNode["tag"];
  }
  if (element.children.length) return "div";
  if (containerText(element)) return "span";
  return;
}

function containerText(element: Element): Label | undefined {
  const label = canonicalLabel(element.textContent, "text");
  if (label === "ellipsis" || label?.startsWith("#") || label?.startsWith("current#")) return label;
  return;
}

function isHidden(element: Element): boolean {
  return element.hasAttribute("hidden") || hiddenClass.test(element.getAttribute("class") ?? "") ||
    hiddenStyle.test(element.getAttribute("style") ?? "");
}

function classFlagsOf(element: Element): ClassFlag[] {
  const raw = element.getAttribute("class") ?? "";
  const flags: ClassFlag[] = [];
  if (navWords.test(raw)) flags.push("pagination");
  if (currentClass.test(raw) || /^current page,/i.test(element.getAttribute("aria-label") ?? "") ||
      /current page/i.test(element.getAttribute("aria-label") ?? "")) flags.push("current");
  if (disabledClass.test(raw)) flags.push("disabled");
  return flags;
}

function fixtureRole(element: Element): FixtureRole | undefined {
  const role = element.getAttribute("role");
  if (role === "button" && element.matches(controlSelector)) return "button";
  if (role === "navigation" || role === "grid" || role === "tablist" || role === "dialog") return role;
  return;
}

function expectedKeys(
  anchors: HTMLAnchorElement[],
  context: SanitizeContext,
  source: Record<Direction, string[] | undefined>,
): Expected | undefined {
  const expected: Expected = {};
  for (const direction of ["previous", "next"] as const) {
    const destinations = source[direction];
    if (destinations === undefined) continue;
    const keys = new Set<string>();
    const captured = new Set<string>();
    for (const anchor of anchors) {
      const destination = linkDestination(anchor, context.page);
      if (!destination || !destinations.includes(destination)) continue;
      const key = context.keys.get(anchor);
      if (!key) continue;
      keys.add(key);
      captured.add(destination);
    }
    if (destinations.some(destination => !captured.has(destination))) return;
    expected[direction] = [...keys].sort((left, right) => Number(left.slice(1)) - Number(right.slice(1)));
  }
  return expected;
}

function canonicalLabel(raw: string | null | undefined, source: "text" | "attribute"): Label | undefined {
  if (!raw) return;
  const text = raw.normalize("NFKC").replace(/\s+/g, " ").trim();
  if (!text) return;
  if (source === "attribute" && text.length <= 80 && navWords.test(text)) return "nav";
  const stripped = text
    .replace(/^[<‹«←❮]\s*(?=\p{L})/u, "")
    .replace(/\s*[>›»→❯]+\s*$/u, "")
    .trim();
  for (const value of [text, stripped]) {
    if (!value) continue;
    const currentNumber = value.match(/^(?:current page,?\s*)?(\d{1,6})\s*\(\s*current\s*\)$/i)?.[1] ??
      value.match(/^current page,?\s*(\d{1,6})$/i)?.[1] ??
      value.match(/^page\s+(\d{1,6}),?\s*current page$/i)?.[1];
    if (currentNumber) return `current#${Number(currentNumber)}`;
    const plainNumber = value.match(/^(\d{1,6})$/)?.[1];
    if (plainNumber) return `#${Number(plainNumber)}`;
    const pageOf = value.match(/^(?:page\s+)?(\d{1,6})\s*(?:\/|of)\s*[\d,.]+$/i)?.[1];
    if (pageOf) return `#${Number(pageOf)}`;
    const goToPage = value.match(/^(?:go to|goto)\s+(?:the\s+)?page\s+(\d{1,6})(?:,?\s*current page)?$/i)?.[1];
    if (goToPage) return `goto#${Number(goToPage)}`;
    const pageNumber = value.match(/^page\s+(\d{1,6})(?:,?\s*current page)?$/i)?.[1];
    if (pageNumber) return source === "attribute" ? `page#${Number(pageNumber)}` : `#${Number(pageNumber)}`;
    if (/^(?:next(?:\s+page)?(?:\s+\d+)?)$/i.test(value)) return "next";
    if (/^older\s+(?:posts|entries|articles)$/i.test(value)) return "older";
    if (/^(?:prev(?:ious)?(?:\s+page)?)$/i.test(value)) return "prev";
    if (/^newer\s+(?:posts|entries|articles)$/i.test(value)) return "newer";
    if (/^次(?:へ|のページ|ページ)$/u.test(value)) return "next";
    if (/^前(?:へ|のページ|ページ)$/u.test(value)) return "prev";
    if (/^(?:first|last)(?:\s+page)?$/i.test(value)) return value.toLowerCase().startsWith("first") ? "first" : "last";
    if (/^(?:pagination|page navigation|page numbers|pager)$/i.test(value)) return "nav";
    if (/^(?:\.{3}|…)$/.test(value)) return "ellipsis";
    if (/^[<‹←❮]+$/.test(value)) return "prev";
    if (/^[>›→❯]+$/.test(value)) return "next";
    if (/^[\p{P}\p{S}\s]+$/u.test(value) && !/[\p{L}\p{N}]/u.test(value)) return "icon";
  }
  return "label";
}

class RouteMap {
  private readonly routeIds = new Map<string, number>();
  private readonly filterIds = new Map<string, number>();

  constructor(private readonly page: URL) {}

  current(): Route {
    const route = this.routeFor(this.page.href);
    if (!route) throw new IntakeError("current-route");
    return route;
  }

  routeFor(href: string | undefined): Route | undefined {
    if (!href) return;
    let url: URL;
    try {
      url = new URL(href);
    } catch {
      return;
    }
    if (!/^https?:$/.test(url.protocol) || url.username || url.password) return;
    const site = url.origin === this.page.origin ? "same" : "other";
    const segment = url.pathname.match(pagePath)?.[0];
    const numbered = segment ? undefined : url.pathname.match(numberedPath)?.[0];
    let shape: RouteShape = "plain";
    let pageNumber: number | undefined;
    let pageKey: PageKey | undefined;
    let base = url.pathname;
    if (segment) {
      shape = "page-path";
      pageNumber = Number(segment.match(/\d+/)?.[0]);
      base = url.pathname.slice(0, -segment.length) || "/";
    } else {
      for (const [key, value] of url.searchParams) {
        if (!pageParameter.test(key) || !/^\d{1,8}$/.test(value)) continue;
        const number = Number(value);
        if (number > 999_999) break;
        shape = "query";
        pageNumber = number;
        pageKey = PAGE_KEYS.get(key.toLowerCase());
        break;
      }
      if (!pageKey && numbered) {
        shape = "numbered-path";
        pageNumber = Number(numbered.match(/\d+/)?.[0]);
        base = url.pathname.slice(0, -numbered.length) || "/";
      }
    }
    base = base.replace(/\/$/, "") || "/";
    const routeKey = `${site}:${base}`;
    let route = this.routeIds.get(routeKey);
    if (!route) {
      route = this.routeIds.size + 1;
      this.routeIds.set(routeKey, route);
    }
    const filters: number[] = [];
    for (const [key, value] of url.searchParams) {
      if ((pageKey && key.toLowerCase() === pageKey) || (shape !== "plain" && pageParameter.test(key))) continue;
      if (trackingParameter.test(key)) continue;
      const filterKey = `${key.toLowerCase()}=${value}`;
      let filter = this.filterIds.get(filterKey);
      if (!filter) {
        filter = this.filterIds.size + 1;
        this.filterIds.set(filterKey, filter);
      }
      filters.push(filter);
    }
    filters.sort((left, right) => left - right);
    return {
      site,
      route,
      shape,
      ...(pageNumber === undefined ? {} : { page: pageNumber }),
      ...(pageKey === undefined ? {} : { key: pageKey }),
      ...(filters.length ? { filters: [...new Set(filters)] } : {}),
    };
  }
}

const PAGE_KEYS = new Map<string, PageKey>(pageKeys.map(key => [key, key]));

function sameRoute(left: Route, right: Route): boolean {
  return left.site === right.site && left.route === right.route && left.shape === right.shape &&
    left.page === right.page && left.key === right.key &&
    JSON.stringify(left.filters ?? []) === JSON.stringify(right.filters ?? []);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

if (import.meta.main) await main();

async function main() {
  const input = option("input");
  const output = option("out");
  if (!input || !output) {
    console.error("Usage: bun test/pagination-eval/intake.ts --input <source.jsonl> --out <fixtures.jsonl> [--limit <n>]");
    process.exit(2);
  }
  if (resolve(input) === resolve(output)) {
    console.error("The fixture output must differ from the source input.");
    process.exit(2);
  }
  if (!await Bun.file(input).exists()) {
    console.error("The source JSONL was not found.");
    process.exit(2);
  }
  const limit = parseLimit(option("limit"));
  const summary: IntakeSummary = {
    read: 0,
    written: 0,
    duplicates: 0,
    unsupported: 0,
    skipped: 0,
    positives: 0,
    negatives: 0,
    mixed: 0,
    uniqueShapes: 0,
    reasons: {},
    bytes: 0,
  };
  const seen = new Set<string>();
  const shapes = new Set<string>();
  const temporary = `${resolve(output)}.tmp-${process.pid}`;
  mkdirSync(dirname(resolve(output)), { recursive: true });
  const writer = Bun.file(temporary).writer();
  try {
    const lines = createInterface({
      input: Readable.fromWeb(Bun.file(input).stream() as never),
      crlfDelay: Infinity,
    });
    for await (const line of lines) {
      if (!line.trim()) continue;
      summary.read++;
      if (limit !== undefined && summary.read > limit) break;
      let parsed: unknown;
      try {
        parsed = JSON.parse(line);
      } catch {
        summary.unsupported++;
        reason(summary, "json");
        continue;
      }
      const result = await intakeRecord(parsed);
      if (result.status === "skipped") {
        summary.skipped++;
        reason(summary, result.reason);
        continue;
      }
      if (result.status === "unsupported") {
        summary.unsupported++;
        reason(summary, result.reason);
        continue;
      }
      if (seen.has(result.fixture.id)) {
        summary.duplicates++;
        continue;
      }
      seen.add(result.fixture.id);
      shapes.add(result.shape);
      summary.written++;
      summary.uniqueShapes = shapes.size;
      const expected = result.fixture.expected;
      const positive = Boolean(expected.previous?.length || expected.next?.length);
      const negative = expected.previous?.length === 0 || expected.next?.length === 0;
      if (!positive) summary.negatives++;
      else if (negative) summary.mixed++;
      else summary.positives++;
      const serialized = JSON.stringify(result.fixture) + "\n";
      summary.bytes += serialized.length;
      await writer.write(serialized);
    }
    await writer.end();
    renameSync(temporary, resolve(output));
  } catch {
    try { await writer.end(); } catch {}
    rmSync(temporary, { force: true });
    console.error("Intake failed before a fixture set was written.");
    process.exitCode = 1;
    return;
  }
  console.log(JSON.stringify(summary, null, 2));
  if (!summary.written) process.exitCode = 1;
}

function option(name: string): string | undefined {
  const index = Bun.argv.indexOf(`--${name}`);
  if (index < 0) return;
  const value = Bun.argv[index + 1];
  return value && !value.startsWith("--") ? value : undefined;
}

function parseLimit(value: string | undefined): number | undefined {
  if (value === undefined) return;
  if (!/^[1-9]\d{0,6}$/.test(value)) {
    console.error("--limit must be a positive integer.");
    process.exit(2);
  }
  return Number(value);
}

function reason(summary: IntakeSummary, code: string) {
  summary.reasons[code] = (summary.reasons[code] ?? 0) + 1;
}
