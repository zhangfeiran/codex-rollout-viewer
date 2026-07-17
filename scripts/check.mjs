import assert from "node:assert/strict";
import { readFile, readdir } from "node:fs/promises";
import { spawn } from "node:child_process";
import path from "node:path";
import vm from "node:vm";

const projectDir = path.resolve(import.meta.dirname, "..");
const files = [
  "rollout-renderer.js"
].map(file => path.resolve(projectDir, file));

async function addJsFiles(dir) {
  for (const entry of await readdir(dir, { withFileTypes: true })) {
    const fullPath = path.resolve(dir, entry.name);
    if (entry.isDirectory()) {
      await addJsFiles(fullPath);
      continue;
    }
    if (entry.isFile() && entry.name.endsWith(".js")) {
      files.push(fullPath);
    }
  }
}

async function checkFile(file) {
  await new Promise((resolve, reject) => {
    const child = spawn(process.execPath, ["--check", file], { stdio: "inherit" });
    child.on("error", reject);
    child.on("exit", code => {
      if (code === 0) {
        resolve();
        return;
      }
      reject(new Error(`node --check failed for ${path.relative(projectDir, file)}`));
    });
  });
}

async function checkLocalHtml(fileName) {
  const file = path.resolve(projectDir, fileName);
  const html = await readFile(file, "utf8");
  const begin = "/* BEGIN embedded rollout-renderer.js */";
  const end = "/* END embedded rollout-renderer.js */";
  const beginIndex = html.indexOf(begin);
  const endIndex = html.indexOf(end);
  if (beginIndex < 0 || endIndex < 0 || endIndex <= beginIndex) {
    throw new Error(`${fileName} must embed rollout-renderer.js between sync markers`);
  }

  const embeddedRenderer = html.slice(beginIndex + begin.length, endIndex).trim();
  const renderer = (await readFile(path.resolve(projectDir, "rollout-renderer.js"), "utf8")).replace(/\r\n/g, "\n").trim();
  if (/<\/script/i.test(renderer)) {
    throw new Error("rollout-renderer.js contains a closing script tag and cannot be embedded in codex-rollout-viewer.html");
  }
  if (embeddedRenderer.replace(/\r\n/g, "\n") !== renderer) {
    throw new Error(`${fileName} embedded rollout renderer is out of sync with rollout-renderer.js`);
  }

  const bootScript = html.slice(endIndex + end.length, html.indexOf("</script>", endIndex));
  try {
    new Function(bootScript);
  } catch (error) {
    throw new Error(`${fileName} boot script has invalid syntax: ${error.message}`);
  }
}

async function checkSynchronizedLocalHtmlCopy() {
  const source = await readFile(path.resolve(projectDir, "codex-rollout-viewer.html"), "utf8");
  const copy = await readFile(path.resolve(projectDir, "codex-rollout-viewer2.html"), "utf8");
  assert.equal(copy, source, "codex-rollout-viewer2.html is out of sync; run npm run export:pages");
}

