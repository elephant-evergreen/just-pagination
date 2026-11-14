import { enteredHost } from "./protocol.js";

const form = document.querySelector<HTMLFormElement>("#sites")!;
const field = document.querySelector<HTMLInputElement>("#site-url")!;
const action = document.querySelector<HTMLButtonElement>("#disable-site")!;
const note = document.querySelector<HTMLElement>("#site-note")!;
const list = document.querySelector<HTMLUListElement>("#site-rows")!;
const empty = document.querySelector<HTMLElement>("#empty-sites")!;

let hosts: Set<string> | undefined;
let busy = false;

function showNote(message = "", error = false) {
  note.textContent = message;
  note.classList.toggle("error", error);
}

function render() {
  const host = enteredHost(field.value);
  const saved = host !== undefined && hosts?.has(host);
  const candidates = host ? [host] : Array.from(hosts ?? []);
  field.readOnly = busy;
  action.disabled = busy || !hosts || !host || saved === true;
  empty.hidden = hosts?.size !== 0 || host !== undefined;
  const scroll = list.parentElement!;
  const offset = scroll.scrollTop;
  list.replaceChildren(...candidates.map(name => {
    const row = document.createElement("li");
    row.className = "site-row";
    const label = document.createElement("span");
    label.textContent = name;
    row.append(label);
    if (hosts?.has(name)) {
      const remove = document.createElement("button");
      remove.type = "button";
      remove.textContent = "×";
      remove.disabled = busy;
      remove.setAttribute("aria-label", "Enable pagination on " + name);
      remove.addEventListener("click", () => { void update(name, false); });
      row.append(remove);
    } else {
      row.classList.add("pending");
      row.setAttribute("aria-label", "Site to disable: " + name);
    }
    return row;
  }));
  scroll.scrollTop = offset;
}

async function loadSites() {
  const result: unknown = await chrome.runtime.sendMessage({ type: "disabled-sites" });
  if (!Array.isArray(result) || !result.every(host => typeof host === "string")) throw new Error();
  hosts = new Set(result);
}

async function update(host: string, disabled: boolean) {
  if (!hosts || busy) return;
  busy = true;
  showNote(disabled ? "" : "Enabling pagination…");
  if (disabled) {
    action.textContent = "";
    action.setAttribute("aria-busy", "true");
    action.setAttribute("aria-label", "Disabling");
  }
  render();
  try {
    if (await chrome.runtime.sendMessage({ type: "set-site-disabled", host, disabled }) !== true) throw new Error();
    await loadSites();
    field.value = "";
    showNote(disabled ? "" : "Pagination enabled on " + host + ".");
  } catch {
    showNote(disabled ? "Could not disable this site. Try again." : "Could not enable this site. Try again.", true);
  } finally {
    busy = false;
    action.textContent = "Disable";
    action.removeAttribute("aria-busy");
    action.removeAttribute("aria-label");
    render();
    field.focus({ preventScroll: true });
  }
}

field.addEventListener("input", () => {
  showNote();
  field.removeAttribute("aria-invalid");
  list.parentElement!.scrollTop = 0;
  render();
});
field.addEventListener("blur", () => {
  if (field.value.trim() && !enteredHost(field.value)) {
    field.setAttribute("aria-invalid", "true");
    showNote("Enter a valid page URL.", true);
  }
});
form.addEventListener("submit", event => {
  event.preventDefault();
  const host = enteredHost(field.value);
  if (host) void update(host, true);
});
chrome.storage.onChanged.addListener((changes, area) => {
  if (area === "local" && changes.pausedSites && !busy) {
    void loadSites().then(render, () => showNote("Could not load disabled sites. Reload this page.", true));
  }
});
try {
  showNote("Loading disabled sites…");
  await loadSites();
  field.disabled = false;
  showNote();
} catch {
  showNote("Could not load disabled sites. Reload this page.", true);
}
render();
