import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import vm from "node:vm";

export async function checkRolloutTitles() {
  const html = await readFile(new URL("../codex-rollout-viewer.html", import.meta.url), "utf8");
  const names = ["escapeHtml", "escapeAttribute", "normalizeRolloutUuid", "getSourceRolloutId", "getSourceStateId", "getRolloutTitleStorageKey", "getCustomRolloutTitle", "getRolloutDisplayTitle", "getWorkspaceTabLabel", "updateRenderedRolloutTitle", "refreshRolloutTitleViews", "editRolloutTitle", "handleRolloutTitleStorageChange", "renameWorkspaceSlot", "getSortValue", "compareSortValues", "getSortedIndexItems", "renderRolloutTable"];
  const functions = names.map(name => {
    const indent = name.startsWith("escape") ? "" : "    ";
    const match = html.match(new RegExp(`^${indent}(?:async )?function ${name}\\([^]*?\\n${indent}\\}`, "m"));
    assert.ok(match, `Missing ${name}`);
    return match[0];
  }).join("\n");
  const stored = new Map();
  const localStorage = {
    getItem: key => stored.get(key) ?? null,
    setItem: (key, value) => stored.set(key, value),
    removeItem: key => stored.delete(key)
  };
  const uuid = "01a0a451-159b-7841-ba36-fbb432672af8";
  const source = { directoryId: "folder-a", path: "2026/session.jsonl", name: "session.jsonl", rolloutId: uuid };
  const item = { id: "row-a", source, title: "Original question", sessionId: uuid };
  const slot = { id: "slot-a", sourceId: "folder-a::2026/session.jsonl", rolloutId: uuid, label: "Original tab" };
  let input = null;
  let updates = 0;
  let searchUpdates = 0;
  const alerts = [];
  const heading = { textContent: "Codex Rollout original", dataset: {} };
  const table = { scrollLeft: 240, outerHTML: "" };
  const context = vm.createContext({
    localStorage,
    ROLLOUT_TITLE_KEY_PREFIX: "viewer:rollout-title-v1:",
    window: { prompt: () => input, alert: message => alerts.push(message) },
    currentRenderedSource: source,
    activeWorkspaceViewKind: "rollout",
    currentContentSearch: { root: { isConnected: true } },
    rolloutIndex: [item],
    indexSort: { key: "title", direction: "asc" },
    getWorkspaceSlot: id => id === slot.id ? slot : null,
    getFilteredIndexItems: items => items,
    renderSortHeader: () => "", formatDateTime: () => "", renderStatsCell: () => "", workspaceIcon: () => "",
    document: {
      title: "Original browser title",
      querySelector: selector => selector === ".rollout-hero h1" ? heading : selector === ".standalone-table-wrap" ? table : null
    },
    installWorkspaceBar() { updates += 1; context.updateRenderedRolloutTitle(); },
    renderContentSearchResults() { searchUpdates += 1; }
  });
  vm.runInContext(functions, context);
  assert.match(html, /data-edit-rollout-title=/, "folder rows must expose title editing");
  assert.match(html, /data-edit-current-rollout-title/, "rollout toolbar must expose title editing");

  input = '  New <title> & "name"  ';
  context.editRolloutTitle(item);
  const customTitle = 'New <title> & "name"';
  assert.equal(context.getWorkspaceTabLabel(slot), customTitle, "an already open tab immediately uses the file title");
  assert.equal(context.getRolloutDisplayTitle(item), customTitle);
  assert.equal(heading.textContent, customTitle);
  assert.equal(context.document.title, customTitle);
  assert.equal(item.title, "Original question", "custom titles do not overwrite cached original titles");
  assert.equal(slot.label, "Original tab", "titles belong to rollouts, independently of tab lifetime");
  assert.equal(searchUpdates, 1, "visible search results refresh their title labels");
  const otherSlot = { ...slot, id: "independent-window-slot" };
  assert.equal(context.getWorkspaceTabLabel(otherSlot), customTitle, "cloned tabs share the rollout title");
  assert.equal(context.getCustomRolloutTitle({ ...source, directoryId: "folder-b", path: "copied.jsonl" }), customTitle, "rollout UUIDs identify the same rollout across entrypoints");
  assert.equal(context.getCustomRolloutTitle({ ...source, rolloutId: "01a0a451-159b-7841-ba36-fbb432672af9" }), "", "different rollouts with the same filename keep independent titles");

  const reopened = vm.createContext({ localStorage, ROLLOUT_TITLE_KEY_PREFIX: context.ROLLOUT_TITLE_KEY_PREFIX });
  vm.runInContext(functions, reopened);
  assert.equal(reopened.getCustomRolloutTitle({ ...source }), customTitle, "title persistence survives a fresh viewer context and a new file source");
  context.activeWorkspaceViewKind = "index";
  context.refreshRolloutTitleViews();
  assert.match(table.outerHTML, /New &lt;title&gt; &amp; &quot;name&quot;/);
  assert.doesNotMatch(table.outerHTML, /New <title>/, "custom title markup must remain plain text");
  assert.equal(table.scrollLeft, 240, "renaming retains the folder table's horizontal scroll position");
  assert.equal(context.getSortValue(item, "title"), customTitle, "title sorting uses the visible custom name");

  const countBeforeCancel = updates;
  input = null;
  context.editRolloutTitle(item);
  assert.equal(updates, countBeforeCancel, "cancel must not change storage or rerender the view");
  assert.equal(context.getCustomRolloutTitle(source), customTitle);
  context.activeWorkspaceViewKind = "rollout";
  input = "Renamed from tab";
  await context.renameWorkspaceSlot(slot.id);
  assert.equal(context.getRolloutDisplayTitle(item), input, "double-click tab editing changes the shared rollout title");
  input = "  ";
  context.editRolloutTitle(slot);
  assert.equal(context.getRolloutDisplayTitle(item), "Original question");
  assert.equal(context.getWorkspaceTabLabel(slot), "Original tab");
  assert.equal(heading.textContent, "Codex Rollout original");
  assert.equal(context.document.title, "Original browser title", "clearing restores the original document title even after repeated renames");

  const noUuid = { directoryId: "folder-a", path: "custom.jsonl", name: "custom.jsonl" };
  input = "Title without UUID";
  context.editRolloutTitle(noUuid);
  assert.equal(context.getCustomRolloutTitle({ ...noUuid }), input);
  assert.equal(context.getCustomRolloutTitle({ ...noUuid, directoryId: "folder-b" }), "", "fallback file identities include the source directory");
  const countBeforeStorageEvent = updates;
  const titleKey = context.getRolloutTitleStorageKey(source);
  stored.set(titleKey, "Edited in another window");
  context.handleRolloutTitleStorageChange({ storageArea: localStorage, key: titleKey });
  assert.equal(heading.textContent, "Edited in another window");
  assert.equal(updates, countBeforeStorageEvent + 1);
  context.handleRolloutTitleStorageChange({ storageArea: localStorage, key: "unrelated" });
  assert.equal(updates, countBeforeStorageEvent + 1, "unrelated storage changes do not redraw the viewer");

  context.localStorage = { ...localStorage, setItem() { throw new Error("Storage full"); } };
  input = "Will not save";
  context.editRolloutTitle(source);
  assert.equal(alerts.length, 1, "storage failures must be visible to the user");
  assert.equal(stored.get(titleKey), "Edited in another window", "failed saves retain the previous title");
  console.log("Checked rollout title persistence, tab and header updates, reset, isolation, sorting, escaping, and cross-window changes.");
}
