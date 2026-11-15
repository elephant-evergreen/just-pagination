type Direction = import("./protocol.js").Direction;
type CandidateShape = import("./protocol.js").CandidateShape;
type Decisions = import("./protocol.js").Decisions;

(() => {
  const installed = globalThis as typeof globalThis & { justPaginationInstalled?: boolean };
  if (installed.justPaginationInstalled) return;
  installed.justPaginationInstalled = true;

  const controlSelector = "a[href], button, [role=button]";
  const protectedControls = "input, textarea, select, [contenteditable]:not([contenteditable=false]), " +
    "[role=textbox], [role=slider], [role=spinbutton], [role=combobox], [role=listbox], [role=menu], " +
    "[role=tablist], [role=grid], [role=tree], video, audio";
  const nonPagination = "dialog,[role=dialog],[role=menu],[role=tablist],[role=grid],[role=tree]";
  const labels: Record<Direction, RegExp> = {
    previous: /^(?:‹|←|❮|<|prev(?:ious)?(?:\s+page)?|newer\s+(?:posts|entries|articles)|前(?:へ|のページ)|前ページ)$/iu,
    next: /^(?:›|→|❯|>|next(?:\s+page)?|older\s+(?:posts|entries|articles)|次(?:へ|のページ)|次ページ)$/iu,
  };
  const navWords = /paginat|paging|(?:^|[\W_])pager(?:$|[\W_])|ページネーション|ページ送り|ページ移動|page[ -]?(?:nav(?:igation)?|numbers)/i;
  const directions = ["previous", "next"] as const;
  type Targets = Partial<Record<Direction, HTMLElement>>;
  type Group = { root: Element; controls: HTMLElement[]; current?: Element; currentPage?: number };
  const paginationSelector = "nav,[role=navigation],[class*=paginat i],[class*=pager i],[class*=pagenav i],[class*=page-nav i],[data-pagination]";
  const selectedSelector = '.active,.selected,.current,.is-current,[class$="--current"],[class*="--current "],[aria-label^="Current page," i]';
  const currentSelector = "[aria-current=page],[aria-current=true]";
  const pageParameter = /^(?:p|page|paged|pageno|pagenum|pagenumber|pg|start(?:_index|row)?|offset|skip|bsi)$/i;
  const pagePath = /\/(?:page[\/=-]|p)\d+(?:\.html)?\/?$/i;
  const numberedPath = /\/(\d{1,6})\/?$/;
  const trackingParameter = /^(?:utm_.+|gclid|fbclid|ved)$/i;
  let enabled = false;
  let refreshRevision = 0;
  let targets: Targets = {};
  let timer: number | undefined;
  let documentURL = location.href;
  let classificationAttempt: string | undefined;
  let assisted: Targets = {};
  let inspectedRoots: Element[] = [];
  const fingerprints = new WeakMap<HTMLElement, string>();

  function safeDestination(raw: string): string | undefined {
    try {
      const url = new URL(raw, location.href);
      if (url.origin !== location.origin || !/^https?:$/.test(url.protocol) || url.username || url.password) return;
      if (url.pathname === location.pathname && url.search === location.search) return;
      return url.href;
    } catch {
      return;
    }
  }

  function usable(node: Element): node is HTMLElement {
    if (!(node instanceof HTMLElement) || !node.isConnected || !node.getClientRects().length) return false;
    if (node.closest("[inert],[hidden],[aria-hidden=true],:disabled,[aria-disabled=true],.disabled," +
        nonPagination + ",form[method=dialog]")) return false;
    if (getComputedStyle(node).visibility !== "visible") return false;
    if (node instanceof HTMLAnchorElement) {
      if (node.hasAttribute("download") || (node.target && node.target !== "_self") || !safeDestination(node.href)) return false;
      if (!node.closest("form") || pageAddress(new URL(node.href))) return true;
      const direction = directionOf(node);
      return direction !== "unknown" && adjacentAddress(node.href, direction);
    }
    return node.matches("button,[role=button]") && !node.closest("a,form") &&
      (!(node instanceof HTMLButtonElement) || !node.form);
  }

  function label(node: Element) {
    return [node.getAttribute("aria-label"), node.getAttribute("title"), node.textContent,
      ...[...node.children].filter(child => !child.matches("[aria-hidden=true],svg")).map(child => child.textContent)]
      .filter((value): value is string => Boolean(value)).map(value => value.trim().replace(/\s+/g, " "));
  }

  function directionOf(node: Element): Direction | "unknown" {
    const rel = node.getAttribute("rel")?.toLowerCase().split(/\s+/) ?? [];
    if (rel.includes("prev") || rel.includes("previous")) return "previous";
    if (rel.includes("next")) return "next";
    const values = label(node);
    if (values.some(value => /^(?:first|last)(?: page)?$|^cannot go to\b/i.test(value))) return "unknown";
    for (const value of values) {
      const text = value.replace(/^[<‹«←❮]\s*(?=\p{L})/u, "")
        .replace(/^(?:go to|goto|navigate to) (?:the )?/i, "")
        .replace(/(?: of (?:search )?results\.?|\s*[<>›‹»«→←])$/i, "")
        .replace(/^(next|previous|prev) page \d+$/i, "$1 page")
        .replace(/\.$/, "");
      const direction = directions.find(direction => labels[direction].test(text) || labels[direction].test(value));
      if (direction) return direction;
    }
    return "unknown";
  }

  function numberOf(node: Element): number | undefined {
    const text = node.textContent?.normalize("NFKC").trim() ?? "";
    const number = text.match(/^(\d{1,6})(?:\s*\(current\))?$/i)?.[1] ??
      (node.getAttribute("aria-current") === "page" ? text.match(/^(\d{1,6})\s*[/／]\s*[\d,.]+$/)?.[1] : undefined) ??
      node.getAttribute("aria-label")?.match(/^(?:(?:go to|goto) )?page (\d{1,6})(?:,? current page)?$/i)?.[1];
    return number === undefined ? undefined : Number(number);
  }

  function currentControl(root: Element, controls: Element[]) {
    const matches = (elements: Iterable<Element>) => [...elements].filter(node => numberOf(node) !== undefined);
    const selected = matches(root.querySelectorAll(selectedSelector));
    const marked = matches(root.querySelectorAll(currentSelector));
    const url = new URL(location.href);
    const samePage = (node: Element) => {
      if (!(node instanceof HTMLAnchorElement) || !node.hasAttribute("href")) return false;
      const destination = new URL(node.href);
      return destination.origin === url.origin && destination.pathname === url.pathname && destination.search === url.search;
    };
    const numberLists = new Set(controls.filter(node => numberOf(node) !== undefined).map(node => node.parentElement));
    const bareNumbers = [...numberLists].flatMap(list => [...(list?.children ?? [])].filter(node =>
      !node.matches(controlSelector) && !node.querySelector(controlSelector) && numberOf(node) !== undefined,
    ));
    return selected.find(samePage) ?? (selected.length === 1 ? selected[0] : undefined) ??
      marked.find(samePage) ?? (marked.length === 1 ? marked[0] : undefined) ??
      controls.find(node => numberOf(node) !== undefined && samePage(node)) ??
      (bareNumbers.length === 1 ? bareNumbers[0] : undefined);
  }

  function pageAddress(url: URL) {
    const route = (path: string, pageKey: string) => {
      const parameters = new URLSearchParams(url.search);
      for (const key of [...parameters.keys()]) {
        if (key === pageKey || trackingParameter.test(key)) parameters.delete(key);
      }
      parameters.sort();
      return JSON.stringify([path, pageKey, parameters.toString()]);
    };
    const segment = url.pathname.match(pagePath)?.[0];
    if (segment) return { route: route(url.pathname.slice(0, -segment.length), ""), value: Number(segment.match(/\d+/)?.[0]) };
    for (const [key, value] of url.searchParams) {
      if (pageParameter.test(key) && /^\d{1,8}$/.test(value)) return { route: route(url.pathname, key), value: Number(value) };
    }
  }

  function numberedPathBase(url: URL, page: number) {
    const suffix = url.pathname.match(numberedPath);
    if (suffix && Number(suffix[1]) === page) return url.pathname.slice(0, -suffix[0].length);
  }

  function inferredPage(controls: HTMLElement[], current: URL) {
    const segment = current.pathname.match(numberedPath)?.[0];
    if (!segment) return;
    const currentPage = Number(segment.match(/\d+/)?.[0]);
    const base = current.pathname.slice(0, -segment.length);
    const pages = new Map<number, HTMLAnchorElement>();
    const rel = (control: HTMLAnchorElement) => control.getAttribute("rel")?.toLowerCase().split(/\s+/) ?? [];
    for (const control of controls) {
      if (!(control instanceof HTMLAnchorElement) || !usable(control)) continue;
      const page = numberOf(control);
      if (page === undefined) continue;
      const url = new URL(control.href);
      if (url.origin !== current.origin || url.search !== current.search) continue;
      const pageBase = numberedPathBase(url, page) ?? (page === 1 ? url.pathname.replace(/\/$/, "") : undefined);
      if (pageBase === base) pages.set(page, control);
    }
    const previous = pages.get(currentPage - 1);
    const next = pages.get(currentPage + 1);
    if (!previous || !next || (!rel(previous).includes("prev") && !rel(previous).includes("previous")) ||
        !rel(next).includes("next")) return;
    return [...pages.keys()].some(page => page !== currentPage && Math.abs(page - currentPage) > 1)
      ? currentPage
      : undefined;
  }

  function routeEvidence(controls: HTMLElement[], currentPage: number | undefined) {
    const current = new URL(location.href);
    const suffix = current.pathname.match(numberedPath);
    const page = suffix ? Number(suffix[1]) : currentPage;
    const base = page === undefined ? undefined : numberedPathBase(current, page) ??
      (page === 1 ? current.pathname.replace(/\/$/, "") : undefined);
    const routes = new Map<string, Set<number>>();
    for (const control of controls) {
      if (!(control instanceof HTMLAnchorElement) || !usable(control)) continue;
      const url = new URL(control.href);
      if (addressDirection(control.href)) {
        const address = pageAddress(url);
        if (!address) continue;
        const values = routes.get(address.route) ?? new Set<number>();
        values.add(address.value);
        routes.set(address.route, values);
        continue;
      }
      const value = numberOf(control);
      if (value === undefined || base === undefined || url.search !== current.search ||
          numberedPathBase(url, value) !== base) continue;
      const values = routes.get(base) ?? new Set<number>();
      values.add(value);
      routes.set(base, values);
    }
    return [...routes.values()].some(values => values.size >= 2);
  }

  function pageDirection(control: HTMLElement, group: Group | undefined) {
    if (!(control instanceof HTMLAnchorElement)) return;
    const direct = addressDirection(control.href);
    if (direct) return direct;
    if (!group) return;
    const page = numberOf(control);
    if (page === undefined || group.currentPage === undefined) return;
    const url = new URL(control.href);
    const current = new URL(location.href);
    const currentBase = numberedPathBase(current, group.currentPage) ??
      (group.currentPage === 1 ? current.pathname.replace(/\/$/, "") : undefined);
    const rel = control.getAttribute("rel")?.toLowerCase().split(/\s+/) ?? [];
    const alias = page === 1 && group.currentPage === 2 && url.search === current.search &&
      (rel.includes("prev") || rel.includes("previous")) &&
      url.pathname.replace(/\/$/, "") === currentBase;
    const base = numberedPathBase(url, page) ?? (alias ? currentBase : undefined);
    if (base === undefined || base !== currentBase || url.search !== current.search || page === group.currentPage) return;
    return page > group.currentPage ? "next" : "previous";
  }

  function automatic(group: Group, control: HTMLElement) {
    if (control instanceof HTMLAnchorElement) return pageDirection(control, group) !== undefined;
    return numberOf(control) === undefined || group.currentPage !== undefined;
  }

  function activationEvidence(group: Group | undefined, target: HTMLElement, direction: Direction) {
    if (target instanceof HTMLAnchorElement) return pageDirection(target, group) === direction;
    if (!group) return false;
    const page = numberOf(target);
    if (page !== undefined) {
      return group.currentPage !== undefined &&
        page === group.currentPage + (direction === "next" ? 1 : -1);
    }
    return directionOf(target) === direction;
  }

  function classificationLayout(root: Element, currentPage: number | undefined, controls: HTMLElement[]) {
    const url = new URL(location.href);
    const path = numberedPathBase(url, currentPage ?? 0) ?? url.pathname.replace(pagePath, "");
    const filters = new URLSearchParams(url.search);
    for (const key of [...filters.keys()]) {
      if (pageParameter.test(key) || trackingParameter.test(key)) filters.delete(key);
    }
    filters.sort();
    const structure = controls.map(control => {
      const destination = control instanceof HTMLAnchorElement ? new URL(control.href) : undefined;
      const address = destination && pageAddress(destination);
      const page = numberOf(control);
      const numericPath = destination && page !== undefined && numberedPathBase(destination, page);
      return [
        control.tagName, control.className, control.getAttribute("role"), control.getAttribute("type"),
        page === undefined ? label(control).slice(0, 4).map(value => value.slice(0, 120)) : "#",
        control.querySelector("svg")?.innerHTML.slice(0, 512),
        address?.route ?? (numericPath || destination?.pathname),
      ];
    });
    return JSON.stringify([path.replace(/\/$/, ""), filters.toString(), root.tagName, root.className, structure]);
  }

  function numberedGroup(root: Element) {
    if (root.children.length < 3 || root.children.length > 34 || root.closest(nonPagination)) return;
    const controls = [...root.querySelectorAll<HTMLElement>(controlSelector)];
    if (controls.length > 32) return;
    const numbers: number[] = [];
    const pages: { route: string; value: number; number: number }[] = [];
    const pathPages: { control: HTMLAnchorElement; base: string; number: number }[] = [];
    let current: Element | undefined;
    for (const child of root.children) {
      if (child.matches("[hidden],[aria-hidden=true]") || child.querySelectorAll(controlSelector).length > 1) return;
      const control = child.matches(controlSelector) ? child : child.querySelector(controlSelector);
      const page = numberOf(control ?? child);
      if (page === undefined) {
        if (control && directionOf(control) === "unknown") {
          if (!/^(?:\.{3}|…)$/.test(control.textContent?.trim() ?? "") && !label(control).some(value => /^(?:first|last)(?: page)?$/i.test(value))) return;
        } else if (!control && !/^(?:\.{3}|…)?$/.test(child.textContent?.trim() ?? "")) return;
        continue;
      }
      if (numbers.length && page <= numbers[numbers.length - 1]) return;
      numbers.push(page);
      const marker = (control ?? child).closest(selectedSelector + "," + currentSelector);
      if (!control || (marker && marker !== root && root.contains(marker))) {
        if (current) return;
        current = control ?? child;
      }
      if (control instanceof HTMLAnchorElement && usable(control)) {
        const url = new URL(control.href);
        const address = pageAddress(url);
        if (address) pages.push({ ...address, number: page });
        else {
          const base = numberedPathBase(url, page);
          if (base !== undefined) pathPages.push({ control, base, number: page });
        }
      }
    }
    if (numbers.length < 3) return;
    const selectedPage = current && numberOf(current);
    const currentPage = selectedPage ?? (current ? undefined : inferredPage(controls, new URL(location.href)));
    if (currentPage === undefined) return;
    if (selectedPage !== undefined && !numbers.some((page, index) => page === numbers[index - 1] + 1)) return;
    if (pages.length >= 2) {
      const [first, second] = pages;
      const step = (second.value - first.value) / (second.number - first.number);
      if (!Number.isInteger(step) || step < 1 || !pages.every(page =>
        page.route === first.route && page.value - first.value === (page.number - first.number) * step)) return;
    } else {
      const currentURL = new URL(location.href);
      const base = currentPage === 1 ? currentURL.pathname.replace(/\/$/, "") : numberedPathBase(currentURL, currentPage);
      if (base === undefined || pathPages.length < 2 || !pathPages.every(page =>
        page.base === base && new URL(page.control.href).search === currentURL.search)) return;
      const hasDirectionalLink = pathPages.some(({ control, number }) =>
        Math.abs(number - currentPage) === 1 && controls.some(link => link instanceof HTMLAnchorElement &&
          link.href === control.href && directionOf(link) === (number > currentPage ? "next" : "previous")));
      if (!hasDirectionalLink) return;
    }
    return { root, controls, current, currentPage };
  }

  function paginationGroups() {
    const roots = new Set<Element>([...document.querySelectorAll(paginationSelector)].filter(node =>
      navWords.test(node.getAttribute("aria-label") ?? "") || navWords.test(node.getAttribute("class") ?? "") || node.hasAttribute("data-pagination"),
    ));
    for (const current of document.querySelectorAll(currentSelector)) {
      if (numberOf(current) === undefined) continue;
      const group = current.closest("ul,ol,nav,[role=navigation]");
      if (group && ![...roots].some(root => root.contains(group))) roots.add(group);
    }
    const groups: Group[] = [...roots].filter(root => !root.closest(nonPagination) &&
      ![...roots].some(other => other !== root && other.contains(root))).flatMap(root => {
      const controls = [...root.querySelectorAll<HTMLElement>(controlSelector)];
      const current = currentControl(root, controls);
      const currentPage = current ? numberOf(current) : inferredPage(controls, new URL(location.href));
      return controls.length && (currentPage !== undefined || routeEvidence(controls, currentPage))
        ? [{ root, controls, current, currentPage }]
        : [];
    });
    const seen = new Set<Element>();
    for (const anchor of document.querySelectorAll<HTMLAnchorElement>("a[href]")) {
      const page = numberOf(anchor);
      if (page === undefined || !safeDestination(anchor.href)) continue;
      const url = new URL(anchor.href);
      if (!pageAddress(url) && numberedPathBase(url, page) === undefined) continue;
      let parent = anchor.parentElement;
      for (let depth = 0; depth < 3 && parent; depth++, parent = parent.parentElement) {
        if (seen.has(parent) || groups.some(group => group.root.contains(parent))) break;
        seen.add(parent);
        const group = numberedGroup(parent);
        if (group) { groups.push(group); break; }
      }
    }
    return groups;
  }

  function fingerprint(node: HTMLElement) {
    return JSON.stringify([node instanceof HTMLAnchorElement ? node.href : null, directionOf(node), numberOf(node),
      label(node).join("\n").slice(0, 1024)]);
  }

  function addressDirection(href: string, indexAlias = false): Direction | undefined {
    const current = new URL(location.href);
    const destination = new URL(href);
    const page = pageAddress(current);
    const target = pageAddress(destination);
    if (!target && !page) return;
    if (target && page) {
      if (page.route !== target.route || page.value === target.value) return;
      return target.value > page.value ? "next" : "previous";
    }
    const unpaged = target ? current : destination;
    const paged = target ? destination : current;
    const suffix = paged.pathname.match(pagePath)?.[0];
    if (suffix) {
      const base = paged.pathname.slice(0, -suffix.length).replace(/\/$/, "");
      const path = unpaged.pathname.replace(/\/$/, "");
      if (path !== base && !(indexAlias && (target ?? page)?.value === 2 && path === base + "/index")) return;
    } else if (unpaged.pathname !== paged.pathname) return;
    const options = (url: URL) => {
      const result = new URLSearchParams(url.search);
      for (const key of [...result.keys()]) {
        if (pageParameter.test(key) || trackingParameter.test(key)) result.delete(key);
      }
      result.sort();
      return result.toString();
    };
    if (options(paged) === options(unpaged)) return target ? "next" : "previous";
  }

  function adjacentAddress(href: string, direction: Direction) {
    return addressDirection(href) === direction;
  }

  function documentPage(direction: Direction) {
    const rel = direction === "next" ? "next" : "prev";
    const destinations = new Set<string>();
    for (const link of document.head.querySelectorAll<HTMLLinkElement>('link[rel~="' + rel + '"][href]')) {
      const href = safeDestination(link.href);
      if (href && addressDirection(href, true) === direction) destinations.add(href);
    }
    if (destinations.size !== 1) return;
    const href = destinations.values().next().value;
    return href && [...document.querySelectorAll<HTMLAnchorElement>("a[href]")].find(anchor => anchor.href === href && usable(anchor));
  }

  function destinationKey(control: HTMLElement) {
    if (!(control instanceof HTMLAnchorElement)) return control;
    const destination = new URL(control.href);
    const page = pageAddress(destination);
    return page ? JSON.stringify([destination.origin, page.route, page.value]) : destination.href;
  }

  function inspect() {
    const groups = paginationGroups();
    inspectedRoots = groups.map(group => group.root);

    const solid: Targets = {};
    for (const direction of directions) {
      const metadata = documentPage(direction);
      if (metadata) {
        solid[direction] = metadata;
        continue;
      }
      const rel = direction === "next" ? "next" : "prev";
      const candidates = new Map<string | HTMLElement, HTMLElement>();
      for (const group of groups) {
        const { controls, current, currentPage } = group;
        const adjacent = currentPage === undefined ? undefined : currentPage + (direction === "next" ? 1 : -1);
        const available = controls.filter(usable).filter(control =>
          !current?.contains(control) && automatic(group, control) &&
          (!(control instanceof HTMLAnchorElement) || pageDirection(control, group) === direction),
        );
        const named = available.filter(control => directionOf(control) === direction);
        const adjacentControls = available.filter(control => adjacent !== undefined && numberOf(control) === adjacent);
        const adjacentKeys = new Set(adjacentControls.map(destinationKey));
        const matchingNamed = adjacentControls.length ? named.filter(control => adjacentKeys.has(destinationKey(control))) : named;
        for (const control of matchingNamed.length ? matchingNamed : adjacentControls) {
          candidates.set(destinationKey(control), control);
        }
      }
      if (candidates.size > 1) {
        const exactList = [...candidates].filter(([, control]) =>
          control instanceof HTMLAnchorElement && adjacentAddress(control.href, direction));
        if (exactList.length === 1) {
          candidates.clear();
          candidates.set(...exactList[0]);
        }
      }
      if (!candidates.size) {
        for (const node of document.querySelectorAll<HTMLAnchorElement>("a[href]")) {
          if (directionOf(node) !== direction || !usable(node)) continue;
          const explicit = node.relList.contains(rel);
          const named = label(node).some(value => /\p{L}/u.test(value));
          if ((explicit || named) && adjacentAddress(node.href, direction)) candidates.set(destinationKey(node), node);
        }
      }
      if (candidates.size === 1) solid[direction] = candidates.values().next().value;
    }

    const candidates: { target: HTMLElement; data: CandidateShape }[] = [];
    if (groups.length === 1) {
      const group = groups[0];
      const { controls, current, currentPage } = group;
      const resolvedDestinations = new Set(Object.values(solid).map(destinationKey));
      for (const [position, target] of controls.entries()) {
        if (!usable(target) || current?.contains(target) || resolvedDestinations.has(destinationKey(target)) ||
            !automatic(group, target)) continue;
        const targetPage = numberOf(target);
        const cue = (target instanceof HTMLAnchorElement ? pageDirection(target, group) : undefined) ?? directionOf(target);
        const difference = targetPage === undefined || currentPage === undefined ? 0 : targetPage - currentPage;
        if (targetPage !== undefined && Math.abs(difference) !== 1) continue;
        if (targetPage === undefined && cue === "unknown" &&
            (position !== 0 && position !== controls.length - 1 || !target.querySelector("svg,[aria-hidden=true]"))) continue;
        candidates.push({
          target,
          data: { id: candidates.length + 1, position, relation: difference < 0 ? -1 : difference > 0 ? 1 : 0,
            kind: target instanceof HTMLAnchorElement ? "link" : "button", cue },
        });
      }
    }
    return { solid, candidates, group: groups.length === 1 ? groups[0] : undefined };
  }

  function inspectTargets() {
    if (!enabled) return;
    if (documentURL !== location.href) {
      documentURL = location.href;
      targets = {};
      assisted = {};
      classificationAttempt = undefined;
    }
    const found = inspect();
    for (const direction of directions) {
      const previousDecision = assisted[direction];
      if (previousDecision && (!found.candidates.some(candidate => candidate.target === previousDecision) ||
          fingerprints.get(previousDecision) !== fingerprint(previousDecision))) {
        delete assisted[direction];
      }
    }
    targets = { ...assisted, ...found.solid };
    for (const target of Object.values(targets)) fingerprints.set(target, fingerprint(target));
    return found;
  }

  async function scan(allowClassification = true) {
    const address = location.href;
    const found = inspectTargets();
    if (!found) return;
    const needed = directions.filter(direction => !targets[direction]);
    if (!allowClassification || !needed.length || !found.candidates.length || found.candidates.length > 8) return;
    const data = { needed, hasCurrent: Boolean(found.group?.current), candidates: found.candidates.map(candidate => candidate.data) };
    const layout = found.group && classificationLayout(found.group.root, found.group.currentPage, found.candidates.map(candidate => candidate.target));
    const attempt = JSON.stringify([layout, data]);
    if (classificationAttempt === attempt) return;
    classificationAttempt = attempt;
    try {
      const decisions = await chrome.runtime.sendMessage({ type: "classify", data, layout }) as Decisions | undefined;
      if (!enabled || address !== location.href || classificationAttempt !== attempt || !decisions) return;
      const fresh = inspect();
      if (JSON.stringify(fresh.candidates.map(candidate => candidate.data)) !== JSON.stringify(data.candidates)) return;
      if (fresh.group && classificationLayout(fresh.group.root, fresh.group.currentPage, fresh.candidates.map(candidate => candidate.target)) !== layout) return;
      for (const direction of needed) {
        const candidate = fresh.candidates.find(candidate => candidate.data.id === decisions[direction]);
        if (!fresh.solid[direction] && candidate && usable(candidate.target)) {
          fingerprints.set(candidate.target, fingerprint(candidate.target));
          assisted[direction] = candidate.target;
          targets[direction] = candidate.target;
        }
      }
    } catch {
      return;
    }
  }

  function schedule() {
    if (!enabled) return;
    if (documentURL !== location.href) {
      targets = {};
    }
    if (timer !== undefined) return;
    timer = window.setTimeout(() => {
      timer = undefined;
      void scan();
    }, 100);
  }

  const observer = new MutationObserver(records => {
    if (records.some(record => {
      const element = record.target instanceof Element ? record.target : record.target.parentElement;
      return element?.closest(paginationSelector + ",a[rel],[aria-current=page]") ||
        inspectedRoots.some(root => element && root.contains(element)) ||
        [...record.addedNodes, ...record.removedNodes].some(node => node instanceof Element &&
          (node.matches(paginationSelector) || node.querySelector(paginationSelector) ||
            node.matches('a[href],li,td') && numberOf(node) !== undefined ||
            node.querySelector('ul a[href],ol a[href],tr a[href]')));
    })) {
      targets = {};
      schedule();
    }
  });

  async function refresh() {
    const revision = ++refreshRevision;
    enabled = false;
    observer.disconnect();
    targets = {};
    let permitted = false;
    try {
      permitted = await chrome.runtime.sendMessage({ type: "content-status" }) === true;
    } catch {
      permitted = false;
    }
    if (revision !== refreshRevision) return;
    enabled = permitted;
    if (!enabled) {
      assisted = {};
      classificationAttempt = undefined;
    }
    if (!enabled) return;
    observer.observe(document.documentElement, {
      subtree: true, childList: true, characterData: true, attributes: true,
      attributeFilter: ["href", "rel", "aria-current", "aria-disabled", "aria-label", "disabled", "class", "hidden"],
    });
    void scan();
  }

  function eligibleAtActuation(direction: Direction, inspected?: ReturnType<typeof inspect>) {
    const target = targets[direction];
    if (!enabled || documentURL !== location.href || !target ||
        fingerprints.get(target) !== fingerprint(target) || !usable(target)) return;
    const fresh = inspected ?? inspect();
    if (fresh.solid[direction] === target) return target;
    if (assisted[direction] !== target) return;
    const candidate = fresh.candidates.find(candidate => candidate.target === target);
    if (!candidate) return;
    if (candidate.data.cue !== "unknown") {
      return activationEvidence(fresh.group, target, direction) ? target : undefined;
    }
    if (candidate.data.relation === (direction === "next" ? -1 : 1)) return;
    return target;
  }

  chrome.runtime.onMessage.addListener((message: unknown) => {
    if (typeof message === "object" && message !== null && "type" in message && message.type === "refresh") void refresh();
  });
  window.addEventListener("popstate", schedule);
  (window as Window & { navigation?: EventTarget }).navigation?.addEventListener("currententrychange", schedule);
  window.addEventListener("keydown", event => {
    if (!enabled || !event.isTrusted || event.defaultPrevented || event.repeat || event.isComposing || event.shiftKey ||
        event.altKey || event.metaKey || event.ctrlKey) return;
    const direction = event.key === "ArrowLeft" ? "previous" : event.key === "ArrowRight" ? "next" : undefined;
    if (!direction || event.composedPath().some(node => node instanceof Element && node.closest(protectedControls))) return;
    if (document.fullscreenElement || window.getSelection()?.type === "Range") return;
    const inspected = timer !== undefined || documentURL !== location.href ? inspectTargets() : undefined;
    const target = eligibleAtActuation(direction, inspected);
    if (!target) return;
    for (const media of document.querySelectorAll<HTMLMediaElement>("video,audio")) {
      if (media.paused || media.ended) continue;
      if (media instanceof HTMLVideoElement && media.muted && media.loop && !media.controls) continue;
      return;
    }
    event.preventDefault();
    target.click();
  });
  void refresh();
})();
