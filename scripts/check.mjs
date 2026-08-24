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
  assert.doesNotMatch(html, /Add or choose remembered sessions folders|data-folder-input|Choose folder/, "the removed home and transient folder picker must not remain in the local viewer");
  assert.match(html, /\.standalone-workspace-tab\.is-rollout \.standalone-workspace-tab-status\s*\{[\s\S]*?background: var\(--rollout-accent, #9b7bd5\)/, "rollout status colors must support their source folder accent");

  const bootScript = html.slice(endIndex + end.length, html.indexOf("</script>", endIndex));
  try {
    new Function(bootScript);
  } catch (error) {
    throw new Error(`${fileName} boot script has invalid syntax: ${error.message}`);
  }
  assert.match(bootScript, /node\.dataset\.rolloutLevel === "2"/, "level-two directories must be excluded from persisted UI state");
  assert.match(bootScript, /node\.open = false;/, "restoring UI state must collapse level-two directories");
  assert.match(bootScript, /\(\?:assistant\|compact\|post-compact\|activity\)-\\d\+:body/, "legacy level-two directory state must be discarded");
  assert.match(bootScript, /workspace-slots-v1/, "workspace slot metadata must be persisted");
  assert.match(bootScript, /workspace-navigation-v1/, "visible tab navigation must be persisted separately from rollout slots");
  assert.match(bootScript, /sessionStorage\.setItem\(WORKSPACE_NAVIGATION_KEY/, "visible tab navigation must be isolated per browser window while surviving reloads");
  assert.match(bootScript, /openDirectoryTabIds: \[\.\.\.openDirectoryTabIds\]/, "open folder tabs must survive page reloads");
  assert.doesNotMatch(bootScript, /\[normalizeWorkspaceSlot\(\{ id: DEFAULT_WORKSPACE_SLOT_ID, label: "Default" \}\)\]/, "startup must not recreate an empty Default tab");
  assert.match(bootScript, /slot\.id === DEFAULT_WORKSPACE_SLOT_ID && slot\.label === "Default" && !slot\.sourceId/, "startup must remove previously persisted synthetic Default tabs");
  assert.match(bootScript, /url\.searchParams\.delete\("slot"\)/, "closing the last rollout tab must clear the stale slot URL parameter");
  assert.match(bootScript, /if \(!activeSlot\) \{[\s\S]*?workspaceSlots\.push\(slot\);[\s\S]*?setActiveWorkspaceSlotId\(slot\.id/, "opening a source from an empty workspace must create a real rollout tab on demand");
  assert.match(bootScript, /createWorkspaceSlotStorageKey\(LEGACY_CURRENT_ROLLOUT_KEY, slotId\)/, "rollout sources must be stored per workspace slot");
  assert.match(bootScript, /getSavedCurrentRolloutRenderCache\(slotId\)/, "incremental caches must be read per workspace slot");
  assert.match(bootScript, /metadata\.size > cached\.size/, "incremental parsing must only append when a rollout grows");
  assert.match(bootScript, /data-refresh-all-workspace-slots/, "workspace UI must expose independent bulk refresh");
  assert.match(bootScript, /data-popout-workspace-slot/, "workspace slots must support independent windows");
  assert.match(bootScript, /data-sessions-folders-tab/, "the fixed sessions-folders tab must be rendered");
  assert.match(bootScript, /openDirectoryTabIds = new Set\(\)/, "remembered folder tabs must be tracked independently");
  assert.match(bootScript, /data-directory-tab-id/, "remembered folders must render as navigation tabs");
  assert.match(bootScript, /data-close-directory-tab-id/, "opened folder tabs must be closeable");
  assert.match(bootScript, /class="standalone-workspace-tab is-folder/, "folder tabs must have a distinct shape class");
  assert.match(bootScript, /class="standalone-workspace-tab is-rollout/, "rollout tabs must have a distinct shape class");
  assert.match(bootScript, /slot\.directoryId \? "is-folder-rollout"/, "rollout tabs from remembered folders must carry a folder color class");
  assert.match(bootScript, /getFolderTabColor\(slot\.directoryId\)/, "rollout tabs must reuse their sessions-folder tab color");
  assert.match(bootScript, /data-back-index/, "Back to index must live in the workspace tab row");
  assert.match(bootScript, /label: summarizeText\(item\.title \|\| item\.name, 64\)/, "opening an indexed rollout must create a title-based tab");
  assert.match(
    bootScript,
    /const existingSlot = workspaceSlots\.find\(slot => slot\.sourceId === getSourceStateId\(item\.source\)\);[\s\S]*?if \(existingSlot\) \{[\s\S]*?await activateWorkspaceSlot\(existingSlot\.id\);[\s\S]*?return;[\s\S]*?workspaceSlots\.push\(slot\);/,
    "opening an indexed rollout must activate its existing tab before creating a new slot"
  );
  const renderIndexedRolloutMatch = bootScript.match(/(async function renderIndexedRollout\(id\) \{[\s\S]*?\n    \})\n\n    async function openSessionsFoldersTab/);
  assert.ok(renderIndexedRolloutMatch, "the indexed rollout activation function must remain testable");
  const activatedSlotIds = [];
  const tabReuseContext = {
    rolloutIndex: [{ id: "rollout-row", source: { directoryId: "folder-a", path: "2026/rollout.jsonl" } }],
    workspaceSlots: [{ id: "existing-slot", sourceId: "folder-a::2026/rollout.jsonl" }],
    getSourceStateId(source) {
      return [source.directoryId || "", source.path || source.name || ""].filter(Boolean).join("::");
    },
    async activateWorkspaceSlot(id) {
      activatedSlotIds.push(id);
    }
  };
  vm.runInNewContext(`${renderIndexedRolloutMatch[1]}\nglobalThis.testRenderIndexedRollout = renderIndexedRollout;`, tabReuseContext);
  await tabReuseContext.testRenderIndexedRollout("rollout-row");
  assert.deepEqual(activatedSlotIds, ["existing-slot"], "an indexed rollout already open in a tab must activate that tab");
  assert.equal(tabReuseContext.workspaceSlots.length, 1, "reopening an indexed rollout must not create a duplicate tab");
  assert.match(bootScript, /getFolderTabColor\(entry\.id\)/, "folder tabs must use stable folder colors");
  assert.match(bootScript, /directoryId: source\.directoryId \|\| ""/, "restored rollout slots must refresh their folder identity from the source");
  assert.match(bootScript, /url\.searchParams\.set\("slot", newSlotId\)/, "each independent window must receive a newly generated slot id");
  assert.match(bootScript, /saveCurrentRollout\(rollout, newSlotId\)/, "independent windows must clone rollout state into their own storage keys");
  assert.doesNotMatch(bootScript, /function renderHome\s*\(/, "the viewer must not keep a separate home screen");
  assert.doesNotMatch(bootScript, /walkDroppedEntry|webkitGetAsEntry/, "dropped folders must not bypass the remembered sessions-folders flow");
  assert.match(bootScript, /async function getSourcesFromDrop\(dataTransfer\)/, "drop handling must resolve persistent JSONL file handles when available");
  assert.match(bootScript, /handle\?\.kind === "directory"[\s\S]*?continue;/, "drop handling must reject directory handles");
  assert.match(bootScript, /activeWorkspaceViewKind !== "folders"/, "drag and drop must be limited to the sessions-folders page");
  assert.match(bootScript, /await restoreInitialWorkspaceView\(\);\s*\}\)\(\);/, "startup must restore the persisted visible tab deterministically");
  assert.match(bootScript, /activeWorkspaceViewKind === "rollout" && id === activeWorkspaceSlotId/, "rollout activation and refresh must distinguish a visible tab from a background selected slot");
  assert.match(bootScript, /const wasVisible = activeWorkspaceViewKind === "rollout" && wasSelectedSlot/, "closing a background rollout slot must not replace the visible folder view");
  assert.match(bootScript, /const shouldRenderActive = activeWorkspaceViewKind === "rollout"/, "background refresh must not take over folder views");
  assert.match(bootScript, /options\.navigationVersion \?\? \+\+workspaceNavigationVersion/, "folder scans must ignore stale results after another tab navigation");
  assert.match(bootScript, /const navigationVersion = \+\+workspaceNavigationVersion;[\s\S]*?const shouldRender = slotId === activeWorkspaceSlotId && navigationVersion === workspaceNavigationVersion/, "rollout reads must ignore stale results after another tab navigation");
  assert.match(bootScript, /renderActiveWorkspaceView\(\{ requestPermission: true \}\)/, "clicking a persisted rollout tab must be able to restore file-system permission");
  assert.match(bootScript, /function scrollToDocumentStartSoon\(\) \{[\s\S]*?activeWorkspaceViewKind === "folders" \|\| activeWorkspaceViewKind === "index"/, "sessions pages must guard their delayed scroll-to-top callbacks by view kind");
  assert.match(bootScript, /function scrollToDocumentEndSoon\(\) \{[\s\S]*?activeWorkspaceViewKind === "rollout"/, "scroll-to-bottom callbacks must be limited to rollout detail views");
  assert.match(bootScript, /async function renderDirectorySelectionPage\(notice = ""\) \{[\s\S]*?installWorkspaceBar\(\);\s*scrollToDocumentStartSoon\(\);/, "the sessions-folders page must scroll to the top after rendering");
  assert.match(bootScript, /function renderRolloutIndex\(items, label, notice = ""\) \{[\s\S]*?installWorkspaceBar\(\);\s*scrollToDocumentStartSoon\(\);/, "session rollout indexes must scroll to the newest rows at the top after rendering");
  assert.equal((bootScript.match(/scrollToDocumentEndSoon\(\);/g) || []).length, 2, "only rollout rendering and rollout-state restoration may request scrolling to the bottom");
  const scrollFunctionsMatch = bootScript.match(/(function scrollDocumentSoon\(getTop, isCurrentView\) \{[\s\S]*?function scrollToDocumentEndSoon\(\) \{[\s\S]*?\n    \})\n\n    function captureRenderedUiState/);
  assert.ok(scrollFunctionsMatch, "workspace scroll helpers must remain testable");
  const scrollCalls = [];
  const scrollContext = {
    activeWorkspaceViewKind: "folders",
    document: { body: { scrollHeight: 120 }, documentElement: { scrollHeight: 200 } },
    window: { scrollTo(options) { scrollCalls.push(options.top); } },
    requestAnimationFrame(callback) { callback(); },
    setTimeout(callback) { callback(); }
  };
  vm.runInNewContext(`${scrollFunctionsMatch[1]}\nglobalThis.testScrollStart = scrollToDocumentStartSoon; globalThis.testScrollEnd = scrollToDocumentEndSoon;`, scrollContext);
  scrollContext.testScrollStart();
  scrollContext.activeWorkspaceViewKind = "rollout";
  scrollContext.testScrollStart();
  scrollContext.testScrollEnd();
  scrollContext.activeWorkspaceViewKind = "index";
  scrollContext.testScrollEnd();
  assert.deepEqual(scrollCalls, [0, 0, 0, 200, 200, 200], "delayed scrolling must follow the currently visible workspace view");
  assert.match(bootScript, /loaded && !hadOpenDirectoryTab[\s\S]*?closeWorkspaceSlot\(rolloutSlotId\)/, "Back to index must replace the rollout tab when its folder tab was closed");
  assert.doesNotMatch(bootScript, /saveCurrentView\(\{\s*kind: "folders"/, "the folders tab must not overwrite a rollout slot view");
  assert.doesNotMatch(bootScript, /saveCurrentView\(\{\s*kind: "index"/, "folder index tabs must not overwrite a rollout slot view");
  assert.match(bootScript, /diff\.closest\("\[data-rollout-diff-scope\]"\) \|\| diff/, "restored diff modes must update controls outside the diff body");
  assert.match(bootScript, /button\.closest\("\[data-rollout-diff-scope\]"\)\?\.querySelector\("\[data-rollout-diff\]\[data-rollout-state-key\]"\)/, "diff mode clicks must persist through their enclosing scope");
}

async function checkMarkdownRendering() {
  const rendererSource = await readFile(path.resolve(projectDir, "rollout-renderer.js"), "utf8");
  assert.match(rendererSource, /\.rollout-role\.has-tool-role-names\s*\{[\s\S]*?border: 0;[\s\S]*?background: transparent;/, "concrete tool labels must not keep the outer purple frame");
  assert.match(rendererSource, /\.rollout-tool-role-name\.is-apply-patch\s*\{[\s\S]*?border-color: rgba\(63, 185, 80,[\s\S]*?color: var\(--wh-rollout-green\)/, "apply_patch tool labels must use matching green text and borders");
  assert.match(rendererSource, /\.rollout-tool-role-name\.is-exec-command\s*\{[\s\S]*?border-color: rgba\(88, 166, 255,[\s\S]*?color: var\(--wh-rollout-blue\)/, "exec command tool labels must use matching blue text and borders");
  assert.match(rendererSource, /data-rollout-collapse-level-zero>Collapse L0<\/button>[\s\S]*data-rollout-collapse-level-one>Collapse L1<\/button>[\s\S]*data-rollout-expand-level-one>Expand L1<\/button>/, "directory controls must use explicit collapse and expand labels");
  assert.match(rendererSource, /\.rollout-diff-word-add\s*\{[\s\S]*background: rgba\(63, 185, 80, 0\.42\)/, "word additions must use a stronger green highlight");
  assert.match(rendererSource, /\.rollout-diff-word-delete\s*\{[\s\S]*background: rgba\(255, 107, 107, 0\.42\)/, "word deletions must use a stronger red highlight");
  assert.match(rendererSource, /\.rollout-diff-prefix\s*\{[\s\S]*?user-select: none;/, "visible diff prefixes must stay outside manual text selection");
  assert.match(rendererSource, /\.rollout-exec-command-head > span:last-child\s*\{/, "patch stat colors must not be overridden by the tool-header secondary text rule");
  assert.match(rendererSource, /\.rollout-diff-file > summary\s*\{[\s\S]*?justify-content: flex-start;/, "patch file rows must stay left aligned");
  assert.match(rendererSource, /\.rollout-patch-file-title\s*\{[\s\S]*?font-weight: 750;/, "Patch diff file titles must be bold");
  assert.match(rendererSource, /\.rollout-final-answer-turn\s*\{[\s\S]*?width: calc\(100% - 28px\);[\s\S]*?margin-left: 28px;/, "final-answer turns must be narrower and indented on desktop");
  assert.match(rendererSource, /@media \(max-width: 640px\)[\s\S]*?\.rollout-final-answer-turn\s*\{[\s\S]*?width: calc\(100% - 12px\);[\s\S]*?margin-left: 12px;/, "final-answer turns must keep a smaller mobile indent");
  assert.match(rendererSource, /\.rollout-steer-turn\s*\{[\s\S]*?width: calc\(100% - 28px\);[\s\S]*?margin-left: 28px;/, "steer turns must be narrower and indented on desktop");
  assert.match(rendererSource, /@media \(max-width: 640px\)[\s\S]*?\.rollout-steer-turn\s*\{[\s\S]*?width: calc\(100% - 12px\);[\s\S]*?margin-left: 12px;/, "steer turns must keep a smaller mobile indent");
  assert.match(rendererSource, /\.rollout-tree > details\.rollout-steer-nav\s*\{[\s\S]*?margin-left: 14px;/, "steer turns must also be indented in the outline");
  const runnableRenderer = rendererSource
    .replace(/^export\s+/gm, "")
    .replace(/import\.meta\.url/g, JSON.stringify("file:///codex-rollout-viewer/rollout-renderer.js"));
  const rendererContext = { console };
  vm.runInNewContext(
    `${runnableRenderer}\nglobalThis.__rolloutTest = { buildGroupFinalAnswer, buildGroupSections, buildGroups, createRenderableRecords, getGitDiffText, getReadableToolOutput, getRecordsPatchFiles, getRecordsPatchStats, getSteerParentTurnIds, isFinalAnswerRecord, openSidebarRolloutTarget, parseExecCommandCalls, parseExecToolNames, parseExecWrapperOutput, parseNestedToolArguments, parsePatchApplyEndChanges, parseStructuredToolOutput, renderAssistantSection, renderEvent, renderFinalAnswerSection, renderFunctionCall, renderGroupSection, renderMarkdownContent, renderMessage, renderSidebarFinalAnswer, renderSidebarGroup, renderToolCallGroup, renderTurnGroup, renderTurnGroupWithFinalAnswer, renderWordDiffPair, setRolloutDirectoryLevel };`,
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
  const userMessageHtml = rendererContext.__rolloutTest.renderMessage({
    line: 9,
    value: { type: "response_item", payload: { type: "message", role: "user", content: [{ type: "input_text", text: "# Raw user Markdown" }] } }
  });
  const assistantMessageHtml = rendererContext.__rolloutTest.renderMessage({
    line: 10,
    value: { type: "response_item", payload: { type: "message", role: "assistant", content: [{ type: "output_text", text: "**Raw assistant Markdown**" }] } }
  });
  const developerMessageHtml = rendererContext.__rolloutTest.renderMessage({
    line: 11,
    value: { type: "response_item", payload: { type: "message", role: "developer", content: [{ type: "input_text", text: "Developer instruction" }] } }
  });
  assert.match(userMessageHtml, /data-rollout-copy-markdown="message-9-\d+"/, "user messages must expose a raw Markdown copy button");
  assert.match(assistantMessageHtml, /data-rollout-copy-markdown="message-10-\d+"/, "assistant messages must expose a raw Markdown copy button");
  assert.doesNotMatch(developerMessageHtml, /data-rollout-copy-markdown/, "non-user and non-assistant messages must not expose the Markdown copy button");
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
  const localCompactRecords = rendererContext.__rolloutTest.createRenderableRecords([
    { line: 20, value: { type: "response_item", payload: { type: "message", role: "user", content: [{ type: "input_text", text: "Previous task" }], internal_chat_message_metadata_passthrough: { turn_id: "previous-turn" } } } },
    { line: 21, value: { type: "response_item", payload: { type: "message", role: "assistant", phase: "final_answer", content: [{ type: "output_text", text: "## Handoff summary\n\nContinue from here." }], internal_chat_message_metadata_passthrough: { turn_id: "compact-turn" } } } },
    { line: 22, value: { type: "event_msg", payload: { type: "token_count" } } },
    { line: 23, value: { type: "compacted", payload: { message: "Another model produced a handoff summary.", replacement_history: [{ type: "compaction" }] } } },
    { line: 24, value: { type: "world_state", payload: { full: false } } },
    { line: 25, value: { type: "turn_context", payload: { turn_id: "compact-turn" } } },
    { line: 26, value: { type: "response_item", payload: { type: "message", role: "user", content: [{ type: "input_text", text: "Continue" }], internal_chat_message_metadata_passthrough: { turn_id: "compact-turn" } } } },
    { line: 27, value: { type: "response_item", payload: { type: "message", role: "assistant", phase: "commentary", content: [{ type: "output_text", text: "Continuing work." }], internal_chat_message_metadata_passthrough: { turn_id: "compact-turn" } } } }
  ]);
  const localCompactGroups = rendererContext.__rolloutTest.buildGroups(localCompactRecords);
  const localCompactSummary = localCompactRecords.find(record => record.line === 21);
  assert.equal(rendererContext.__rolloutTest.isFinalAnswerRecord(localCompactSummary), false, "a final_answer immediately consumed by local compact must not remain a completed answer");
  assert.equal(rendererContext.__rolloutTest.buildGroupFinalAnswer(localCompactGroups[1]), null, "a local compact handoff must not attach as the next user turn's final answer");
  const localCompactSection = rendererContext.__rolloutTest.buildGroupSections(localCompactGroups[0])
    .find(section => section.kind === "compact");
  assert.equal(localCompactSection.title, "Local compact", "top-level compacted records must use the local compact label");
  assert.deepEqual(Array.from(localCompactSection.records, record => record.line), [21, 23, 24, 25], "the generated handoff summary and compact bridge must render in one compact section");
  const localCompactHtml = rendererContext.__rolloutTest.renderGroupSection(localCompactSection, { callById: new Map() });
  assert.match(localCompactHtml, /Local compact[\s\S]*local compact summary[\s\S]*Copy MD[\s\S]*Handoff summary/, "local compact must render the handoff Markdown inside the compact section");
  assert.doesNotMatch(localCompactHtml, /phase: final_answer|Another model produced a handoff summary/, "local compact rendering must not retain final-answer labeling or duplicate the wrapper message");

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
  assert.doesNotMatch(mainSectionHtml, /data-rollout-state-key/, "level-two assistant sections must not persist their expanded state");

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
  assert.equal(
    rendererContext.__rolloutTest.getGitDiffText(parsedPatchFiles),
    [
      "diff --git a/src/old.js b/src/new.js",
      "--- a/src/old.js",
      "+++ b/src/new.js",
      "@@ -1 +1 @@",
      "-old value",
      "+new value",
      "",
      "diff --git a/src/added.js b/src/added.js",
      "--- /dev/null",
      "+++ b/src/added.js",
      "@@ -0,0 +1,2 @@",
      "+first",
      "+second",
      ""
    ].join("\n"),
    "copied patches must use complete Git diff headers and preserve line prefixes"
  );
  const missingAddPatchText = [
    "*** Begin Patch",
    "*** Add File: src/new-plan.md",
    "+# Plan",
    "+",
    "+Details",
    "*** End Patch"
  ].join("\n");
  const missingAddRecords = rendererContext.__rolloutTest.createRenderableRecords([
    {
      line: 12,
      value: {
        type: "response_item",
        payload: {
          type: "custom_tool_call",
          name: "exec",
          call_id: "call-add-file",
          input: `const patch = ${JSON.stringify(missingAddPatchText)};\ntext(await tools.apply_patch(patch));`
        }
      }
    },
    {
      line: 13,
      value: {
        type: "event_msg",
        payload: {
          type: "patch_apply_end",
          changes: {
            "/repo/src/new-plan.md": { type: "add", unified_diff: "", move_path: null },
            "/repo/src/existing.js": { type: "update", unified_diff: "@@ -1 +1 @@\n-old\n+new\n", move_path: null }
          }
        }
      }
    }
  ]);
  const recoveredAddChanges = missingAddRecords[0].toolGroup.eventRecords[0].value.payload.changes;
  assert.match(recoveredAddChanges["/repo/src/new-plan.md"].unified_diff, /^@@ -0,0 \+1,3 @@\n\+# Plan\n\+\n\+Details\n$/);
  assert.equal(recoveredAddChanges["/repo/src/existing.js"].unified_diff, "@@ -1 +1 @@\n-old\n+new\n", "existing event diffs must remain authoritative");
  assert.deepEqual(
    Array.from(rendererContext.__rolloutTest.getRecordsPatchFiles(missingAddRecords), file => [file.path, file.additions, file.deletions]),
    [["/repo/src/new-plan.md", 3, 0], ["/repo/src/existing.js", 1, 1]],
    "empty Add File event diffs must recover from the matching apply_patch input"
  );
  const dynamicAddInput = [
    "const content = String.raw`alpha",
    "beta",
    "gamma`;",
    "const patch = \"*** Begin Patch\\n*** Add File: /repo/src/dynamic.md\\n\" +",
    "  content.split(\"\\n\").map(line => \"+\" + line).join(\"\\n\") +",
    "  \"\\n*** End Patch\";",
    "text(await tools.apply_patch(patch));"
  ].join("\n");
  const dynamicAddRecords = rendererContext.__rolloutTest.createRenderableRecords([
    { line: 13, value: { type: "response_item", payload: { type: "custom_tool_call", name: "exec", call_id: "call-dynamic-add", input: dynamicAddInput } } },
    { line: 14, value: { type: "event_msg", payload: { type: "patch_apply_end", success: true, changes: { "/repo/src/dynamic.md": { type: "add", unified_diff: "", move_path: null } } } } },
    { line: 15, value: { type: "response_item", payload: { type: "custom_tool_call_output", call_id: "call-dynamic-add", output: [{ type: "input_text", text: "Script completed\\n" }] } } },
    { line: 16, value: { type: "response_item", payload: { type: "custom_tool_call", name: "apply_patch", call_id: "call-dynamic-update", input: "*** Begin Patch\n*** Update File: /repo/src/dynamic.md\n@@\n alpha\n-beta\n gamma\n*** End Patch" } } },
    { line: 17, value: { type: "event_msg", payload: { type: "patch_apply_end", success: true, changes: { "/repo/src/dynamic.md": { type: "update", unified_diff: "@@ -1,3 +1,2 @@\n alpha\n-beta\n gamma\n", move_path: null } } } } },
    { line: 18, value: { type: "response_item", payload: { type: "custom_tool_call_output", call_id: "call-dynamic-update", output: "Success" } } }
  ]);
  const dynamicAddFiles = rendererContext.__rolloutTest.getRecordsPatchFiles(dynamicAddRecords);
  assert.deepEqual(
    Array.from(dynamicAddFiles, file => [file.path, file.changeType, file.additions, file.deletions]),
    [["/repo/src/dynamic.md", "add", 2, 0]],
    "dynamically constructed Add File patches must compose into the final added content"
  );
  assert.match(dynamicAddFiles[0].unifiedDiff, /^@@ -0,0 \+1,2 @@\n\+alpha\n\+gamma$/);
  assert.doesNotMatch(dynamicAddFiles[0].unifiedDiff, /beta/, "lines removed after a dynamic Add File patch must disappear from the aggregate diff");
  const fileChangeRecords = rendererContext.__rolloutTest.createRenderableRecords([
    { line: 23, value: { type: "response_item", payload: { type: "custom_tool_call", name: "exec", call_id: "file-change-call", input: "await tools.apply_patch(\"*** Begin Patch\\n*** End Patch\")", internal_chat_message_metadata_passthrough: { turn_id: "file-change-turn" } } } },
    { line: 24, value: { type: "event_msg", payload: { type: "item_completed", turn_id: "file-change-turn", item: { type: "FileChange", status: "completed", changes: { "/repo/src/new.js": { type: "add", unified_diff: "@@ -0,0 +1,1 @@\n+new\n", move_path: null } } } } } },
    { line: 25, value: { type: "response_item", payload: { type: "custom_tool_call_output", call_id: "file-change-call", output: [{ type: "input_text", text: "Script completed\\n" }], internal_chat_message_metadata_passthrough: { turn_id: "file-change-turn" } } } }
  ]);
  assert.equal(fileChangeRecords.length, 1, "new FileChange records must attach to their tool call instead of rendering as a separate event");
  assert.deepEqual(
    Array.from(rendererContext.__rolloutTest.getRecordsPatchFiles(fileChangeRecords), file => [file.path, file.additions, file.deletions]),
    [["/repo/src/new.js", 1, 0]],
    "item_completed FileChange records must feed changed-file diff summaries"
  );
  const fileChangeHtml = rendererContext.__rolloutTest.renderToolCallGroup(fileChangeRecords[0]);
  assert.match(fileChangeHtml, /apply_patch[\s\S]*Copy diff[\s\S]*Unified[\s\S]*Split[\s\S]*src\/new\.js/, "new FileChange records must render their diff controls and changed path inside the tool card");
  const rawItemCompletedRecords = rendererContext.__rolloutTest.createRenderableRecords([
    { line: 26, value: { type: "event_msg", payload: { type: "item_completed", turn_id: "turn-empty", item: { type: "Reasoning", id: "reasoning-empty", summary_text: [], raw_content: [] } } } },
    { line: 27, value: { type: "event_msg", payload: { type: "item_completed", turn_id: "turn-mirrored", item: { type: "AgentMessage", id: "message-mirrored", content: [{ type: "Text", text: "Already represented by a response_item." }] } } } },
    { line: 28, value: { type: "event_msg", payload: { type: "item_completed", turn_id: "turn-empty-change", item: { type: "FileChange", id: "file-change-empty", status: "completed", changes: {} } } } }
  ]);
  assert.deepEqual(Array.from(rawItemCompletedRecords, record => record.line), [], "raw item_completed lifecycle records must not render empty event cards");
  const wordDiffPair = rendererContext.__rolloutTest.renderWordDiffPair("count = 2", "count = 8");
  assert.equal(wordDiffPair.deletedHtml, 'count = <span class="rollout-diff-word-delete">2</span>', "word diff must highlight only the replaced deletion token");
  assert.equal(wordDiffPair.addedHtml, 'count = <span class="rollout-diff-word-add">8</span>', "word diff must highlight only the replaced addition token");
  const patchCallHtml = rendererContext.__rolloutTest.renderFunctionCall({
    line: 20,
    value: { payload: { name: "apply_patch", input: "*** Begin Patch\n*** Update File: wrong.js\n-old\n+new\n*** End Patch" } }
  });
  assert.doesNotMatch(patchCallHtml, /rollout-patch-details/, "apply_patch call input must not be rendered as the resulting patch diff");
  const patchEndHtml = rendererContext.__rolloutTest.renderEvent({
    line: 21,
    value: { type: "event_msg", payload: { type: "patch_apply_end", success: true, status: "completed", changes: patchChanges } }
  });
  assert.match(patchEndHtml, /rollout-patch-tool-summary"><span>apply_patch<\/span>[\s\S]*rollout-patch-additions">\+3<[\s\S]*rollout-patch-deletions">-1</, "apply_patch headers must show colored total stats");
  assert.match(patchEndHtml, /src\/old\.js -&gt; src\/new\.js/, "patch_apply_end must render move_path from its changes data");
  assert.doesNotMatch(patchEndHtml, /<details class="rollout-diff-file" open/, "patch files must be collapsed by default");
  assert.doesNotMatch(patchEndHtml, /patch-file-\d+/, "patch file open state must not be persisted");
  assert.equal((patchEndHtml.match(/<details class="rollout-diff-file"/g) || []).length, 2, "multi-file patches must render one flat details entry per file");
  assert.match(
    patchEndHtml,
    /rollout-exec-command-head">[\s\S]*apply_patch[\s\S]*>Copy diff<[\s\S]*>Unified<[\s\S]*>Split<[\s\S]*<\/div>\s*<div class="rollout-diff/,
    "diff mode controls must share the gray apply_patch header line"
  );
  assert.match(patchEndHtml, /data-rollout-diff-scope[\s\S]*data-rollout-copy-diff=/, "patch diff actions must target their own diff scope");
  assert.equal((patchEndHtml.match(/rollout-copy-file-diff/g) || []).length, 2, "each patch file must expose its own copy button");
  assert.doesNotMatch(patchEndHtml, /rollout-patch-details|files changed|Patch diff, 2 files/, "patches must not render an aggregate folding layer or duplicate totals");
  const singlePatchHtml = rendererContext.__rolloutTest.renderEvent({
    line: 22,
    value: { type: "event_msg", payload: { type: "patch_apply_end", success: true, changes: { "src/old.js": patchChanges["src/old.js"] } } }
  });
  assert.match(
    singlePatchHtml,
    /rollout-patch-file-label"><span class="rollout-patch-file-title">Patch diff<\/span><span class="rollout-diff-path">src\/old\.js -&gt; src\/new\.js<\/span><span class="rollout-diff-file-stat">[\s\S]*rollout-patch-additions">\+1<[\s\S]*rollout-patch-deletions">-1<[\s\S]*<\/span><\/span>\s*<button class="rollout-copy-diff rollout-copy-file-diff"[^>]*>Copy diff<\/button>\s*<\/summary>/,
    "single-file patch summaries must show the path, stats, and file copy action directly"
  );
  assert.equal((singlePatchHtml.match(/data-rollout-copy-diff=/g) || []).length, 2, "single-file patches must keep separate whole-patch and file copy actions");
  assert.equal((singlePatchHtml.match(/<details class="rollout-diff-file"/g) || []).length, 1, "single-file patches must use the same one-details-per-file layout");
  assert.doesNotMatch(singlePatchHtml, /rollout-patch-details/, "single-file patches must not create an aggregate details layer");

  const completedTurnRecords = rendererContext.__rolloutTest.createRenderableRecords([
    { line: 40, value: { type: "response_item", payload: { type: "message", role: "user", content: [{ type: "input_text", text: "Original request" }], internal_chat_message_metadata_passthrough: { turn_id: "turn-original" } } } },
    { line: 41, value: { type: "event_msg", payload: { type: "task_started", turn_id: "turn-original" } } },
    { line: 42, value: { type: "response_item", payload: { type: "message", role: "assistant", phase: "commentary", content: [{ type: "output_text", text: "Working update" }], internal_chat_message_metadata_passthrough: { turn_id: "turn-original" } } } },
    { line: 43, value: { type: "event_msg", payload: { type: "patch_apply_end", turn_id: "turn-original", success: true, changes: { "src/old.js": patchChanges["src/old.js"] } } } },
    { line: 44, value: { type: "event_msg", payload: { type: "task_complete", turn_id: "turn-original" } } },
    { line: 45, value: { type: "event_msg", payload: { type: "task_started", turn_id: "turn-steer" } } },
    { line: 46, value: { type: "response_item", payload: { type: "message", role: "user", content: [{ type: "input_text", text: "Steer while working" }], internal_chat_message_metadata_passthrough: { turn_id: "turn-steer" } } } },
    { line: 47, value: { type: "response_item", payload: { type: "message", role: "assistant", phase: "commentary", content: [{ type: "output_text", text: "Steered update" }], internal_chat_message_metadata_passthrough: { turn_id: "turn-steer" } } } },
    { line: 48, value: { type: "event_msg", payload: { type: "patch_apply_end", turn_id: "turn-steer", success: true, changes: { "src/steer.js": patchChanges["src/added.js"] } } } },
    { line: 49, value: { type: "response_item", payload: { type: "message", role: "assistant", phase: "final_answer", content: [{ type: "output_text", text: "\nFinished result\n\nMore details" }], internal_chat_message_metadata_passthrough: { turn_id: "turn-original" } } } }
  ]);
  const repeatedTextRecords = rendererContext.__rolloutTest.createRenderableRecords([
    { line: 30, value: { type: "response_item", payload: { type: "message", role: "user", content: [{ type: "input_text", text: "Continue" }], internal_chat_message_metadata_passthrough: { turn_id: "repeat-a" } } } },
    { line: 31, value: { type: "response_item", payload: { type: "message", role: "user", content: [{ type: "input_text", text: "Continue" }], internal_chat_message_metadata_passthrough: { turn_id: "repeat-b" } } } }
  ]);
  assert.equal(repeatedTextRecords.length, 2, "identical user text from different turns must not be deduplicated before steer detection");
  const mirroredMessageRecords = rendererContext.__rolloutTest.createRenderableRecords([
    { line: 32, value: { type: "event_msg", payload: { type: "agent_message", phase: "commentary", message: "Working update" } } },
    { line: 33, value: { type: "response_item", payload: { type: "message", role: "assistant", phase: "commentary", content: [{ type: "output_text", text: "Working update" }], internal_chat_message_metadata_passthrough: { turn_id: "mirror-a" } } } },
    { line: 34, value: { type: "response_item", payload: { type: "message", role: "user", content: [{ type: "input_text", text: "Continue" }], internal_chat_message_metadata_passthrough: { turn_id: "mirror-b" } } } },
    { line: 35, value: { type: "event_msg", payload: { type: "user_message", message: "Continue" } } },
    { line: 36, value: { type: "event_msg", payload: { type: "agent_message", phase: "commentary", message: "Working update" } } },
    { line: 37, value: { type: "response_item", payload: { type: "message", role: "assistant", phase: "commentary", content: [{ type: "output_text", text: "Working update" }], internal_chat_message_metadata_passthrough: { turn_id: "mirror-c" } } } }
  ]);
  assert.deepEqual(
    Array.from(mirroredMessageRecords, record => [record.line, record.value.type]),
    [[33, "response_item"], [34, "response_item"], [37, "response_item"]],
    "adjacent event_msg mirrors must be removed while identical messages from separate turns remain"
  );
  const environmentContextRecords = rendererContext.__rolloutTest.createRenderableRecords([
    { line: 38, value: { type: "response_item", payload: { type: "message", role: "user", content: [{ type: "input_text", text: "\n<environment_context>\n<cwd>/repo</cwd>\n</environment_context>\n" }], internal_chat_message_metadata_passthrough: { turn_id: "environment-turn" } } } },
    { line: 39, value: { type: "response_item", payload: { type: "message", role: "user", content: [{ type: "input_text", text: "Actual request" }], internal_chat_message_metadata_passthrough: { turn_id: "environment-turn" } } } }
  ]);
  assert.deepEqual(
    Array.from(environmentContextRecords, record => record.line),
    [39],
    "environment-only user messages must not create a separate renderable turn"
  );
  const completedGroups = rendererContext.__rolloutTest.buildGroups(completedTurnRecords);
  const originalSections = rendererContext.__rolloutTest.buildGroupSections(completedGroups[0]);
  const steerSections = rendererContext.__rolloutTest.buildGroupSections(completedGroups[1]);
  const finalSection = rendererContext.__rolloutTest.buildGroupFinalAnswer(completedGroups[0]);
  assert.ok(finalSection, "a user turn with a matching final_answer must receive a final section");
  assert.equal(finalSection.title, "Finished result More details", "the final section title must collapse the full final-answer body into one line");
  assert.equal(rendererContext.__rolloutTest.buildGroupFinalAnswer(completedGroups[1]), null, "a steer turn without final_answer must not receive a final section");
  assert.equal(completedGroups[0].isSteer, false, "the active user turn must remain a normal turn");
  assert.equal(completedGroups[1].isSteer, true, "a user turn arriving before the previous final_answer must be marked as steer even after task_complete");
  assert.equal(completedGroups[1].steerParent, completedGroups[0], "steer turns must retain their interrupted parent turn");
  assert.deepEqual(Array.from(finalSection.patchFiles, file => file.path), ["src/old.js", "src/steer.js"], "final summaries must include changed files from both sides of a steer boundary");
  const steerOwnedTurnRecords = completedTurnRecords.map(record => record.line !== 49 ? record : {
    ...record,
    value: {
      ...record.value,
      payload: {
        ...record.value.payload,
        internal_chat_message_metadata_passthrough: { turn_id: "turn-steer" }
      }
    }
  });
  const steerOwnedGroups = rendererContext.__rolloutTest.buildGroups(steerOwnedTurnRecords);
  const steerOwnedFinal = rendererContext.__rolloutTest.buildGroupFinalAnswer(steerOwnedGroups[1]);
  assert.equal(rendererContext.__rolloutTest.buildGroupFinalAnswer(steerOwnedGroups[0]), null, "a final_answer owned by a steer must not be duplicated under its parent turn");
  assert.deepEqual(Array.from(steerOwnedFinal.patchFiles, file => file.path), ["src/old.js", "src/steer.js"], "steer-owned final summaries must include pre-steer changes in JSONL order");
  assert.equal(originalSections.some(section => section.kind === "final"), false, "final_answer must not be nested inside the user turn sections");
  assert.deepEqual(Array.from(finalSection.records, record => record.line), [49], "the final section must contain only final_answer records");
  assert.equal(originalSections.some(section => section.records.includes(finalSection.records[0])), false, "final_answer must be removed from commentary sections");
  assert.equal(steerSections.some(section => section.records.includes(finalSection.records[0])), false, "a final_answer from an earlier turn must not render inside the steer turn");
  const steerHtml = rendererContext.__rolloutTest.renderTurnGroup(completedGroups[1], { callById: new Map() });
  assert.match(steerHtml, /class="rollout-turn rollout-steer-turn"[\s\S]*rollout-turn-meta">\s*<span>steer<\/span>/, "steer turns must render with the indented class and visible metadata");
  assert.match(rendererContext.__rolloutTest.renderSidebarGroup(completedGroups[1], new Map()), /class="rollout-steer-nav"/, "steer turns must be identifiable in the outline");
  const steerLifecycle = rendererContext.__rolloutTest.getSteerParentTurnIds([
    { value: { type: "response_item", payload: { type: "message", role: "user", content: [{ type: "input_text", text: "A" }], internal_chat_message_metadata_passthrough: { turn_id: "a" } } } },
    { value: { type: "event_msg", payload: { type: "task_complete", turn_id: "a" } } },
    { value: { type: "response_item", payload: { type: "message", role: "user", content: [{ type: "input_text", text: "B" }], internal_chat_message_metadata_passthrough: { turn_id: "b" } } } },
    { value: { type: "response_item", payload: { type: "message", role: "assistant", phase: "final_answer", content: [{ type: "output_text", text: "Done" }], internal_chat_message_metadata_passthrough: { turn_id: "b" } } } },
    { value: { type: "response_item", payload: { type: "message", role: "user", content: [{ type: "input_text", text: "C" }], internal_chat_message_metadata_passthrough: { turn_id: "c" } } } }
  ]);
  assert.equal(JSON.stringify(Array.from(steerLifecycle)), JSON.stringify([["b", "a"]]), "task_complete must not end steer detection, while final_answer must end it");
  const repeatedPatchFiles = rendererContext.__rolloutTest.getRecordsPatchFiles([
    { line: 46, value: { type: "event_msg", payload: { type: "patch_apply_end", changes: { "src/old.js": patchChanges["src/old.js"] } } } },
    { line: 47, value: { type: "event_msg", payload: { type: "patch_apply_end", changes: { "src/old.js": { ...patchChanges["src/old.js"], unified_diff: "@@ -2 +2 @@\n-before\n+after\n" }, "src/added.js": patchChanges["src/added.js"] } } } }
  ]);
  assert.deepEqual(
    Array.from(repeatedPatchFiles, file => [file.path, file.additions, file.deletions]),
    [["src/old.js", 2, 2], ["src/added.js", 2, 0]],
    "final summaries must compose repeated patches into one net entry per changed file"
  );
  const createdFileLines = Array.from({ length: 100 }, (unused, index) => `line ${index + 1}`);
  const netAddedFileRecords = [
    { line: 48, value: { type: "event_msg", payload: { type: "patch_apply_end", changes: { "src/generated.txt": { type: "add", unified_diff: `@@ -0,0 +1,100 @@\n${createdFileLines.map(line => `+${line}`).join("\n")}\n` } } } } },
    { line: 49, value: { type: "event_msg", payload: { type: "patch_apply_end", changes: { "src/generated.txt": { type: "update", unified_diff: `@@ -96,5 +95,0 @@\n${createdFileLines.slice(95).map(line => `-${line}`).join("\n")}\n` } } } } }
  ];
  const netAddedFile = rendererContext.__rolloutTest.getRecordsPatchFiles(netAddedFileRecords)[0];
  assert.deepEqual(
    [netAddedFile.changeType, netAddedFile.additions, netAddedFile.deletions],
    ["add", 95, 0],
    "a file created with 100 lines and then shortened by 5 must summarize as a net 95-line addition"
  );
  assert.doesNotMatch(netAddedFile.unifiedDiff, /^-/m, "lines removed from a newly created file must disappear from the aggregate diff");
  const revertedPatchFiles = rendererContext.__rolloutTest.getRecordsPatchFiles([
    { line: 50, value: { type: "event_msg", payload: { type: "patch_apply_end", changes: { "src/reverted.txt": { type: "update", unified_diff: "@@ -1,1 +1,1 @@\n-old\n+new\n" } } } } },
    { line: 51, value: { type: "event_msg", payload: { type: "patch_apply_end", changes: { "src/reverted.txt": { type: "update", unified_diff: "@@ -1,1 +1,1 @@\n-new\n+old\n" } } } } }
  ]);
  assert.equal(revertedPatchFiles.length, 0, "a change fully reverted within the turn must disappear from the aggregate diff");
  const missingHunkPatchFile = rendererContext.__rolloutTest.getRecordsPatchFiles([
    { line: 52, value: { type: "event_msg", payload: { type: "patch_apply_end", changes: { "src/missing-diff.txt": { type: "add", unified_diff: "" } } } } },
    { line: 53, value: { type: "event_msg", payload: { type: "patch_apply_end", changes: { "src/missing-diff.txt": { type: "update", unified_diff: "@@ -1,1 +1,1 @@\n-old\n+new\n" } } } } }
  ])[0];
  assert.equal(missingHunkPatchFile.changeType, "add", "missing hunk data must fall back without losing the file lifecycle");
  assert.equal(missingHunkPatchFile.deletions, 1, "missing hunk data must not be mistaken for a fully reverted file");
  const finalHtml = rendererContext.__rolloutTest.renderFinalAnswerSection({ ...finalSection, patchFiles: repeatedPatchFiles }, { callById: new Map() });
  assert.match(finalHtml, /1\. Finished result More details[\s\S]*final_answer[\s\S]*Finished result[\s\S]*More details[\s\S]*Changed files/, "final sections must collapse the full body into a one-line title and render the original answer before changed files");
  assert.match(finalHtml, /class="rollout-turn rollout-final-answer-turn"[\s\S]*data-rollout-level="1"/, "final sections must render as level-one turn siblings");
  assert.doesNotMatch(finalHtml, /rollout-assistant-section|data-rollout-level="2"/, "final sections must not use the nested assistant-section structure");
  assert.doesNotMatch(finalHtml, /Working update|Steered update/, "final sections must not include commentary messages");
  assert.equal((finalHtml.match(/<details class="rollout-diff-file"/g) || []).length, 2, "final summaries must render one aggregate diff entry per changed file");
  assert.equal((finalHtml.match(/rollout-copy-file-diff/g) || []).length, 2, "final summaries must expose a copy action for every changed file");
  assert.equal((finalHtml.match(/src\/old\.js/g) || []).length, 1, "a repeatedly edited file must appear only once in the aggregate diff");
  assert.match(finalHtml, /class="rollout-final-changes" data-rollout-diff-scope>[\s\S]*data-rollout-copy-diff=[\s\S]*data-rollout-diff-mode="split"/, "final changed files must expose scoped copy and split controls");
  const repeatedGitDiff = rendererContext.__rolloutTest.getGitDiffText(repeatedPatchFiles);
  assert.match(repeatedGitDiff, /-old value\n-before\n\+new value\n\+after/, "copied final diffs must contain the composed net changes for a repeatedly edited file");
  const turnPairHtml = rendererContext.__rolloutTest.renderTurnGroupWithFinalAnswer(completedGroups[0], { callById: new Map() });
  assert.match(turnPairHtml, /id="turn-1"[\s\S]*<details class="rollout-turn rollout-final-answer-turn" id="final-49"/, "the final section must follow its user turn as a sibling");
  assert.match(rendererContext.__rolloutTest.renderSidebarFinalAnswer(completedGroups[0]), /<a class="rollout-final-answer-link" href="#final-49">1\. Finished result More details<\/a>/, "the outline final-answer link must use the same collapsed full-body title");

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
    Array.from(rendererContext.__rolloutTest.parseExecToolNames(execInput)),
    ["exec_command", "exec_command", "apply_patch"],
    "exec wrappers must expose their concrete nested tool names"
  );
  assert.deepEqual(
    Array.from(rendererContext.__rolloutTest.parseStructuredToolOutput(execOutputValue).results, result => result.exit_code),
    [0, 1],
    "structured exec results must be decoded from content blocks"
  );
  const groupedExecHtml = rendererContext.__rolloutTest.renderToolCallGroup(combinedExecRecords[0]);
  assert.match(
    groupedExecHtml,
    /rollout-role rollout-role-error has-tool-role-names">[\s\S]*is-apply-patch">apply_patch<[\s\S]*rollout-tool-role-separator"> \/ <[\s\S]*is-exec-command">exec_command</,
    "concrete, independently colored tool names must replace the generic role label"
  );
  assert.doesNotMatch(groupedExecHtml, /rollout-call-id|call-exec|<dt>Call ID<\/dt>/, "call ids must not be rendered");
  assert.doesNotMatch(groupedExecHtml, />tool<|>exec<|exec_command [12]\/2/, "tool cards must not show wrapper labels or command counters");
  assert.equal((groupedExecHtml.match(/>exec_command<\/span>/g) || []).length, 3, "the colored role and each nested command must keep the concrete tool label");
  assert.doesNotMatch(groupedExecHtml, /<dt>(?:Tool|Call ID|Status|Commands|Plans|Patches)<\/dt>|Raw exec input/, "redundant exec metadata and raw wrapper input must be omitted");
  assert.doesNotMatch(groupedExecHtml, />completed<|>success</, "successful status labels must be omitted");
  assert.match(groupedExecHtml, /apply_patch<\/span>[\s\S]*rollout-patch-additions">\+3<[\s\S]*rollout-patch-deletions">-1/, "grouped exec must show colored total patch stats after apply_patch");
  assert.doesNotMatch(groupedExecHtml, /\[object Object\]/, "grouped tool output must not stringify content blocks as object placeholders");
  assert.deepEqual(
    { ...rendererContext.__rolloutTest.getRecordsPatchStats(combinedExecRecords) },
    { files: 2, additions: 3, deletions: 1, patches: 1 },
    "directory stats must include patch events attached to exec wrappers"
  );
  const patchSectionHtml = rendererContext.__rolloutTest.renderAssistantSection({
    id: "assistant-patch",
    title: "Changed files",
    records: combinedExecRecords
  }, { callById: new Map() });
  assert.match(
    patchSectionHtml,
    /rollout-directory-patch-stats">[\s\S]*rollout-patch-additions">\+3<[\s\S]*rollout-patch-deletions">-1<[\s\S]*rollout-assistant-title">Changed files</,
    "main-area level-two directories must show colored line changes before the title"
  );
  const patchTurnHtml = rendererContext.__rolloutTest.renderTurnGroup({
    id: "turn-patch",
    index: 2,
    title: "Changed files",
    isPreamble: false,
    records: combinedExecRecords
  }, { callById: new Map() });
  assert.match(
    patchTurnHtml,
    /<h2>[\s\S]*rollout-patch-additions">\+3<[\s\S]*rollout-patch-deletions">-1<[\s\S]*rollout-turn-heading-text">2\. Changed files/,
    "main-area level-one directories must show colored line changes before the title"
  );

  const quotedExecInput = 'const r = await tools.exec_command({"cmd":"printf real","workdir":"/repo"}); text(r.output);';
  assert.deepEqual(
    Array.from(rendererContext.__rolloutTest.parseExecCommandCalls(quotedExecInput), command => [command.command, command.workdir]),
    [["printf real", "/repo"]],
    "nested exec_command parsing must accept quoted JSON property names"
  );
  const plainExecOutput = [
    { type: "input_text", text: "Script completed\nWall time 0.2 seconds\nOutput:\n" },
    { type: "input_text", text: "real output\n" }
  ];
  assert.deepEqual(
    Array.from(rendererContext.__rolloutTest.parseExecWrapperOutput(plainExecOutput).results, result => [result.output, result.wall_time_seconds]),
    [["real output", 0.2]],
    "plain exec wrapper blocks must normalize into the matching command result"
  );
  const plainExecRecords = rendererContext.__rolloutTest.createRenderableRecords([
    { line: 33, value: { type: "response_item", payload: { type: "custom_tool_call", name: "exec", call_id: "call-plain-exec", status: "completed", input: quotedExecInput } } },
    { line: 34, value: { type: "response_item", payload: { type: "custom_tool_call_output", call_id: "call-plain-exec", output: plainExecOutput } } }
  ]);
  const plainExecHtml = rendererContext.__rolloutTest.renderToolCallGroup(plainExecRecords[0]);
  assert.match(plainExecHtml, /printf real/, "plain wrapper output must keep the command text");
  assert.match(plainExecHtml, /Output, 11 characters/, "plain wrapper output must attach stdout to the command card");
  assert.doesNotMatch(plainExecHtml, /Command text unavailable|No output|Additional output/, "a matched plain exec result must not render fallback placeholders or duplicate output");

  const nestedPlanInput = [
    "const p = await tools.update_plan({explanation:\"Ready to verify.\",plan:[",
    "  {step:\"Inspect\",status:\"completed\"},",
    "  {step:\"Verify\",status:\"in_progress\"}",
    "]}); text(p);"
  ].join("\n");
  const nestedPlans = rendererContext.__rolloutTest.parseNestedToolArguments(nestedPlanInput, "update_plan");
  assert.equal(nestedPlans.length, 1, "nested update_plan arguments must be extracted from the exec wrapper");
  assert.equal(nestedPlans[0].plan[1].status, "in_progress", "nested update_plan statuses must survive parsing");
  const nestedPlanRecords = rendererContext.__rolloutTest.createRenderableRecords([
    { line: 35, value: { type: "response_item", payload: { type: "custom_tool_call", name: "exec", call_id: "call-plan", status: "completed", input: nestedPlanInput } } },
    { line: 36, value: { type: "response_item", payload: { type: "custom_tool_call_output", call_id: "call-plan", output: [{ type: "input_text", text: "Script completed\nWall time 0.0 seconds\nOutput:\n" }, { type: "input_text", text: "{}" }] } } }
  ]);
  const nestedPlanHtml = rendererContext.__rolloutTest.renderToolCallGroup(nestedPlanRecords[0]);
  assert.match(nestedPlanHtml, /Ready to verify\.[\s\S]*Inspect[\s\S]*Verify/, "nested update_plan must use the dedicated plan renderer");
  assert.match(nestedPlanHtml, /rollout-plan-status-completed[\s\S]*rollout-plan-status-in-progress/, "nested update_plan must preserve status styling");
  assert.doesNotMatch(nestedPlanHtml, /Raw exec input|Command text unavailable|No output/, "nested update_plan must not fall back to raw exec placeholders");

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

  const levelOneClosed = { dataset: { rolloutLevel: "1" }, open: false };
  const levelOneOpen = { dataset: { rolloutLevel: "1" }, open: true };
  const levelTwoOpen = { dataset: { rolloutLevel: "2" }, open: true };
  rendererContext.document = {
    documentElement: { dataset: {} },
    querySelectorAll: () => [levelOneClosed, levelOneOpen, levelTwoOpen]
  };
  rendererContext.__rolloutTest.setRolloutDirectoryLevel("level-one");
  assert.deepEqual(
    [levelOneClosed.open, levelOneOpen.open, levelTwoOpen.open],
    [false, true, false],
    "collapse-to-level-one must preserve level-one state while closing deeper directories"
  );
  rendererContext.__rolloutTest.setRolloutDirectoryLevel("collapse");
  assert.deepEqual(
    [levelOneClosed.open, levelOneOpen.open, levelTwoOpen.open],
    [false, false, false],
    "collapse-to-level-zero must close every directory"
  );
  rendererContext.__rolloutTest.setRolloutDirectoryLevel("expand-level-one");
  assert.deepEqual(
    [levelOneClosed.open, levelOneOpen.open, levelTwoOpen.open],
    [true, true, false],
    "expand-to-level-one must open level one without opening deeper directories"
  );

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
  const navigationOpenEvent = navigationEvents.find(event => event.type === "codex-rollout-navigation-open");
  assert.deepEqual(
    Array.from(navigationOpenEvent.detail.stateKeys),
    ["turn-1:body"],
    "sidebar navigation must persist only the opened parent turn state"
  );
}

await addJsFiles(path.resolve(projectDir, "vendor"));

for (const file of files) {
  await checkFile(file);
}

await checkLocalHtml("codex-rollout-viewer.html");
await checkMarkdownRendering();

console.log(`Checked ${files.length} JavaScript files and the local HTML entrypoint.`);
