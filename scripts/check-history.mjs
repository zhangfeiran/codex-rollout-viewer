import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { pathToFileURL } from "node:url";
import path from "node:path";
import vm from "node:vm";

export async function checkHistory(realFiles = []) {
  const renderer = await readFile(new URL("../rollout-renderer.js", import.meta.url), "utf8");
  const html = await readFile(new URL("../codex-rollout-viewer.html", import.meta.url), "utf8");
  const context = vm.createContext({ console, TextEncoder, TextDecoder });
  vm.runInContext(renderer.replace(/^export\s+/gm, "").replace(/import\.meta\.url/g, JSON.stringify("file:///viewer/rollout-renderer.js")), context);
  for (const name of ["normalizeRolloutUuid", "getSourceRolloutId", "createRolloutIndexItem", "readForkSourceItem"]) {
    const fn = html.match(new RegExp(`^    (?:async )?function ${name}\\([^]*?\\n    \\}`, "m"));
    assert.ok(fn, `Missing ${name}`);
    vm.runInContext(fn[0], context);
  }
  const thread = "01a11b48-1d8e-7240-b71b-6871cec7219f";
  const reverted = "01a11b48-557d-7883-9bfe-dbe9fb2b5900";
  const parent = "01a11989-b3c2-71c3-b95d-680ace084a86";
  const name = `rollout-2026-10-08T19-31-27-${thread}_${reverted}.jsonl`;
  const wrap = values => values.map((value, i) => ({ line: i + 1, value }));
  const meta = { type: "session_meta", ordinal: 10, payload: {
    id: thread, forked_from_id: parent, forked_from_ordinal_exclusive: 8,
    history_mode: "paginated", history_base: { thread_id: thread, end_ordinal_exclusive: 10, end_byte_offset: 2000 }
  } };
  const rows = wrap([meta]);
  assert.equal(context.getRolloutId(rows, name), reverted, "revert keeps the thread ID but changes the file ID");
  assert.equal(context.getRolloutId(rows, "renamed.jsonl"), thread);
  assert.equal(context.getRolloutId(rows, name.replace(thread, parent)), thread, "mismatched filenames cannot override metadata");
  assert.equal(context.getSourceRolloutId({ name, path: `2026/${name}` }), reverted);
  const header = context.renderHeader(rows, [], { fileName: name });
  assert.match(header, new RegExp(`History from:[^]*${thread}`));
  assert.match(header, new RegExp(`Forked from:[^]*${parent}`));
  assert.match(header, /data-history-end-ordinal="10" data-history-end-byte="2000"/);
  assert.ok(header.includes(`data-fork-ancestors="[&quot;${reverted}&quot;]"`));
  const capped = context.renderHeader(rows, [], { fileName: name, historyEndOrdinal: 5 });
  assert.match(capped, /data-history-end-ordinal="5"/);
  assert.doesNotMatch(capped, /data-history-end-byte="2000"/, "a narrower ancestor cap must not reuse a larger byte boundary");

  const message = (role, text, turn = "turn-a") => ({ type: "response_item", payload: {
    type: "message", role, content: [{ type: "input_text", text }],
    internal_chat_message_metadata_passthrough: { turn_id: turn }
  } });
  const event = (type, rest = {}) => ({ type: "event_msg", payload: { type, ...rest } });
  const original = wrap([
    { ...meta, ordinal: 0, payload: { id: thread } },
    event("task_started", { turn_id: "turn-a" }), message("user", "kept question"), message("assistant", "kept answer"),
    event("task_started", { turn_id: "turn-b" }), message("user", "removed question", "turn-b"),
    event("user_message", { message: "removed question", turn_id: "turn-b" }),
    message("user", "<codex_internal_context source=\"daemon_recovery\">resume</codex_internal_context>", "turn-b"),
    message("assistant", "removed answer", "turn-b"),
    { type: "response_item", payload: { type: "function_call", name: "exec_command", call_id: "removed-tool", arguments: "{}" } },
    { type: "compacted", payload: { replacement_history: [message("user", "checkpoint context").payload] } },
    event("thread_rolled_back", { num_turns: 1 }),
    event("task_started", { turn_id: "turn-c" }), message("user", "new branch", "turn-c"),
    { type: "token_usage_record", payload: { usage: { input_tokens: 1234 } } }
  ]);
  const active = context.createRenderableRecords(original);
  const messages = Array.from(active.filter(context.isMessageLikeRecord), context.getMessageText);
  assert.deepEqual(messages, ["kept question", "kept answer", "new branch"]);
  assert.equal(active.some(record => record.value.type === "token_usage_record"), false);
  assert.equal(context.summarizeRecords(active, []).calls, 0, "rolled-back tools do not affect active statistics");
  const rollback = active.find(record => record.value.payload.type === "thread_rolled_back");
  assert.ok(rollback.rolledBackRecords.length >= 7, "the removed branch is preserved for inspection");
  assert.match(context.renderEvent(rollback), /Rolled-back source records/);
  assert.doesNotMatch(context.renderEvent(rollback), /<details[^>]* open/, "archived source stays collapsed");
  const entries = context.createRolloutSearchEntries(original);
  const find = (query, categories) => Array.from(context.findRolloutSearchMatches(entries, query, categories));
  assert.equal(find("removed question").length, 0);
  assert.equal(find("removed question", ["system"]).length, 1);
  assert.match(find("removed answer", ["system"])[0].label, /Rolled back/);
  assert.equal(find("1234", ["system"]).length, 1, "token accounting remains available in source search");
  const repeated = context.createRenderableRecords([...original, { line: 16, value: event("thread_rolled_back", { num_turns: 2 }) }]);
  assert.equal(repeated.filter(context.isUserMessageRecord).length, 0, "repeated rollback reduces the already active history");
  const steered = wrap([meta, message("user", "first"), message("user", "steer"), message("assistant", "answer"), event("thread_rolled_back", { num_turns: 1 })]);
  assert.deepEqual(Array.from(context.createRenderableRecords(steered).filter(context.isUserMessageRecord), context.getMessageText), ["first"], "rollback counts user inputs even when they share a turn ID");
  const reversedMirror = wrap([meta, event("user_message", { message: "paired" }), message("user", "paired"), event("thread_rolled_back", { num_turns: 1 })]);
  assert.equal(context.createRenderableRecords(reversedMirror).filter(context.isUserMessageRecord).length, 0);
  const legacyContext = wrap([meta, message("user", "kept"), message("assistant", "done"),
    { type: "turn_context", payload: { turn_id: "turn-b", model: "removed-model" } },
    message("user", "<environment_context>context</environment_context>", "turn-b"),
    message("user", "removed", "turn-b"), event("thread_rolled_back", { num_turns: 1 })]);
  assert.equal(context.createRenderableRecords(legacyContext).some(record => record.value.type === "turn_context"), false);
  assert.deepEqual(Array.from(context.applyRolloutRollbacks(context.applyRolloutRollbacks(original)), record => record.line),
    Array.from(context.applyRolloutRollbacks(original), record => record.line), "normalized histories must not replay the same rollback twice");

  const prefix = context.parseCodexRolloutJsonl([
    { type: "session_meta", ordinal: 0, payload: { id: parent } },
    { ...message("user", "inherited 中文"), ordinal: 1 },
    { ...message("user", "later parent turn"), ordinal: 2 }
  ].map(value => JSON.stringify(value)).join("\n"));
  assert.deepEqual(Array.from(context.selectRolloutHistoryPrefix(prefix, 2).records, record => record.value.ordinal), [0, 1]);
  assert.equal(context.selectRolloutHistoryPrefix(prefix, 0).records.length, 1);
  assert.throws(() => context.selectRolloutHistoryPrefix({ records: wrap([message("user", "legacy")]), errors: [] }, 2), /no record ordinals/);
  assert.equal(context.selectRolloutHistoryPrefix({ records: wrap([message("user", "legacy")]), errors: [] }, 2, true).records.length, 1);
  assert.equal(context.getRolloutHistoryBase(wrap([{ ...meta, payload: { ...meta.payload, history_base: { thread_id: "javascript:evil", end_ordinal_exclusive: 1, end_byte_offset: 0 } } } ])), null);

  Object.assign(context, {
    getSourceMetadata: async source => ({ size: source.text.length, lastModified: 1 }),
    getRolloutTimestamp: () => 1, getFolderFromPath: () => ".", getRolloutTitle: () => "Title"
  });
  const source = { name, path: name, text: JSON.stringify(meta), getText() { return this.text; } };
  const item = await context.createRolloutIndexItem({ ...source, text: source.text + "\n" + JSON.stringify(event("thread_settings_applied")) }, 0);
  assert.equal(item.rolloutId, reverted);
  assert.equal(item.sessionId, thread);
  assert.equal(await context.readForkSourceItem(item.source, thread), null, "a same-thread reversion is not the requested physical prefix");
  assert.ok(await context.readForkSourceItem(item.source, reverted));

  const available = new Map();
  for (const file of realFiles) {
    const parsed = context.parseCodexRolloutJsonl(await readFile(file, "utf8"));
    assert.equal(parsed.errors.length, 0);
    const rendered = context.createRenderableRecords(parsed.records);
    assert.ok(rendered.length);
    const session = context.getSessionMeta(parsed.records);
    const fileId = context.getRolloutId(parsed.records, path.basename(file));
    available.set(fileId, { file, base: context.getRolloutHistoryBase(parsed.records) });
    if (path.basename(file).includes("_")) assert.notEqual(fileId, session.id);
    const realHeader = context.renderHeader(rendered, [], { fileName: path.basename(file) });
    const base = context.getRolloutHistoryBase(parsed.records);
    if (base) assert.match(realHeader, new RegExp(`data-history-end-ordinal="${base.endOrdinalExclusive}"`));
    assert.equal(rendered.some(record => record.value.type === "token_usage_record"), false);
    console.log(`Validated history ${path.basename(file)}: ${parsed.records.length} records, ${context.buildGroups(rendered).filter(group => !group.isPreamble).length} user groups, rollout ${fileId}.`);
  }
  for (const { file, base } of available.values()) {
    const parentFile = base && available.get(base.id)?.file;
    if (!parentFile) continue;
    const bytes = await readFile(parentFile);
    assert.ok(bytes.length >= base.endByteOffset, "the parent must cover its referenced byte prefix");
    const parsed = context.parseCodexRolloutJsonl(bytes.subarray(0, base.endByteOffset).toString("utf8"));
    assert.equal(parsed.errors.length, 0);
    const ordinals = Array.from(parsed.records, record => record.value.ordinal);
    assert.ok(ordinals.every(ordinal => ordinal < base.endOrdinalExclusive));
    assert.equal(ordinals.at(-1), base.endOrdinalExclusive - 1, "the real byte cutoff must match the exclusive ordinal cutoff");
    console.log(`Validated inherited prefix for ${path.basename(file)}: ${parsed.records.length} records, ${base.endByteOffset} bytes, before ordinal ${base.endOrdinalExclusive}.`);
  }
  console.log("Checked immutable rollout IDs, logical/physical history, bounded prefixes, rollback replay, contextual inputs, source search, and token accounting.");
}

if (process.argv[1] && pathToFileURL(process.argv[1]).href === import.meta.url) await checkHistory(process.argv.slice(2));
