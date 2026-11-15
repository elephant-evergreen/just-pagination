type Direction = import("./protocol.js").Direction;
type CandidateShape = import("./protocol.js").CandidateShape;
type Decisions = import("./protocol.js").Decisions;

(() => {
  const installed = globalThis as typeof globalThis & { justPaginationInstalled?: boolean };
  if (installed.justPaginationInstalled) return;
  installed.justPaginationInstalled = true;

  const controlSelector = "a[href], button, [role=button]";
  const widgetRegions = 'dialog,[role=dialog],[role=alertdialog],[aria-roledescription="carousel" i]';
  const protectedControls = "input, textarea, select, [contenteditable]:not([contenteditable=false]), " +
    "[role=textbox], [role=slider], [role=spinbutton], [role=combobox], [role=listbox], [role=menu], " +
    "[role=tablist], [role=grid], [role=tree], video, audio," + widgetRegions;
  const nonPagination = widgetRegions + ",[role=menu],[role=tablist],[role=grid],[role=tree]";
  const labels: Record<Direction, RegExp> = {
    previous: /^(?:‹|←|❮|<|prev(?:ious)?(?:\s+page)?|newer\s+(?:posts|entries|articles)|前(?:へ|のページ)|前ページ)$/iu,
    next: /^(?:›|→|❯|>|next(?:\s+page)?|older\s+(?:posts|entries|articles)|次(?:へ|のページ)|次ページ)$/iu,
  };
  const navWords = /paginat|paging|(?:^|[\W_])pager(?:$|[\W_])|ページネーション|ページ送り|ページ移動|page[ -]?(?:nav(?:igation)?|numbers)/i;
  const ajaxLoadMoreButton = ".alm-btn-wrap > button.alm-load-more-btn";
  const loadMoreLabels = [
    /^(?:load|show|see|view) (?:\d+ )?more(?: (?:products?|items?|results?|articles?|posts?|stories|recipes|projects|jobs|events|videos|news))?$/iu,
    /^(?:(?:商品|記事|検索結果|結果|投稿|アイテム|製品)を)?もっと(?:見る|表示(?:する)?|読み込む)$/u,
    /^(?:mehr (?:(?:produkte|artikel|beiträge|ergebnisse) )?(?:laden|anzeigen)|meer (?:laden|tonen|weergeven|bekijken|(?:producten|artikelen|berichten) (?:laden|tonen))|laad meer)$/iu,
    /^(?:(?:afficher|voir|charger) plus(?: (?:de |d['’])(?:produits|articles|résultats|actualités))?|(?:cargar|mostrar|ver) más(?: (?:productos|resultados|artículos|entradas|noticias))?|(?:carregar|mostrar|ver) mais(?: (?:produtos|resultados|artigos|notícias))?|(?:carica|mostra|vedi) (?:altro|altri (?:prodotti|articoli|risultati)))$/iu,
  ];
  const directions = ["previous", "next"] as const;
  type Targets = Partial<Record<Direction, HTMLElement>>;
  type Group = { root: Element; controls: HTMLElement[]; current?: Element; currentPage?: number };
  type NumberedAddress = NonNullable<ReturnType<typeof pageAddress>> & { number: number };
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
  let classificationAttempt: { signature: string } | undefined;
  let assisted: Targets = {};
  let inspectedRoots: Element[] = [];
  const fingerprints = new WeakMap<HTMLElement, string>();
  type LoadMore = { control: HTMLElement; list: Element; itemCount: number; page?: ReturnType<typeof pageAddress> };
  let pendingLoadMore: Omit<LoadMore, "control"> & { address: string; retryAt: number } | undefined;

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

  function isLoadMoreLabel(node: Element) {
    return label(node).some(value => {
      const text = loadMoreText(value);
      return loadMoreLabels.some(pattern => pattern.test(text));
    });
  }

  function loadMoreText(value: string) {
    return value.normalize("NFKC").replace(/\p{Cf}/gu, "").replace(/\s*[+→›»]\s*$/, "").trim().replace(/\s+/g, " ");
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

  function numberedPageStep(pages: NumberedAddress[]) {
    const first = pages[0];
    const second = first && pages.find(page => page.number !== first.number);
    if (!first || !second) return;
    const step = (second.value - first.value) / (second.number - first.number);
    if (Number.isInteger(step) && step > 0 && pages.every(page =>
      page.route === first.route && page.value - first.value === (page.number - first.number) * step)) return step;
  }

  function pageFromNumberedLinks(controls: HTMLElement[], url: URL) {
    const current = pageAddress(url);
    if (!current) return;
    const pages: NumberedAddress[] = [];
    for (const control of controls) {
      if (!(control instanceof HTMLAnchorElement) || !usable(control)) continue;
      const number = numberOf(control);
      if (number === undefined) continue;
      const address = pageAddress(new URL(control.href));
      if (address?.route === current.route) pages.push({ ...address, number });
    }
    const step = numberedPageStep(pages);
    if (step === undefined) return;
    const first = pages[0];
    const number = first.number + (current.value - first.value) / step;
    if (Number.isInteger(number) && number >= 1 &&
        pages.some(page => page.number === number - 1) &&
        pages.some(page => page.number === number + 1)) return number;
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
    const pages: NumberedAddress[] = [];
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
      if (numberedPageStep(pages) === undefined) return;
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
      const url = new URL(location.href);
      const currentPage = current ? numberOf(current) : inferredPage(controls, url) ?? pageFromNumberedLinks(controls, url);
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

  function adjacentNumberedPath(href: string): Direction | undefined {
    const current = new URL(location.href);
    const target = new URL(href);
    if (current.origin !== target.origin || current.search !== target.search) return;
    const from = Number(current.pathname.match(numberedPath)?.[1]);
    const to = Number(target.pathname.match(numberedPath)?.[1]);
    if (from < 1 || to < 1 || Math.abs(to - from) !== 1 ||
        numberedPathBase(current, from) !== numberedPathBase(target, to)) return;
    return to > from ? "next" : "previous";
  }

  function hasDirectionalRel(anchor: HTMLAnchorElement, direction: Direction) {
    const rel = anchor.getAttribute("rel")?.toLowerCase().split(/\s+/);
    return direction === "next" ? rel?.includes("next") : rel?.includes("prev") || rel?.includes("previous");
  }

  function listingSize(list: Element, end?: Element) {
    if (list.childElementCount < 3 || list.closest("nav,aside,[role=navigation],details," + nonPagination)) return 0;
    const destinationsByTag = new Map<string, Set<string>>();
    for (const entry of list.children) {
      if (entry === end) break;
      if (entry.matches("nav,aside,header,footer,[hidden],[aria-hidden=true]")) continue;
      const link = entry.matches("a[href]") ? entry : entry.querySelector("a[href]");
      if (!(link instanceof HTMLAnchorElement) || !safeDestination(link.href) || adjacentAddress(link.href, "next") ||
          adjacentAddress(link.href, "previous")) continue;
      const destination = new URL(link.href);
      const entries = destinationsByTag.get(entry.tagName) ?? new Set<string>();
      entries.add(destination.pathname + destination.search);
      destinationsByTag.set(entry.tagName, entries);
    }
    return Math.max(0, ...[...destinationsByTag.values()].map(entries => entries.size));
  }

  function ajaxLoadMoreListing(control: Element): Pick<LoadMore, "list" | "itemCount"> | undefined {
    if (!control.matches(ajaxLoadMoreButton)) return;
    const container = control.closest(".ajax-load-more-wrap");
    if (!container) return;
    const lists = [...container.querySelectorAll(".alm-listing.alm-ajax")].filter(list =>
      list.closest(".ajax-load-more-wrap") === container,
    );
    if (lists.length === 1) {
      const list = lists[0];
      return { list, itemCount: list.querySelectorAll("a[href]").length };
    }
  }

  function declaresManualLoadMore(control: Element, list: Element | undefined) {
    if (list?.getAttribute("data-scroll") !== "false" || directionOf(control) === "previous") return false;
    const configured = (name: string) => loadMoreText((list.getAttribute(name) ?? "").replace(/<[^>]+>/g, "")).toLowerCase();
    const expected = configured("data-button-label");
    return Boolean(expected && expected !== configured("data-prev-button-label") &&
      label(control).some(value => loadMoreText(value).toLowerCase() === expected));
  }

  function wooCommerceListing(control: HTMLElement): Pick<LoadMore, "list" | "itemCount"> | undefined {
    if (!control.matches("a.lmp_button")) return;
    const wrapper = control.closest(".lmp_load_more_button");
    let found: Pick<LoadMore, "list" | "itemCount"> | undefined;
    for (let list = wrapper?.previousElementSibling; list; list = list.previousElementSibling) {
      if (!list.matches("ul.products") || !list.getClientRects().length) continue;
      const itemCount = listingSize(list);
      if (itemCount < 3) continue;
      if (found) return;
      found = { list, itemCount };
    }
    return found;
  }

  function listingBefore(control: HTMLElement): Pick<LoadMore, "list" | "itemCount"> | undefined {
    const { top } = control.getBoundingClientRect();
    function endsNearControl(item: Element) {
      const bounds = item.getBoundingClientRect();
      return bounds.height > 0 && bounds.bottom <= top + 4 && top - bounds.bottom <= 320;
    }

    function check(list: Element, depth: number): Pick<LoadMore, "list" | "itemCount"> | undefined {
      if (list.matches("nav,aside,[role=navigation],details,progress,[role=status],[aria-hidden=true],[hidden]")) return;
      if (!endsNearControl(list)) return;
      const itemCount = listingSize(list);
      if (itemCount >= 3) return { list, itemCount };
      if (!depth) return;
      for (const child of [...list.children].slice(-4).reverse()) {
        const found = check(child, depth - 1);
        if (found) return found;
      }
    }

    let region: Element | null = control;
    for (let depth = 0; region && region !== document.body && depth < 5; depth++, region = region.parentElement) {
      let previous = region.previousElementSibling;
      for (let distance = 0; previous && distance < 4; distance++, previous = previous.previousElementSibling) {
        const found = check(previous, 2);
        if (found) return found;
      }
      const last = region.previousElementSibling;
      const second = last?.previousElementSibling;
      const third = second?.previousElementSibling;
      const parent = region.parentElement;
      if (last && second && third && parent && endsNearControl(last) &&
          last.tagName === second.tagName && last.tagName === third.tagName &&
          (last.matches("article,li,[role=listitem]") || [...last.classList].some(name =>
            second.classList.contains(name) && third.classList.contains(name),
          ))) {
        const itemCount = listingSize(parent, region);
        if (itemCount >= 3) return { list: parent, itemCount };
      }
      if (region.matches("main,[role=main],section")) break;
    }
  }

  function loadMoreAtEnd(): LoadMore | undefined {
    const main = document.querySelector("main,[role=main]");
    let found: LoadMore | undefined;
    for (const control of document.querySelectorAll(controlSelector)) {
      if (main && !control.closest("main,[role=main]")) continue;
      const ajaxListing = ajaxLoadMoreListing(control);
      if ((!isLoadMoreLabel(control) && !declaresManualLoadMore(control, ajaxListing?.list)) || !usable(control) ||
          control.closest("aside,details,form,header,footer,[aria-busy=true],.ajax-load-more-wrap.alm-loading") ||
          control.matches("[aria-expanded],[aria-haspopup],.alm-load-more-btn:is(.loading,.done)")) continue;
      const page = control instanceof HTMLAnchorElement ? pageAddress(new URL(control.href)) : undefined;
      if (control instanceof HTMLAnchorElement && (!page || !adjacentAddress(control.href, "next"))) continue;
      const { left, top, width, height } = control.getBoundingClientRect();
      const underPointer = document.elementFromPoint(left + width / 2, top + height / 2);
      if (!underPointer || !control.contains(underPointer)) continue;
      const listing = ajaxListing ?? wooCommerceListing(control) ??
        (control.closest("article") ? undefined : listingBefore(control));
      if (!listing || listing.list.closest("[aria-busy=true]")) continue;
      if (page) {
        const current = pageAddress(new URL(location.href));
        const pending = pendingLoadMore;
        let next = (current?.value ?? 1) + 1;
        if (pending?.page?.route === page.route && pending.address === location.href && pending.list === listing.list) {
          next = pending.page.value + Number(listing.itemCount > pending.itemCount);
        }
        if (page.value !== next) continue;
      }
      if (found) return;
      found = { control, ...listing, page };
    }
    if (!found) return;
    if (pendingLoadMore && (pendingLoadMore.list === found.list || pendingLoadMore.address === location.href ||
        addressDirection(pendingLoadMore.address) !== undefined) &&
        pendingLoadMore.itemCount >= found.itemCount && performance.now() < pendingLoadMore.retryAt) return;
    return found;
  }

  function documentPage(direction: Direction, anchors: HTMLAnchorElement[], groups: Group[]) {
    const destinations = new Set<string>();
    const rel = direction === "next" ? '[rel~="next" i]' : '[rel~="prev" i],[rel~="previous" i]';
    for (const link of document.head.querySelectorAll<HTMLLinkElement>("link[href]")) {
      if (!link.matches(rel)) continue;
      const href = safeDestination(link.href);
      if (href && (addressDirection(href, true) ?? adjacentNumberedPath(href)) === direction) destinations.add(href);
    }
    if (destinations.size !== 1) return;
    const href = destinations.values().next().value;
    const links = anchors.filter(anchor =>
      anchor.href === href && usable(anchor) && !isLoadMoreLabel(anchor),
    );
    const opposite = direction === "next" ? "previous" : "next";
    return links.find(anchor => directionOf(anchor) === direction) ??
      links.find(anchor => groups.some(group => group.currentPage !== undefined && group.root.contains(anchor) &&
        numberOf(anchor) === group.currentPage + (direction === "next" ? 1 : -1))) ??
      links.find(anchor => directionOf(anchor) === "unknown") ??
      links.find(anchor => !hasDirectionalRel(anchor, opposite));
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
    const anchors = [...document.querySelectorAll<HTMLAnchorElement>("a[href]")];
    const numberedNeighbors: Record<Direction, HTMLAnchorElement[]> = { previous: [], next: [] };
    for (const anchor of anchors) {
      if (!anchor.hasAttribute("rel")) continue;
      const rel = directions.filter(direction => hasDirectionalRel(anchor, direction));
      if (rel.length !== 1 || adjacentNumberedPath(anchor.href) !== rel[0] ||
          anchor.closest("article,aside,header,footer,form") || !usable(anchor) || isLoadMoreLabel(anchor)) continue;
      numberedNeighbors[rel[0]].push(anchor);
    }

    const solid: Targets = {};
    for (const direction of directions) {
      const metadata = documentPage(direction, anchors, groups);
      if (metadata) {
        solid[direction] = metadata;
        continue;
      }
      const candidates = new Map<string | HTMLElement, HTMLElement>();
      for (const group of groups) {
        const { controls, current, currentPage } = group;
        const adjacent = currentPage === undefined ? undefined : currentPage + (direction === "next" ? 1 : -1);
        const available = controls.filter(usable).filter(control =>
          !current?.contains(control) && !isLoadMoreLabel(control) && !control.matches(ajaxLoadMoreButton) && automatic(group, control) &&
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
        for (const node of anchors) {
          if (directionOf(node) !== direction || !usable(node) || isLoadMoreLabel(node)) continue;
          const explicit = hasDirectionalRel(node, direction);
          const named = label(node).some(value => /\p{L}/u.test(value));
          if ((explicit || named) && adjacentAddress(node.href, direction)) candidates.set(destinationKey(node), node);
        }
      }
      if (!candidates.size) {
        const paired = numberedNeighbors[direction === "next" ? "previous" : "next"].length > 0;
        for (const node of numberedNeighbors[direction]) {
          if (paired || node.closest("nav,[role=navigation]")) {
            candidates.set(destinationKey(node), node);
          }
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
        if (!usable(target) || isLoadMoreLabel(target) || target.matches(ajaxLoadMoreButton) ||
            current?.contains(target) || resolvedDestinations.has(destinationKey(target)) ||
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

  async function scan() {
    const address = location.href;
    const found = inspectTargets();
    if (!found) return;
    if (!found.candidates.length || found.candidates.length > 8) return;
    const needed = directions.filter(direction => !targets[direction] && found.candidates.some(({ data }) =>
      (data.cue === "unknown" || data.cue === direction) && data.relation !== (direction === "next" ? -1 : 1),
    ));
    if (!needed.length) return;
    const data = { needed, hasCurrent: Boolean(found.group?.current), candidates: found.candidates.map(candidate => candidate.data) };
    const layout = found.group && classificationLayout(found.group.root, found.group.currentPage, found.candidates.map(candidate => candidate.target));
    const signature = JSON.stringify([layout, data]);
    if (classificationAttempt?.signature === signature) return;
    const attempt = { signature };
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

  async function refresh(jevChanged = false) {
    const revision = ++refreshRevision;
    enabled = false;
    observer.disconnect();
    targets = {};
    if (jevChanged) {
      assisted = {};
      classificationAttempt = undefined;
    }
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

  function siteUsesArrowKeys(node: EventTarget) {
    if (!(node instanceof Element)) return false;
    if (node.closest(protectedControls)) return true;
    if (!(node instanceof HTMLElement) || node === document.body || node === document.documentElement ||
        node.clientWidth === 0 || node.scrollWidth <= node.clientWidth) return false;
    const { overflowX } = getComputedStyle(node);
    return overflowX === "auto" || overflowX === "scroll";
  }

  chrome.runtime.onMessage.addListener((message: unknown) => {
    if (typeof message === "object" && message !== null && "type" in message && message.type === "refresh") {
      void refresh("jevChanged" in message && message.jevChanged === true);
    }
  });
  window.addEventListener("popstate", schedule);
  (window as Window & { navigation?: EventTarget }).navigation?.addEventListener("currententrychange", schedule);
  window.addEventListener("keydown", event => {
    if (!enabled || !event.isTrusted || event.defaultPrevented || event.repeat || event.isComposing || event.shiftKey ||
        event.altKey || event.metaKey || event.ctrlKey) return;
    const direction = event.key === "ArrowLeft" ? "previous" : event.key === "ArrowRight" ? "next" : undefined;
    if (!direction || event.composedPath().some(siteUsesArrowKeys)) return;
    if (document.fullscreenElement || window.getSelection()?.type === "Range") return;
    const inspected = timer !== undefined || documentURL !== location.href ? inspectTargets() : undefined;
    const pageTarget = eligibleAtActuation(direction, inspected);
    const more = !pageTarget && direction === "next" ? loadMoreAtEnd() : undefined;
    if (more && (inspected ?? inspect()).solid.next) return;
    const target = pageTarget ?? more?.control;
    if (!target) return;
    for (const media of document.querySelectorAll<HTMLMediaElement>("video,audio")) {
      if (media.paused || media.ended) continue;
      if (media instanceof HTMLVideoElement && media.muted && media.loop && !media.controls) continue;
      return;
    }
    event.preventDefault();
    if (more) {
      pendingLoadMore = {
        list: more.list, itemCount: more.itemCount, page: more.page, address: location.href, retryAt: performance.now() + 5000,
      };
    }
    target.click();
  });
  void refresh();
})();
