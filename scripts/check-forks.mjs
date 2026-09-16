import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { pathToFileURL } from "node:url";
import vm from "node:vm";

export async function checkForks(realFile) {
  const renderer = await readFile(new URL("../rollout-renderer.js", import.meta.url), "utf8");
  const html = await readFile(new URL("../codex-rollout-viewer.html", import.meta.url), "utf8");
  const context = vm.createContext({ console });
  vm.runInContext(renderer.replace(/^export\s+/gm, "").replace(/import\.meta\.url/g, JSON.stringify("file:///viewer/rollout-renderer.js")), context);
  const sourceId = "01a0a04f-f5a2-7ba3-86c3-d75cef2b0ebd";
  const childId = "01a0a2b4-b39d-7a20-b75f-35a687e8d715";
  const metaRecords = payload => [{ line: 1, value: { type: "session_meta", payload } }];
  const records = metaRecords({ id: childId, forked_from_id: sourceId, forked_from_ordinal_exclusive: 7487 });
  assert.equal(context.getRolloutForkSourceId(records), sourceId);
  const header = context.renderHeader(records, [], { fileName: "fork.jsonl" });
  assert.match(header, new RegExp(`data-rollout-fork-source="${sourceId}"`));
  assert.match(header, /data-open-fork-source/);
  assert.match(header, /Forked from:/);
  assert.equal(context.getRolloutForkSourceId(metaRecords({ id: childId, parent_thread_id: sourceId })), "", "subagent parent metadata must not be interpreted as a fork");
  for (const value of [null, 123, "javascript:alert(1)", `${sourceId}<script>`, childId]) {
    const invalid = metaRecords({ id: childId, forked_from_id: value });
    assert.equal(context.getRolloutForkSourceId(invalid), "");
    assert.doesNotMatch(context.renderHeader(invalid, [], { fileName: "plain.jsonl" }), /data-rollout-fork-source/);
  }
  assert.equal(context.getRolloutForkSourceId(metaRecords({ forked_from_id: sourceId.toUpperCase() })), sourceId);

  for (const name of ["normalizeRolloutUuid", "getSourceStateId", "getSourceRolloutId", "getScopedIndexCache", "readForkSourceItem", "findForkSourceItem", "showForkSourceStatus", "openForkSourceRollout", "openChosenForkSource", "chooseForkSourceFile"]) {
    const match = html.match(new RegExp(`^    (?:async )?function ${name}\\([^]*?\\n    \\}`, "m"));
    assert.ok(match, `Missing ${name}`);
    vm.runInContext(match[0], context);
  }
  const source = { name: `rollout-${sourceId}.jsonl`, path: `2026/rollout-${sourceId}.jsonl`, directoryId: "preferred", actualId: sourceId };
  const renamed = { ...source, name: "renamed.jsonl", path: "renamed.jsonl" };
  const impostor = { ...source, directoryId: "other", actualId: childId };
  const preferred = { id: "preferred", label: "Sessions A", handle: { allowed: true, sources: [source] } };
  const other = { id: "other", label: "Sessions B", handle: { allowed: true, sources: [impostor] } };
  const denied = { id: "denied", label: "Needs permission", handle: { allowed: false, sources: [source] } };
  const walked = [];
  const reads = [];
  let cache = { items: {} };
  Object.assign(context, {
    rolloutIndex: [],
    savedDirectoryEntries: [other, preferred, denied],
    getSavedDirectoryEntries: async () => [other, preferred, denied],
    getSavedIndexCache: async () => cache,
    getDirectoryEntryLabel: entry => entry.label,
    getDirectoryEntryById: id => context.savedDirectoryEntries.find(entry => entry.id === id),
    hasReadPermission: async handle => handle.allowed,
    requestReadPermission: async handle => handle.allowed,
    async* walkDirectoryHandle(handle) { walked.push(handle); yield* handle.sources; },
    getFileHandleByPath: async (handle, path) => handle.sources.find(candidate => candidate.path === path) || null,
    createSourceFromFileHandle: handle => handle,
    async createRolloutIndexItem(candidate) {
      reads.push(candidate);
      if (candidate.unreadable) throw new Error("Unreadable");
      return { source: candidate, name: candidate.name, title: "Source title", rolloutId: candidate.actualId };
    }
  });
  assert.equal(await context.readForkSourceItem(impostor, sourceId), null, "matching filenames must not override a mismatched session ID");
  let report = await context.findForkSourceItem(sourceId, preferred.id);
  assert.equal(report.item.source, source);
  assert.deepEqual(walked, [preferred.handle], "search the current sessions folder before unrelated folders");

  walked.length = 0;
  preferred.handle.sources = [renamed];
  cache = { items: { preferred: { "renamed.jsonl": { path: "renamed.jsonl", rolloutId: sourceId, isRollout: true } } } };
  report = await context.findForkSourceItem(sourceId, preferred.id);
  assert.equal(report.item.source, renamed, "index caches locate renamed source files by session ID");
  assert.equal(walked.length, 0, "a valid cached path avoids scanning the directory");
  cache = { items: {} };
  report = await context.findForkSourceItem(sourceId, preferred.id);
  assert.equal(report.item.source, renamed, "uncached nonstandard filenames are resolved from session metadata");
  context.savedDirectoryEntries = [denied, other];
  walked.length = 0;
  report = await context.findForkSourceItem(sourceId, preferred.id);
  assert.equal(report.item, null);
  assert.equal(report.blocked[0], denied);
  assert.deepEqual(walked, [other.handle], "denied folders must not be read");
  const readsBeforeCancel = reads.length;
  await context.findForkSourceItem(sourceId, preferred.id, () => false);
  assert.equal(reads.length, readsBeforeCancel, "cancelled lookups must stop reading candidates");

  const nodes = new Map();
  const root = {
    dataset: { rolloutForkSource: sourceId }, isConnected: true,
    querySelector(selector) {
      if (!nodes.has(selector)) nodes.set(selector, { click() { this.clicked = true; } });
      return nodes.get(selector);
    }
  };
  const opened = [];
  const activated = [];
  const openTabs = [{ id: "child-tab" }];
  let existing = null;
  Object.assign(context, {
    workspaceNavigationVersion: 1,
    activeWorkspaceViewKind: "rollout",
    currentRenderedSource: { directoryId: preferred.id },
    getWorkspaceSlotByRolloutId: () => existing,
    activateWorkspaceSlot: async id => activated.push(id),
    openIndexedRolloutItem: async item => { opened.push(item); openTabs.push({ id: "source-tab" }); },
    window: {}
  });
  const item = { source, rolloutId: sourceId };
  context.findForkSourceItem = async () => ({ item, blocked: [], unreadable: 0 });
  await context.openForkSourceRollout(root);
  assert.equal(opened[0], item);
  assert.deepEqual(openTabs.map(tab => tab.id), ["child-tab", "source-tab"], "opening the source retains the fork tab");
  assert.equal(nodes.get("[data-open-fork-source]").disabled, false);
  existing = { id: "already-open-source" };
  await context.openForkSourceRollout(root);
  assert.deepEqual(activated, ["already-open-source"], "an existing source tab is reused");
  assert.equal(opened.length, 1);
  existing = null;
  context.findForkSourceItem = async () => ({ item: null, blocked: [denied], unreadable: 0 });
  await context.openForkSourceRollout(root);
  assert.match(nodes.get("[data-fork-source-status]").textContent, /not found/);
  assert.match(nodes.get("[data-fork-source-actions]").innerHTML, /data-fork-source-permission="denied"/);
  assert.match(nodes.get("[data-fork-source-actions]").innerHTML, /Choose source JSONL/);
  assert.equal(opened.length, 1, "missing sources must not create empty tabs");

  context.findForkSourceItem = async () => {
    context.workspaceNavigationVersion += 1;
    return { item, blocked: [] };
  };
  await context.openForkSourceRollout(root);
  assert.equal(opened.length, 1, "late lookup results must not take over another view");
  await context.openChosenForkSource(root, impostor);
  assert.equal(opened.length, 1, "manually selected files must match the fork source ID");
  assert.match(nodes.get("[data-fork-source-status]").textContent, /does not match/);
  await context.openChosenForkSource(root, renamed);
  assert.equal(opened.length, 2);
  await context.chooseForkSourceFile(root);
  assert.equal(nodes.get("[data-fork-source-file]").clicked, true, "manual selection supports the file-input fallback");

  if (realFile) {
    const parsed = context.parseCodexRolloutJsonl(await readFile(realFile, "utf8"));
    assert.equal(parsed.errors.length, 0);
    const meta = context.getSessionMeta(parsed.records);
    assert.ok(meta.forked_from_id, "the real fixture must contain fork metadata");
    const rendered = context.renderHeader(context.createRenderableRecords(parsed.records), [], { fileName: realFile });
    assert.ok(rendered.includes(`data-rollout-fork-source="${meta.forked_from_id}"`));
    const inline = context.renderInlineCodexRollout(parsed, { fileName: realFile, forkAncestors: [meta.id] });
    assert.ok(inline.includes(`data-rollout-fork-source="${meta.forked_from_id}"`));
    assert.match(inline, /data-fork-preview/);
    assert.doesNotMatch(inline, /id="turn-1"/);
    console.log(`Validated real fork rollout: ${parsed.records.length} records, source ${meta.forked_from_id}.`);
  }
  console.log("Checked fork metadata, source identity, folder lookup, permissions, new tabs, cancellation, and manual source selection.");
}

if (process.argv[1] && pathToFileURL(process.argv[1]).href === import.meta.url) {
  await checkForks(process.argv[2]);
}
