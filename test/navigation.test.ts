import { expect, test } from "bun:test";
import { Window } from "happy-dom";
import { patchSelectorEngine } from "../tools/pagination-eval/harness.ts";
import type { Direction } from "../src/protocol.ts";

type Page = {
  clicks: string[];
  fallback: Direction[];
  root: HTMLElement;
  press(key?: string, repeat?: boolean, target?: Element): boolean;
  cover(control: string): void;
  advanceClock(ms: number): void;
};

const listing = `<div id="items">
  <article><a href="/items/a">A</a></article>
  <article><a href="/items/b">B</a></article>
  <article><a href="/items/c">C</a></article>
</div>`;
const showMore = '<button id="more">Load more articles</button>';
let documentSequence = 0;

async function withPage(html: string, run: (page: Page) => void | Promise<void>, enabled = true, path = "/list", head = "",
  decisions: Partial<Record<Direction, number>> = {}) {
  const window = new Window({ url: "https://example.test" + path });
  patchSelectorEngine(window);
  const document = window.document as unknown as Document;
  document.head.innerHTML = head;
  document.body.innerHTML = html;
  for (const node of document.querySelectorAll<HTMLElement>("*")) node.style.visibility = "visible";
  const hits = new Map<number, Element>();
  let row = 0;
  for (const node of document.querySelectorAll<HTMLElement>("a,button,[role=button]")) {
    const left = 10 + 100 * row++;
    const bounds = new window.DOMRect(left, 420, 80, 44);
    node.getBoundingClientRect = () => bounds;
    hits.set(left + 40, node);
  }
  for (const node of document.querySelectorAll<HTMLElement>('[id^="items"]')) {
    node.getBoundingClientRect = () => new window.DOMRect(10, 10, 400, 390);
  }
  document.elementFromPoint = x => hits.get(x) ?? null;
  const clicks: string[] = [];
  const fallback: Direction[] = [];
  document.addEventListener("click", event => {
    clicks.push((event.target as HTMLElement).id);
    event.preventDefault();
  });
  let now = 0;
  const globals = {
    window, document, location: window.location,
    chrome: { runtime: {
      onMessage: { addListener() {} },
      sendMessage: async (message: { type: "content-status" } | { type: "classify"; data: { needed: Direction[] } }) => {
        if (message.type === "content-status") return enabled;
        fallback.push(...message.data.needed);
        return decisions;
      },
    } },
    Element: window.Element,
    HTMLElement: window.HTMLElement,
    HTMLAnchorElement: window.HTMLAnchorElement,
    HTMLButtonElement: window.HTMLButtonElement,
    MutationObserver: window.MutationObserver,
    getComputedStyle: window.getComputedStyle.bind(window),
    performance: { now: () => now },
    justPaginationInstalled: undefined,
  };
  const saved = Object.keys(globals).map(name => [name, Object.getOwnPropertyDescriptor(globalThis, name)] as const);
  for (const [name, value] of Object.entries(globals)) {
    Object.defineProperty(globalThis, name, { value, configurable: true, writable: true });
  }
  try {
    await import(`../src/content.ts?load-more=${++documentSequence}`);
    await new Promise(resolve => setTimeout(resolve, 0));
    await run({
      clicks,
      fallback,
      root: document.body,
      press(key = "ArrowRight", repeat = false, target) {
        const receiver = target ?? document.body;
        const event = new (receiver.ownerDocument.defaultView!).KeyboardEvent("keydown",
          { key, repeat, bubbles: true, cancelable: true });
        Object.defineProperty(event, "isTrusted", { value: true });
        receiver.dispatchEvent(event);
        return event.defaultPrevented;
      },
      cover(control) {
        for (const [x, node] of hits) {
          if (node.id === control) hits.delete(x);
        }
      },
      advanceClock(ms) { now += ms; },
    });
  } finally {
    window.happyDOM.close();
    for (const [name, descriptor] of saved) {
      if (descriptor) Object.defineProperty(globalThis, name, descriptor);
      else Reflect.deleteProperty(globalThis, name);
    }
  }
}

