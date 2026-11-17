import { imageSource, pages } from "./gallery-data.js";
import type { ArrowKey, ConnectionResult, SetupStatus } from "./protocol.js";

const gallery = document.querySelector<HTMLElement>(".gallery")!;
const form = document.querySelector<HTMLFormElement>("#connection")!;
const field = document.querySelector<HTMLInputElement>(".field")!;
const note = document.querySelector<HTMLElement>(".form-note")!;
const action = document.querySelector<HTMLButtonElement>(".connect")!;
const status = document.querySelector<HTMLElement>(".connection-status")!;
const photos = document.querySelector<HTMLElement>(".photos")!;
const pageStatus = document.querySelector<HTMLElement>(".page-status")!;
const pager = document.querySelector<HTMLElement>(".pager")!;
const previous = document.querySelector<HTMLButtonElement>(".previous")!;
const next = document.querySelector<HTMLButtonElement>(".next")!;
const keyboardCat = document.querySelector<HTMLImageElement>(".keyboard-cat img")!;
const version = document.querySelector<HTMLElement>(".footer-version")!;
const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)");
let catTap: Animation | undefined;
const disclosure = note.textContent!;
const startPage = 4;
let page = startPage;
let connected = false;
let busy = true;

version.textContent = "v" + chrome.runtime.getManifest().version;

const hints = {
  ArrowLeft: document.querySelector<HTMLElement>('[data-key="ArrowLeft"]')!,
  ArrowRight: document.querySelector<HTMLElement>('[data-key="ArrowRight"]')!,
};

const indicators = pages.map((_, index) => {
  const element = document.createElement("button");
  element.className = "page-indicator";
  element.type = "button";
  element.setAttribute("aria-label", "Page " + (index + 1));
  element.addEventListener("click", () => selectPage(index + 1));
  element.textContent = String(index + 1);
  return element;
});
document.querySelector(".page-indicators")!.append(...indicators);

function drawPage() {
  photos.replaceChildren(...pages[page - 1].map(photo => {
    const link = document.createElement("a");
    link.href = photo.href;
    link.target = "_blank";
    link.rel = "noopener noreferrer";
    const image = document.createElement("img");
    image.alt = photo.alt;
    image.referrerPolicy = "no-referrer";
    if (photo.y) image.style.setProperty("--y", photo.y + "%");
    if (photo.smallY) image.style.setProperty("--small-y", photo.smallY + "%");
    image.addEventListener("error", () => {
      link.classList.add("unavailable");
      link.setAttribute("aria-label", `${photo.alt}. Photo unavailable; open on Pexels.`);
      const fallback = document.createElement("span");
      fallback.className = "photo-fallback";
      fallback.textContent = "Photo unavailable — view on Pexels";
      image.replaceWith(fallback);
    }, { once: true });
    link.append(image);
    image.src = imageSource(photo.href);
    return link;
  }));
  previous.disabled = page === 1;
  next.disabled = page === pages.length;
  pageStatus.textContent = "Page " + page + " of " + pages.length;
  indicators.forEach((indicator, index) => {
    if (index === page - 1) indicator.setAttribute("aria-current", "page");
    else indicator.removeAttribute("aria-current");
  });
}

function selectPage(destination: number) {
  if (destination === page || destination < 1 || destination > pages.length) return;
  const focused = document.activeElement;
  page = destination;
  drawPage();
  if (focused && (!focused.isConnected || focused.matches(":disabled"))) pager.focus({ preventScroll: true });
}

function tapKeyboardCat() {
  if (reducedMotion.matches) return;
  if (catTap) {
    catTap.currentTime = 0;
    catTap.play();
  } else {
    catTap = keyboardCat.animate([
      { transform: "translateY(-66.666667%)", easing: "steps(1, jump-end)" },
      { transform: "translateY(-33.333333%)", offset: 0.7, easing: "steps(1, jump-end)" },
      { transform: "translateY(0)" },
    ], 150);
  }
}

reducedMotion.addEventListener("change", () => {
  if (reducedMotion.matches) catTap?.cancel();
});

function renderForm() {
  action.disabled = busy || !connected && !field.value.trim();
  action.textContent = busy ? "" : connected ? "Disconnect" : "Connect";
  action.setAttribute("aria-busy", String(busy));
  if (busy) action.setAttribute("aria-label", connected ? "Disconnecting" : "Connecting");
  else action.removeAttribute("aria-label");
  field.readOnly = connected || busy;
}

function renderConnection() {
  field.value = connected ? "••••••••••••••••" : "";
  status.textContent = connected ? "Jev connected" : "Jev disconnected";
}

function clearError() {
  note.textContent = disclosure;
  note.classList.remove("error");
  field.removeAttribute("aria-invalid");
}

function showError(message: string, invalid = false) {
  note.textContent = message;
  note.classList.add("error");
  if (invalid) field.setAttribute("aria-invalid", "true");
}

field.addEventListener("input", () => { clearError(); renderForm(); });
form.addEventListener("submit", async event => {
  event.preventDefault();
  if (busy || !connected && !field.value.trim()) return;
  clearError();
  busy = true;
  const wasConnected = connected;
  renderForm();
  try {
    if (connected) {
      if (await chrome.runtime.sendMessage({ type: "disconnect" }) !== true) {
        showError("Could not disconnect. Try again.");
        return;
      }
      connected = false;
    } else {
      const result = await chrome.runtime.sendMessage({ type: "connect", key: field.value }) as ConnectionResult | null;
      if (result !== "connected") {
        showError(result === "invalid" ? "Check your TypeSafe API key and try again."
          : result === "no-model" ? "Jev is unavailable for this API key."
          : "Could not reach TypeSafe. Try again.", result === "invalid");
        return;
      }
      connected = true;
    }
    renderConnection();
  } catch {
    showError("Could not update the connection. Try again.");
  } finally {
    busy = false;
    renderForm();
    if (!connected && (wasConnected || field.hasAttribute("aria-invalid"))) field.focus({ preventScroll: true });
    else if (connected && !wasConnected) action.focus({ preventScroll: true });
  }
});

previous.addEventListener("click", () => selectPage(page - 1));
next.addEventListener("click", () => selectPage(page + 1));
document.addEventListener("keydown", event => {
  if (event.defaultPrevented || event.repeat || event.isComposing ||
      event.shiftKey || event.altKey || event.metaKey || event.ctrlKey) return;
  if (event.target instanceof Element && event.target.closest("input:not([readonly]),textarea,select,[contenteditable]:not([contenteditable=false])")) return;
  if (event.key !== "ArrowLeft" && event.key !== "ArrowRight") return;
  const key: ArrowKey = event.key;
  if (!hints[key].classList.contains("dismissed")) {
    hints[key].classList.add("dismissed");
    void chrome.runtime.sendMessage({ type: "tried-arrow", key }).catch(() => {});
  }
  const delta = key === "ArrowLeft" ? -1 : 1;
  if (page + delta < 1 || page + delta > pages.length) return;
  event.preventDefault();
  selectPage(page + delta);
  tapKeyboardCat();
});

try {
  const connection = await chrome.runtime.sendMessage({ type: "setup-status" }) as SetupStatus | null;
  if (!connection) throw new Error("Setup status unavailable");
  connected = connection.connected;
  for (const key of connection.tried) {
    hints[key].classList.add("dismissed", "already-tried");
  }
  renderConnection();
} catch {
  showError("Could not load settings. Reload this page.");
} finally {
  drawPage();
  gallery.classList.add("ready");
  busy = false;
  renderForm();
}
