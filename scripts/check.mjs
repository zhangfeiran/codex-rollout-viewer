import assert from "node:assert/strict";
import { readFile, readdir } from "node:fs/promises";
import { spawn } from "node:child_process";
import path from "node:path";
import vm from "node:vm";

const projectDir = path.resolve(import.meta.dirname, "..");
const files = [
  "rollout-renderer.js"
].map(file => path.resolve(projectDir, file));

async function addJsFiles(dir) {
  for (const entry of await readdir(dir, { withFileTypes: true })) {
    const fullPath = path.resolve(dir, entry.name);
    if (entry.isDirectory()) {
      await addJsFiles(fullPath);
      continue;
    }
    if (entry.isFile() && entry.name.endsWith(".js")) {
      files.push(fullPath);
    }
  }
}

async function checkFile(file) {
  await new Promise((resolve, reject) => {
    const child = spawn(process.execPath, ["--check", file], { stdio: "inherit" });
    child.on("error", reject);
    child.on("exit", code => {
      if (code === 0) {
        resolve();
        return;
      }
      reject(new Error(`node --check failed for ${path.relative(projectDir, file)}`));
    });
  });
}

async function checkLocalHtml(fileName) {
  const file = path.resolve(projectDir, fileName);
  const html = await readFile(file, "utf8");
  const begin = "/* BEGIN embedded rollout-renderer.js */";
  const end = "/* END embedded rollout-renderer.js */";
  const beginIndex = html.indexOf(begin);
  const endIndex = html.indexOf(end);
  if (beginIndex < 0 || endIndex < 0 || endIndex <= beginIndex) {
    throw new Error(`${fileName} must embed rollout-renderer.js between sync markers`);
  }

  const embeddedRenderer = html.slice(beginIndex + begin.length, endIndex).trim();
  const renderer = (await readFile(path.resolve(projectDir, "rollout-renderer.js"), "utf8")).replace(/\r\n/g, "\n").trim();
  if (/<\/script/i.test(renderer)) {
    throw new Error("rollout-renderer.js contains a closing script tag and cannot be embedded in codex-rollout-viewer.html");
  }
  if (embeddedRenderer.replace(/\r\n/g, "\n") !== renderer) {
    throw new Error(`${fileName} embedded rollout renderer is out of sync with rollout-renderer.js`);
  }

  const bootScript = html.slice(endIndex + end.length, html.indexOf("</script>", endIndex));
  try {
    new Function(bootScript);
  } catch (error) {
    throw new Error(`${fileName} boot script has invalid syntax: ${error.message}`);
  }
}

async function checkSynchronizedLocalHtmlCopy() {
  const source = await readFile(path.resolve(projectDir, "codex-rollout-viewer.html"), "utf8");
  const copy = await readFile(path.resolve(projectDir, "codex-rollout-viewer2.html"), "utf8");
  assert.equal(copy, source, "codex-rollout-viewer2.html is out of sync; run npm run export:pages");
}

async function checkMarkdownRendering() {
  const rendererSource = await readFile(path.resolve(projectDir, "rollout-renderer.js"), "utf8");
  const runnableRenderer = rendererSource
    .replace(/^export\s+/gm, "")
    .replace(/import\.meta\.url/g, JSON.stringify("file:///codex-rollout-viewer/rollout-renderer.js"));
  const rendererContext = { console };
  vm.runInNewContext(
    `${runnableRenderer}\nglobalThis.__rolloutMarkdownTest = { renderMarkdownContent };`,
    rendererContext,
    { filename: "rollout-renderer.js" }
  );

  const markdown = [
    String.raw`\[`,
    String.raw`R_{\text{rank}}=\frac{L_{\max}}{L_{\text{avg}}}`,
    String.raw`\]`,
    "",
    String.raw`\[`,
    String.raw`L_{\text{aux}}=\alpha E\sum_{i=1}^{E} f_i p_i`,
    String.raw`\]`,
    "",
    "$$q=mc$$",
    "",
    String.raw`Inline \(x^2+y^2=z^2\) and $a+b=c$.`,
    "",
    "```text",
    "$not_math$",
    "```"
  ].join("\n");
  const renderedMarkdown = rendererContext.__rolloutMarkdownTest.renderMarkdownContent(markdown);
  assert.equal((renderedMarkdown.match(/data-rollout-math/g) || []).length, 5, "expected five math placeholders");
  assert.equal((renderedMarkdown.match(/rollout-math is-display/g) || []).length, 3, "expected three display formulas");
  assert.match(renderedMarkdown, /<code class="language-text">\$not_math\$\n<\/code>/, "code fences must not render math");

  const katexSource = await readFile(path.resolve(projectDir, "vendor", "katex", "katex.min.js"), "utf8");
  const katexContext = { console };
  katexContext.self = katexContext;
  vm.runInNewContext(katexSource, katexContext, { filename: "katex.min.js" });
  for (const formula of [
    String.raw`R_{\text{rank}}=\frac{L_{\max}}{L_{\text{avg}}}`,
    String.raw`L_{\text{aux}}=\alpha E\sum_{i=1}^{E} f_i p_i`
  ]) {
    const html = katexContext.katex.renderToString(formula, { displayMode: true, throwOnError: false });
    assert.match(html, /class="katex-display"/, "KaTeX must render display math");
    assert.doesNotMatch(html, /katex-error/, "sample formula must be valid KaTeX");
  }

  const tableMarkdown = [
    "| Name | Formula | Notes |",
    "| :--- | :---: | ---: |",
    "| **Alice** | \\(a|b\\) | `code|pipe` |",
    String.raw`| Bob \| Team | $x+y$ | [link](https://example.com/) |`
  ].join("\n");
  const renderedTable = rendererContext.__rolloutMarkdownTest.renderMarkdownContent(tableMarkdown);
  assert.equal((renderedTable.match(/<th\b/g) || []).length, 3, "expected three table headers");
  assert.equal((renderedTable.match(/<td\b/g) || []).length, 6, "expected two table rows");
  assert.equal((renderedTable.match(/data-rollout-math/g) || []).length, 2, "expected formulas inside table cells");
  assert.match(renderedTable, /<strong>Alice<\/strong>/, "table cells must render inline Markdown");
  assert.match(renderedTable, /<code>code\|pipe<\/code>/, "pipes inside inline code must stay in one cell");
  assert.match(renderedTable, /Bob \| Team/, "escaped pipes must stay in one cell");
  assert.match(renderedTable, /class="is-align-center"/, "center alignment must be rendered");
  assert.match(renderedTable, /class="is-align-right"/, "right alignment must be rendered");
}

await addJsFiles(path.resolve(projectDir, "vendor"));

for (const file of files) {
  await checkFile(file);
}

await checkLocalHtml("codex-rollout-viewer.html");
await checkLocalHtml("codex-rollout-viewer2.html");
await checkSynchronizedLocalHtmlCopy();
await checkMarkdownRendering();

console.log(`Checked ${files.length} JavaScript files and both local HTML entrypoints.`);