test("load more is one click per batch and can retry after a stalled request", async () => {
  await withPage(`<main>${listing}${showMore}</main>`, ({ root, clicks, press, advanceClock }) => {
    expect(press("ArrowLeft")).toBe(false);
    expect(press("ArrowRight", true)).toBe(false);
    expect(press()).toBe(true);
    expect(press()).toBe(false);
    expect(clicks).toEqual(["more"]);
    root.querySelector("#items")!.insertAdjacentHTML("beforeend", '<article><a href="/items/d">D</a></article>');
    expect(press()).toBe(true);
    advanceClock(10_000);
    root.querySelector("#items")!.setAttribute("aria-busy", "true");
    expect(press()).toBe(false);
    root.querySelector("#items")!.removeAttribute("aria-busy");
    expect(press()).toBe(true);
    expect(clicks).toEqual(["more", "more", "more"]);
  });
});

test("an append link must be visible and point to the next page of the same list", async () => {
  const link = '<a id="more" aria-label="商品をもっと見る" rel="next" href="/list?page=2#items">もっと見る</a>';
  await withPage(`<main>${listing}<div><progress value="3" max="10"></progress>${link}</div></main>`, ({ clicks, press, cover }) => {
    expect(press()).toBe(true);
    cover("more");
    expect(press()).toBe(false);
    expect(clicks).toEqual(["more"]);
  });
  for (const href of ["/list?page=3", "/other?page=2", "/list?page=2&sort=price"]) {
    await withPage(`<main>${listing}${link.replace("/list?page=2#items", href)}</main>`, ({ clicks, press }) => {
      expect(press()).toBe(false);
      expect(clicks).toEqual([]);
    });
  }
});

test("numbered pagination wins over an append control", async () => {
  await withPage(`<main>${listing}${showMore}<a id="next" rel="next" href="/list?page=2">Next</a></main>`, ({ clicks, press }) => {
    expect(press()).toBe(true);
    expect(clicks).toEqual(["next"]);
  });
});

test("numbered links distinguish the previous page from a distant earlier page", async () => {
  const pager = '<nav aria-label="Pagination"><a href="?start=0"><svg></svg></a>' +
    '<a href="?start=48"><svg></svg></a><a id="first" href="?start=0">1</a>' +
    '<a id="previous" href="?start=48">7</a><a id="next" href="?start=64">9</a></nav>';
  await withPage(pager, ({ clicks, fallback, press }) => {
    expect(press("ArrowLeft")).toBe(true);
    expect(press()).toBe(true);
    expect(clicks).toEqual(["previous", "next"]);
    expect(fallback).toEqual([]);
  }, true, "/list?start=56");
  await withPage(pager.replace('id="next" href="?start=64"', 'id="next" href="?start=64&sort=price"'), ({ clicks, press }) => {
    expect(press("ArrowLeft")).toBe(false);
    expect(clicks).toEqual([]);
  }, true, "/list?start=56");
});

test("forward-only controls do not need a decision for the previous page", async () => {
  const pager = '<nav aria-label="Pagination"><a id="next" rel="next" href="?page=2">Next</a>' +
    '<a href="?page=5"><svg></svg></a></nav>';
  await withPage(pager, ({ clicks, fallback, press }) => {
    expect(press("ArrowLeft")).toBe(false);
    expect(press()).toBe(true);
    expect(clicks).toEqual(["next"]);
    expect(fallback).toEqual([]);
  }, true, "/list?page=1");
});

