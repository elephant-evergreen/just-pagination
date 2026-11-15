export const fixtureVersion = 1;

export const pageKeys = [
  "p",
  "page",
  "paged",
  "pageno",
  "pagenum",
  "pagenumber",
  "pg",
  "start",
  "start_index",
  "start_row",
  "offset",
  "skip",
  "bsi",
] as const;

export type PageKey = typeof pageKeys[number];
export type Site = "same" | "other";
export type RouteShape = "plain" | "query" | "page-path" | "numbered-path" | "index";

export type Route = {
  site: Site;
  route: number;
  shape: RouteShape;
  page?: number;
  key?: PageKey;
  filters?: number[];
};

export type Label =
  | "prev"
  | "next"
  | "older"
  | "newer"
  | "first"
  | "last"
  | "ellipsis"
  | "icon"
  | "label"
  | "nav"
  | "pager"
  | "pageNav"
  | "pageNumbers"
  | `#${number}`
  | `current#${number}`
  | `page#${number}`
  | `goto#${number}`;

export type ClassFlag = "pagination" | "pager" | "pageNav" | "current" | "selected" | "disabled" | "active";
export type FixtureTag =
  | "a"
  | "button"
  | "div"
  | "form"
  | "li"
  | "main"
  | "nav"
  | "ol"
  | "p"
  | "section"
  | "span"
  | "table"
  | "tbody"
  | "td"
  | "tr"
  | "ul";
export type FixtureRole = "navigation" | "button" | "grid" | "tablist" | "dialog";

export type FixtureNode = {
  tag: FixtureTag;
  key?: string;
  text?: Label;
  ariaLabel?: Label;
  title?: Label;
  role?: FixtureRole;
  flags?: ClassFlag[];
  ariaCurrent?: "page" | "true";
  ariaDisabled?: true;
  ariaHidden?: true;
  disabled?: true;
  hidden?: true;
  inert?: true;
  dataPagination?: true;
  rel?: Array<"prev" | "next">;
  href?: Route;
  targetBlank?: true;
  targetOther?: true;
  download?: true;
  inForm?: true;
  svg?: true;
  children?: FixtureNode[];
};

export type Expected = {
  previous?: string[];
  next?: string[];
};

export type FixturePayload = {
  version: typeof fixtureVersion;
  url: Route;
  head: Array<{ rel: "prev" | "next"; href: Route }>;
  body: FixtureNode[];
  expected: Expected;
};

export type Fixture = FixturePayload & { id: string };

export type Direction = "previous" | "next";

