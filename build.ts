import { execFileSync } from "node:child_process";
import { cpSync, globSync, rmSync, statSync } from "node:fs";
import { fileURLToPath } from "node:url";

const root = new URL("./", import.meta.url);
const javascriptSources = globSync("**/*.{js,cjs,mjs,jsx}", {
  cwd: root,
  exclude: ["node_modules", "dist", "artifacts"],
}).filter(path => !statSync(new URL(path, root), { throwIfNoEntry: false })?.isDirectory());
if (javascriptSources.length) {
  throw new Error(`Use TypeScript for source files: ${javascriptSources.join(", ")}`);
}

const output = new URL("dist/", root);
rmSync(output, { recursive: true, force: true });
execFileSync(process.execPath, [fileURLToPath(new URL("node_modules/typescript/bin/tsc", root))], {
  cwd: root,
  stdio: "inherit",
});
cpSync(new URL("extension/", root), output, { recursive: true });