test("focused widgets and horizontal scroll regions keep their arrow keys", async () => {
  const carousel = '<section role="region" aria-roledescription="carousel" aria-label="Photos">' +
    '<button id="slide">Photo</button><nav aria-label="Pagination"><a href="?page=3" rel="next">Next</a></nav></section>';
  const dialog = '<div role="dialog"><button id="modal">Choose</button></div>';
  const rail = '<div id="rail" tabindex="0" style="overflow-x:auto"><button id="thumbnail">Thumbnail</button></div>';
  const paginator = '<nav aria-label="Pagination"><a id="page-back" rel="prev" href="?page=1">Previous page</a>' +
    '<span aria-current="page">2</span><a id="page-next" rel="next" href="?page=3">Next page</a></nav>';
  await withPage(carousel + dialog + rail + paginator, ({ root, clicks, press }) => {
    const scrollRegion = root.querySelector("#rail")!;
    Object.defineProperties(scrollRegion, { clientWidth: { value: 200 }, scrollWidth: { value: 450 } });
    expect(press("ArrowRight", false, root.querySelector("#slide")!)).toBe(false);
    expect(press("ArrowLeft", false, root.querySelector("#modal")!)).toBe(false);
    expect(press("ArrowRight", false, root.querySelector("#thumbnail")!)).toBe(false);
    expect(clicks).toEqual([]);
    expect(press("ArrowLeft", false, root)).toBe(true);
    expect(press("ArrowRight", false, root)).toBe(true);
    expect(clicks).toEqual(["page-back", "page-next"]);
  }, true, "/list?page=2");
  await withPage(carousel, ({ root, clicks, press }) => {
    expect(press("ArrowRight", false, root)).toBe(false);
    expect(clicks).toEqual([]);
  }, true, "/list?page=2");
});

const carouselMarkup = `<section aria-roledescription="carousel" aria-label="Product photos">
  <label>Caption <input id="caption"></label>
  <button id="previous-slide" aria-label="Previous slide" disabled>‹</button>
  <button id="next-slide" aria-label="次の画像">›</button>
  <div aria-roledescription="slide"><button id="slide-action">Next</button></div>
</section>`;
const adjacentPages = `<nav aria-label="Pagination">
  <a id="previous-page" href="?page=1" rel="prev">Previous</a>
  <span aria-current="page">2</span>
  <a id="next-page" href="?page=3" rel="next">Next</a>
</nav>`;

test("arrows use the focused carousel controls and return to the pager outside", async () => {
  await withPage(carouselMarkup + adjacentPages, ({ root, clicks, fallback, press }) => {
    const next = root.querySelector<HTMLButtonElement>("#next-slide")!;
    const previous = root.querySelector<HTMLButtonElement>("#previous-slide")!;
    expect(press("ArrowLeft", false, next)).toBe(false);
    expect(press("ArrowRight", false, root.querySelector("#caption")!)).toBe(false);
    next.focus();
    next.addEventListener("click", () => {
      previous.disabled = false;
      next.disabled = true;
    });
    expect(press("ArrowRight", false, next)).toBe(true);
    expect(root.ownerDocument.activeElement).toBe(previous);
    expect(press("ArrowRight", false, previous)).toBe(false);
    expect(press("ArrowLeft", false, previous)).toBe(true);
    expect(press("ArrowRight", false, root)).toBe(true);
    expect(clicks).toEqual(["next-slide", "previous-slide", "next-page"]);
    expect(fallback).toEqual([]);
  }, true, "/list?page=2");
});

test("carousel actions yield to site shortcuts and require an available unique button", async () => {
  const html = carouselMarkup.replace("</section>", '<button id="duplicate" hidden>Next slide</button></section>');
  await withPage(html + adjacentPages, ({ root, clicks, cover, press }) => {
    const next = root.querySelector("#next-slide")!;
    const carousel = next.parentElement!;
    const duplicate = root.querySelector<HTMLButtonElement>("#duplicate")!;
    next.addEventListener("keydown", event => event.preventDefault(), { once: true });
    press("ArrowRight", false, next);
    expect(clicks).toEqual([]);

    carousel.setAttribute("aria-keyshortcuts", "ArrowRight");
    expect(press("ArrowRight", false, next)).toBe(false);
    carousel.removeAttribute("aria-keyshortcuts");

    duplicate.hidden = false;
    expect(press("ArrowRight", false, next)).toBe(false);
    duplicate.hidden = true;
    cover("next-slide");
    expect(press("ArrowRight", false, next)).toBe(false);
    expect(clicks).toEqual([]);
  }, true, "/list?page=2");
});

