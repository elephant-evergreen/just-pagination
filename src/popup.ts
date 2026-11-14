import type { SiteInfo, SiteStatus } from "./protocol.js";

const site = document.querySelector<HTMLButtonElement>("#site")!;
const hostname = document.querySelector<HTMLElement>("#host")!;
const status = document.querySelector<HTMLElement>("#status")!;
const error = document.querySelector<HTMLElement>("#error")!;

const labels: Record<SiteStatus, string> = {
  ready: "",
  disabled: "Disabled",
  disconnected: "Jev disconnected",
  "no-access": "No access",
  unsupported: "Page unavailable",
};
let info: SiteInfo = { status: "unsupported" };
let busy = false;
let address = "";

async function readSite() {
  const result = await chrome.runtime.sendMessage({ type: "site-status", url: address }) as SiteInfo | null;
  if (!result) throw new Error();
  info = result;
}

function render() {
  const canChange = info.status === "ready" || info.status === "disabled";
  const label = info.status === "disabled" ? "Enable" : "Disable";
  hostname.textContent = info.status === "disconnected" ? "" : info.host ?? "";
  hostname.title = hostname.textContent;
  status.textContent = labels[info.status];
  document.body.classList.toggle("active", info.status === "ready");
  site.disabled = busy || !canChange;
  site.textContent = busy ? "" : label;
  site.setAttribute("aria-label", busy ? "Updating site" : info.host ? label + " on " + info.host : label);
  site.setAttribute("aria-busy", String(busy));
}

try {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  address = tab?.url ?? "";
  await readSite();
} catch {
  error.textContent = "Could not read site settings.";
}
render();

site.addEventListener("click", async () => {
  if (busy || !info.host || (info.status !== "ready" && info.status !== "disabled")) return;
  const disabled = info.status === "ready";
  error.textContent = "";
  busy = true;
  render();
  try {
    if (await chrome.runtime.sendMessage({ type: "set-site-disabled", host: info.host, disabled }) !== true) throw new Error();
    info.status = disabled ? "disabled" : "ready";
    await readSite().catch(() => {});
  } catch {
    error.textContent = "Could not update this site. Try again.";
  } finally {
    busy = false;
    render();
  }
});
