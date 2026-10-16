import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { zstdCompressSync, zstdDecompressSync } from "node:zlib";
import { pathToFileURL } from "node:url";
import vm from "node:vm";

export async function checkZstd(realFiles = []) {
  const renderer = await readFile(new URL("../rollout-renderer.js", import.meta.url), "utf8");
  const html = await readFile(new URL("../codex-rollout-viewer.html", import.meta.url), "utf8");
  const decoder = await readFile(new URL("../vendor/fzstd/fzstd.min.js", import.meta.url), "utf8");
  let loads = 0;
  let failLoad = false;
  let cached = null;
  const context = vm.createContext({ console, TextEncoder, TextDecoder, URL, Blob,
    activeWorkspaceSlotId: "zstd-test", contentSearchCache: new Map(), contentSearchCacheSize: 0,
    currentRolloutSearchDocument: null,
    getSavedCurrentRolloutRenderCache: async () => cached,
    document: {
      createElement() { return { dataset: {}, events: {}, addEventListener(name, fn) { this.events[name] = fn; }, remove() {} }; },
      head: { append(script) {
        loads++;
        assert.equal(script.src, "file:///viewer/vendor/fzstd/fzstd.min.js", "only the bundled local decoder may load");
        if (failLoad) script.events.error();
        else { vm.runInContext(decoder, context); script.events.load(); }
      } }
    }
  });
  vm.runInContext(renderer.replace(/^export\s+/gm, "").replace(/import\.meta\.url/g, JSON.stringify("file:///viewer/rollout-renderer.js")), context);
  const names = ["normalizeRolloutUuid", "getSourceRolloutId", "isJsonlFileName", "createSourceFromFile", "createSourceFromFileHandle", "getSourceFile", "walkDirectoryHandle", "getFileHandleByPath", "getSourcesFromFiles", "getSourcesFromDrop", "getSourceLastModified", "getSourceMetadata", "getSourceStateId", "splitJsonlCompleteLines", "parseJsonlLines", "parseCompleteJsonlText", "readSourceTextSlice", "readRolloutParsedIncrementally", "getRolloutTimestamp", "getFolderFromPath", "stripContextBlocks", "isContextOnlyUserMessage", "getFirstUserTitle", "getRolloutTitle", "createRolloutIndexItem", "readForkSourceItem", "getContentSearchDocument"];
  for (const name of names) {
    const match = html.match(new RegExp(`^    (?:async )?function\\*? ${name}\\([^]*?\\n    \\}`, "m"));
    assert.ok(match, `Missing ${name}`);
    vm.runInContext(match[0], context);
  }
  const id = "01a11b48-1d8e-7240-b71b-6871cec7219f";
  const physical = "01a11b48-557d-7883-9bfe-dbe9fb2b5900";
  const name = `rollout-2026-10-08T19-31-27-${id}_${physical}.jsonl.zst`;
  const user = text => ({ type: "response_item", payload: { type: "message", role: "user", content: [{ type: "input_text", text }] } });
  const prefix = [
    { type: "session_meta", payload: { id, cwd: "/test" } }, user("中文 rollout 🦀 search needle")
  ].map(value => JSON.stringify(value)).join("\n") + "\n";
  const later = JSON.stringify(user("Later branch")) + "\n";
  const text = prefix + later;
  const file = (bytes, fileName = name, mtime = 1) => {
    const blob = new Blob([bytes]);
    return { name: fileName, size: blob.size, lastModified: mtime,
      text: () => blob.text(), arrayBuffer: () => blob.arrayBuffer(), slice: (start, end) => blob.slice(start, end) };
  };
  const compressed = file(zstdCompressSync(Buffer.from(text)));
  const plain = file(text, name.slice(0, -4));
  for (const value of [name, "test.JSONL.ZST", "test.zst", "test.jsonl"]) assert.equal(context.isJsonlFileName(value), true);
  for (const value of ["test.zip", "test.jsonl.bak", "test.zstd", "test.json"]) assert.equal(context.isJsonlFileName(value), false);
  assert.equal(loads, 0);
  assert.equal(await context.readRolloutFileText(plain), text);
  assert.equal(loads, 0, "plain files do not need a decoder");
  failLoad = true;
  await assert.rejects(() => context.readRolloutFileText(compressed), /Could not decompress.*Failed to load/);
  failLoad = false;
  const decoded = await Promise.all([context.readRolloutFileText(compressed), context.readRolloutFileText(compressed)]);
  assert.deepEqual(decoded, [text, text]);
  assert.equal(loads, 2, "decoder loading is shared and retried after failure");
  await assert.rejects(() => context.readRolloutFileText(file("not zstandard")), /Could not decompress/);
  await assert.rejects(() => context.readRolloutFileText(file(new Uint8Array())), /Empty Zstandard/);
  await assert.rejects(() => context.readRolloutFileText(file(zstdCompressSync(Buffer.from(text)).subarray(0, 10))), /Could not decompress/);
  const concatenated = Buffer.concat([zstdCompressSync(Buffer.from(prefix)), zstdCompressSync(Buffer.from(later))]);
  assert.equal(await context.readRolloutFileText(file(concatenated)), text, "concatenated frames are decoded together");
  const source = context.createSourceFromFile(compressed);
  assert.equal(source.compressed, true);
  assert.equal(context.getSourceRolloutId(source), physical, "compressed reversion names retain the physical rollout ID");
  assert.equal(context.getRolloutId(context.parseCodexRolloutJsonl(text).records, name), physical);
  assert.equal(context.getSourceStateId(source), context.getSourceStateId(context.createSourceFromFile(plain)), "archiving preserves viewer source identity");
  assert.equal(await source.getTextSlice(0, Buffer.byteLength(prefix)), prefix, "history bounds count decompressed UTF-8 bytes");
  const start = Buffer.byteLength(prefix.slice(0, prefix.indexOf("中文")));
  assert.equal(await source.getTextSlice(start, start + Buffer.byteLength("中文")), "中文");
  const item = await context.createRolloutIndexItem(source, 0);
  assert.equal(item.rolloutId, physical);
  assert.equal(item.title, "中文 rollout 🦀 search needle");
  assert.equal(item.parseErrors, 0);
  assert.ok(await context.readForkSourceItem(source, physical), "fork sources accept compressed files");
  const search = await context.getContentSearchDocument(source);
  assert.equal(Array.from(context.findRolloutSearchMatches(search.entries, "search needle", ["user"])).length, 1);
  assert.equal(context.getSourcesFromFiles([plain, compressed, file("", "bad.zip")]).length, 2);
  let current = compressed;
  const handle = { kind: "file", name, getFile: async () => current };
  const handleSource = context.createSourceFromFileHandle(handle, name, { directoryId: "folder" });
  assert.equal(await handleSource.getText(), text);
  assert.equal(await handleSource.getTextSlice(0, Buffer.byteLength(prefix)), prefix);
  const dropped = await context.getSourcesFromDrop({ items: [{ kind: "file", getAsFileSystemHandle: async () => handle }] });
  assert.equal(await dropped[0].getText(), text);
  const directory = {
    async *entries() { yield [name, handle]; },
    async getFileHandle(candidate) { if (candidate === name) return handle; throw new Error("Not found"); }
  };
  const scanned = [];
  for await (const candidate of context.walkDirectoryHandle(directory, "", { directoryId: "folder" })) scanned.push(candidate);
  assert.equal(scanned.length, 1);
  assert.equal(await scanned[0].getText(), text);
  assert.equal(await context.getFileHandleByPath(directory, name.slice(0, -4)), handle, "old paths find their compressed archive");
  const unarchived = { async getFileHandle(candidate) { if (candidate === name.slice(0, -4)) return { kind: "file" }; throw new Error("Not found"); } };
  assert.ok(await context.getFileHandleByPath(unarchived, name), "compressed paths also find restored plain files");
  assert.equal(await context.getFileHandleByPath(directory, "missing.jsonl"), null);
  context.getDirectoryEntryById = () => ({ handle: directory });
  const removedHandle = { name: plain.name, async getFile() { throw Object.assign(new Error("Archived"), { name: "NotFoundError" }); } };
  const openPlainSource = context.createSourceFromFileHandle(removedHandle, plain.name, { directoryId: "folder" });
  const identityBefore = context.getSourceStateId(openPlainSource);
  assert.equal((await openPlainSource.getMetadata()).size, compressed.size, "already open tabs find an archive during refresh");
  assert.equal(openPlainSource.compressed, true);
  assert.equal(context.getSourceStateId(openPlainSource), identityBefore);
  assert.equal(await openPlainSource.getText(), text);
  assert.equal(openPlainSource.fileHandle, handle);
  const deniedSource = context.createSourceFromFileHandle({ name, async getFile() { throw Object.assign(new Error("Denied"), { name: "NotAllowedError" }); } }, name, { directoryId: "folder" });
  await assert.rejects(() => deniedSource.getText(), /Denied/, "permission errors are not treated as archive renames");
  let result = await context.readRolloutParsedIncrementally(handleSource, await handleSource.getMetadata());
  assert.equal(result.incremental, false);
  assert.equal(result.parsed.records.length, 3);
  cached = result.cache;
  handleSource.getTextSlice = async () => { throw new Error("must not slice a compressed append"); };
  result = await context.readRolloutParsedIncrementally(handleSource, await handleSource.getMetadata());
  assert.equal(result.appendedBytes, 0);
  assert.equal(result.incremental, true, "unchanged archives reuse the parsed cache");
  current = file(concatenated, name, 2);
  assert.ok(current.size > cached.size, "fixture exercises growth in compressed bytes");
  result = await context.readRolloutParsedIncrementally(handleSource, await handleSource.getMetadata());
  assert.equal(result.incremental, false, "changed archives are decoded in full, including concatenated frames");
  assert.equal(result.parsed.records.length, 3, "full refresh must not duplicate cached records");
  cached = { ...result.cache, size: 20, lastModified: 3 };
  const sameSizeMetadata = { size: 20, lastModified: 4 };
  result = await context.readRolloutParsedIncrementally(handleSource, sameSizeMetadata);
  assert.equal(result.incremental, false, "same-size archive replacements are reparsed");
  const plainSource = context.createSourceFromFile(plain);
  cached = { ...result.cache, sourceId: context.getSourceStateId(plainSource), size: plain.size, lastModified: plain.lastModified };
  result = await context.readRolloutParsedIncrementally(plainSource, await plainSource.getMetadata());
  assert.equal(result.incremental, false, "compressed and plain cache metadata must not mix");
  cached = result.cache;
  const appendPlain = context.createSourceFromFile(file(text + later, plain.name, 2));
  result = await context.readRolloutParsedIncrementally(appendPlain, await appendPlain.getMetadata());
  assert.equal(result.incremental, true, "plain JSONL retains incremental parsing");
  assert.equal(result.parsed.records.length, 4);
  for (const path of realFiles) {
    const bytes = await readFile(path);
    const real = file(bytes, path.split(/[\\/]/).pop());
    const output = await context.readRolloutFileText(real);
    assert.equal(output, zstdDecompressSync(bytes).toString("utf8"), "real archive bytes match an independent native decoder");
    const parsed = context.parseCodexRolloutJsonl(output);
    assert.equal(parsed.errors.length, 0);
    assert.ok(context.isCodexRolloutRecords(parsed.records));
    const indexed = await context.createRolloutIndexItem(context.createSourceFromFile(real), 0);
    assert.ok(indexed.rolloutId);
    console.log(`Checked real Zstandard rollout: ${bytes.length} compressed bytes, ${Buffer.byteLength(output)} decoded bytes, ${parsed.records.length} records, 0 parse errors.`);
  }
  console.log("Checked Zstandard local loading, corrupt data, concatenated frames, file/drop/folder sources, search, fork byte bounds, cache refresh, and archive path restoration.");
}

if (process.argv[1] && pathToFileURL(process.argv[1]).href === import.meta.url) await checkZstd(process.argv.slice(2));