test("a disabled site keeps its carousel controls", async () => {
  await withPage(carouselMarkup, ({ root, clicks, press }) => {
    expect(press("ArrowRight", false, root.querySelector("#next-slide")!)).toBe(false);
    expect(clicks).toEqual([]);
  }, false);
});

test("load more follows successive links when the address stays on the first page", async () => {
  const link = '<a id="more" href="/list/page/2/">Load more articles</a>';
  await withPage(`<main>${listing}${link}</main>`, ({ root, clicks, press, advanceClock }) => {
    const control = root.querySelector("#more")!;
    const items = root.querySelector("#items")!;
    expect(press()).toBe(true);
    control.setAttribute("href", "/list/page/3/");
    expect(press()).toBe(false);
    items.insertAdjacentHTML("beforeend", '<article><a href="/items/d">D</a></article>');
    control.setAttribute("href", "/list/page/4/");
    expect(press()).toBe(false);
    control.setAttribute("href", "/list/page/3/?sort=price");
    expect(press()).toBe(false);
    control.setAttribute("href", "/list/page/3/");
    expect(press()).toBe(true);
    expect(press()).toBe(false);
    advanceClock(5000);
    expect(press()).toBe(true);
    expect(clicks).toEqual(["more", "more", "more"]);
  });
});

test("an Ajax Load More widget can start with an empty append container", async () => {
  const widget = '<div class="ajax-load-more-wrap"><div><div class="alm-listing alm-ajax" data-posts-per-page="8"></div></div>' +
    '<div class="alm-btn-wrap"><button id="more" class="alm-load-more-btn loading">Load More</button></div></div>';
  await withPage(`<main><article>${widget}</article></main>`, ({ root, clicks, press }) => {
    expect(press()).toBe(false);
    root.querySelector("#more")!.classList.remove("loading");
    root.querySelector(".ajax-load-more-wrap")!.classList.add("alm-loading");
    expect(press()).toBe(false);
    root.querySelector(".ajax-load-more-wrap")!.classList.remove("alm-loading");
    expect(press()).toBe(true);
    expect(press()).toBe(false);
    root.querySelector(".alm-listing")!.insertAdjacentHTML("beforeend", '<div><a href="/items/a">A</a></div>');
    expect(press()).toBe(true);
    expect(clicks).toEqual(["more", "more"]);
  });
});

test("a manually configured Ajax Load More label works in any language", async () => {
  const widget = '<main><div class="ajax-load-more-wrap"><div class="alm-listing alm-ajax" ' +
    'data-scroll="false" data-button-label="<span>Załaduj więcej</span>"></div>' +
    '<div class="alm-btn-wrap"><button id="more" class="alm-load-more-btn">Załaduj więcej</button></div></div></main>';
  await withPage(widget, ({ clicks, press }) => {
    expect(press()).toBe(true);
    expect(clicks).toEqual(["more"]);
  });
  for (const markup of [
    widget.replace('data-scroll="false"', 'data-scroll="true"'),
    widget.replace("Załaduj więcej</button>", "More news</button>"),
    widget.replace('<button id="more"', '<button rel="prev" id="more"'),
    widget.replace('data-scroll="false"', 'data-scroll="false" data-prev-button-label="Załaduj więcej"'),
  ]) {
    await withPage(markup, ({ clicks, press }) => {
      expect(press()).toBe(false);
      expect(clicks).toEqual([]);
    });
  }
  await withPage(widget, ({ clicks, cover, press }) => {
    cover("more");
    expect(press()).toBe(false);
    expect(clicks).toEqual([]);
  });
});

