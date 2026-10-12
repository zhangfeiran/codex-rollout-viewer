import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import vm from "node:vm";

export async function checkInlineForks() {
  const renderer = await readFile(new URL("../rollout-renderer.js", import.meta.url), "utf8");
  const html = await readFile(new URL("../codex-rollout-viewer.html", import.meta.url), "utf8");
  const context = vm.createContext({ console, TextEncoder, TextDecoder });
  vm.runInContext(renderer.replace(/^export\s+/gm, "").replace(/import\.meta\.url/g, JSON.stringify("file:///viewer/rollout-renderer.js")), context);
  for (const name of ["normalizeRolloutUuid", "showForkSourceStatus", "getForkSourceAncestors", "restoreInlineForkPreviews", "expandForkSourceInline", "openChosenForkSource"]) {
    const match = html.match(new RegExp(`^    (?:async )?function ${name}\\([^]*?\\n    \\}`, "m"));
    assert.ok(match, `Missing ${name}`);
    vm.runInContext(match[0], context);
  }
  const child = "01a0a2b4-b39d-7a20-b75f-35a687e8d715";
  const source = "01a0a04f-f5a2-7ba3-86c3-d75cef2b0ebd";
  const ancestor = "01a09ef1-5477-75b2-a19a-e2388b261261";
  const rawText = 'Message with <script>unsafe</script> and id="turn-1"';
  const records = (id, fork) => [
    { type: "session_meta", payload: { id, forked_from_id: fork } },
    { type: "response_item", payload: { type: "message", role: "user", content: [{ type: "input_text", text: rawText }] } },
    { type: "response_item", payload: { type: "message", role: "assistant", content: [{ type: "output_text", text: "A source answer" }] } }
  ].map(value => JSON.stringify(value)).join("\n");
  const parentParsed = context.parseCodexRolloutJsonl(records(child, source));
  const parentGroup = context.buildGroups(context.createRenderableRecords(parentParsed.records))[0];
  context.renderTurnGroupWithFinalAnswer(parentGroup, { callById: new Map() });
  const lazyBefore = vm.runInContext("[...lazyRolloutContentStore.entries()]", context);
  const rawBefore = vm.runInContext("[...rawMessageMarkdownStore.entries()]", context);
  const result = context.renderInlineCodexRollout(context.parseCodexRolloutJsonl(records(source, ancestor)), {
    fileName: "source.jsonl", forkAncestors: [child, source], directoryId: "parent-folder"
  });
  assert.match(result, /data-fork-preview/);
  assert.match(result, new RegExp(`data-rollout-fork-source="${ancestor}"`));
  assert.match(result, /data-fork-directory-id="parent-folder"/);
  assert.doesNotMatch(result, /id="turn-1"|data-rollout-state-key="turn-1:body"/, "inline turns cannot collide with the current rollout IDs or state keys");
  assert.match(result, new RegExp(`data-rollout-state-key="fork-${child}-${source}:turn-1:body"`));
  assert.doesNotMatch(result, /<script>/, "source content is rendered as escaped data");
  const lazyAfter = vm.runInContext("[...lazyRolloutContentStore.entries()]", context);
  assert.deepEqual(Array.from(lazyAfter.slice(0, lazyBefore.length), pair => Array.from(pair)), Array.from(lazyBefore, pair => Array.from(pair)), "rendering a fork leaves parent lazy content intact");
  assert.deepEqual(Array.from(vm.runInContext("[...rawMessageMarkdownStore.entries()]", context).slice(0, rawBefore.length), pair => Array.from(pair)), Array.from(rawBefore, pair => Array.from(pair)), "parent copy-Markdown content is preserved");
  assert.ok(vm.runInContext("[...rawMessageMarkdownStore.values()]", context).includes(rawText), "raw Markdown is not rewritten by DOM namespacing");
  const inlineBody = lazyAfter.find(([key, value], index) => index >= lazyBefore.length && typeof value === "string" && value.includes("rollout-entry"));
  assert.ok(inlineBody);
  assert.doesNotMatch(inlineBody[1], /id="record-\d+"/, "lazy turn descendants receive the same unique prefix");

  const makeRoot = (id = source, ancestors = [child]) => {
    const details = { open: true, dataset: {} };
    const body = { dataset: {}, innerHTML: "", querySelectorAll: () => [] };
    const status = {};
    const actions = {};
    const root = {
      dataset: { rolloutForkSource: id, forkAncestors: JSON.stringify(ancestors) }, isConnected: true,
      querySelector: selector => ({ "[data-fork-preview]": details, "[data-fork-preview-body]": body, "[data-fork-source-status]": status, "[data-fork-source-actions]": actions })[selector]
    };
    return { root, details, body, status, actions };
  };
  let reads = 0;
  let opens = 0;
  const sources = new Map([[source, records(source, ancestor)], [ancestor, records(ancestor, child)]]);
  const item = id => ({ source: { name: `${id}.jsonl`, directoryId: "parent-folder", getText: async () => { reads += 1; return sources.get(id); } }, rolloutId: id });
  Object.assign(context, {
    activeWorkspaceViewKind: "rollout", activeWorkspaceSlotId: "child-tab", workspaceNavigationVersion: 1,
    currentRenderedSource: { directoryId: "child-folder" }, currentRenderedUiState: null,
    getWorkspaceSlotByRolloutId: () => null,
    getDirectoryEntryById: id => ({ id, handle: {} }), getDirectoryEntryLabel: entry => entry.id,
    requestReadPermission: async () => true,
    findForkSourceItem: async id => ({ item: item(id), blocked: [], unreadable: 0 }),
    parseCompleteJsonlText: context.parseCodexRolloutJsonl,
    updateInlineForkTitles() {}, enhanceRenderedContent: async () => {},
    openIndexedRolloutItem: async () => { opens += 1; },
    readForkSourceItem: async () => item(source)
  });
  const first = makeRoot();
  await context.expandForkSourceInline(first.root);
  assert.equal(first.details.dataset.loaded, "true");
  assert.equal(first.body.dataset.inlineRolloutId, source);
  assert.match(first.body.innerHTML, new RegExp(ancestor));
  assert.equal(opens, 0, "inline expansion does not open or navigate workspace tabs");
  assert.equal(context.activeWorkspaceSlotId, "child-tab");
  first.details.open = false;
  await context.expandForkSourceInline(first.root);
  first.details.open = true;
  await context.expandForkSourceInline(first.root);
  assert.equal(reads, 1, "folding and reopening loaded ancestry reuses its content");
  const second = makeRoot(ancestor, [child, source]);
  await context.expandForkSourceInline(second.root);
  assert.equal(second.details.dataset.loaded, "true", "source rollouts may expand their own fork origin");
  const cycle = makeRoot(child, [child, source, ancestor]);
  await context.expandForkSourceInline(cycle.root);
  assert.match(cycle.status.textContent, /already in the expanded ancestry/);
  assert.equal(reads, 2, "cycles are rejected before any source read");

  const denied = makeRoot();
  context.findForkSourceItem = async () => ({ item: null, blocked: [{ id: "blocked" }], unreadable: 0 });
  await context.expandForkSourceInline(denied.root);
  assert.match(denied.actions.innerHTML, /data-fork-source-permission="blocked"/);
  assert.match(denied.actions.innerHTML, /Choose source JSONL/);
  await context.openChosenForkSource(denied.root, {});
  assert.equal(denied.details.dataset.loaded, "true", "manual file selection continues the inline action");
  assert.equal(opens, 0);

  const stale = makeRoot();
  context.findForkSourceItem = async () => { context.activeWorkspaceSlotId = "another-tab"; return { item: item(source) }; };
  await context.expandForkSourceInline(stale.root);
  assert.equal(stale.body.innerHTML, "", "a late response must not attach to another tab");
  context.activeWorkspaceSlotId = "child-tab";
  const mismatch = makeRoot();
  context.findForkSourceItem = async () => ({ item: item(ancestor) });
  await context.expandForkSourceInline(mismatch.root);
  assert.match(mismatch.status.textContent, /does not match/);
  assert.equal(mismatch.body.innerHTML, "");

  const boundedPrefix = [
    { type: "session_meta", ordinal: 0, payload: { id: source, forked_from_id: ancestor,
      history_base: { thread_id: ancestor, end_ordinal_exclusive: 20, end_byte_offset: 4000 } } },
    { type: "response_item", ordinal: 1, payload: { type: "message", role: "user", content: [{ type: "input_text", text: "Inherited 中文 boundary" }] } }
  ].map(value => JSON.stringify(value)).join("\n") + "\n";
  const later = JSON.stringify({ type: "response_item", ordinal: 2, payload: { type: "message", role: "user", content: [{ type: "input_text", text: "Later parent branch must be excluded" }] } });
  sources.set(source, boundedPrefix + later);
  context.findForkSourceItem = async () => ({ item: item(source) });
  const bounded = makeRoot();
  bounded.root.dataset.historyEndOrdinal = "2";
  bounded.root.dataset.historyEndByte = String(Buffer.byteLength(boundedPrefix));
  const beforeBounded = vm.runInContext("lazyRolloutContentStore.size", context);
  await context.expandForkSourceInline(bounded.root);
  assert.equal(bounded.details.dataset.loaded, "true");
  const boundedLazy = Array.from(vm.runInContext("[...lazyRolloutContentStore.values()]", context).slice(beforeBounded)).join("\n");
  assert.match(boundedLazy, /Inherited 中文 boundary/);
  assert.doesNotMatch(boundedLazy, /Later parent branch/);
  assert.match(bounded.body.innerHTML, /data-history-end-ordinal="2"/, "a source's own parent inherits the enclosing cutoff");
  assert.doesNotMatch(bounded.body.innerHTML, /data-history-end-byte="4000"/);

  const ordinalOnly = makeRoot();
  ordinalOnly.root.dataset.historyEndOrdinal = "2";
  await context.expandForkSourceInline(ordinalOnly.root);
  assert.equal(ordinalOnly.details.dataset.loaded, "true", "ordinal-only fork boundaries also exclude later source turns");
  const emptyPrefix = makeRoot();
  emptyPrefix.root.dataset.historyEndOrdinal = "0";
  emptyPrefix.root.dataset.historyEndByte = "0";
  await context.expandForkSourceInline(emptyPrefix.root);
  assert.equal(emptyPrefix.details.dataset.loaded, "true");
  assert.match(emptyPrefix.body.innerHTML, /No inherited records/);
  const reversionId = "01a11b48-557d-7883-9bfe-dbe9fb2b5900";
  const reversion = makeRoot(reversionId);
  context.findForkSourceItem = async () => ({ item: {
    rolloutId: reversionId,
    source: { name: `rollout-2026-10-08T19-31-27-${source}_${reversionId}.jsonl`, getText: async () => boundedPrefix }
  } });
  await context.expandForkSourceInline(reversion.root);
  assert.equal(reversion.details.dataset.loaded, "true", "physical history bases match the filename rollout ID even when metadata keeps a different thread ID");
  console.log("Checked recursive inline fork rendering, lazy-store and DOM isolation, collapse reuse, cycles, permissions, manual fallback, and cancellation.");
}
