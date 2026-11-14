import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { mkdirSync, mkdtempSync, readdirSync, readFileSync, renameSync, rmSync, writeFileSync } from "node:fs";
import { join, relative } from "node:path";
import { fileURLToPath } from "node:url";
import { pages } from "./src/gallery-data.ts";

const root = fileURLToPath(new URL("./", import.meta.url));
const dist = join(root, "dist");
const manifest: { version?: unknown; manifest_version?: unknown } = JSON.parse(readFileSync(join(dist, "manifest.json"), "utf8"));
const { version } = manifest;
if (manifest.manifest_version !== 3 || typeof version !== "string" || !/^(0|[1-9]\d{0,4})(\.(0|[1-9]\d{0,4})){2}$/.test(version) ||
    version === "0.0.0" || version.split(".").some(part => Number(part) > 65535)) {
  throw new Error("Expected a Manifest V3 extension with a valid three-part version.");
}
const tag = `v${version}`;
if (process.env.GITHUB_REF_TYPE === "tag" && process.env.GITHUB_REF_NAME !== tag) {
  throw new Error(`The Git tag must match the manifest version (${tag}).`);
}
if (!readFileSync(join(root, "release-notes", `${tag}.md`), "utf8").trim()) {
  throw new Error(`Release notes for ${tag} are empty.`);
}

const runtimeFiles = [
  "background.js", "content.js", "controls.css", "gallery-data.js", "jev.js", "manifest.json", "photo-credits.html",
  "popup.css", "popup.html", "popup.js", "protocol.js", "setup.css", "setup.html", "setup.js", "sites.js",
  "assets/Mulish-OFL.txt", "assets/icon.png", "assets/icon-16.png", "assets/icon-32.png", "assets/icon-48.png", "assets/mulish.woff2",
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
  execFileSync("zip", ["-q", "-X", path, ...runtimeFiles], { cwd: dist });
  const digest = createHash("sha256").update(readFileSync(path)).digest("hex");
  writeFileSync(join(staging, checksum), `${digest}  ${archive}\n`);
  renameSync(path, join(artifacts, archive));
  renameSync(join(staging, checksum), join(artifacts, checksum));
  console.log(`Created artifacts/${archive}`);
} finally {
  rmSync(staging, { recursive: true, force: true });
}