test("a paging link can follow items in the same container", async () => {
  const item = (id: string) => `<div class="card" id="items-${id}"><a href="/items/${id}">${id}</a></div>`;
  const html = `<main>${item("a")}${item("b")}${item("c")}<div><a id="more" href="/list/page/2/">Load more</a></div></main>`;
  await withPage(html, ({ clicks, press }) => {
    expect(press()).toBe(true);
    expect(clicks).toEqual(["more"]);
  });
});

test("a WooCommerce load-more link can follow a distant product list", async () => {
  const html = '<main><ul class="products"><li><a href="/items/a">A</a></li><li><a href="/items/b">B</a></li>' +
    '<li><a href="/items/c">C</a></li></ul><section>More information</section><div class="lmp_load_more_button">' +
    '<a id="more" class="lmp_button" href="/list/page/2/">Carica altro</a></div></main>';
  await withPage(html, ({ clicks, press }) => {
    expect(press()).toBe(true);
    expect(clicks).toEqual(["more"]);
  });
});

test("paired sequential links turn bare numbered paths without a current-page marker", async () => {
  const pair = '<a id="back" rel="prev" href="/list/96">Back</a><a id="forward" rel="next" href="/list/98">Forward</a>';
  await withPage(`<main>${pair}</main>`, ({ clicks, press }) => {
    expect(press("ArrowLeft")).toBe(true);
    expect(press()).toBe(true);
    expect(clicks).toEqual(["back", "forward"]);
  }, true, "/list/97");
  for (const html of [`<article>${pair}</article>`, pair.replace("/list/98", "/items/98"), pair.replace("/list/98", "/list/99")]) {
    await withPage(html, ({ clicks, press }) => {
      expect(press()).toBe(false);
      expect(clicks).toEqual([]);
    }, true, "/list/97");
  }
});

test("matching document metadata validates a single numbered neighbor", async () => {
  const links = '<a id="back" href="/list/96">96</a><a id="skip" href="/list/99">99</a>';
  const head = '<link rel="prev" href="/list/96"><link rel="next" href="/list/99">';
  await withPage(links, ({ clicks, press }) => {
    expect(press("ArrowLeft")).toBe(true);
    expect(press()).toBe(false);
    expect(clicks).toEqual(["back"]);
  }, true, "/list/97", head);
  await withPage(links.replace('id="back"', 'id="back" rel="next"'), ({ clicks, press }) => {
    expect(press("ArrowLeft")).toBe(false);
    expect(clicks).toEqual([]);
  }, true, "/list/97", head);
});

test("a busy results region keeps the previous pager out of arrow turns", async () => {
  const pager = '<nav aria-label="Pagination"><a id="previous" rel="prev" href="?page=1&color=blue">Previous page</a>' +
    '<span aria-current="page">2</span><a id="next" rel="next" href="?page=3&color=blue">Next page</a></nav>';
  await withPage(`<main id="results">${listing}${pager}</main>`, ({ root, clicks, press }) => {
    const results = root.querySelector("#results")!;
    results.setAttribute("aria-busy", "true");
    expect(press("ArrowLeft")).toBe(false);
    expect(press()).toBe(false);
    expect(clicks).toEqual([]);
    results.removeAttribute("aria-busy");
    expect(press("ArrowLeft")).toBe(true);
    expect(press()).toBe(true);
    expect(clicks).toEqual(["previous", "next"]);
  }, true, "/list?page=2&color=blue");
});

test("the updated URL and pager drive the next two turns with the filter intact", async () => {
  const render = (page: number) => {
    const query = (target: number) => `?page=${target}&color=blue`;
    return `<div id="items">Blue page ${page}</div><nav aria-label="Pagination">` +
      (page > 1 ? `<a id="previous-${page}" rel="prev" href="${query(page - 1)}">Previous page</a>` : "") +
      `<span aria-current="page">${page}</span>` +
      `<a id="next-${page}" rel="next" href="${query(page + 1)}">Next page</a></nav>`;
  };
  await withPage(`<main id="results">${render(1)}</main>`, ({ root, clicks, press }) => {
    const results = root.querySelector("#results")!;
    results.addEventListener("click", event => {
      const link = event.target instanceof Element ? event.target.closest("a") : null;
      if (!link) return;
      const url = new URL(link.href);
      window.history.replaceState({}, "", url);
      results.innerHTML = render(Number(url.searchParams.get("page")));
    });
    expect(press()).toBe(true);
    expect(press("ArrowLeft")).toBe(true);
    expect(clicks).toEqual(["next-1", "previous-2"]);
    expect(root.querySelector("#items")!.textContent).toBe("Blue page 1");
    expect(new URL(window.location.href).search).toBe("?page=1&color=blue");
  }, true, "/list?page=1&color=blue");
});

