import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import vm from "node:vm";

export async function checkWorkspace() {
  const html = await readFile(new URL("../codex-rollout-viewer.html", import.meta.url), "utf8");
  const renderer = await readFile(new URL("../rollout-renderer.js", import.meta.url), "utf8");
  assert.doesNotMatch(html + renderer, /rollout-sidebar|renderSidebar|rollout-tree|openSidebarRolloutTarget|rollout-nav-wrap/, "the rollout outline must be removed, including styles and event handlers");
  assert.match(html, /role="tablist"[^>]*aria-orientation="vertical"/, "workspace navigation must expose vertical tabs");
  assert.match(renderer, /class="rollout-view-controls"[\s\S]*data-rollout-collapse-level-zero/, "the renderer must supply reusable content controls");

  const stored = new Map();
  let narrow = false;
  const context = vm.createContext({
    WORKSPACE_TABS_COLLAPSED_KEY: "tabs-collapsed",
    localStorage: { getItem: key => stored.get(key) ?? null, setItem: (key, value) => stored.set(key, value) },
    window: { matchMedia: () => ({ matches: narrow }) },
    activeWorkspaceViewKind: "folders",
    activeWorkspaceSlotId: "slot-b",
    openDirectoryTabIds: new Set(["folder-a"]),
    selectedDirectoryEntry: { id: "folder-a" },
    workspaceSlots: [
      { id: "slot-a", label: 'One <script> & "quoted"', directoryId: "folder-a", hasUpdates: true },
      { id: "slot-b", label: "Two", refreshState: "refreshing" },
      { id: "slot-c", label: "Three", refreshState: "error", refreshMessage: "Read failed" }
    ],
    getDirectoryEntryById: id => id === "folder-a" ? { id, label: "Sessions A" } : null,
    getDirectoryEntryLabel: entry => entry.label,
    getFolderTabColor: () => "#55aaff",
    CSS: { escape: value => value }
  });
  for (const name of ["escapeHtml", "escapeAttribute", "getWorkspaceTabLabel", "readWorkspaceTabsCollapsed", "toggleWorkspaceTabs", "workspaceIcon", "getActiveWorkspaceTabKey", "renderWorkspaceTabs", "handleWorkspaceTabKeydown", "focusWorkspaceControl", "installWorkspaceBar", "formatWorkspaceRefreshOption"]) {
    const indent = name.startsWith("escape") ? "" : "    ";
    const match = html.match(new RegExp(`^${indent}function ${name}\\([^]*?\\n${indent}\\}`, "m"));
    assert.ok(match, `Missing ${name}`);
    vm.runInContext(match[0], context);
  }

  assert.equal(context.readWorkspaceTabsCollapsed(), false, "wide screens start pinned");
  narrow = true;
  assert.equal(context.readWorkspaceTabsCollapsed(), true, "narrow screens start as an icon rail");
  stored.set("tabs-collapsed", "false");
  assert.equal(context.readWorkspaceTabsCollapsed(), false, "an explicit preference survives reload on a narrow screen");
  stored.set("tabs-collapsed", "true");
  narrow = false;
  assert.equal(context.readWorkspaceTabsCollapsed(), true, "a collapsed preference survives reload on a wide screen");
  const storage = context.localStorage;
  context.localStorage = { getItem() { throw new Error("Storage unavailable"); } };
  assert.equal(context.readWorkspaceTabsCollapsed(), false, "blocked storage must not prevent startup");
  context.localStorage = storage;

  const chooseFile = html.match(/    async function chooseJsonlFile\([^]*?\n    \}/);
  vm.runInContext(chooseFile[0], context);
  let filePickerOpened = false;
  context.document = { querySelector: () => ({ click() { filePickerOpened = true; } }) };
  await context.chooseJsonlFile();
  assert.equal(filePickerOpened, true, "Open JSONL uses the file input when the handle picker is unavailable");

  for (const [kind, key] of [["folders", "folders"], ["index", "directory:folder-a"], ["rollout", "rollout:slot-b"]]) {
    context.activeWorkspaceViewKind = kind;
    const tabsHtml = context.renderWorkspaceTabs();
    const tabs = [...tabsHtml.matchAll(/<button[^>]*role="tab"[^>]*>/g)].map(match => match[0]);
    assert.equal(tabs.length, 5, "every open folder and rollout must be reachable");
    const selected = tabs.filter(tab => tab.includes('aria-selected="true"'));
    assert.equal(selected.length, 1, "only the visible view is selected");
    assert.ok(selected[0].includes(`data-workspace-key="${key}"`));
    assert.equal(tabs.filter(tab => tab.includes('tabindex="0"')).length, 1, "the tab list has one keyboard entry point");
    assert.match(tabsHtml, /One &lt;script&gt; &amp;/, "file labels must be escaped");
    assert.doesNotMatch(tabsHtml, /<script>/);
    assert.match(tabsHtml, /--rollout-accent: #55aaff/, "folder rollouts retain their source color");
    assert.match(tabsHtml, /has-updates/);
    assert.match(tabsHtml, /; refreshing/);
    assert.match(tabsHtml, /; refresh failed/);
  }
  const slots = context.workspaceSlots;
  context.workspaceSlots = [];
  context.openDirectoryTabIds.clear();
  context.activeWorkspaceViewKind = "folders";
  assert.equal((context.renderWorkspaceTabs().match(/role="tab"/g) || []).length, 1, "an empty workspace retains its folders tab without synthetic rollouts");
  context.workspaceSlots = slots;

  let focused = -1;
  const tabs = Array.from({ length: 3 }, (_, index) => ({
    tabIndex: index === 0 ? 0 : -1,
    closest() { return this; },
    focus() { focused = index; },
    scrollIntoView() {}
  }));
  context.document = { querySelectorAll: () => tabs };
  for (const [index, key, expected] of [[0, "ArrowUp", 2], [2, "ArrowDown", 0], [1, "Home", 0], [1, "End", 2]]) {
    let prevented = false;
    context.handleWorkspaceTabKeydown({ target: tabs[index], key, preventDefault() { prevented = true; } });
    assert.equal(focused, expected);
    assert.equal(prevented, true);
    assert.deepEqual(tabs.map(tab => tab.tabIndex), tabs.map((tab, position) => position === expected ? 0 : -1));
  }
  focused = -1;
  context.handleWorkspaceTabKeydown({ target: tabs[0], key: "ArrowDown", ctrlKey: true });
  assert.equal(focused, -1, "modified shortcuts stay available to the browser");

  // Exercise repeated navigation installs, as used by background refreshes.
  const children = [];
  const content = { className: "codex-rollout" };
  children.push(content);
  let scrolls = 0;
  const focusCalls = [];
  const control = { matches: () => false, focus: () => focusCalls.push("refresh") };
  const rolloutControls = {};
  const makeNode = () => ({
    dataset: {},
    tabs: { scrollTop: 0 },
    actions: { prepend(node) { this.controls = node; } },
    setAttribute() {},
    querySelector(selector) {
      if (selector === ".standalone-workspace-actions") return this.actions;
      return selector === ".standalone-workspace-tabs" ? this.tabs : { scrollIntoView: () => { scrolls += 1; } };
    },
    remove() { children.splice(children.indexOf(this), 1); }
  });
  context.document = {
    documentElement: { dataset: {} },
    activeElement: { dataset: {} },
    getElementById: () => ({}),
    createElement: makeNode,
    querySelector(selector) {
      if (selector === ".rollout-view-controls") return rolloutControls;
      return selector.startsWith("[data-workspace-key=") ? control
        : children.find(child => `.${child.className}` === selector) || null;
    },
    body: { prepend: (...nodes) => children.unshift(...nodes) }
  };
  Object.assign(context, {
    workspaceInitialized: true,
    workspaceTabsCollapsed: false,
    AUTO_REFRESH_INTERVALS: [0, 2000],
    currentRenderedSource: null,
    getWorkspaceSlot: () => slots[1]
  });
  context.installWorkspaceBar();
  const bar = children[0];
  assert.equal(children[1].actions.controls, undefined, "folder pages must not show rollout content controls");
  assert.equal(children.length, 3);
  assert.equal(children[2], content, "installing navigation preserves the visible content");
  assert.equal(scrolls, 1, "a newly installed pane reveals its active tab");
  bar.tabs.scrollTop = 240;
  context.document.activeElement.dataset.workspaceKey = "refresh";
  context.installWorkspaceBar();
  assert.equal(children.length, 3, "refresh must replace navigation instead of duplicating it");
  assert.equal(children[0].tabs.scrollTop, 240, "background updates preserve the tab pane scroll position");
  assert.equal(scrolls, 1, "background updates must not force the pane back to the active tab");
  assert.deepEqual(focusCalls, ["refresh"], "background updates restore the focused workspace control");
  context.toggleWorkspaceTabs();
  assert.equal(stored.get("tabs-collapsed"), "true");
  assert.equal(context.document.documentElement.dataset.workspaceTabsCollapsed, "true");
  assert.equal(children[2], content, "collapsing navigation must not rerender rollout content");
  context.activeWorkspaceViewKind = "rollout";
  context.installWorkspaceBar();
  assert.equal(scrolls, 2, "switching views reveals the newly active tab");
  assert.equal(children[1].actions.controls, rolloutControls, "rollout controls move into the top toolbar");
  context.installWorkspaceBar();
  assert.equal(children[1].actions.controls, rolloutControls, "toolbar refresh preserves the existing control nodes and their click handlers");
  console.log("Checked vertical tab selection, keyboard navigation, collapse persistence, focus, and independent pane scrolling.");
}
