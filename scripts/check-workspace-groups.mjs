import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import vm from "node:vm";

export async function checkWorkspaceGroups() {
  const html = await readFile(new URL("../codex-rollout-viewer.html", import.meta.url), "utf8");
  const folders = new Map([
    ["a", { id: "a", label: "Folder A" }],
    ["b", { id: "b", label: "Folder B" }],
    ["empty", { id: "empty", label: "Empty folder" }]
  ]);
  const slots = [
    { id: "a1", directoryId: "a", label: "First", hasUpdates: true },
    { id: "b1", directoryId: "b", label: "Second", refreshState: "refreshing" },
    { id: "a2", directoryId: "a", label: "Third", refreshState: "error" },
    { id: "loose", label: "Loose file" },
    { id: "orphan", directoryId: "forgotten", directoryLabel: 'Old <folder> "name"', label: "Orphan" }
  ];
  const storage = new Map();
  let installs = 0;
  const context = vm.createContext({
    activeWorkspaceViewKind: "rollout",
    activeWorkspaceSlotId: "a1",
    workspaceNavigationVersion: 0,
    workspaceSlots: slots.slice(),
    openDirectoryTabIds: new Set(["a", "empty"]),
    collapsedWorkspaceFolderIds: new Set(),
    selectedDirectoryEntry: null,
    currentRenderedSource: { id: "source-a1" },
    currentRenderedUiState: { scrollTop: 150 },
    WORKSPACE_NAVIGATION_KEY: "navigation",
    sessionStorage: { getItem: key => storage.get(key), setItem: (key, value) => storage.set(key, value) },
    getDirectoryEntryById: id => folders.get(id),
    getDirectoryEntryLabel: entry => entry.label,
    getFolderTabColor: () => "#55aaff",
    getCustomRolloutTitle: slot => slot.id === "a1" ? "Custom title" : "",
    installWorkspaceBar() { installs += 1; },
    CSS: { escape: value => value },
    URL,
    location: { href: "https://viewer.test/" },
    history: { replaceState() {} },
    getWorkspaceSlotUrlId: slot => slot?.id || ""
  });
  context.getWorkspaceSlot = (id = context.activeWorkspaceSlotId) => context.workspaceSlots.find(slot => slot.id === id);
  for (const name of ["escapeHtml", "escapeAttribute", "getWorkspaceTabLabel", "workspaceIcon", "getActiveWorkspaceTabKey", "getVisibleWorkspaceTabKey", "workspaceTabAttributes", "getWorkspaceFolderGroups", "renderWorkspaceRolloutTab", "renderWorkspaceFolderGroup", "renderWorkspaceTabs", "setWorkspaceFolderCollapsed", "getVisibleWorkspaceTabs", "handleWorkspaceTabKeydown", "focusWorkspaceControl", "normalizeWorkspaceNavigation", "saveWorkspaceNavigation", "getLocalWorkspaceNavigation", "closeDirectoryTab", "leaveActiveRolloutView", "restoreInitialWorkspaceView"]) {
    const indent = name.startsWith("escape") ? "" : "    ";
    const match = html.match(new RegExp(`^${indent}(?:async )?function ${name}\\([^]*?\\n${indent}\\}`, "m"));
    assert.ok(match, `Missing ${name}`);
    vm.runInContext(match[0], context);
  }

  let groups = context.getWorkspaceFolderGroups();
  assert.deepEqual(Array.from(groups, group => [group.id, Array.from(group.slots, slot => slot.id)]), [
    ["a", ["a1", "a2"]], ["empty", []], ["b", ["b1"]], ["forgotten", ["orphan"]]
  ], "grouping includes empty open folders and implicit source folders, preserving child order");
  const groupHtml = context.renderWorkspaceFolderGroup(groups[0]);
  assert.match(groupHtml, /has-active-rollout is-error/, "folder summaries expose hidden active and error states");
  assert.match(groupHtml, /2 open rollouts; contains active rollout; refresh failed/);
  assert.match(groupHtml, /standalone-workspace-folder-children[^]*Custom title[^]*Third/, "renamed rollouts render inside their folder");
  assert.doesNotMatch(groupHtml, /Loose file|Second/, "a folder must contain only its own rollout tabs");
  assert.match(context.renderWorkspaceFolderGroup(groups[1]), /disabled[^]*folder-children[^>]*hidden/, "empty groups have no actionable collapse control");
  assert.match(context.renderWorkspaceFolderGroup(groups[2]), /is-refreshing/);
  assert.match(context.renderWorkspaceFolderGroup(groups[3]), /Old &lt;folder&gt; &quot;name&quot;/, "forgotten folder labels remain escaped and reachable");
  const allTabs = context.renderWorkspaceTabs();
  for (const slot of slots) assert.equal(allTabs.split(`data-workspace-slot-id="${slot.id}"`).length - 1, 1, "each rollout appears exactly once");
  assert.match(allTabs, /Standalone rollouts[^]*Loose file/);
  context.openDirectoryTabIds.delete("a");
  assert.equal(context.getWorkspaceFolderGroups().find(group => group.id === "a").slots.length, 2, "closing the index does not ungroup its rollouts");

  assert.deepEqual(Array.from(context.normalizeWorkspaceNavigation({}).collapsedFolderIds), [], "legacy navigation starts expanded");
  assert.deepEqual(Array.from(context.normalizeWorkspaceNavigation({ collapsedFolderIds: ["a", "a", null, "b"] }).collapsedFolderIds), ["a", "b"]);
  context.setWorkspaceFolderCollapsed("a", true);
  assert.equal(installs, 1);
  assert.deepEqual(JSON.parse(storage.get("navigation")).collapsedFolderIds, ["a"]);
  assert.equal(context.getVisibleWorkspaceTabKey(), "directory:a", "a collapsed active child uses its visible parent as the keyboard entry");
  groups = context.getWorkspaceFolderGroups();
  const collapsedHtml = context.renderWorkspaceFolderGroup(groups.find(group => group.id === "a"));
  assert.match(collapsedHtml, /aria-expanded="false"/);
  assert.match(collapsedHtml, /folder-children[^>]*hidden/);
  assert.match(collapsedHtml, /tabindex="0" data-workspace-key="directory:a"/);
  assert.match(collapsedHtml, /aria-selected="true" tabindex="-1" data-workspace-key="rollout:a1"/);
  assert.match(html, /folder-children\[hidden\]\s*\{\s*display: none/, "flex styles must not override hidden children");

  // Restore the stored folder preference before the first content render.
  context.getSavedWorkspaceNavigation = context.getLocalWorkspaceNavigation;
  context.getRequestedRolloutId = () => "";
  context.getWorkspaceSlotByRolloutId = () => null;
  context.setActiveWorkspaceSlotId = async id => { context.activeWorkspaceSlotId = id; };
  let restoredCollapsed = false;
  context.renderActiveWorkspaceView = async () => { restoredCollapsed = context.collapsedWorkspaceFolderIds.has("a"); };
  context.collapsedWorkspaceFolderIds.clear();
  await context.restoreInitialWorkspaceView();
  assert.equal(restoredCollapsed, true, "reload restores folder collapse before rendering the selected rollout");
  assert.match(html, /const popupNavigation = normalizeWorkspaceNavigation\([^]*?collapsedFolderIds: \[\.\.\.collapsedWorkspaceFolderIds\]/, "independent windows inherit initial collapse preferences");

  // Keyboard movement skips hidden children and supports parent/child movement.
  let focused = "";
  const makeTab = (key, folderId = "", slotId = "") => ({
    dataset: { workspaceKey: key, workspaceSlotId: slotId },
    tabIndex: -1,
    closest(selector) {
      if (selector === "[hidden]") return slotId && context.collapsedWorkspaceFolderIds.has(folderId) ? {} : null;
      if (selector === "[data-workspace-folder]") return folderId ? { dataset: { workspaceFolder: folderId } } : null;
      return this;
    },
    matches: () => true,
    focus() { focused = key; },
    scrollIntoView() {}
  });
  const tabs = [makeTab("folders"), makeTab("directory:a", "a"), makeTab("rollout:a1", "a", "a1"), makeTab("rollout:a2", "a", "a2"), makeTab("directory:b", "b")];
  context.document = {
    querySelectorAll: () => tabs,
    querySelector: selector => tabs.find(tab => selector === `[data-workspace-key="${tab.dataset.workspaceKey}"]`)
  };
  const press = (index, key) => context.handleWorkspaceTabKeydown({ target: tabs[index], key, preventDefault() {} });
  press(1, "ArrowDown");
  assert.equal(focused, "directory:b", "Down skips collapsed rollout tabs");
  context.focusWorkspaceControl("rollout:a1");
  assert.equal(focused, "directory:a", "restoring hidden focus falls back to its folder");
  press(1, "ArrowRight");
  assert.equal(context.collapsedWorkspaceFolderIds.has("a"), false);
  assert.equal(focused, "directory:a");
  press(1, "ArrowRight");
  assert.equal(focused, "rollout:a1");
  press(2, "ArrowLeft");
  assert.equal(focused, "directory:a");
  press(1, "ArrowLeft");
  assert.equal(context.collapsedWorkspaceFolderIds.has("a"), true);

  // Closing one group must preserve unrelated content and all its slot settings.
  const deleted = [];
  let folderRenders = 0;
  const persisted = [];
  context.rememberClosedWorkspaceTabs = async () => true;
  context.persistCurrentRenderedUiState = async id => { persisted.push(id); };
  context.saveWorkspaceSlots = async () => {};
  context.deleteWorkspaceSlotState = async id => { deleted.push(id); };
  context.clearActiveWorkspaceSlotSelection = () => { context.activeWorkspaceSlotId = ""; };
  context.renderDirectorySelectionPage = async () => { folderRenders += 1; };
  context.activeWorkspaceSlotId = "b1";
  context.currentRenderedSource = { id: "source-b1" };
  const source = context.currentRenderedSource;
  await context.closeDirectoryTab("a");
  assert.deepEqual(deleted, ["a1", "a2"]);
  assert.deepEqual(Array.from(context.workspaceSlots, slot => slot.id), ["b1", "loose", "orphan"]);
  assert.equal(context.workspaceSlots[0], slots[1], "other slot refresh metadata is retained by identity");
  assert.equal(context.currentRenderedSource, source, "closing a background group preserves the active content");
  assert.equal(context.activeWorkspaceSlotId, "b1");
  assert.equal(folderRenders, 0);
  assert.equal(context.collapsedWorkspaceFolderIds.has("a"), false);
  await context.closeDirectoryTab("b");
  assert.equal(folderRenders, 1, "closing the visible group returns to Sessions folders");
  assert.equal(context.activeWorkspaceViewKind, "folders");
  assert.equal(context.currentRenderedSource, null);
  assert.deepEqual(persisted, ["b1"]);
  assert.deepEqual(deleted, ["a1", "a2", "b1"]);
  assert.deepEqual(Array.from(context.workspaceSlots, slot => slot.id), ["loose", "orphan"]);
  assert.ok(folders.has("b"), "closing tabs does not forget the source folder");
  await context.closeDirectoryTab("empty");
  assert.equal(context.openDirectoryTabIds.has("empty"), false, "empty folder groups remain closeable");

  // A newer navigation wins if UI-state persistence was still pending.
  context.workspaceSlots = slots.slice();
  context.activeWorkspaceSlotId = "a1";
  context.activeWorkspaceViewKind = "rollout";
  context.currentRenderedSource = { id: "a1" };
  let release;
  context.persistCurrentRenderedUiState = () => new Promise(resolve => { release = resolve; });
  const closing = context.closeDirectoryTab("a");
  context.workspaceNavigationVersion += 1;
  context.activeWorkspaceSlotId = "b1";
  context.currentRenderedSource = source;
  release();
  await closing;
  assert.equal(context.workspaceSlots.length, slots.length);
  assert.equal(context.currentRenderedSource, source, "a stale close does not clear newly selected content");
  assert.equal(folderRenders, 1);
  console.log("Checked folder grouping, status summaries, collapse persistence, keyboard hierarchy, and isolated group closing.");
}