test("a pager replaced at the same URL is read when the key is pressed", async () => {
  const pager = (id: string, href: string) =>
    `<nav aria-label="Pagination"><span aria-current="page">1</span><a id="${id}" href="${href}">Next page</a></nav>`;
  const html = `<main id="results"><div id="items">First</div>${pager("stale", "?page=3&color=blue")}</main>`;
  await withPage(html, ({ root, clicks, press }) => {
    const results = root.querySelector("#results")!;
    results.innerHTML = `<div id="items">Filtered</div>${pager("next", "?page=2&color=blue")}`;
    expect(press()).toBe(true);
    expect(clicks).toEqual(["next"]);
    expect(new URL(window.location.href).search).toBe("?page=1&color=blue");
  }, true, "/list?page=1&color=blue");
});

test("a busy region requests Jev again after it clears", async () => {
  const html = '<main id="results" aria-busy="true"><nav aria-label="Pagination">' +
    '<span aria-current="page">2</span><button id="mystery"><svg aria-hidden="true"></svg></button></nav></main>';
  await withPage(html, async ({ root, clicks, fallback, press }) => {
    expect(fallback).toEqual([]);
    root.querySelector("#results")!.removeAttribute("aria-busy");
    await new Promise(resolve => setTimeout(resolve, 150));
    expect(fallback).toEqual(["previous", "next"]);
    expect(press()).toBe(true);
    expect(clicks).toEqual(["mystery"]);
  }, true, "/list?page=2", "", { next: 1 });
});

test("a selected Jev control survives a temporary busy region until the URL changes", async () => {
  const html = '<main id="results"><nav aria-label="Pagination">' +
    '<span aria-current="page">2</span><button id="mystery"><svg aria-hidden="true"></svg></button></nav></main>';
  await withPage(html, async ({ root, clicks, press }) => {
    expect(press()).toBe(true);
    expect(clicks).toEqual(["mystery"]);

    const results = root.querySelector("#results")!;
    results.setAttribute("aria-busy", "true");
    await new Promise(resolve => setTimeout(resolve, 150));
    expect(press()).toBe(false);
    expect(clicks).toEqual(["mystery"]);

    results.removeAttribute("aria-busy");
    await new Promise(resolve => setTimeout(resolve, 150));
    expect(press()).toBe(true);
    expect(clicks).toEqual(["mystery", "mystery"]);

    window.history.replaceState({}, "", "?page=2&color=blue");
    expect(press()).toBe(false);
    expect(clicks).toEqual(["mystery", "mystery"]);
  }, true, "/list?page=2", "", { next: 1 });
});

test("disclosures, ambiguous lists, and disabled sites leave the key alone", async () => {
  const scenarios = [
    { html: `<main>${listing}<button id="more" aria-expanded="false">Show more</button></main>`, enabled: true },
    { html: `<main>${listing}<article>${showMore}</article></main>`, enabled: true },
    { html: `<main>${listing}${showMore}${listing.replace('id="items"', 'id="items2"')}${showMore.replace('id="more"', 'id="more2"')}</main>`, enabled: true },
    { html: `<main>${listing}${showMore}</main>`, enabled: false },
  ];
  for (const { html, enabled } of scenarios) {
    await withPage(html, ({ clicks, press }) => {
      expect(press()).toBe(false);
      expect(clicks).toEqual([]);
    }, enabled);
  }
});
