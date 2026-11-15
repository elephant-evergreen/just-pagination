import { $ } from "bun";
import { mkdirSync, mkdtempSync, readdirSync, renameSync, rmSync } from "node:fs";
import { join, relative } from "node:path";
import { pages } from "./src/gallery-data.ts";

const root = import.meta.dir;
const dist = join(root, "dist");
const manifest: { version?: unknown; manifest_version?: unknown } = await Bun.file(join(dist, "manifest.json")).json();
const { version } = manifest;
if (manifest.manifest_version !== 3 || typeof version !== "string" || !/^(0|[1-9]\d{0,4})(\.(0|[1-9]\d{0,4})){2}$/.test(version) ||
    version === "0.0.0" || version.split(".").some(part => Number(part) > 65535)) {
  throw new Error("Expected a Manifest V3 extension with a valid three-part version.");
}
const tag = `v${version}`;
if (Bun.env.GITHUB_REF_TYPE === "tag" && Bun.env.GITHUB_REF_NAME !== tag) {
  throw new Error(`The Git tag must match the manifest version (${tag}).`);
}
if (!(await Bun.file(join(root, "release-notes", `${tag}.md`)).text()).trim()) {
  throw new Error(`Release notes for ${tag} are empty.`);
}

const runtimeFiles = [
  "background.js", "content.js", "controls.css", "gallery-data.js", "jev.js", "manifest.json", "photo-credits.html",
  "popup.css", "popup.html", "popup.js", "protocol.js", "settings.html", "setup.css", "setup.js", "sites.js",
  "assets/Mulish-OFL.txt", "assets/icon.png", "assets/icon-16.png", "assets/icon-32.png", "assets/icon-48.png", "assets/keyboard-cat.png", "assets/mulish.woff2",
  ...new Set(pages.flat().map(photo => photo.src)),
].sort();
const builtFiles = readdirSync(dist, { recursive: true, withFileTypes: true }).filter(entry => !entry.isDirectory());
const builtPaths = new Set(builtFiles.map(entry => relative(dist, join(entry.parentPath, entry.name))));
if (builtFiles.some(entry => !entry.isFile()) || builtPaths.size !== runtimeFiles.length ||
    runtimeFiles.some(path => !builtPaths.has(path))) {
  throw new Error("The build does not match the Chrome extension package file list.");
}

const artifacts = join(root, "artifacts");
mkdirSync(artifacts, { recursive: true });
const staging = mkdtempSync(join(artifacts, ".package-"));
const archive = `just-pagination-${version}.zip`;
const checksum = `${archive}.sha256`;
try {
  const path = join(staging, archive);
  await $`zip -q -X ${path} ${runtimeFiles}`.cwd(dist);
  const bytes = await Bun.file(path).arrayBuffer();
  const digest = new Uint8Array(await crypto.subtle.digest("SHA-256", bytes)).toHex();
  await Bun.write(join(staging, checksum), `${digest}  ${archive}\n`);
  renameSync(path, join(artifacts, archive));
  renameSync(join(staging, checksum), join(artifacts, checksum));
  console.log(`Created artifacts/${archive}`);
} finally {
  rmSync(staging, { recursive: true, force: true });
}
