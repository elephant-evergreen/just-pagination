import { expect, test } from "bun:test";
import { Window } from "happy-dom";
import { patchSelectorEngine } from "../tools/pagination-eval/harness.ts";

type Page = {
  clicks: string[];
  root: HTMLElement;
  press(key?: string, repeat?: boolean): boolean;
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

async function withPage(html: string, run: (page: Page) => void, enabled = true, path = "/list", head = "") {
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
  document.addEventListener("click", event => {
    clicks.push((event.target as HTMLElement).id);
    event.preventDefault();
  });
  let now = 0;
  const globals = {
    window, document, location: window.location,
    chrome: { runtime: {
      onMessage: { addListener() {} },
      sendMessage: async (message: { type: string }) => message.type === "content-status" ? enabled : {},
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
    run({
      clicks,
      root: document.body,
      press(key = "ArrowRight", repeat = false) {
        const event = new window.KeyboardEvent("keydown", { key, repeat, bubbles: true, cancelable: true });
        Object.defineProperty(event, "isTrusted", { value: true });
        window.dispatchEvent(event);
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
