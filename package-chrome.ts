import { $ } from "bun";
import { chmodSync, copyFileSync, mkdirSync, mkdtempSync, readdirSync, renameSync, rmSync, utimesSync } from "node:fs";
import { dirname, join, relative } from "node:path";
import { releaseTag, releaseVersion } from "./release.ts";

const root = import.meta.dir;
const dist = join(root, "dist");
const manifest = await Bun.file(join(dist, "manifest.json")).json();
const version = releaseVersion(manifest);
const tag = releaseTag(version);
if (Bun.env.GITHUB_REF_TYPE === "tag" && Bun.env.GITHUB_REF_NAME !== tag) {
  throw new Error(`The Git tag must match the manifest version (${tag}).`);
}
const notesPath = join(root, "release-notes", `${tag}.md`);
if (!(await Bun.file(notesPath).exists()) || !(await Bun.file(notesPath).text()).trim()) {
  throw new Error(`Release notes for ${tag} are missing or empty.`);
}

const runtimeFiles = [
  "background.js", "content.js", "controls.css", "gallery-data.js", "jev.js", "manifest.json", "photo-credits.html",
  "popup.css", "popup.html", "popup.js", "protocol.js", "settings.html", "setup.css", "setup.js", "sites.js",
  "assets/Mulish-OFL.txt", "assets/icon.png", "assets/icon-16.png", "assets/icon-32.png", "assets/icon-48.png", "assets/keyboard-cat.png", "assets/mulish.woff2",
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
  const packageDir = join(staging, "package");
  const fixedTime = new Date("1980-01-01T00:00:00Z");
  // Keep reruns of the same tag byte-identical so a failed draft upload can resume safely.
  for (const file of runtimeFiles) {
    const target = join(packageDir, file);
    mkdirSync(dirname(target), { recursive: true });
    copyFileSync(join(dist, file), target);
    chmodSync(target, 0o644);
    utimesSync(target, fixedTime, fixedTime);
  }
  await $`TZ=UTC zip -q -X ${path} ${runtimeFiles}`.cwd(packageDir);
  const bytes = await Bun.file(path).arrayBuffer();
  const digest = new Uint8Array(await crypto.subtle.digest("SHA-256", bytes)).toHex();
  await Bun.write(join(staging, checksum), `${digest}  ${archive}\n`);
  renameSync(path, join(artifacts, archive));
  renameSync(join(staging, checksum), join(artifacts, checksum));
  console.log(`Created artifacts/${archive}`);
} finally {
  rmSync(staging, { recursive: true, force: true });
}
