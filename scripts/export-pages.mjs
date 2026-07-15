import { copyFile, cp, mkdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";

const projectDir = path.resolve(import.meta.dirname, "..");
const pagesDir = path.resolve(
  process.env.CODEX_ROLLOUT_PAGES_DIR || path.join(tmpdir(), "codex-rollout-viewer-pages")
);
const highlightDir = path.join(pagesDir, "vendor", "highlightjs");
const localHtmlSource = path.join(projectDir, "codex-rollout-viewer.html");
const localHtmlCopy = path.join(projectDir, "codex-rollout-viewer2.html");

const projectRelativeToOutput = path.relative(pagesDir, projectDir);
if (projectRelativeToOutput === "" || (!projectRelativeToOutput.startsWith("..") && !path.isAbsolute(projectRelativeToOutput))) {
  throw new Error(`Refusing to replace Pages output directory because it contains the project: ${pagesDir}`);
}

await rm(pagesDir, { recursive: true, force: true });
await mkdir(highlightDir, { recursive: true });

await copyFile(localHtmlSource, localHtmlCopy);
await copyFile(localHtmlSource, path.join(pagesDir, "index.html"));
await copyFile(
  path.join(projectDir, "vendor", "highlightjs", "highlight.min.js"),
  path.join(highlightDir, "highlight.min.js")
);
await copyFile(
  path.join(projectDir, "vendor", "highlightjs", "LICENSE"),
  path.join(highlightDir, "LICENSE")
);
await cp(path.join(projectDir, "vendor", "katex"), path.join(pagesDir, "vendor", "katex"), { recursive: true });

await writeFile(path.join(pagesDir, ".nojekyll"), "", "utf8");

console.log(`Synced ${path.basename(localHtmlCopy)} and staged the GitHub Pages artifact at ${pagesDir}`);
