import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { pathToFileURL } from "node:url";
import vm from "node:vm";

export async function checkFileLinks(realFile) {
  const renderer = await readFile(new URL("../rollout-renderer.js", import.meta.url), "utf8");
  const html = await readFile(new URL("../codex-rollout-viewer.html", import.meta.url), "utf8");
  const makeNode = () => ({ dataset: {}, setAttribute() {}, replaceChildren(...children) { this.children = children; } });
  const context = vm.createContext({
    console, URL, navigator: { language: "en" },
    location: { href: "file:///E:/viewer/codex-rollout-viewer.html" },
    document: { documentElement: makeNode(), head: makeNode(), body: makeNode(), createElement: makeNode }
  });
  vm.runInContext(renderer.replace(/^export\s+/gm, "").replace(/import\.meta\.url/g, JSON.stringify(context.location.href)), context);
  vm.runInContext("initRolloutControls = () => {}; enhanceRenderedContent = async () => {};", context);
  const markdown = "[Linux](/home/feiran/project/file.js:12) [Space](</home/feiran/my project/中文.js#L12>)";
  const jsonl = [
    { type: "session_meta", payload: { id: "test-links", cwd: "/home/feiran" } },
    { type: "response_item", payload: { type: "message", role: "user", content: [{ type: "input_text", text: "Show the files" }] } },
    { type: "response_item", payload: { type: "message", role: "assistant", phase: "final_answer", content: [{ type: "output_text", text: markdown }] } }
  ].map(value => JSON.stringify(value)).join("\n");
  const parsed = context.parseCodexRolloutJsonl(jsonl);
  const renderedText = () => context.document.body.children[0].innerHTML
    + vm.runInContext("[...lazyRolloutContentStore.values()].join('')", context);

  for (const [value, expected] of [["x", "X:"], [" x: ", "X:"], ["X:/", "X:"], ["x:\\", "X:"], ["", ""], ["XX", ""], ["X:/home", ""], ["javascript:", ""]]) {
    assert.equal(context.normalizeMarkdownLinkDrive(value), expected);
  }
  for (const base of ["file:///E:/viewer/index.html", "https://example.test/viewer/"]) {
    context.location.href = base;
    await context.renderCodexRolloutRecords(parsed, { markdownLinkDrive: "x" });
    assert.match(renderedText(), /href="file:\/\/\/X:\/home\/feiran\/project\/file.js:12"/);
    assert.match(renderedText(), /href="file:\/\/\/X:\/home\/feiran\/my%20project\/%E4%B8%AD%E6%96%87.js#L12"/);
    assert.equal(vm.runInContext("[...rawMessageMarkdownStore.values()].includes(" + JSON.stringify(markdown) + ")", context), true, "Copy MD must retain the original Linux links");
    assert.equal(context.sanitizeUrl("file:///home/feiran/file.txt?raw=1#L2", "X:"), "file:///X:/home/feiran/file.txt?raw=1#L2");
    for (const url of ["https://example.test/home/file", "//server/share/file", "file://server/share/file", "file:///C:/home/file", "/C:/home/file", "relative/file.md", "../file.md", "#section", "X:/home/file", "javascript:alert(1)", "data:text/html,test"]) {
      assert.equal(context.sanitizeUrl(url, "X:"), context.sanitizeUrl(url), `${url} must keep its existing behavior`);
    }
    assert.match(context.renderMarkdownContent("![Image](/home/image.png)"), new RegExp('src="' + new URL("/home/image.png", base).href.replace(/[.*+?^${}()|[\]\\]/g, "\\$&") + '"'));
    await context.renderCodexRolloutRecords(parsed, { markdownLinkDrive: "Y:" });
    assert.match(renderedText(), /href="file:\/\/\/Y:\/home\/feiran/);
    assert.doesNotMatch(renderedText(), /file:\/\/\/X:/);
    await context.renderCodexRolloutJsonlText(jsonl);
    assert.doesNotMatch(renderedText(), /file:\/\/\/[XY]:/, "standalone files must not inherit the previous folder's drive");
    assert.ok(renderedText().includes(new URL("/home/feiran/project/file.js:12", base).href));
  }

  const stored = new Map();
  let promptValue = "x";
  let status = "";
  Object.assign(context, {
    savedDirectoryEntries: [], SESSIONS_HANDLES_KEY: "folders", SESSIONS_HANDLE_KEY: "legacy-folder",
    getStoredValue: async key => structuredClone(stored.get(key)),
    putStoredValue: async (key, value) => { stored.set(key, structuredClone(value)); },
    updateSavedDirectoryButtons() {},
    setStatus(message) { status = message; },
    askDirectoryDisplayLabel: () => "Renamed folder",
    selectedDirectoryEntry: null,
    window: { prompt: () => promptValue },
    renderDirectorySelectionPage: async () => { context.savedDirectoryEntries = await context.getSavedDirectoryEntries(); }
  });
  for (const name of ["normalizeDirectoryEntry", "getDirectoryEntryLabel", "getDirectoryEntryById", "sortDirectoryEntries", "findMatchingDirectoryEntryIndex", "saveDirectoryEntries", "getSavedDirectoryEntries", "editDirectoryEntryLinkDrive", "touchDirectoryEntry", "editDirectoryEntryLabel"]) {
    const match = html.match(new RegExp(`    (?:async )?function ${name}\\([^]*?\\n    \\}`));
    assert.ok(match, `Missing ${name}`);
    vm.runInContext(match[0], context);
  }
  await context.saveDirectoryEntries([
    { id: "a", handle: { kind: "directory", name: "sessions-a" } },
    { id: "b", handle: { kind: "directory", name: "sessions-b" }, markdownLinkDrive: "Y:" }
  ]);
  assert.equal(context.getDirectoryEntryById("a").markdownLinkDrive, "", "old folder entries must default to no mapping");
  await context.editDirectoryEntryLinkDrive("a");
  context.savedDirectoryEntries = [];
  context.savedDirectoryEntries = await context.getSavedDirectoryEntries();
  assert.equal(context.getDirectoryEntryById("a").markdownLinkDrive, "X:", "drive must survive persistence and reload");
  assert.equal(context.getDirectoryEntryById("b").markdownLinkDrive, "Y:", "editing one folder must not affect another");
  await context.touchDirectoryEntry(context.getDirectoryEntryById("a"));
  await context.editDirectoryEntryLabel("a");
  assert.equal(context.getDirectoryEntryById("a").markdownLinkDrive, "X:", "reopening and renaming a folder must retain its mapping");
  for (const value of [null, "X:/home", "javascript:alert(1)"]) {
    promptValue = value;
    await context.editDirectoryEntryLinkDrive("a");
    assert.equal(context.getDirectoryEntryById("a").markdownLinkDrive, "X:", "cancel or invalid input must preserve the setting");
  }
  assert.match(status, /single drive letter/);
  promptValue = " ";
  await context.editDirectoryEntryLinkDrive("a");
  assert.equal(context.getDirectoryEntryById("a").markdownLinkDrive, "");
  assert.equal(context.getDirectoryEntryById("b").markdownLinkDrive, "Y:");

  Object.assign(context, {
    activeWorkspaceSlotId: "slot-a", workspaceNavigationVersion: 0,
    currentRenderedSource: null, currentRenderedUiState: null,
    clearTimeout() {}, persistRenderedUiStateSoon() {},
    captureRenderedUiState: () => ({}), saveCurrentRolloutUiState: async () => {},
    getSourceStateId: source => `${source.directoryId || ""}::${source.path}`,
    getSourceMetadata: async () => ({ size: jsonl.length }),
    readRolloutParsedIncrementally: async () => ({ parsed, cache: {}, appendedBytes: 0 }),
    normalizeRolloutUuid: () => "", getSourceRolloutId: () => "",
    saveCurrentRolloutRenderCache: async () => {}, saveCurrentView: async () => {},
    saveWorkspaceNavigation: async () => {}, updateWorkspaceSlot: async () => {},
    getWorkspaceSlot: () => ({}), getSavedCurrentRolloutUiState: async () => null,
    restoreRenderedUiState() {}, ensureRenderedUiStatePersistenceInstalled() {},
    installWorkspaceBar() {}, installContentSearch() {}, scrollToDocumentEndSoon() {}
  });
  vm.runInContext(html.match(/    async function renderSource\([^]*?\n    \}/)[0], context);
  const source = { directoryId: "b", name: "rollout.jsonl", path: "rollout.jsonl" };
  const sourceOptions = { skipSlotSelection: true, skipRemember: true };
  await context.renderSource(source, sourceOptions);
  assert.match(renderedText(), /href="file:\/\/\/Y:\/home\/feiran/);
  const previousArticle = context.document.body.children[0];
  await context.renderSource(source, sourceOptions);
  assert.equal(context.document.body.children[0], previousArticle, "unchanged files must still reuse the existing view");
  promptValue = "z";
  await context.editDirectoryEntryLinkDrive("b");
  await context.renderSource(source, sourceOptions);
  assert.notEqual(context.document.body.children[0], previousArticle, "changed mapping must invalidate an unchanged file's rendered view");
  assert.match(renderedText(), /href="file:\/\/\/Z:\/home\/feiran/);
  await context.renderSource({ ...source, directoryId: "a" }, sourceOptions);
  assert.doesNotMatch(renderedText(), /file:\/\/\/[XYZ]:/, "the source folder must determine the mapping when switching rollout tabs");

  if (realFile) {
    const real = context.parseCodexRolloutJsonl(await readFile(realFile, "utf8"));
    assert.ok(context.isCodexRolloutRecords(real.records));
    await context.renderCodexRolloutRecords(real, { markdownLinkDrive: "X:" });
    console.log(`Rendered real rollout with drive mapping: ${real.records.length} records, ${real.errors.length} parse errors.`);
  }
  console.log("Checked per-folder drive persistence, isolation, clearing, Markdown targets, copied source, and renderer switching.");
}

if (process.argv[1] && pathToFileURL(process.argv[1]).href === import.meta.url) {
  await checkFileLinks(process.argv[2]);
}
