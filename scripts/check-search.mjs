import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { pathToFileURL } from "node:url";
import vm from "node:vm";
import { createRolloutSearchEntries, findRolloutSearchMatches, parseCodexRolloutJsonl, isCodexRolloutRecords, ROLLOUT_SEARCH_CATEGORIES } from "../rollout-renderer.js";

const message = (role, text, turn_id = "turn-a") => ({ type: "response_item", payload: { type: "message", role, turn_id, content: [{ type: "input_text", text }] } });
const asJsonl = values => values.map(value => JSON.stringify(value)).join("\n");
const literal = "Needle.+[x] 中文 <script>";
const fixture = [
  { type: "session_meta", payload: { id: "session-a", cwd: "/test" } },
  { type: "event_msg", payload: { type: "user_message", turn_id: "turn-a", message: literal } },
  message("user", literal),
  message("assistant", literal),
  { type: "response_item", payload: { type: "reasoning", summary: [{ type: "summary_text", text: literal }], encrypted_content: "opaque-only" } },
  { type: "response_item", payload: { type: "function_call", name: "exec_command", call_id: "call-a", arguments: JSON.stringify({ cmd: literal, data: "tool-data-value" }) } },
  { type: "response_item", payload: { type: "function_call_output", call_id: "call-a", output: [{ type: "input_text", text: `${literal}${"x".repeat(125000)} deep-tail-only` }] } },
  message("system", literal),
  message("user", "<environment_context>context-only</environment_context>"),
  message("assistant", "analysis-only"),
  message("user", literal, "turn-b"),
  { type: "response_item", payload: { type: "custom_tool_call", name: "exec", input: "custom-input-only", call_id: "call-b" } },
  { type: "response_item", payload: { type: "custom_tool_call_output", call_id: "call-b", output: { data: { output: "custom-output-only" } } } }
];
fixture[9].payload.channel = "analysis";

function makeSource(directoryId, text = asJsonl(fixture)) {
  return {
    directoryId, directoryLabel: directoryId, name: "rollout.jsonl", path: "2026/rollout.jsonl",
    text, reads: 0, size: text.length, lastModified: 1,
    async getText() { this.reads += 1; return this.text; },
    async getMetadata() { return { size: this.size, lastModified: this.lastModified }; }
  };
}

function makeRoot() {
  const nodes = new Map();
  return {
    isConnected: true, attributes: new Map(),
    querySelector(selector) {
      if (!nodes.has(selector)) nodes.set(selector, { textContent: "", innerHTML: "", replaceChildren() { this.innerHTML = ""; } });
      return nodes.get(selector);
    },
    setAttribute(key, value) { this.attributes.set(key, value); },
    removeAttribute(key) { this.attributes.delete(key); }
  };
}

