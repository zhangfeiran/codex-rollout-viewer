import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import vm from "node:vm";

export async function checkSessionIndex(realIndex, realRollout) {
  const html = await readFile(new URL("../codex-rollout-viewer.html", import.meta.url), "utf8");
  const id = "01a0a451-159b-7841-ba36-fbb432672af8";
  const line = (title, updated = "2026-10-16T01:00:00Z") => JSON.stringify({ id, thread_name: title, updated_at: updated });
  let text = [line("Old"), line("Newest <name>", "2026-10-16T02:00:00Z"), line("Out of order"), "{partial"].join("\n");
  let custom = "";
  let status = "";
  let saves = 0;
  const handle = { kind: "file", name: "session_index.jsonl", getFile: async () => ({ text: async () => text }) };
  const missing = async () => { throw new Error("Not found"); };
  const sessions = { kind: "directory", name: "sessions", getFileHandle: missing, getDirectoryHandle: missing };
  const home = { kind: "directory", name: ".codex", getFileHandle: async () => handle, getDirectoryHandle: async () => sessions };
  const entry = { id: "a", handle: sessions, codexHomeHandle: home };
  const context = vm.createContext({
    sessionTitleIndexes: new Map(), savedDirectoryEntries: [entry],
    normalizeMarkdownLinkDrive: () => "", createDirectoryEntryId: () => "new",
    hasReadPermission: async () => true,
    getCustomRolloutTitle: () => custom,
    getDirectoryEntryById: key => context.savedDirectoryEntries.find(entry => entry.id === key),
    saveDirectoryEntries: async entries => { saves++; context.savedDirectoryEntries = entries.map(context.normalizeDirectoryEntry); },
    activeWorkspaceViewKind: "rollout", selectedDirectoryEntry: entry,
    refreshRolloutTitleViews() {}, setStatus: value => { status = value; }
  });
  for (const name of ["normalizeRolloutUuid", "getSourceRolloutId", "normalizeDirectoryEntry", "parseSessionTitleIndex", "getPreferredRolloutTitle", "getRolloutDisplayTitle", "getWorkspaceTabLabel", "refreshSessionTitleIndex", "useSessionTitleIndexFile", "resolveSessionsDirectorySelection", "walkDirectoryHandle", "isJsonlFileName"]) {
    const match = html.match(new RegExp(`^    (?:async )?function\\*? ${name}\\([^]*?\\n    \\}`, "m"));
    assert.ok(match, `Missing ${name}`);
    vm.runInContext(match[0], context);
  }
  assert.equal(context.parseSessionTitleIndex(text).get(id).title, "Newest <name>");
  assert.equal(context.parseSessionTitleIndex(`${line("First")}\n${line("Last")}`).get(id).title, "Last");
  assert.equal(context.parseSessionTitleIndex('\ufeff' + line("BOM")).size, 1);
  assert.equal(context.parseSessionTitleIndex('{"id":"bad","thread_name":"bad"}\nnull\n{}').size, 0);
  const selection = await context.resolveSessionsDirectorySelection(home);
  assert.equal(selection.handle, sessions);
  assert.equal(selection.codexHomeHandle, home);
  assert.equal((await context.resolveSessionsDirectorySelection(sessions)).codexHomeHandle, null);
  await context.refreshSessionTitleIndex(entry);
  const target = { rolloutId: id, directoryId: "a", title: "Fallback", label: "Fallback" };
  assert.equal(context.getRolloutDisplayTitle(target), "Newest <name>", "parent index provides display titles");
  assert.equal(context.getWorkspaceTabLabel(target), "Newest <name>");
  assert.equal(context.getRolloutDisplayTitle({ ...target, directoryId: "b" }), "Fallback", "unrelated folders must not inherit another folder's index");
  assert.equal(context.getPreferredRolloutTitle({ rolloutId: id }), "Newest <name>", "forks and standalone files can resolve known UUIDs");
  custom = "Manual override";
  assert.equal(context.getRolloutDisplayTitle(target), custom);
  custom = "";
  assert.equal(context.getRolloutDisplayTitle(target), "Newest <name>");
  text = line("Renamed in Codex");
  await context.refreshSessionTitleIndex(entry);
  assert.equal(context.getWorkspaceTabLabel(target), "Renamed in Codex", "title-only edits refresh without a rollout edit");
  const inside = { ...sessions, getFileHandle: async () => handle };
  await context.refreshSessionTitleIndex({ id: "inside", handle: inside });
  assert.equal(context.getPreferredRolloutTitle({ ...target, directoryId: "inside" }), "Renamed in Codex");
  await context.refreshSessionTitleIndex({ id: "missing", handle: sessions });
  assert.equal(context.sessionTitleIndexes.get("missing").status, "Not found");
  await context.useSessionTitleIndexFile("a", await handle.getFile(), handle);
  assert.equal(saves, 1);
  const restored = context.savedDirectoryEntries[0];
  assert.equal(restored.sessionIndexHandle, handle, "chosen index handle survives directory normalization");
  assert.equal(restored.codexHomeHandle, home, "parent handle survives directory normalization");
  context.sessionTitleIndexes.clear();
  await context.refreshSessionTitleIndex(restored);
  assert.equal(context.getWorkspaceTabLabel(target), "Renamed in Codex", "a reopened folder reads its remembered file");
  const before = context.sessionTitleIndexes.get("a");
  await context.useSessionTitleIndexFile("a", { text: async () => "{}" }, handle);
  assert.equal(saves, 1, "invalid file must not replace the remembered handle");
  assert.equal(context.sessionTitleIndexes.get("a"), before);
  assert.match(status, /No Codex titles/);
  context.hasReadPermission = async () => false;
  await context.refreshSessionTitleIndex(restored);
  assert.equal(context.sessionTitleIndexes.get("a").status, "Needs permission");
  assert.equal(context.getWorkspaceTabLabel(target), "Renamed in Codex", "temporary permission loss retains the last readable titles");
  context.hasReadPermission = async () => true;
  text = "";
  await context.refreshSessionTitleIndex(restored);
  assert.equal(context.getRolloutDisplayTitle(target), "Fallback", "removed entries must clear stale titles");
  const paths = [];
  const indexOnly = { async *entries() { yield ["session_index.jsonl", handle]; } };
  for await (const source of context.walkDirectoryHandle(indexOnly)) paths.push(source);
  assert.equal(paths.length, 0, "the title index is not a rollout");
  if (realIndex) {
    const titles = context.parseSessionTitleIndex(await readFile(realIndex, "utf8"));
    assert.ok(titles.size > 0);
    if (realRollout) {
      const first = JSON.parse((await readFile(realRollout, "utf8")).split(/\r?\n/)[0]);
      const rolloutId = first.payload.id;
      assert.ok(titles.has(rolloutId), "real rollout UUID must match a real Codex index entry");
      context.sessionTitleIndexes.set("real", { titles });
      assert.equal(context.getPreferredRolloutTitle({ directoryId: "real", rolloutId }), titles.get(rolloutId).title);
    }
    console.log(`Checked real Codex session index with ${titles.size} titles${realRollout ? " and a matching rollout" : ""}.`);
  }
  console.log("Checked Codex title index parsing, discovery, folder isolation, refresh, fallback, permissions, and handle persistence.");
}
