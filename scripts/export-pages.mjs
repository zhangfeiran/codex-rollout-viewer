import { copyFile, cp, mkdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";

const projectDir = path.resolve(import.meta.dirname, "..");
const pagesDir = path.resolve(
  process.env.CODEX_ROLLOUT_PAGES_DIR || path.join(tmpdir(), "codex-rollout-viewer-pages")
);
const highlightDir = path.join(pagesDir, "vendor", "highlightjs");
const secondaryPagesDir = path.join(pagesDir, "codex-rollout-viewer2");
const secondaryHighlightDir = path.join(secondaryPagesDir, "vendor", "highlightjs");
const localHtmlSource = path.join(projectDir, "codex-rollout-viewer.html");
const localHtmlCopy = path.join(projectDir, "codex-rollout-viewer2.html");

const projectRelativeToOutput = path.relative(pagesDir, projectDir);
if (projectRelativeToOutput === "" || (!projectRelativeToOutput.startsWith("..") && !path.isAbsolute(projectRelativeToOutput))) {
  throw new Error(`Refusing to replace Pages output directory because it contains the project: ${pagesDir}`);
}

await rm(pagesDir, { recursive: true, force: true });
await Promise.all([
  mkdir(highlightDir, { recursive: true }),
  mkdir(secondaryHighlightDir, { recursive: true })
]);

await copyFile(localHtmlSource, localHtmlCopy);
await Promise.all([
  copyFile(localHtmlSource, path.join(pagesDir, "index.html")),
  copyFile(localHtmlSource, path.join(secondaryPagesDir, "index.html"))
]);
await Promise.all([highlightDir, secondaryHighlightDir].flatMap(outputDir => [
  copyFile(
    path.join(projectDir, "vendor", "highlightjs", "highlight.min.js"),
    path.join(outputDir, "highlight.min.js")
  ),
  copyFile(
    path.join(projectDir, "vendor", "highlightjs", "LICENSE"),
    path.join(outputDir, "LICENSE")
  )
]));
await Promise.all([pagesDir, secondaryPagesDir].map(outputDir =>
  cp(path.join(projectDir, "vendor", "katex"), path.join(outputDir, "vendor", "katex"), { recursive: true })
));

await writeFile(path.join(pagesDir, ".nojekyll"), "", "utf8");

console.log(`Synced ${path.basename(localHtmlCopy)} and staged both GitHub Pages viewer paths at ${pagesDir}`);
