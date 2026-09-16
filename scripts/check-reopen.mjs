import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import vm from "node:vm";

export async function checkReopen() {
  const html = await readFile(new URL("../codex-rollout-viewer.html", import.meta.url), "utf8");
  const saved = new Map();
  const sources = new Map();
  const states = new Map();
  const views = new Map();
  const slotA = { id: "a", sourceId: "source-a", directoryId: "folder", label: "Original", autoRefreshMs: 5000 };
  const slotB = { id: "b", sourceId: "source-b", label: "Other" };
  const sourceA = { fileHandle: { name: "source-a.jsonl" } };
  const uiA = { details: { "turn-1:body": true }, diffModes: {} };
  sources.set("a", sourceA);
  states.set("a", uiA);
  views.set("a", { kind: "rollout", sourceId: slotA.sourceId });
  const selected = [];
  const context = vm.createContext({
    workspaceSlots: [slotA, slotB], closedWorkspaceTabs: [], reopeningWorkspaceTabs: false,
    CLOSED_WORKSPACE_TABS_KEY: "closed", CLOSED_WORKSPACE_TABS_LIMIT: 20,
    workspaceNavigationVersion: 0, activeWorkspaceSlotId: "a", activeWorkspaceViewKind: "rollout",
    currentRenderedSource: sourceA, currentRenderedUiState: uiA,
    selectedDirectoryEntry: null, openDirectoryTabIds: new Set(["folder"]), collapsedWorkspaceFolderIds: new Set(["folder"]),
    getWorkspaceTabLabel: slot => slot.id === "a" ? "Renamed title" : slot.label,
    getDirectoryEntryById: id => id === "folder" ? { id, label: "Sessions" } : null,
    getDirectoryEntryLabel: entry => entry.label,
    normalizeWorkspaceSlot: slot => ({ ...slot }),
    getSavedCurrentRollout: async id => sources.get(id),
    getSavedCurrentRolloutUiState: async id => states.get(id),
    getSavedCurrentView: async id => views.get(id),
    saveCurrentRollout: async (value, id) => sources.set(id, value),
    saveCurrentRolloutUiState: async (value, id) => states.set(id, value),
    saveCurrentView: async (value, id) => views.set(id, value),
    putStoredValue: async (key, value) => saved.set(key, value),
    saveWorkspaceSlots: async () => {}, saveWorkspaceNavigation: async () => {},
    persistCurrentRenderedUiState: async () => {}, installWorkspaceBar() {},
    deleteWorkspaceSlotState: async id => { sources.delete(id); states.delete(id); views.delete(id); },
    window: { alert(message) { throw new Error(message); } }
  });
  context.clearActiveWorkspaceSlotSelection = () => { context.activeWorkspaceSlotId = ""; };
  context.setActiveWorkspaceSlotId = async id => { context.activeWorkspaceSlotId = id; context.workspaceNavigationVersion += 1; };
  context.renderActiveWorkspaceView = async () => { selected.push(context.activeWorkspaceSlotId); context.activeWorkspaceViewKind = "rollout"; };
  context.activateWorkspaceSlot = async id => { await context.setActiveWorkspaceSlotId(id); await context.renderActiveWorkspaceView(); };
  context.renderDirectorySelectionPage = async () => { context.activeWorkspaceViewKind = "folders"; };
  context.openDirectoryTab = async id => { selected.push(id); context.activeWorkspaceViewKind = "index"; };
  for (const name of ["rememberClosedWorkspaceTabs", "reopenClosedWorkspaceTab", "handleReopenWorkspaceTabKeydown", "closeWorkspaceSlot", "closeAllWorkspaceSlots", "closeDirectoryTab", "leaveActiveRolloutView"]) {
    const match = html.match(new RegExp(`^    (?:async )?function ${name}\\([^]*?\\n    \\}`, "m"));
    assert.ok(match, `Missing ${name}`);
    vm.runInContext(match[0], context);
  }

  await context.closeWorkspaceSlot("a");
  assert.deepEqual(Array.from(context.workspaceSlots, slot => slot.id), ["b"]);
  assert.equal(sources.has("a"), false, "closing removes live slot state after archiving it");
  assert.equal(context.closedWorkspaceTabs[0].label, "Renamed title");
  assert.equal(saved.get("closed")[0].slots[0].source, sourceA, "archive retains the file handle for reload");
  await context.reopenClosedWorkspaceTab();
  assert.deepEqual(Array.from(context.workspaceSlots, slot => slot.id), ["a", "b"], "reopen restores the prior position");
  assert.equal(sources.get("a"), sourceA);
  assert.equal(states.get("a"), uiA);
  assert.equal(context.workspaceSlots[0].autoRefreshMs, 5000);
  assert.equal(context.activeWorkspaceSlotId, "a");
  assert.equal(context.closedWorkspaceTabs.length, 0);

  // Folder close is one history action, including its empty-folder form.
  context.activeWorkspaceViewKind = "index";
  context.selectedDirectoryEntry = { id: "folder" };
  await context.closeDirectoryTab("folder");
  assert.equal(context.openDirectoryTabIds.has("folder"), false);
  assert.equal(context.closedWorkspaceTabs.length, 1);
  await context.reopenClosedWorkspaceTab();
  assert.equal(context.openDirectoryTabIds.has("folder"), true);
  assert.equal(context.collapsedWorkspaceFolderIds.has("folder"), true);
  assert.equal(selected.at(-1), "folder");
  context.workspaceSlots = [slotB];
  await context.closeDirectoryTab("folder");
  assert.equal(context.closedWorkspaceTabs.at(-1).slots.length, 0);
  await context.reopenClosedWorkspaceTab();
  assert.equal(context.openDirectoryTabIds.has("folder"), true);

  // Close all is restored as one batch. Reopening an already reopened source reuses it.
  context.workspaceSlots = [slotA, slotB];
  context.activeWorkspaceViewKind = "rollout";
  context.activeWorkspaceSlotId = "b";
  await context.closeAllWorkspaceSlots();
  assert.equal(context.workspaceSlots.length, 0);
  assert.equal(context.closedWorkspaceTabs.at(-1).slots.length, 2);
  context.workspaceSlots = [{ ...slotA, id: "new-a" }];
  await context.reopenClosedWorkspaceTab();
  assert.equal(context.workspaceSlots.length, 2, "reopen must not duplicate a source opened in the meantime");
  assert.equal(context.activeWorkspaceSlotId, "b");

  // History survives reinitialization and is bounded without retaining parse caches.
  for (let index = 0; index < 22; index += 1) {
    await context.rememberClosedWorkspaceTabs([context.workspaceSlots[0]]);
  }
  assert.equal(context.closedWorkspaceTabs.length, 20);
  assert.ok(!("cache" in context.closedWorkspaceTabs[0].slots[0]));
  context.closedWorkspaceTabs = saved.get("closed").slice();
  assert.equal(context.closedWorkspaceTabs.length, 20);
  assert.match(html, /const closed = await getStoredValue\(CLOSED_WORKSPACE_TABS_KEY\)/);
  const beforeStale = context.closedWorkspaceTabs.length;
  const put = context.putStoredValue;
  let changed = false;
  context.putStoredValue = async (key, value) => {
    await put(key, value);
    if (!changed) { changed = true; context.workspaceNavigationVersion += 1; }
  };
  assert.equal(await context.rememberClosedWorkspaceTabs([context.workspaceSlots[0]]), false);
  assert.equal(context.closedWorkspaceTabs.length, beforeStale, "a stale close is removed without evicting a real closed tab");
  context.putStoredValue = put;
  let reopens = 0;
  context.reopenClosedWorkspaceTab = async () => { reopens += 1; };
  let prevented = false;
  context.handleReopenWorkspaceTabKeydown({ key: "T", ctrlKey: true, shiftKey: true, preventDefault() { prevented = true; } });
  assert.equal(reopens, 1);
  assert.equal(prevented, true);
  context.handleReopenWorkspaceTabKeydown({ key: "t", ctrlKey: true, shiftKey: false });
  assert.equal(reopens, 1);
  console.log("Checked reopen order, source and view-state restoration, folder batches, duplicate reuse, persisted history, and shortcut handling.");
}
