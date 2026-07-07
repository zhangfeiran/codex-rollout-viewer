import { copyFile, mkdir, writeFile } from "node:fs/promises";
import path from "node:path";

const projectDir = path.resolve(import.meta.dirname, "..");
const pagesDir = path.join(projectDir, "pages");
const highlightDir = path.join(pagesDir, "vendor", "highlightjs");

await mkdir(highlightDir, { recursive: true });

await copyFile(path.join(projectDir, "codex-rollout-viewer.html"), path.join(pagesDir, "index.html"));
await copyFile(
  path.join(projectDir, "vendor", "highlightjs", "highlight.min.js"),
  path.join(highlightDir, "highlight.min.js")
);
await copyFile(
  path.join(projectDir, "vendor", "highlightjs", "LICENSE"),
  path.join(highlightDir, "LICENSE")
);

await writeFile(path.join(pagesDir, ".nojekyll"), "", "utf8");

await writeFile(
  path.join(pagesDir, "README.md"),
  [
    "# Codex Rollout Viewer",
    "",
    "Static GitHub Pages build for Codex Rollout Viewer.",
    "",
    "## Deploy",
    "",
    "1. Push this directory to a GitHub repository.",
    "2. In GitHub, open Settings -> Pages.",
    "3. Select the branch that contains this directory as the Pages source.",
    "4. Open `https://zhangfeiran.github.io/codex-rollout-viewer/`.",
    "",
    "The viewer runs fully in the browser. JSONL files and session folders are read through browser file permissions and are not uploaded.",
    "",
    "## Refresh",
    "",
    "From the source project, run:",
    "",
    "```sh",
    "npm run export:pages",
    "```",
    ""
  ].join("\n"),
  "utf8"
);

console.log(`Exported GitHub Pages static site to ${path.relative(projectDir, pagesDir)}`);
