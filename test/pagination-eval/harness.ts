import { Window } from "happy-dom";
import { classTokens, labelText, routeHref } from "./fixture.ts";
import type { Direction, Fixture, FixtureNode } from "./fixture.ts";

export type Evaluation = {
  id: string;
  actual: Record<Direction, string | null>;
  fallbackDirections: Direction[];
  harnessError?: true;
};

const directions: Direction[] = ["previous", "next"];
const patchedPrototypes = new WeakSet<object>();
let importSequence = 0;

export async function evaluateFixture(fixture: Fixture): Promise<Evaluation> {
  const window = new Window({
    url: routeHref(fixture.url),
    settings: { disableJavaScriptFileLoading: true, disableCSSFileLoading: true },
  });
  const document = window.document as unknown as Document;
  const saved = saveGlobals();
  const clicked: string[] = [];
  const fallbackDirections = new Set<Direction>();
  try {
    patchSelectorEngine(window);
    makeDocument(fixture, document);
    for (const element of document.querySelectorAll<HTMLElement>("*")) element.style.visibility = "visible";
    installGlobals(window, fallbackDirections);
    document.addEventListener(
      "click",
      (event) => {
        const target =
          event.target instanceof window.Element
            ? (event.target as unknown as Element).closest("[data-fixture-id]")
            : undefined;
        const key = target?.getAttribute("data-fixture-id");
        if (key) clicked.push(key);
        event.preventDefault();
      },
      true,
    );
    Reflect.deleteProperty(globalThis, "justPaginationInstalled");
    await import(`../../src/content.ts?pagination-eval=${++importSequence}`);
    await new Promise((resolve) => setTimeout(resolve, 0));
    const actual = { previous: null, next: null } as Record<Direction, string | null>;
    for (const direction of directions) {
      const key = direction === "previous" ? "ArrowLeft" : "ArrowRight";
      const before = clicked.length;
      const event = new window.KeyboardEvent("keydown", { key, bubbles: true, cancelable: true });
      Object.defineProperty(event, "isTrusted", { value: true });
      window.dispatchEvent(event);
      actual[direction] = clicked.length > before ? clicked[before] : null;
    }
    return { id: fixture.id, actual, fallbackDirections: [...fallbackDirections] };
  } catch {
    return { id: fixture.id, actual: { previous: null, next: null }, fallbackDirections: [], harnessError: true };
  } finally {
    window.happyDOM.close();
    saved.restore();
  }
}

function makeDocument(fixture: Fixture, document: Document) {
  for (const entry of fixture.head) {
    const link = document.createElement("link");
    link.rel = entry.rel;
    link.href = routeHref(entry.href);
    document.head.append(link);
  }
  document.body.replaceChildren(...fixture.body.map((node) => buildNode(document, node)));
}

function buildNode(document: Document, node: FixtureNode, insideForm = false): HTMLElement {
  const element = document.createElement(node.tag);
  const classes = classTokens(node.flags);
  if (classes.length) element.className = classes.join(" ");
  if (node.key) element.setAttribute("data-fixture-id", node.key);
  if (node.ariaLabel) element.setAttribute("aria-label", labelText(node.ariaLabel));
  if (node.title) element.setAttribute("title", labelText(node.title));
  if (node.role) element.setAttribute("role", node.role);
  if (node.ariaCurrent) element.setAttribute("aria-current", node.ariaCurrent);
  if (node.ariaDisabled) element.setAttribute("aria-disabled", "true");
  if (node.ariaHidden) element.setAttribute("aria-hidden", "true");
  if (node.disabled && node.tag === "button") (element as HTMLButtonElement).disabled = true;
  if (node.hidden) element.setAttribute("hidden", "");
  if (node.inert) element.setAttribute("inert", "");
  if (node.dataPagination) element.setAttribute("data-pagination", "");
  if (node.rel) element.setAttribute("rel", node.rel.join(" "));
  if (node.href) element.setAttribute("href", routeHref(node.href));
  if (node.targetBlank) element.setAttribute("target", "_blank");
  if (node.targetOther) element.setAttribute("target", "_parent");
  if (node.download) element.setAttribute("download", "");
  if (node.text) element.append(labelText(node.text));
  if (node.svg) {
    const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
    svg.setAttribute("aria-hidden", "true");
    element.append(svg);
  }
  for (const child of node.children ?? []) {
    element.append(buildNode(document, child, insideForm || node.tag === "form"));
  }
  if (node.inForm && !insideForm) {
    const form = document.createElement("form");
    form.append(element);
    return form;
  }
  return element;
}

function installGlobals(window: Window, fallbackDirections: Set<Direction>) {
  const chrome = {
    runtime: {
      sendMessage(message: unknown) {
        if (isRecord(message) && message.type === "content-status") return Promise.resolve(true);
        if (
          isRecord(message) &&
          message.type === "classify" &&
          isRecord(message.data) &&
          Array.isArray(message.data.needed)
        ) {
          for (const direction of message.data.needed) {
            if (direction === "previous" || direction === "next") fallbackDirections.add(direction);
          }
        }
        return Promise.resolve(undefined);
      },
      onMessage: { addListener() {} },
    },
  };
  setGlobal("window", window);
  setGlobal("document", window.document);
  setGlobal("location", window.location);
  setGlobal("chrome", chrome);
  setGlobal("Element", window.Element);
  setGlobal("HTMLElement", window.HTMLElement);
  setGlobal("HTMLAnchorElement", window.HTMLAnchorElement);
  setGlobal("HTMLButtonElement", window.HTMLButtonElement);
  setGlobal("MutationObserver", window.MutationObserver);
  setGlobal("getComputedStyle", window.getComputedStyle.bind(window));
}

export function patchSelectorEngine(window: Window) {
  const normalize = (selector: string) => selector.replace(/\s+i\]/g, "]");
  const roots: object[] = [window.document, window.document.createElement("div")];
  for (const root of roots) {
    for (
      let prototype = Object.getPrototypeOf(root);
      prototype && prototype !== Object.prototype;
      prototype = Object.getPrototypeOf(prototype)
    ) {
      if (patchedPrototypes.has(prototype)) continue;
      patchedPrototypes.add(prototype);
      for (const name of ["querySelectorAll", "querySelector", "matches", "closest"] as const) {
        const original = (prototype as Record<string, unknown>)[name];
        if (typeof original !== "function") continue;
        Object.defineProperty(prototype, name, {
          configurable: true,
          writable: true,
          value(this: unknown, selector: string, ...args: unknown[]) {
            return Reflect.apply(original, this, [normalize(selector), ...args]);
          },
        });
      }
    }
  }
}

function saveGlobals() {
  const names = [
    "window",
    "document",
    "location",
    "chrome",
    "Element",
    "HTMLElement",
    "HTMLAnchorElement",
    "HTMLButtonElement",
    "MutationObserver",
    "getComputedStyle",
    "justPaginationInstalled",
  ] as const;
  const saved = names.map((name) => [name, Object.getOwnPropertyDescriptor(globalThis, name)] as const);
  return {
    restore() {
      for (const [name, descriptor] of saved) {
        if (descriptor) Object.defineProperty(globalThis, name, descriptor);
        else Reflect.deleteProperty(globalThis, name);
      }
    },
  };
}

function setGlobal(name: string, value: unknown) {
  Object.defineProperty(globalThis, name, { configurable: true, writable: true, value });
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