const labels = new Set<string>([
  "prev",
  "next",
  "older",
  "newer",
  "first",
  "last",
  "ellipsis",
  "icon",
  "label",
  "nav",
  "pager",
  "pageNav",
  "pageNumbers",
]);
const classFlags = new Set<string>(["pagination", "pager", "pageNav", "current", "selected", "disabled", "active"]);
const tags = new Set<string>([
  "a",
  "button",
  "div",
  "form",
  "li",
  "main",
  "nav",
  "ol",
  "p",
  "section",
  "span",
  "table",
  "tbody",
  "td",
  "tr",
  "ul",
]);
const roles = new Set<string>(["navigation", "button", "grid", "tablist", "dialog"]);
const shapes = new Set<string>(["plain", "query", "page-path", "numbered-path", "index"]);
const pageKeySet = new Set<string>(pageKeys);
const labelPattern = /^(?:#|current#|page#|goto#)(\d{1,6})$/;
const numericLabelShape = /^(#|current#|page#|goto#)\d{1,6}$/;
const keyPattern = /^c[1-9]\d{0,3}$/;
const digestPattern = /^[a-f0-9]{64}$/;

export function isLabel(value: unknown): value is Label {
  if (typeof value !== "string") return false;
  if (labels.has(value)) return true;
  const match = value.match(labelPattern);
  return Boolean(match && Number(match[1]) <= 999_999);
}

export function labelText(label: Label): string {
  if (labels.has(label)) {
    switch (label) {
      case "prev": return "Previous";
      case "next": return "Next";
      case "older": return "Older posts";
      case "newer": return "Newer posts";
      case "first": return "First";
      case "last": return "Last";
      case "ellipsis": return "…";
      case "icon": return "";
      case "label": return "Label";
      case "nav": return "Pagination";
      case "pager": return "Pager";
      case "pageNav": return "Page navigation";
      case "pageNumbers": return "Page numbers";
    }
  }
  const match = label.match(labelPattern)!;
  const number = Number(match[1]);
  if (label.startsWith("current#")) return `${number} (current)`;
  if (label.startsWith("page#")) return `Page ${number}`;
  if (label.startsWith("goto#")) return `Go to page ${number}`;
  return String(number);
}

export function classTokens(flags: readonly ClassFlag[] | undefined): string[] {
  if (!flags) return [];
  return flags.flatMap(flag => {
    if (flag === "pageNav") return ["page-nav"];
    return [flag];
  });
}

export function routeHref(route: Route): string {
  const origin = route.site === "same" ? "https://same.example.test" : "https://other.example.test";
  const base = `/r${route.route}`;
  let path = base;
  if (route.shape === "page-path") path = `${base}/page/${route.page}`;
  else if (route.shape === "numbered-path") path = `${base}/${route.page}`;
  else if (route.shape === "index") path = `${base}/index`;
  const parameters: string[] = [];
  if (route.shape === "query") parameters.push(`${route.key ?? "page"}=${route.page}`);
  for (const filter of [...(route.filters ?? [])].sort((left, right) => left - right)) {
    parameters.push(`f${filter}=1`);
  }
  return origin + path + (parameters.length ? "?" + parameters.join("&") : "");
}

export function stableStringify(value: unknown): string {
  if (value === null || typeof value !== "object") return JSON.stringify(value) ?? "null";
  if (Array.isArray(value)) return `[${value.map(item => stableStringify(item)).join(",")}]`;
  const record = value as Record<string, unknown>;
  return `{${Object.keys(record).sort().map(key =>
    `${JSON.stringify(key)}:${stableStringify(record[key])}`,
  ).join(",")}}`;
}

export async function sha256(value: string): Promise<string> {
  const bytes = new TextEncoder().encode(value);
  const digest = new Uint8Array(await crypto.subtle.digest("SHA-256", bytes));
  return Array.from(digest, byte => byte.toString(16).padStart(2, "0")).join("");
}

export function fixturePayload(fixture: Fixture): FixturePayload {
  return {
    version: fixture.version,
    url: fixture.url,
    head: fixture.head,
    body: fixture.body,
    expected: fixture.expected,
  };
}

export async function fixtureDigest(fixture: FixturePayload | Fixture): Promise<string> {
  return sha256(stableStringify("version" in fixture && "id" in fixture ? fixturePayload(fixture as Fixture) : fixture));
}

export async function sealFixture(payload: FixturePayload): Promise<Fixture> {
  return { ...payload, id: await fixtureDigest(payload) };
}

export async function fixtureShapeDigest(fixture: Fixture): Promise<string> {
  const currentPage = fixture.url.page;
  const hrefShape = (href: Route | undefined) => href && {
    site: href.site,
    shape: href.shape,
    pageRelation: href.page === undefined || currentPage === undefined ? null : href.page - currentPage,
    pageKey: href.key ?? null,
    filterCount: href.filters?.length ?? 0,
  };
  const shapeLabel = (label: Label | undefined) => label === undefined ? null : label.replace(numericLabelShape, "$1");
  const nodeShape = (node: FixtureNode): unknown => ({
    tag: node.tag,
    text: shapeLabel(node.text),
    ariaLabel: shapeLabel(node.ariaLabel),
    title: shapeLabel(node.title),
    role: node.role ?? null,
    flags: node.flags ?? [],
    ariaCurrent: node.ariaCurrent ?? null,
    ariaDisabled: node.ariaDisabled ?? null,
    ariaHidden: node.ariaHidden ?? null,
    disabled: node.disabled ?? null,
    hidden: node.hidden ?? null,
    inert: node.inert ?? null,
    dataPagination: node.dataPagination ?? null,
    rel: node.rel ?? [],
    href: hrefShape(node.href),
    targetBlank: node.targetBlank ?? null,
    targetOther: node.targetOther ?? null,
    download: node.download ?? null,
    inForm: node.inForm ?? null,
    svg: node.svg ?? null,
    children: node.children?.map(nodeShape) ?? [],
  });
  return sha256(stableStringify({
    version: fixture.version,
    url: {
      site: fixture.url.site,
      shape: fixture.url.shape,
      hasPage: fixture.url.page !== undefined,
      pageKey: fixture.url.key ?? null,
      filterCount: fixture.url.filters?.length ?? 0,
    },
    head: fixture.head.map(entry => ({ rel: entry.rel, href: hrefShape(entry.href) })),
    body: fixture.body.map(nodeShape),
    expected: {
      previous: fixture.expected.previous?.length ?? null,
      next: fixture.expected.next?.length ?? null,
    },
  }));
}

export async function parseFixture(value: unknown): Promise<Fixture> {
  const fixture = record(value, "fixture");
  exactKeys(fixture, ["id", "version", "url", "head", "body", "expected"], "fixture");
  if (fixture.version !== fixtureVersion) throw new TypeError("fixture.version");
  if (typeof fixture.id !== "string" || !digestPattern.test(fixture.id)) throw new TypeError("fixture.id");
  const url = parseRoute(fixture.url, "fixture.url");
  if (url.site !== "same") throw new TypeError("fixture.url.site");
  if (!Array.isArray(fixture.head) || fixture.head.length > 4) throw new TypeError("fixture.head");
  const head = fixture.head.map((entry, index) => {
    const item = record(entry, `fixture.head[${index}]`);
    exactKeys(item, ["rel", "href"], `fixture.head[${index}]`);
    if (item.rel !== "prev" && item.rel !== "next") throw new TypeError(`fixture.head[${index}].rel`);
    const rel: "prev" | "next" = item.rel;
    return { rel, href: parseRoute(item.href, `fixture.head[${index}].href`) };
  });
  if (!Array.isArray(fixture.body) || fixture.body.length > 3) throw new TypeError("fixture.body");
  const keys = new Set<string>();
  let nodes = 0;
  const body = fixture.body.map((node, index) => {
    nodes++;
    return parseNode(node, `fixture.body[${index}]`, keys, 1, () => ++nodes);
  });
  if (nodes > 800) throw new TypeError("fixture.body.nodes");
  const expectedRecord = record(fixture.expected, "fixture.expected");
  exactKeys(expectedRecord, ["previous", "next"], "fixture.expected", true);
  const expected: Expected = {};
  for (const direction of ["previous", "next"] as const) {
    const value = expectedRecord[direction];
    if (value === undefined) continue;
    if (!Array.isArray(value) || value.length > 64) throw new TypeError(`fixture.expected.${direction}`);
    const expectedKeys = value.map(entry => {
      if (typeof entry !== "string" || !keys.has(entry)) throw new TypeError(`fixture.expected.${direction}`);
      return entry;
    });
    if (new Set(expectedKeys).size !== expectedKeys.length) throw new TypeError(`fixture.expected.${direction}`);
    if (expectedKeys.some((entry, index) => index > 0 && sortKey(entry) <= sortKey(expectedKeys[index - 1]))) {
      throw new TypeError(`fixture.expected.${direction}.order`);
    }
    expected[direction] = expectedKeys;
  }
  const payload: FixturePayload = { version: fixtureVersion, url, head, body, expected };
  if (await fixtureDigest(payload) !== fixture.id) throw new TypeError("fixture.id.digest");
  return { ...payload, id: fixture.id };
}

function parseNode(value: unknown, path: string, keys: Set<string>, depth: number, count: () => number): FixtureNode {
  if (depth > 20) throw new TypeError(`${path}.depth`);
  const node = record(value, path);
  exactKeys(node, [
    "tag", "key", "text", "ariaLabel", "title", "role", "flags", "ariaCurrent", "ariaDisabled", "ariaHidden",
    "disabled", "hidden", "inert", "dataPagination", "rel", "href", "targetBlank", "targetOther", "download",
    "inForm", "svg", "children",
  ], path, true);
  if (typeof node.tag !== "string" || !tags.has(node.tag)) throw new TypeError(`${path}.tag`);
  const tag = node.tag as FixtureTag;
  const control = tag === "a" || tag === "button";
  if (control) {
    if (typeof node.key !== "string" || !keyPattern.test(node.key) || keys.has(node.key)) throw new TypeError(`${path}.key`);
    keys.add(node.key);
  } else if (node.key !== undefined) throw new TypeError(`${path}.key`);
  for (const field of ["text", "ariaLabel", "title"] as const) {
    if (node[field] !== undefined && !isLabel(node[field])) throw new TypeError(`${path}.${field}`);
  }
  if (node.role !== undefined && (typeof node.role !== "string" || !roles.has(node.role))) throw new TypeError(`${path}.role`);
  if (node.role === "button" && !control) throw new TypeError(`${path}.role`);
  if (node.flags !== undefined) {
    if (!Array.isArray(node.flags) || node.flags.length > classFlags.size) throw new TypeError(`${path}.flags`);
    for (const flag of node.flags) {
      if (typeof flag !== "string" || !classFlags.has(flag)) throw new TypeError(`${path}.flags`);
    }
    if (new Set(node.flags).size !== node.flags.length) throw new TypeError(`${path}.flags`);
  }
  if (node.ariaCurrent !== undefined && node.ariaCurrent !== "page" && node.ariaCurrent !== "true") {
    throw new TypeError(`${path}.ariaCurrent`);
  }
  for (const field of ["ariaDisabled", "ariaHidden", "disabled", "hidden", "inert", "dataPagination", "targetBlank", "targetOther", "download", "inForm", "svg"] as const) {
    if (node[field] !== undefined && node[field] !== true) throw new TypeError(`${path}.${field}`);
  }
  if (node.disabled === true && tag !== "button") throw new TypeError(`${path}.disabled`);
  if ((node.targetBlank === true || node.targetOther === true || node.download === true) && tag !== "a") {
    throw new TypeError(`${path}.linkOnly`);
  }
  if (node.inForm === true && !control) throw new TypeError(`${path}.inForm`);
  if (node.rel !== undefined) {
    if (!Array.isArray(node.rel) || node.rel.length > 2) throw new TypeError(`${path}.rel`);
    for (const rel of node.rel) if (rel !== "prev" && rel !== "next") throw new TypeError(`${path}.rel`);
    if (new Set(node.rel).size !== node.rel.length) throw new TypeError(`${path}.rel`);
  }
  if (node.href !== undefined && tag !== "a") throw new TypeError(`${path}.href`);
  const href = node.href === undefined ? undefined : parseRoute(node.href, `${path}.href`);
  let children: FixtureNode[] | undefined;
  if (node.children !== undefined) {
    if (control) throw new TypeError(`${path}.children`);
    if (!Array.isArray(node.children) || node.children.length > 100) throw new TypeError(`${path}.children`);
    children = node.children.map((child, index) => {
      count();
      return parseNode(child, `${path}.children[${index}]`, keys, depth + 1, count);
    });
  }
  const key = node.key as string | undefined;
  const text = node.text as Label | undefined;
  const ariaLabel = node.ariaLabel as Label | undefined;
  const title = node.title as Label | undefined;
  const role = node.role as FixtureRole | undefined;
  const flags = node.flags as ClassFlag[] | undefined;
  const ariaCurrent = node.ariaCurrent as "page" | "true" | undefined;
  const ariaDisabled = node.ariaDisabled as true | undefined;
  const ariaHidden = node.ariaHidden as true | undefined;
  const disabled = node.disabled as true | undefined;
  const hidden = node.hidden as true | undefined;
  const inert = node.inert as true | undefined;
  const dataPagination = node.dataPagination as true | undefined;
  const rel = node.rel as Array<"prev" | "next"> | undefined;
  const targetBlank = node.targetBlank as true | undefined;
  const targetOther = node.targetOther as true | undefined;
  const download = node.download as true | undefined;
  const inForm = node.inForm as true | undefined;
  const svg = node.svg as true | undefined;
  return {
    tag,
    ...(key === undefined ? {} : { key }),
    ...(text === undefined ? {} : { text }),
    ...(ariaLabel === undefined ? {} : { ariaLabel }),
    ...(title === undefined ? {} : { title }),
    ...(role === undefined ? {} : { role }),
    ...(flags === undefined ? {} : { flags }),
    ...(ariaCurrent === undefined ? {} : { ariaCurrent }),
    ...(ariaDisabled === undefined ? {} : { ariaDisabled }),
    ...(ariaHidden === undefined ? {} : { ariaHidden }),
    ...(disabled === undefined ? {} : { disabled }),
    ...(hidden === undefined ? {} : { hidden }),
    ...(inert === undefined ? {} : { inert }),
    ...(dataPagination === undefined ? {} : { dataPagination }),
    ...(rel === undefined ? {} : { rel }),
    ...(href === undefined ? {} : { href }),
    ...(targetBlank === undefined ? {} : { targetBlank }),
    ...(targetOther === undefined ? {} : { targetOther }),
    ...(download === undefined ? {} : { download }),
    ...(inForm === undefined ? {} : { inForm }),
    ...(svg === undefined ? {} : { svg }),
    ...(children === undefined ? {} : { children }),
  };
}

function parseRoute(value: unknown, path: string): Route {
  const route = record(value, path);
  exactKeys(route, ["site", "route", "shape", "page", "key", "filters"], path, true);
  if (route.site !== "same" && route.site !== "other") throw new TypeError(`${path}.site`);
  if (typeof route.route !== "number" || !Number.isInteger(route.route) || route.route < 1 || route.route > 9_999) {
    throw new TypeError(`${path}.route`);
  }
  if (typeof route.shape !== "string" || !shapes.has(route.shape)) throw new TypeError(`${path}.shape`);
  const shape = route.shape as RouteShape;
  if (route.page !== undefined && (typeof route.page !== "number" || !Number.isInteger(route.page) ||
      route.page < 0 || route.page > 999_999)) throw new TypeError(`${path}.page`);
  if (route.key !== undefined && (typeof route.key !== "string" || !pageKeySet.has(route.key))) {
    throw new TypeError(`${path}.key`);
  }
  let filters: number[] | undefined;
  if (route.filters !== undefined) {
    if (!Array.isArray(route.filters) || route.filters.length > 32) throw new TypeError(`${path}.filters`);
    const values = route.filters;
    for (const filter of values) {
      if (typeof filter !== "number" || !Number.isInteger(filter) || filter < 1 || filter > 999) {
        throw new TypeError(`${path}.filters`);
      }
    }
    if (values.some((filter, index) => index > 0 && filter <= values[index - 1])) {
      throw new TypeError(`${path}.filters.order`);
    }
    filters = values as number[];
  }
  if (shape === "query" && (route.page === undefined || route.key === undefined)) throw new TypeError(`${path}.query`);
  if ((shape === "page-path" || shape === "numbered-path") && route.page === undefined) {
    throw new TypeError(`${path}.page`);
  }
  return {
    site: route.site,
    route: route.route,
    shape,
    ...(route.page === undefined ? {} : { page: route.page }),
    ...(route.key === undefined ? {} : { key: route.key as PageKey }),
    ...(filters === undefined ? {} : { filters }),
  };
}

function record(value: unknown, path: string): Record<string, unknown> {
  if (typeof value !== "object" || value === null || Array.isArray(value)) throw new TypeError(path);
  return value as Record<string, unknown>;
}

function exactKeys(value: Record<string, unknown>, allowed: string[], path: string, optional = false) {
  const present = Object.keys(value);
  if (!optional && present.length !== allowed.length) throw new TypeError(`${path}.keys`);
  for (const key of present) if (!allowed.includes(key)) throw new TypeError(`${path}.${key}`);
}

function sortKey(value: string): number {
  return Number(value.slice(1));
}