export async function checkContentSearch() {
  const parsed = parseCodexRolloutJsonl(asJsonl(fixture));
  const entries = createRolloutSearchEntries(parsed.records);
  const allCategories = ROLLOUT_SEARCH_CATEGORIES.map(category => category.id);
  const find = (query, categories) => [...findRolloutSearchMatches(entries, query, categories)];
  assert.deepEqual(find(literal).map(match => [match.line, match.category]), [[3, "user"], [4, "assistant"], [11, "user"]], "default search must deduplicate mirrored messages while retaining identical messages from distinct turns");
  assert.deepEqual(find(literal, allCategories).map(match => match.category), ["user", "assistant", "reasoning", "tool_input", "tool_output", "system", "user"]);
  assert.equal(find("needle.+[x] 中文 <SCRIPT>").length, 3, "search must treat regex syntax literally and match Chinese and case-insensitive text");
  assert.equal(find(" ").length, 0);
  assert.equal(find(literal, []).length, 0, "deselecting every category must not fall back to the default categories");
  assert.equal(find("deep-tail-only", ["tool_output"])[0].line, 7, "search must include tool output past the renderer's truncation limit");
  assert.ok(find("deep-tail-only", ["tool_output"])[0].offset > 120000, "source previews must be able to identify hits beyond rendered content");
  assert.equal(find("tool-data-value", ["tool_input"])[0].line, 6);
  assert.equal(find("custom-output-only", ["tool_output"])[0].line, 13, "structured tool data must remain searchable");
  assert.equal(find("custom-input-only", ["tool_input"])[0].line, 12);
  assert.equal(find("context-only").length, 0);
  assert.equal(find("context-only", ["system"])[0].line, 9);
  assert.equal(find("analysis-only").length, 0);
  assert.equal(find("analysis-only", ["reasoning"])[0].line, 10);
  assert.equal(find("opaque-only", allCategories).length, 0, "encrypted reasoning data must not be indexed as visible text");
  const reasoning = createRolloutSearchEntries(parseCodexRolloutJsonl(asJsonl([
    { type: "response_item", payload: { type: "reasoning", summary: [], content: [{ type: "reasoning_text", text: "visible-reasoning" }] } }
  ])).records);
  assert.equal([...findRolloutSearchMatches(reasoning, "visible-reasoning", ["reasoning"])].length, 1, "an empty reasoning summary must not hide visible reasoning content");
  const localCompact = createRolloutSearchEntries(parseCodexRolloutJsonl(asJsonl([
    { ...message("assistant", "compact-handoff"), payload: { ...message("assistant", "compact-handoff").payload, phase: "final_answer" } },
    { type: "compacted", payload: { message: "compact-bridge" } }
  ])).records);
  assert.equal([...findRolloutSearchMatches(localCompact, "compact-handoff")].length, 0, "compact handoffs belong to context, not default assistant-message results");
  assert.equal([...findRolloutSearchMatches(localCompact, "compact-handoff", ["system"])].length, 1);

  const html = await readFile(new URL("../codex-rollout-viewer.html", import.meta.url), "utf8");
  const functions = html.slice(html.indexOf("    function getContentSearchScope()"), html.indexOf("    function getStatusNode()"));
  const stored = new Map();
  const sourceA = makeSource("folder-a");
  const sourceB = makeSource("folder-b", asJsonl([fixture[0], message("user", "other-folder-only")]));
  const context = {
    createRolloutSearchEntries, findRolloutSearchMatches, parseCodexRolloutJsonl, isCodexRolloutRecords, ROLLOUT_SEARCH_CATEGORIES,
    CONTENT_SEARCH_STATE_KEY: "search-test", contentSearchStates: new Map(),
    contentSearchCache: new Map(), contentSearchCacheSize: 0, currentRolloutSearchDocument: null,
    activeWorkspaceViewKind: "index", selectedDirectoryEntry: { id: "folder-a" }, currentIndexLabel: "Folder A",
    indexCwdFilter: "", activeWorkspaceSlotId: "slot-a", currentRenderedSource: sourceA,
    rolloutIndex: [{ source: sourceA, cwd: "/a" }, { source: sourceB, cwd: "/b" }],
    savedDirectoryEntries: [
      { id: "folder-a", handle: { allowed: true, sources: [sourceA] } },
      { id: "folder-b", handle: { allowed: true, sources: [sourceB] } },
      { id: "blocked", handle: { allowed: false } }
    ],
    currentContentSearch: null,
    getSourceMetadata: source => source.getMetadata(),
    getSourceStateId: source => `${source?.directoryId || ""}::${source?.path || ""}`,
    getFirstUserTitle: () => "Fixture title", getWorkspaceSlot: () => ({ label: "Fixture rollout" }),
    getDirectoryEntryLabel: entry => entry.id,
    hasReadPermission: async handle => handle.allowed,
    async* walkDirectoryHandle(handle) { yield* handle.sources; },
    getFilteredIndexItems(items) { return items.filter(item => !context.indexCwdFilter || context.indexCwdFilter === item.cwd); },
    sessionStorage: { getItem: key => stored.get(key), setItem: (key, value) => stored.set(key, value) },
    escapeHtml: value => String(value ?? "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;"),
    formatNumber: String, setTimeout, clearTimeout, Date
  };
  context.escapeAttribute = context.escapeHtml;
  vm.createContext(context);
  vm.runInContext(functions, context);
  assert.deepEqual(Array.from(context.getContentSearchState("folders").categories), ["user", "assistant"]);
  context.saveContentSearchState("index:folder-a", { query: "remembered", categories: [] });
  assert.deepEqual(Array.from(context.getContentSearchState("index:folder-a").categories), []);
  assert.equal(context.getContentSearchState("rollout:slot-a").query, "", "search settings must be scoped independently");

  const initial = await context.getContentSearchDocument(sourceA);
  assert.equal((await context.getContentSearchDocument(sourceA)), initial);
  assert.equal(sourceA.reads, 1, "unchanged files must reuse their search text");
  sourceA.text = sourceA.text.replace("deep-tail-only", "same-size-new!");
  sourceA.lastModified += 1;
  const replaced = await context.getContentSearchDocument(sourceA);
  assert.equal([...findRolloutSearchMatches(replaced.entries, "same-size-new!", ["tool_output"])].length, 1, "same-size edits must invalidate cached text");
  sourceA.text += `\n${JSON.stringify(message("assistant", "appended-only", "turn-c"))}`;
  sourceA.size = sourceA.text.length;
  sourceA.lastModified += 1;
  assert.equal([...findRolloutSearchMatches((await context.getContentSearchDocument(sourceA)).entries, "appended-only")].length, 1);
  const shortSource = makeSource("shrink", sourceA.text);
  await context.getContentSearchDocument(shortSource);
  shortSource.text = asJsonl([fixture[0], message("user", "after-shrink-only")]);
  shortSource.size = shortSource.text.length;
  assert.equal([...findRolloutSearchMatches((await context.getContentSearchDocument(shortSource)).entries, "appended-only")].length, 0);
  assert.equal([...findRolloutSearchMatches((await context.getContentSearchDocument(sourceB)).entries, "appended-only")].length, 0, "identical relative paths in different folders must not share search text");

  const search = query => {
    const value = { root: makeRoot(), scope: context.getContentSearchScope(), state: { query, categories: ["user", "assistant"] }, run: 0, results: [], page: 0 };
    context.currentContentSearch = value;
    return value;
  };
  context.indexCwdFilter = "/a";
  let current = search("other-folder-only");
  await context.runContentSearch(current);
  assert.equal(current.results.length, 0, "folder search must respect CWD filtering");
  context.activeWorkspaceViewKind = "rollout";
  current = search("other-folder-only");
  await context.runContentSearch(current);
  assert.equal(current.results.length, 0, "rollout search must only read its own file");
  context.activeWorkspaceViewKind = "folders";
  current = search("other-folder-only");
  await context.runContentSearch(current);
  assert.equal(current.results.length, 1, "all-folders search must include unopened folders");
  assert.equal(current.results[0].source.directoryId, "folder-b");
  assert.match(current.root.querySelector("[data-search-status]").textContent, /1 folders need permission/);
  assert.match(current.root.querySelector("[data-search-permissions]").innerHTML, /data-search-permission="blocked"/);
  assert.equal(current.root.attributes.has("aria-busy"), false);

  context.activeWorkspaceViewKind = "rollout";
  current = search(literal);
  await context.runContentSearch(current);
  const resultHtml = current.root.querySelector("[data-search-results]").innerHTML;
  assert.match(resultHtml, /<mark>Needle\.\+\[x\] 中文 &lt;script&gt;<\/mark>/, "snippets must highlight literal matches without interpreting HTML");
  assert.doesNotMatch(resultHtml, /<script>/);
  current.results = Array.from({ length: 85 }, () => current.results[0]);
  current.page = 2;
  context.renderContentSearchResults(current);
  assert.equal((current.root.querySelector("[data-search-results]").innerHTML.match(/data-search-result=/g) || []).length, 5, "pagination must retain matches beyond the first page");

  let release;
  let signalStart;
  const started = new Promise(resolve => { signalStart = resolve; });
  const slow = makeSource("slow");
  slow.getText = async () => { signalStart(); await new Promise(resolve => { release = resolve; }); return slow.text; };
  context.currentRenderedSource = slow;
  current = search(literal);
  const pending = context.runContentSearch(current);
  await started;
  current.run += 1;
  current.root.querySelector("[data-search-status]").textContent = "New search owns this view";
  release();
  await pending;
  assert.equal(current.results.length, 0);
  assert.equal(current.root.querySelector("[data-search-status]").textContent, "New search owns this view", "a superseded search must not overwrite newer results");

  console.log("Checked search categories, literal matching, full text, scope isolation, cache invalidation, permissions, cancellation, escaping, and pagination.");
}

async function checkRealRollout(fileName) {
  const parsed = parseCodexRolloutJsonl(await readFile(fileName, "utf8"));
  assert.ok(isCodexRolloutRecords(parsed.records));
  const entries = createRolloutSearchEntries(parsed.records);
  const counts = {};
  for (const category of ROLLOUT_SEARCH_CATEGORIES) {
    const records = entries.filter(entry => entry.category === category.id);
    counts[category.id] = records.length;
    for (const entry of records.slice(0, 8)) {
      const query = entry.text.slice(Math.floor(entry.text.length * 0.7), Math.floor(entry.text.length * 0.7) + 50).trim();
      if (query) assert.ok([...findRolloutSearchMatches(entries, query, [category.id])].some(match => match.line === entry.line));
    }
  }
  assert.ok(counts.user && counts.assistant);
  console.log(`Real rollout: ${parsed.records.length} records, ${parsed.errors.length} parse errors; searchable categories ${JSON.stringify(counts)}`);
}

if (process.argv[1] && pathToFileURL(process.argv[1]).href === import.meta.url) {
  await checkContentSearch();
  for (const fileName of process.argv.slice(2)) await checkRealRollout(fileName);
}