async function checkMarkdownRendering() {
  const rendererSource = await readFile(path.resolve(projectDir, "rollout-renderer.js"), "utf8");
  const runnableRenderer = rendererSource
    .replace(/^export\s+/gm, "")
    .replace(/import\.meta\.url/g, JSON.stringify("file:///codex-rollout-viewer/rollout-renderer.js"));
  const rendererContext = { console };
  vm.runInNewContext(
    `${runnableRenderer}\nglobalThis.__rolloutTest = { buildGroupSections, createRenderableRecords, getReadableToolOutput, openSidebarRolloutTarget, parseExecCommandCalls, parsePatchApplyEndChanges, parseStructuredToolOutput, renderAssistantSection, renderEvent, renderFunctionCall, renderMarkdownContent, renderSidebarGroup, renderToolCallGroup, renderTurnGroup };`,
    rendererContext,
    { filename: "rollout-renderer.js" }
  );

  const markdown = [
    String.raw`\[`,
    String.raw`R_{\text{rank}}=\frac{L_{\max}}{L_{\text{avg}}}`,
    String.raw`\]`,
    "",
    String.raw`\[`,
    String.raw`L_{\text{aux}}=\alpha E\sum_{i=1}^{E} f_i p_i`,
    String.raw`\]`,
    "",
    "$$q=mc$$",
    "",
    String.raw`Inline \(x^2+y^2=z^2\) and $a+b=c$.`,
    "",
    "```text",
    "$not_math$",
    "```"
  ].join("\n");
  const renderedMarkdown = rendererContext.__rolloutTest.renderMarkdownContent(markdown);
  assert.equal((renderedMarkdown.match(/data-rollout-math/g) || []).length, 5, "expected five math placeholders");
  assert.equal((renderedMarkdown.match(/rollout-math is-display/g) || []).length, 3, "expected three display formulas");
  assert.match(renderedMarkdown, /<code class="language-text">\$not_math\$\n<\/code>/, "code fences must not render math");

  const katexSource = await readFile(path.resolve(projectDir, "vendor", "katex", "katex.min.js"), "utf8");
  const katexContext = { console };
  katexContext.self = katexContext;
  vm.runInNewContext(katexSource, katexContext, { filename: "katex.min.js" });
  for (const formula of [
    String.raw`R_{\text{rank}}=\frac{L_{\max}}{L_{\text{avg}}}`,
    String.raw`L_{\text{aux}}=\alpha E\sum_{i=1}^{E} f_i p_i`
  ]) {
    const html = katexContext.katex.renderToString(formula, { displayMode: true, throwOnError: false });
    assert.match(html, /class="katex-display"/, "KaTeX must render display math");
    assert.doesNotMatch(html, /katex-error/, "sample formula must be valid KaTeX");
  }

  const tableMarkdown = [
    "| Name | Formula | Notes |",
    "| :--- | :---: | ---: |",
    "| **Alice** | \\(a|b\\) | `code|pipe` |",
    String.raw`| Bob \| Team | $x+y$ | [link](https://example.com/) |`
  ].join("\n");
  const renderedTable = rendererContext.__rolloutTest.renderMarkdownContent(tableMarkdown);
  assert.equal((renderedTable.match(/<th\b/g) || []).length, 3, "expected three table headers");
  assert.equal((renderedTable.match(/<td\b/g) || []).length, 6, "expected two table rows");
  assert.equal((renderedTable.match(/data-rollout-math/g) || []).length, 2, "expected formulas inside table cells");
  assert.match(renderedTable, /<strong>Alice<\/strong>/, "table cells must render inline Markdown");
  assert.match(renderedTable, /<code>code\|pipe<\/code>/, "pipes inside inline code must stay in one cell");
  assert.match(renderedTable, /Bob \| Team/, "escaped pipes must stay in one cell");
  assert.match(renderedTable, /class="is-align-center"/, "center alignment must be rendered");
  assert.match(renderedTable, /class="is-align-right"/, "right alignment must be rendered");

  const compactBridgeRecords = [
    { line: 1, value: { type: "compacted", payload: { replacement_history: [] } } },
    { line: 2, value: { type: "world_state", payload: { full: false } } },
    { line: 3, value: { type: "turn_context", payload: {} } },
    { line: 4, value: { type: "event_msg", payload: { type: "token_count" } } },
    { line: 5, value: { type: "event_msg", payload: { type: "context_compacted" } } },
    { line: 6, value: { type: "response_item", payload: { type: "reasoning", summary: [] } } },
    { line: 7, value: { type: "event_msg", payload: { type: "token_count" } } },
    {
      line: 8,
      value: {
        type: "response_item",
        payload: { type: "message", role: "assistant", content: [{ type: "output_text", text: "Continuing." }] }
      }
    }
  ];
  const compactSections = rendererContext.__rolloutTest.buildGroupSections({ records: compactBridgeRecords });
  assert.equal(compactSections.filter(section => section.kind === "compact").length, 1, "context compact bridge records must stay in one section");
  assert.deepEqual(
    Array.from(compactSections[0].records, record => record.line),
    [1, 2, 3, 4, 5],
    "world state and token count must preserve their order inside the context compact section"
  );
  assert.deepEqual(
    Array.from(compactSections.find(section => section.kind === "activity").records, record => record.line),
    [6, 7],
    "token counts after post-compact activity starts must stay with that activity"
  );

  const sidebarHtml = rendererContext.__rolloutTest.renderSidebarGroup({
    id: "turn-1",
    index: 1,
    title: "Example turn",
    isPreamble: false,
    records: [
      { line: 1, value: { type: "response_item", payload: { type: "message", role: "user", content: [{ type: "input_text", text: "Question" }] } } },
      { line: 2, value: { type: "response_item", payload: { type: "message", role: "assistant", content: [{ type: "output_text", text: "Answer" }] } } }
    ]
  }, new Map());
  assert.match(sidebarHtml, /<details data-rollout-level="1"/, "sidebar turns must remain collapsible");
  assert.match(sidebarHtml, /<a href="#assistant-2">Answer<\/a>/, "sidebar assistant sections must remain direct links");
  assert.doesNotMatch(sidebarHtml, /data-rollout-level="2"/, "sidebar assistant sections must not expand further");
  assert.doesNotMatch(sidebarHtml, /data-rollout-lazy-sidebar/, "sidebar assistant record children must not be rendered");

  const mainSectionHtml = rendererContext.__rolloutTest.renderAssistantSection({
    id: "assistant-2",
    title: "Answer",
    records: []
  }, {});
  assert.match(mainSectionHtml, /data-rollout-level="2"/, "main assistant sections must remain level two");
  assert.match(mainSectionHtml, /data-rollout-state-key="assistant-2:body"/, "main assistant section state must remain persistent");

  const patchChanges = {
    "src/old.js": {
      type: "update",
      unified_diff: "@@ -1 +1 @@\n-old value\n+new value\n",
      move_path: "src/new.js"
    },
    "src/added.js": {
      type: "add",
      unified_diff: "@@ -0,0 +1,2 @@\n+first\n+second\n",
      move_path: null
    }
  };
  const parsedPatchFiles = rendererContext.__rolloutTest.parsePatchApplyEndChanges(patchChanges);
  assert.equal(parsedPatchFiles.length, 2, "patch_apply_end changes must produce one diff file per changed path");
  assert.deepEqual(
    Array.from(parsedPatchFiles, file => [file.path, file.moveTo, file.additions, file.deletions]),
    [["src/old.js", "src/new.js", 1, 1], ["src/added.js", null, 2, 0]],
    "patch_apply_end unified diffs must preserve paths, moves, and line stats"
  );
  const patchCallHtml = rendererContext.__rolloutTest.renderFunctionCall({
    line: 20,
    value: { payload: { name: "apply_patch", input: "*** Begin Patch\n*** Update File: wrong.js\n-old\n+new\n*** End Patch" } }
  });
  assert.doesNotMatch(patchCallHtml, /rollout-patch-details/, "apply_patch call input must not be rendered as the resulting patch diff");
  const patchEndHtml = rendererContext.__rolloutTest.renderEvent({
    line: 21,
    value: { type: "event_msg", payload: { type: "patch_apply_end", success: true, status: "completed", changes: patchChanges } }
  });
  assert.match(patchEndHtml, /Patch diff, 2 files, \+3 -1/, "patch_apply_end must render stats from its changes data");
  assert.match(patchEndHtml, /src\/old\.js -&gt; src\/new\.js/, "patch_apply_end must render move_path from its changes data");

  const execInput = [
    "const results = await Promise.all([",
    "  tools.exec_command({ cmd: \"printf '{value}'\", workdir: \"/repo\" }),",
    "  tools.exec_command({ cmd: \"git status --short\", workdir: \"/repo\" })",
    "]);",
    "await tools.apply_patch(\"*** Begin Patch\\n*** End Patch\");"
  ].join("\n");
  const execCallRecord = {
    line: 30,
    value: { type: "response_item", payload: { type: "custom_tool_call", name: "exec", call_id: "call-exec", status: "completed", input: execInput } }
  };
  const execPatchRecord = {
    line: 31,
    value: { type: "event_msg", payload: { type: "patch_apply_end", call_id: "exec-internal", success: true, status: "completed", changes: patchChanges } }
  };
  const execOutputValue = [
    { type: "input_text", text: "Script completed\nWall time 0.1 seconds\nOutput:\n" },
    { type: "input_text", text: JSON.stringify({ chunk_id: "one", wall_time_seconds: 0.01, exit_code: 0, original_token_count: 2, output: "{value}\n" }) },
    { type: "input_text", text: JSON.stringify({ chunk_id: "two", wall_time_seconds: 0.02, exit_code: 1, original_token_count: 3, output: " M file.js\n" }) }
  ];
  const execOutputRecord = {
    line: 32,
    value: { type: "response_item", payload: { type: "custom_tool_call_output", call_id: "call-exec", output: execOutputValue } }
  };
  const combinedExecRecords = rendererContext.__rolloutTest.createRenderableRecords([execCallRecord, execPatchRecord, execOutputRecord]);
  assert.equal(combinedExecRecords.length, 1, "call, patch result, and call output must collapse into one render record");
  assert.equal(combinedExecRecords[0].toolGroup.outputRecord.line, 32, "tool group must retain the matching call-id output");
  assert.deepEqual(Array.from(combinedExecRecords[0].toolGroup.eventRecords, record => record.line), [31], "patch_apply_end must attach to its enclosing exec call");
  const parsedExecCommands = rendererContext.__rolloutTest.parseExecCommandCalls(execInput);
  assert.deepEqual(
    Array.from(parsedExecCommands, command => [command.command, command.workdir]),
    [["printf '{value}'", "/repo"], ["git status --short", "/repo"]],
    "nested exec_command calls must preserve commands containing braces and workdirs"
  );
  assert.deepEqual(
    Array.from(rendererContext.__rolloutTest.parseStructuredToolOutput(execOutputValue).results, result => result.exit_code),
    [0, 1],
    "structured exec results must be decoded from content blocks"
  );
  const groupedExecHtml = rendererContext.__rolloutTest.renderToolCallGroup(combinedExecRecords[0]);
  assert.match(groupedExecHtml, /exec_command 1\/2/, "grouped exec must render its first nested command");
  assert.match(groupedExecHtml, /exec_command 2\/2/, "grouped exec must render its second nested command");
  assert.match(groupedExecHtml, /Patch diff, 2 files, \+3 -1/, "grouped exec must include its patch_apply_end diff");
  assert.doesNotMatch(groupedExecHtml, /\[object Object\]/, "grouped tool output must not stringify content blocks as object placeholders");

  const waitRecords = rendererContext.__rolloutTest.createRenderableRecords([
    { line: 40, value: { type: "response_item", payload: { type: "function_call", name: "wait", call_id: "call-wait", arguments: "{\"cell_id\":\"1\"}" } } },
    { line: 41, value: { type: "response_item", payload: { type: "function_call_output", call_id: "call-wait", output: [{ type: "input_text", text: JSON.stringify({ session_id: 7, output: "done" }) }] } } }
  ]);
  assert.equal(waitRecords.length, 1, "generic function call and result must collapse into one render record");
  assert.match(rendererContext.__rolloutTest.getReadableToolOutput(waitRecords[0].toolGroup.outputRecord.value.payload.output), /session 7[\s\S]*done/, "generic paired calls must decode result content");
  assert.match(rendererContext.__rolloutTest.renderToolCallGroup(waitRecords[0]), /record-40:output/, "generic paired calls must render one lazy result inside the call card");
  const settingsHtml = rendererContext.__rolloutTest.renderEvent({
    line: 42,
    value: { type: "event_msg", payload: { type: "thread_settings_applied", thread_settings: { model: "gpt-test", reasoning_effort: "high", cwd: "/repo", collaboration_mode: { mode: "default", settings: { developer_instructions: "large hidden text" } } } } }
  });
  assert.match(settingsHtml, /gpt-test[\s\S]*high[\s\S]*\/repo/, "thread settings must show compact high-value fields");
  assert.doesNotMatch(settingsHtml, /large hidden text/, "thread settings must omit duplicated developer instructions");
  const taskCompleteHtml = rendererContext.__rolloutTest.renderEvent({
    line: 43,
    value: { type: "event_msg", payload: { type: "task_complete", duration_ms: 2000, time_to_first_token_ms: 500 } }
  });
  assert.match(taskCompleteHtml, /Duration[\s\S]*2s[\s\S]*First Token[\s\S]*500ms/, "task lifecycle events must show compact timing fields");
  const timedTurnHtml = rendererContext.__rolloutTest.renderTurnGroup({
    id: "turn-timed",
    index: 1,
    title: "Timed turn",
    isPreamble: false,
    records: [
      { line: 50, value: { timestamp: "2026-07-17T00:00:00.000Z", type: "response_item", payload: { type: "message", role: "user", content: [{ type: "input_text", text: "Question" }] } } },
      { line: 51, value: { timestamp: "2026-07-17T00:00:02.000Z", type: "event_msg", payload: { type: "task_complete", duration_ms: 2000 } } }
    ]
  }, { callById: new Map() });
  assert.match(timedTurnHtml, /rollout-turn-meta">\s*<span>2s<\/span>\s*<span>2 events<\/span>/, "turn duration must appear before event and call counts");

  class FakeDetailsElement {}
  let lazyTurnRendered = false;
  let targetScrolls = 0;
  const lazyTurnBody = {
    childNodes: [],
    set innerHTML(value) {
      this.value = value;
      this.childNodes = [{}];
      lazyTurnRendered = true;
    }
  };
  const turnNode = Object.assign(new FakeDetailsElement(), {
    dataset: { rolloutLazyKey: "missing-test-key", rolloutStateKey: "turn-1:body" },
    open: false,
    querySelector: () => lazyTurnBody
  });
  const targetNode = Object.assign(new FakeDetailsElement(), {
    dataset: { rolloutStateKey: "assistant-2:body" },
    open: false,
    scrollIntoView: () => { targetScrolls += 1; }
  });
  const navigationEvents = [];
  let pushedHash = "";
  rendererContext.HTMLDetailsElement = FakeDetailsElement;
  rendererContext.CustomEvent = class {
    constructor(type, init = {}) {
      this.type = type;
      this.detail = init.detail;
    }
  };
  rendererContext.document = {
    getElementById(id) {
      if (id === "turn-1") {
        return turnNode;
      }
      return id === "assistant-2" && lazyTurnRendered ? targetNode : null;
    },
    dispatchEvent(event) {
      navigationEvents.push(event);
    }
  };
  rendererContext.history = { pushState: (state, title, hash) => { pushedHash = hash; } };
  rendererContext.location = { hash: "" };
  rendererContext.requestAnimationFrame = callback => callback();
  rendererContext.enhanceRenderedContent = () => Promise.resolve();
  const sidebarAnchor = {
    getAttribute: () => "#assistant-2",
    closest: () => ({ dataset: { rolloutNavTarget: "turn-1" } })
  };
  assert.equal(rendererContext.__rolloutTest.openSidebarRolloutTarget(sidebarAnchor), true, "sidebar navigation must resolve a lazy main target");
  assert.equal(turnNode.open, true, "sidebar navigation must open the parent main turn");
  assert.equal(targetNode.open, false, "sidebar navigation must leave the target main section collapsed");
  assert.equal(targetScrolls, 2, "sidebar navigation must scroll immediately and after layout");
  assert.equal(pushedHash, "#assistant-2", "sidebar navigation must update the URL hash");
  assert.deepEqual(
    Array.from(navigationEvents[0].detail.stateKeys),
    ["turn-1:body"],
    "sidebar navigation must persist only the opened parent turn state"
  );
}

await addJsFiles(path.resolve(projectDir, "vendor"));

for (const file of files) {
  await checkFile(file);
}

await checkLocalHtml("codex-rollout-viewer.html");
await checkLocalHtml("codex-rollout-viewer2.html");
await checkSynchronizedLocalHtmlCopy();
await checkMarkdownRendering();

console.log(`Checked ${files.length} JavaScript files and both local HTML entrypoints.`);
