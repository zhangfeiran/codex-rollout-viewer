const SOURCE_META = "codex-rollout-source-url";
const CANONICAL_META = "codex-rollout-canonical-url";
const JSONL_FILE_PATTERN = /\.jsonl(?:$|[?#])/i;
const HIGHLIGHT_JS_VENDOR_PATH = "vendor/highlightjs/highlight.min.js";
const KATEX_JS_VENDOR_PATH = "vendor/katex/katex.min.js";
const KATEX_CSS_VENDOR_PATH = "vendor/katex/katex.min.css";
const MAX_DETAILS_STRING_LENGTH = 8000;
const MAX_DISPLAY_TEXT_LENGTH = 120000;
const LONG_CONTENT_COLLAPSE_LENGTH = 2200;
const LONG_MESSAGE_COLLAPSE_LENGTH = LONG_CONTENT_COLLAPSE_LENGTH;
const LONG_OUTPUT_COLLAPSE_LENGTH = LONG_CONTENT_COLLAPSE_LENGTH;

let codeHighlightScriptPromise = null;
let mathRenderAssetsPromise = null;
let lazyRolloutContentStore = new Map();

const ROLLOUT_CSS = `
:root {
  color-scheme: dark;
  --wh-rollout-bg: #0b0f14;
  --wh-rollout-sidebar: #0f141b;
  --wh-rollout-panel: #131922;
  --wh-rollout-panel-strong: #18212c;
  --wh-rollout-panel-soft: #10161d;
  --wh-rollout-border: #303844;
  --wh-rollout-border-muted: #242c36;
  --wh-rollout-fg: #e7edf5;
  --wh-rollout-muted: #97a3b0;
  --wh-rollout-subtle: #6f7b88;
  --wh-rollout-blue: #58a6ff;
  --wh-rollout-green: #3fb950;
  --wh-rollout-purple: #bc8cff;
  --wh-rollout-red: #ff6b6b;
  --wh-rollout-yellow: #d29922;
  --wh-rollout-cyan: #39c5cf;
}

html {
  background: var(--wh-rollout-bg);
}

body.codex-rollout-page {
  min-width: 280px;
  margin: 0;
  color: var(--wh-rollout-fg);
  background: var(--wh-rollout-bg);
  font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", "Noto Sans", Helvetica, Arial, sans-serif;
  font-size: 13px;
  line-height: 1.4;
}

.codex-rollout,
.codex-rollout *,
.codex-rollout *::before,
.codex-rollout *::after {
  box-sizing: border-box;
}

.codex-rollout {
  display: grid;
  grid-template-columns: 292px minmax(0, 1fr);
  min-height: 100vh;
}

.rollout-sidebar {
  position: sticky;
  top: 0;
  height: 100vh;
  min-width: 0;
  padding: 12px;
  overflow: auto;
  background: var(--wh-rollout-sidebar);
  border-right: 1px solid var(--wh-rollout-border-muted);
}

.rollout-main {
  min-width: 0;
  padding: 14px 18px 28px;
}

.rollout-hero {
  display: grid;
  gap: 8px;
  padding-bottom: 12px;
  margin-bottom: 12px;
  border-bottom: 1px solid var(--wh-rollout-border-muted);
}

.rollout-eyebrow {
  margin: 0;
  color: var(--wh-rollout-subtle);
  font-size: 11px;
  font-weight: 700;
  letter-spacing: 0;
  text-transform: uppercase;
}

.rollout-hero h1 {
  margin: 0;
  overflow-wrap: anywhere;
  font-size: 18px;
  line-height: 1.25;
  font-weight: 650;
}

.rollout-subtitle,
.rollout-entry-meta,
.rollout-turn-meta {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
  margin: 0;
  color: var(--wh-rollout-muted);
  font-size: 11px;
}

.rollout-chip,
.rollout-role,
.rollout-line,
.rollout-count {
  display: inline-flex;
  align-items: center;
  min-height: 20px;
  padding: 1px 7px;
  border: 1px solid var(--wh-rollout-border);
  border-radius: 999px;
  background: var(--wh-rollout-panel-soft);
  color: var(--wh-rollout-muted);
  font-size: 11px;
  font-weight: 650;
}

.rollout-stats {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(94px, 1fr));
  gap: 6px;
  margin: 0 0 12px;
}

.rollout-stat {
  min-width: 0;
  padding: 7px 8px;
  border: 1px solid var(--wh-rollout-border-muted);
  border-radius: 7px;
  background: var(--wh-rollout-panel-soft);
}

.rollout-stat-label {
  margin: 0 0 2px;
  color: var(--wh-rollout-subtle);
  font-size: 10px;
}

.rollout-stat-value {
  margin: 0;
  overflow-wrap: anywhere;
  font-size: 15px;
  line-height: 1.15;
  font-weight: 700;
}

.rollout-tree-title {
  margin: 2px 0 8px;
  color: var(--wh-rollout-muted);
  font-size: 11px;
  font-weight: 700;
  text-transform: uppercase;
}

.rollout-tree-actions {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
  margin: 0 0 8px;
}

.rollout-tool-btn {
  flex: 1 1 74px;
  min-width: 0;
  min-height: 24px;
  padding: 3px 7px;
  color: var(--wh-rollout-muted);
  background: var(--wh-rollout-panel-soft);
  border: 1px solid var(--wh-rollout-border);
  border-radius: 5px;
  cursor: pointer;
  font: inherit;
  font-size: 11px;
  font-weight: 650;
}

.rollout-tool-btn:hover {
  color: var(--wh-rollout-fg);
  background: var(--wh-rollout-panel-strong);
}

.rollout-tree {
  display: grid;
  gap: 4px;
}

.rollout-tree a,
.rollout-tree summary {
  color: var(--wh-rollout-muted);
  text-decoration: none;
}

.rollout-tree a {
  display: block;
  min-width: 0;
  padding: 3px 6px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  border-radius: 5px;
}

.codex-rollout.rollout-nav-wrap .rollout-tree a,
.codex-rollout.rollout-nav-wrap .rollout-nav-label {
  overflow: visible;
  text-overflow: clip;
  white-space: normal;
  word-break: break-word;
}

.rollout-tree details[data-rollout-level="2"] {
  margin-left: 8px;
}

.rollout-tree a:hover {
  color: var(--wh-rollout-fg);
  background: var(--wh-rollout-panel-strong);
  text-decoration: none;
}

.rollout-tree details {
  border-left: 1px solid var(--wh-rollout-border-muted);
}

.rollout-tree details + details {
  margin-top: 2px;
}

.rollout-tree summary {
  display: grid;
  grid-template-columns: 14px minmax(0, 1fr);
  gap: 2px;
  padding: 3px 4px;
  cursor: pointer;
  list-style: none;
  border-radius: 5px;
}

.rollout-tree summary::-webkit-details-marker {
  display: none;
}

.rollout-tree summary::before {
  content: ">";
  color: var(--wh-rollout-subtle);
  display: inline-block;
}

.rollout-tree details[open] > summary::before {
  transform: rotate(90deg);
}

.rollout-tree-children {
  display: grid;
  gap: 1px;
  padding-left: 14px;
}

.rollout-nav-label {
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.rollout-parse-errors {
  margin: 0 0 10px;
  padding: 8px 10px;
  border: 1px solid rgba(255, 107, 107, 0.4);
  border-left: 3px solid var(--wh-rollout-red);
  border-radius: 7px;
  background: rgba(255, 107, 107, 0.08);
}

.rollout-parse-errors h2 {
  margin: 0 0 6px;
  color: var(--wh-rollout-red);
  font-size: 13px;
}

.rollout-turn-list {
  display: grid;
  gap: 10px;
}

.rollout-turn {
  min-width: 0;
  border: 1px solid var(--wh-rollout-border-muted);
  border-radius: 8px;
  background: var(--wh-rollout-panel);
  overflow: clip;
}

.rollout-turn > summary {
  display: grid;
  grid-template-columns: 18px minmax(0, 1fr) max-content;
  gap: 8px;
  align-items: center;
  min-width: 0;
  padding: 8px 10px;
  cursor: pointer;
  list-style: none;
  background: var(--wh-rollout-panel-strong);
}

.rollout-turn > summary::-webkit-details-marker {
  display: none;
}

.rollout-turn > summary::before {
  content: ">";
  color: var(--wh-rollout-subtle);
  display: inline-block;
  font-family: ui-monospace, SFMono-Regular, Consolas, "Liberation Mono", Menlo, monospace;
}

.rollout-turn[open] > summary::before {
  transform: rotate(90deg);
}

.rollout-turn-title {
  min-width: 0;
}

.rollout-turn-title h2 {
  margin: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  font-size: 14px;
  line-height: 1.3;
}

.rollout-turn-body {
  min-width: 0;
}

.rollout-assistant-section {
  border-top: 1px solid var(--wh-rollout-border-muted);
}

.rollout-assistant-section > summary {
  display: grid;
  grid-template-columns: 18px minmax(0, 1fr) max-content;
  gap: 8px;
  align-items: center;
  min-width: 0;
  padding: 6px 10px;
  cursor: pointer;
  list-style: none;
  background: var(--wh-rollout-panel-soft);
}

.rollout-assistant-section > summary::-webkit-details-marker {
  display: none;
}

.rollout-assistant-section > summary::before {
  content: ">";
  display: inline-block;
  color: var(--wh-rollout-subtle);
  font-family: ui-monospace, SFMono-Regular, Consolas, "Liberation Mono", Menlo, monospace;
}

.rollout-assistant-section[open] > summary::before {
  transform: rotate(90deg);
}

.rollout-assistant-title {
  min-width: 0;
  display: -webkit-box;
  overflow: hidden;
  -webkit-box-orient: vertical;
  -webkit-line-clamp: 5;
  overflow-wrap: anywhere;
  color: var(--wh-rollout-fg);
  font-size: 13px;
  font-weight: 650;
}

.rollout-assistant-body {
  min-width: 0;
}

.rollout-compact-section {
  border-top: 1px solid var(--wh-rollout-border-muted);
}

.rollout-compact-section > summary {
  display: grid;
  grid-template-columns: 18px minmax(28px, 1fr) max-content minmax(28px, 1fr) max-content;
  gap: 8px;
  align-items: center;
  min-width: 0;
  padding: 7px 10px;
  cursor: pointer;
  list-style: none;
  background: rgba(210, 153, 34, 0.05);
}

.rollout-compact-section > summary::-webkit-details-marker {
  display: none;
}

.rollout-compact-section > summary::before {
  content: ">";
  display: inline-block;
  color: var(--wh-rollout-yellow);
  font-family: ui-monospace, SFMono-Regular, Consolas, "Liberation Mono", Menlo, monospace;
}

.rollout-compact-section[open] > summary::before {
  transform: rotate(90deg);
}

.rollout-compact-rule {
  min-width: 0;
  height: 1px;
  background: linear-gradient(90deg, transparent, rgba(210, 153, 34, 0.65), transparent);
}

.rollout-compact-title {
  color: var(--wh-rollout-yellow);
  font-size: 11px;
  font-weight: 700;
  letter-spacing: 0;
  text-transform: uppercase;
  white-space: nowrap;
}

.rollout-compact-body {
  min-width: 0;
  border-top: 1px dashed rgba(210, 153, 34, 0.25);
}

.rollout-entry {
  display: grid;
  grid-template-columns: 112px minmax(0, 1fr);
  gap: 8px;
  min-width: 0;
  padding: 7px 10px;
  border-top: 1px solid var(--wh-rollout-border-muted);
}

.rollout-entry:first-child {
  border-top: 0;
}

.rollout-entry-anchor {
  scroll-margin-top: 10px;
}

.rollout-entry-head {
  display: grid;
  align-content: start;
  gap: 4px;
  min-width: 0;
}

.rollout-entry-title {
  min-width: 0;
  font-size: 11px;
  color: var(--wh-rollout-subtle);
}

.rollout-entry-body {
  min-width: 0;
}

.rollout-role-user {
  border-color: rgba(88, 166, 255, 0.45);
  color: var(--wh-rollout-blue);
}

.rollout-role-assistant,
.rollout-role-agent {
  border-color: rgba(63, 185, 80, 0.45);
  color: var(--wh-rollout-green);
}

.rollout-role-tool {
  border-color: rgba(188, 140, 255, 0.45);
  color: var(--wh-rollout-purple);
}

.rollout-role-error {
  border-color: rgba(255, 107, 107, 0.55);
  color: var(--wh-rollout-red);
}

.rollout-role-event,
.rollout-role-session,
.rollout-role-turn,
.rollout-role-reasoning,
.rollout-role-system,
.rollout-role-developer {
  border-color: rgba(151, 163, 176, 0.35);
  color: var(--wh-rollout-muted);
}

.rollout-kv {
  display: grid;
  grid-template-columns: max-content minmax(0, 1fr);
  gap: 3px 8px;
  margin: 0;
}

.rollout-kv dt {
  color: var(--wh-rollout-subtle);
  font-weight: 650;
}

.rollout-kv dd {
  min-width: 0;
  margin: 0;
  overflow-wrap: anywhere;
}

.rollout-text {
  min-width: 0;
  margin: 0;
  white-space: pre-wrap;
  overflow-wrap: anywhere;
}

.rollout-content-block + .rollout-content-block,
.rollout-kv + .rollout-content-block,
.rollout-kv + pre,
pre + .rollout-kv,
.rollout-details + .rollout-details {
  margin-top: 7px;
}

.rollout-content-label {
  margin: 0 0 3px;
  color: var(--wh-rollout-subtle);
  font-size: 10px;
  font-weight: 700;
  text-transform: uppercase;
}

.codex-rollout a {
  color: var(--wh-rollout-blue);
  text-decoration: none;
}

.codex-rollout a:hover {
  text-decoration: underline;
}

.codex-rollout pre {
  max-width: 100%;
  margin: 0;
  padding: 8px 9px;
  overflow: auto;
  color: #dbe7f3;
  background: #090d12;
  border: 1px solid var(--wh-rollout-border-muted);
  border-radius: 6px;
}

.codex-rollout code {
  font-family: ui-monospace, SFMono-Regular, Consolas, "Liberation Mono", Menlo, monospace;
  font-size: 12px;
}

.codex-rollout :not(pre) > code {
  padding: 0.08em 0.32em;
  color: #dbe7f3;
  background: #090d12;
  border: 1px solid var(--wh-rollout-border-muted);
  border-radius: 4px;
}

.markdown-lite {
  min-width: 0;
  overflow-wrap: anywhere;
}

.markdown-lite > :first-child {
  margin-top: 0;
}

.markdown-lite > :last-child {
  margin-bottom: 0;
}

.markdown-lite p,
.markdown-lite ul,
.markdown-lite ol,
.markdown-lite blockquote,
.markdown-lite pre {
  margin-top: 0;
  margin-bottom: 7px;
}

.markdown-lite h1,
.markdown-lite h2,
.markdown-lite h3,
.markdown-lite h4,
.markdown-lite h5,
.markdown-lite h6 {
  margin: 8px 0 5px;
  font-weight: 650;
  line-height: 1.25;
}

.markdown-lite h1 {
  font-size: 18px;
}

.markdown-lite h2 {
  font-size: 16px;
}

.markdown-lite h3 {
  font-size: 14px;
}

.markdown-lite h4,
.markdown-lite h5,
.markdown-lite h6 {
  font-size: 13px;
}

.markdown-lite ul,
.markdown-lite ol {
  padding-left: 20px;
}

.markdown-lite li + li {
  margin-top: 2px;
}

.rollout-plan-markdown {
  margin-top: 7px;
}

.rollout-plan-markdown ul {
  list-style: none;
  padding-left: 0;
}

.rollout-plan-markdown li {
  display: grid;
  grid-template-columns: 18px minmax(0, 1fr);
  gap: 8px;
  align-items: start;
}

.rollout-plan-icon {
  line-height: 1.4;
  text-align: center;
}

.rollout-plan-status-completed {
  color: var(--wh-rollout-green);
}

.rollout-plan-status-in-progress {
  color: var(--wh-rollout-cyan);
}

.rollout-plan-status-pending {
  color: var(--wh-rollout-muted);
}

.rollout-plan-status-unknown {
  color: var(--wh-rollout-yellow);
}

.rollout-plan-explanation {
  color: var(--wh-rollout-muted);
}

.markdown-lite blockquote {
  padding-left: 10px;
  color: var(--wh-rollout-muted);
  border-left: 3px solid var(--wh-rollout-border);
}

.rollout-markdown-table {
  max-width: 100%;
  margin: 0 0 7px;
  overflow-x: auto;
}

.rollout-markdown-table table {
  width: max-content;
  min-width: min(100%, 520px);
  border-spacing: 0;
  border-collapse: collapse;
}

.rollout-markdown-table th,
.rollout-markdown-table td {
  min-width: 72px;
  padding: 5px 8px;
  vertical-align: top;
  text-align: left;
  border: 1px solid var(--wh-rollout-border-muted);
}

.rollout-markdown-table th {
  color: var(--wh-rollout-fg);
  font-weight: 650;
  background: var(--wh-rollout-panel-strong);
}

.rollout-markdown-table tbody tr:nth-child(even) {
  background: rgba(255, 255, 255, 0.018);
}

.rollout-markdown-table .is-align-center {
  text-align: center;
}

.rollout-markdown-table .is-align-right {
  text-align: right;
}

.rollout-math {
  max-width: 100%;
}

.rollout-math.is-inline {
  display: inline-block;
  vertical-align: -0.08em;
}

.rollout-math.is-display {
  margin: 9px 0;
  overflow-x: auto;
  overflow-y: hidden;
  text-align: center;
}

.rollout-math.is-display .katex-display {
  margin: 0.35em 0;
}

.rollout-details {
  margin-top: 7px;
}

.rollout-details:first-child {
  margin-top: 0;
}

.rollout-details > summary {
  cursor: pointer;
  color: var(--wh-rollout-muted);
  font-size: 12px;
  font-weight: 650;
}

.rollout-details[open] > summary {
  margin-bottom: 6px;
}

.rollout-patch-details[open] > summary {
  margin-bottom: 0;
}

.rollout-diff {
  margin-top: 7px;
  overflow: hidden;
  border: 1px solid var(--wh-rollout-border-muted);
  border-radius: 6px;
  background: #0d1117;
}

.rollout-diff-toolbar {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
  align-items: center;
  justify-content: space-between;
  padding: 8px 10px;
  border-bottom: 1px solid var(--wh-rollout-border-muted);
  background: rgba(88, 166, 255, 0.05);
}

.rollout-diff-stats {
  color: var(--wh-rollout-muted);
  font-size: 12px;
  font-weight: 650;
}

.rollout-diff-mode {
  display: inline-flex;
  gap: 2px;
  padding: 2px;
  border: 1px solid var(--wh-rollout-border-muted);
  border-radius: 5px;
  background: rgba(255, 255, 255, 0.03);
}

.rollout-diff-mode button {
  border: 0;
  border-radius: 3px;
  padding: 3px 8px;
  color: var(--wh-rollout-muted);
  background: transparent;
  font: inherit;
  font-size: 12px;
  cursor: pointer;
}

.rollout-diff-mode button[aria-pressed="true"] {
  color: var(--wh-rollout-fg);
  background: var(--wh-rollout-panel-strong);
}

.rollout-diff-file {
  border: 0;
}

.rollout-diff-file + .rollout-diff-file {
  border-top: 1px solid var(--wh-rollout-border-muted);
}

.rollout-diff-file > summary {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
  align-items: center;
  justify-content: space-between;
  padding: 7px 10px;
  cursor: pointer;
  list-style: none;
  background: rgba(255, 255, 255, 0.025);
}

.rollout-diff-file > summary::-webkit-details-marker {
  display: none;
}

.rollout-diff-file > summary::before {
  content: ">";
  color: var(--wh-rollout-muted);
  font-family: ui-monospace, SFMono-Regular, Consolas, "Liberation Mono", Menlo, monospace;
}

.rollout-diff-file[open] > summary::before {
  transform: rotate(90deg);
}

.rollout-diff-path {
  min-width: 0;
  overflow: hidden;
  color: var(--wh-rollout-fg);
  font-family: ui-monospace, SFMono-Regular, Consolas, "Liberation Mono", Menlo, monospace;
  font-size: 12px;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.rollout-diff-file-stat {
  color: var(--wh-rollout-subtle);
  font-size: 12px;
}

.rollout-diff-body {
  overflow: auto;
  font-family: ui-monospace, SFMono-Regular, Consolas, "Liberation Mono", Menlo, monospace;
  font-size: 12px;
  line-height: 1.45;
}

.rollout-diff-view {
  display: none;
}

.rollout-diff.is-unified .rollout-diff-unified,
.rollout-diff.is-split .rollout-diff-split {
  display: block;
}

.rollout-diff-row,
.rollout-diff-cell {
  display: grid;
  grid-template-columns: 24px minmax(0, 1fr);
  min-height: 18px;
}

.rollout-diff-prefix {
  color: var(--wh-rollout-subtle);
  text-align: center;
  user-select: none;
}

.rollout-diff-line {
  min-width: 0;
  overflow: visible;
  padding-right: 10px;
  white-space: pre;
}

.rollout-diff-row-add,
.rollout-diff-cell-add {
  background: rgba(63, 185, 80, 0.13);
}

.rollout-diff-row-add .rollout-diff-prefix,
.rollout-diff-cell-add .rollout-diff-prefix {
  color: var(--wh-rollout-green);
}

.rollout-diff-row-delete,
.rollout-diff-cell-delete {
  background: rgba(255, 107, 107, 0.14);
}

.rollout-diff-row-delete .rollout-diff-prefix,
.rollout-diff-cell-delete .rollout-diff-prefix {
  color: var(--wh-rollout-red);
}

.rollout-diff-row-hunk,
.rollout-diff-split-meta.is-hunk {
  color: var(--wh-rollout-cyan);
  background: rgba(57, 197, 207, 0.08);
}

.rollout-diff-row-meta,
.rollout-diff-split-meta.is-meta {
  color: var(--wh-rollout-muted);
  background: rgba(255, 255, 255, 0.035);
}

.rollout-diff-split {
  min-width: 860px;
}

.rollout-diff-split-row {
  display: grid;
  grid-template-columns: minmax(320px, 1fr) minmax(320px, 1fr);
  min-height: 18px;
}

.rollout-diff-cell + .rollout-diff-cell {
  border-left: 1px solid rgba(255, 255, 255, 0.05);
}

.rollout-diff-cell.is-blank {
  background: rgba(255, 255, 255, 0.018);
}

.rollout-diff-split-meta {
  grid-column: 1 / -1;
  min-height: 18px;
  padding: 0 10px;
  white-space: pre;
}

.rollout-muted {
  color: var(--wh-rollout-muted);
}

.rollout-empty {
  margin: 0;
  color: var(--wh-rollout-subtle);
}

.hljs {
  color: #dbe7f3;
  background: transparent;
}

.hljs-keyword,
.hljs-selector-tag,
.hljs-title.function_ {
  color: #ff7b72;
}

.hljs-string,
.hljs-regexp,
.hljs-attr {
  color: #a5d6ff;
}

.hljs-number,
.hljs-literal {
  color: #79c0ff;
}

.hljs-comment {
  color: #8b949e;
}

.hljs-built_in,
.hljs-title.class_ {
  color: #d2a8ff;
}

@media (max-width: 940px) {
  .codex-rollout {
    grid-template-columns: minmax(0, 1fr);
  }

  .rollout-sidebar {
    position: static;
    height: auto;
    max-height: 40vh;
    border-right: 0;
    border-bottom: 1px solid var(--wh-rollout-border-muted);
  }
}

@media (max-width: 640px) {
  .rollout-main {
    padding: 10px;
  }

  .rollout-entry {
    grid-template-columns: minmax(0, 1fr);
  }

  .rollout-turn > summary {
    grid-template-columns: 18px minmax(0, 1fr);
  }

  .rollout-turn > summary .rollout-count {
    display: none;
  }

  .rollout-kv {
    grid-template-columns: minmax(0, 1fr);
  }
}
`;

export function isLocalCodexRolloutJsonlUrl(url = location.href) {
  try {
    const parsed = new URL(url);
    return parsed.protocol === "file:" && JSONL_FILE_PATTERN.test(decodeURIComponent(parsed.pathname));
  } catch {
    return false;
  }
}

function ensureDocumentStructure() {
  if (!document.documentElement) {
    document.appendChild(document.createElement("html"));
  }
  if (!document.head) {
    document.documentElement.prepend(document.createElement("head"));
  }
  if (!document.body) {
    document.documentElement.appendChild(document.createElement("body"));
  }
}

function getRawJsonlFromDocument() {
  if (document.documentElement?.dataset?.codexRolloutRendered === "rendered") {
    return null;
  }
  const body = document.body;
  if (!body) {
    return "";
  }
  const onlyChild = body.childElementCount === 1 ? body.firstElementChild : null;
  if (onlyChild?.tagName?.toLowerCase() === "pre") {
    return onlyChild.textContent ?? "";
  }
  return body.textContent ?? "";
}

export function parseCodexRolloutJsonl(jsonl) {
  const records = [];
  const errors = [];
  const lines = String(jsonl ?? "").replace(/\r\n?/g, "\n").split("\n");
  for (const [index, line] of lines.entries()) {
    if (!line.trim()) {
      continue;
    }
    try {
      records.push({
        line: index + 1,
        value: JSON.parse(line)
      });
    } catch (error) {
      errors.push({
        line: index + 1,
        message: error?.message || String(error),
        text: line.slice(0, 500)
      });
    }
  }
  return {
    records,
    errors
  };
}

export function isCodexRolloutRecords(records) {
  const values = records.map(record => record.value);
  const topTypes = new Set(values.map(value => value?.type).filter(Boolean));
  if (topTypes.has("session_meta") && (topTypes.has("response_item") || topTypes.has("event_msg") || topTypes.has("turn_context"))) {
    return true;
  }
  return values.some(value => value?.type === "response_item" && value?.payload?.type);
}

function escapeHtml(value) {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function escapeAttribute(value) {
  return escapeHtml(value).replace(/`/g, "&#96;");
}

function sanitizeUrl(rawUrl) {
  const cleaned = String(rawUrl ?? "").trim().replace(/^<|>$/g, "");
  if (!cleaned) {
    return null;
  }
  try {
    const parsed = new URL(cleaned, location.href);
    const protocol = parsed.protocol.toLowerCase();
    if (["http:", "https:", "file:"].includes(protocol)) {
      return parsed.href;
    }
  } catch {}
  return null;
}

function createTokenStore() {
  const tokens = [];
  return {
    push(html) {
      const token = `\uE100wh-rollout-${tokens.length}\uE101`;
      tokens.push(html);
      return token;
    },
    restore(value) {
      return String(value ?? "").replace(/\uE100wh-rollout-(\d+)\uE101/g, (match, index) => tokens[Number(index)] ?? match);
    }
  };
}

function renderMathPlaceholder(source, displayMode) {
  const tagName = displayMode ? "div" : "span";
  const modeClass = displayMode ? "is-display" : "is-inline";
  return `<${tagName} class="rollout-math ${modeClass}" data-rollout-math data-rollout-display="${displayMode}">${escapeHtml(source)}</${tagName}>`;
}

function protectInlineMath(value, tokenStore) {
  let text = String(value ?? "");
  text = text.replace(/\\\(([\s\S]*?)\\\)/g, (_match, source) => tokenStore.push(renderMathPlaceholder(source, false)));
  text = text.replace(/(^|[^\\$])\$([^\s$](?:[^$\n]*?[^\s$])?)\$(?!\$)/g, (_match, prefix, source) => {
    return `${prefix}${tokenStore.push(renderMathPlaceholder(source, false))}`;
  });
  return text;
}

function renderInlineMarkdown(value) {
  const tokenStore = createTokenStore();
  let text = String(value ?? "");
  text = text.replace(/`([^`\n]+)`/g, (_match, code) => tokenStore.push(`<code>${escapeHtml(code)}</code>`));
  text = protectInlineMath(text, tokenStore);
  text = text.replace(/\\([\\`*_[\]{}()#+\-.!|>])/g, (_match, character) => tokenStore.push(escapeHtml(character)));
  text = text.replace(/!\[([^\]]*)\]\((\S+?)(?:\s+["']([^"']+)["'])?\)/g, (_match, alt, url, title) => {
    const src = sanitizeUrl(url);
    if (!src) {
      return "";
    }
    const titleAttribute = title ? ` title="${escapeAttribute(title)}"` : "";
    return tokenStore.push(`<img src="${escapeAttribute(src)}" alt="${escapeAttribute(alt)}"${titleAttribute}>`);
  });
  text = text.replace(/\[([^\]]+)\]\((\S+?)(?:\s+["']([^"']+)["'])?\)/g, (_match, label, url, title) => {
    const href = sanitizeUrl(url);
    if (!href) {
      return escapeHtml(label);
    }
    const titleAttribute = title ? ` title="${escapeAttribute(title)}"` : "";
    return tokenStore.push(`<a href="${escapeAttribute(href)}"${titleAttribute}>${renderInlineMarkdown(label)}</a>`);
  });
  text = text.replace(/\bhttps?:\/\/[^\s<>"')]+/gi, match => {
    const href = sanitizeUrl(match);
    return href ? tokenStore.push(`<a href="${escapeAttribute(href)}">${escapeHtml(match)}</a>`) : match;
  });

  let html = escapeHtml(text);
  html = html.replace(/~~([^~]+)~~/g, "<del>$1</del>");
  html = html.replace(/\*\*([^*]+)\*\*/g, "<strong>$1</strong>");
  html = html.replace(/__([^_]+)__/g, "<strong>$1</strong>");
  html = html.replace(/(^|[^\*])\*([^*\n]+)\*/g, "$1<em>$2</em>");
  html = html.replace(/(^|[^_])_([^_\n]+)_/g, "$1<em>$2</em>");
  return tokenStore.restore(html);
}

function isBlank(line) {
  return /^\s*$/.test(line);
}

function isHeading(line) {
  return /^\s{0,3}(#{1,6})\s+(.+?)\s*#*\s*$/.exec(line);
}

function getListMatch(line) {
  return /^\s{0,3}([-+*]|\d+[.)])\s+(.+)$/.exec(line);
}

function splitMarkdownTableRow(line) {
  const text = String(line ?? "").trim();
  if (!text.includes("|")) {
    return null;
  }

  const cells = [];
  let cell = "";
  let separatorCount = 0;
  let inCode = false;
  let mathEnd = null;
  for (let index = 0; index < text.length; index += 1) {
    const character = text[index];
    const pair = text.slice(index, index + 2);
    if (!inCode && mathEnd === "\\)" && pair === "\\)") {
      cell += pair;
      mathEnd = null;
      index += 1;
      continue;
    }
    if (!inCode && !mathEnd && pair === "\\(") {
      cell += pair;
      mathEnd = "\\)";
      index += 1;
      continue;
    }
    if (!inCode && character === "$" && text[index - 1] !== "\\") {
      mathEnd = mathEnd === "$" ? null : mathEnd ? mathEnd : "$";
      cell += character;
      continue;
    }
    if (!mathEnd && character === "`") {
      inCode = !inCode;
      cell += character;
      continue;
    }
    if (character === "\\" && index + 1 < text.length) {
      cell += character + text[index + 1];
      index += 1;
      continue;
    }
    if (character === "|" && !inCode && !mathEnd) {
      cells.push(cell.trim());
      cell = "";
      separatorCount += 1;
      continue;
    }
    cell += character;
  }
  cells.push(cell.trim());

  if (!separatorCount) {
    return null;
  }
  if (text.startsWith("|") && cells[0] === "") {
    cells.shift();
  }
  if (text.endsWith("|") && cells.at(-1) === "") {
    cells.pop();
  }
  return cells;
}

function getTableAlignment(delimiter) {
  const value = String(delimiter ?? "").trim();
  if (!/^:?-{3,}:?$/.test(value)) {
    return null;
  }
  if (value.startsWith(":") && value.endsWith(":")) {
    return "center";
  }
  if (value.endsWith(":")) {
    return "right";
  }
  return "left";
}

function getMarkdownTable(lines, index) {
  const header = splitMarkdownTableRow(lines[index]);
  const delimiters = splitMarkdownTableRow(lines[index + 1]);
  if (!header?.length || !delimiters || delimiters.length !== header.length) {
    return null;
  }
  const alignments = delimiters.map(getTableAlignment);
  if (alignments.some(alignment => !alignment)) {
    return null;
  }

  const rows = [];
  let nextIndex = index + 2;
  while (nextIndex < lines.length && !isBlank(lines[nextIndex])) {
    const cells = splitMarkdownTableRow(lines[nextIndex]);
    if (!cells) {
      break;
    }
    rows.push(Array.from({ length: header.length }, (_unused, cellIndex) => cells[cellIndex] ?? ""));
    nextIndex += 1;
  }
  return { header, alignments, rows, nextIndex };
}

function renderMarkdownTable(table) {
  const renderCell = (tagName, value, alignment) => {
    const alignmentClass = alignment === "left" ? "" : ` class="is-align-${alignment}"`;
    return `<${tagName}${alignmentClass}>${renderInlineMarkdown(value)}</${tagName}>`;
  };
  const header = table.header
    .map((cell, index) => renderCell("th", cell, table.alignments[index]))
    .join("");
  const body = table.rows.length
    ? `<tbody>${table.rows.map(row => `<tr>${row.map((cell, index) => renderCell("td", cell, table.alignments[index])).join("")}</tr>`).join("")}</tbody>`
    : "";
  return `<div class="rollout-markdown-table"><table><thead><tr>${header}</tr></thead>${body}</table></div>`;
}

function isMathBlockStartLine(line) {
  const trimmed = String(line ?? "").trim();
  return trimmed.startsWith("\\[") || trimmed.startsWith("$$");
}

function getMathBlock(lines, index) {
  const firstLine = String(lines[index] ?? "").trim();
  const delimiters = firstLine.startsWith("\\[")
    ? { left: "\\[", right: "\\]" }
    : firstLine.startsWith("$$")
      ? { left: "$$", right: "$$" }
      : null;
  if (!delimiters) {
    return null;
  }

  const sourceLines = [];
  const firstRemainder = firstLine.slice(delimiters.left.length);
  const sameLineEnd = firstRemainder.indexOf(delimiters.right);
  if (sameLineEnd >= 0 && !firstRemainder.slice(sameLineEnd + delimiters.right.length).trim()) {
    return {
      source: firstRemainder.slice(0, sameLineEnd).trim(),
      nextIndex: index + 1
    };
  }
  if (firstRemainder) {
    sourceLines.push(firstRemainder);
  }

  for (let cursor = index + 1; cursor < lines.length; cursor += 1) {
    const currentLine = lines[cursor];
    const endIndex = currentLine.indexOf(delimiters.right);
    if (endIndex >= 0 && !currentLine.slice(endIndex + delimiters.right.length).trim()) {
      sourceLines.push(currentLine.slice(0, endIndex));
      return {
        source: sourceLines.join("\n").trim(),
        nextIndex: cursor + 1
      };
    }
    sourceLines.push(currentLine);
  }
  return null;
}

function isBlockStart(lines, index) {
  const line = lines[index] ?? "";
  return isBlank(line) || Boolean(getMarkdownTable(lines, index)) || isMathBlockStartLine(line) || Boolean(isHeading(line)) || /^\s{0,3}>/.test(line) || Boolean(getListMatch(line));
}

function renderMarkdownBlocks(value) {
  const lines = String(value ?? "").replace(/\r\n?/g, "\n").split("\n");
  const html = [];
  let index = 0;

  while (index < lines.length) {
    const line = lines[index];
    if (isBlank(line)) {
      index += 1;
      continue;
    }

    const mathBlock = getMathBlock(lines, index);
    if (mathBlock) {
      html.push(renderMathPlaceholder(mathBlock.source, true));
      index = mathBlock.nextIndex;
      continue;
    }

    const table = getMarkdownTable(lines, index);
    if (table) {
      html.push(renderMarkdownTable(table));
      index = table.nextIndex;
      continue;
    }

    const heading = isHeading(line);
    if (heading) {
      const level = heading[1].length;
      html.push(`<h${level}>${renderInlineMarkdown(heading[2])}</h${level}>`);
      index += 1;
      continue;
    }

    if (/^\s{0,3}>/.test(line)) {
      const quoteLines = [];
      while (index < lines.length && (/^\s{0,3}>/.test(lines[index]) || isBlank(lines[index]))) {
        quoteLines.push(lines[index].replace(/^\s{0,3}>\s?/, ""));
        index += 1;
      }
      html.push(`<blockquote>${renderMarkdownBlocks(quoteLines.join("\n"))}</blockquote>`);
      continue;
    }

    const listMatch = getListMatch(line);
    if (listMatch) {
      const ordered = /^\d/.test(listMatch[1]);
      const tagName = ordered ? "ol" : "ul";
      const items = [];
      while (index < lines.length) {
        const item = getListMatch(lines[index]);
        if (!item || /^\d/.test(item[1]) !== ordered) {
          break;
        }
        items.push(`<li>${renderInlineMarkdown(item[2])}</li>`);
        index += 1;
      }
      html.push(`<${tagName}>${items.join("")}</${tagName}>`);
      continue;
    }

    const paragraphLines = [];
    while (index < lines.length && !isBlockStart(lines, index)) {
      paragraphLines.push(lines[index].trim());
      index += 1;
    }
    if (!paragraphLines.length) {
      paragraphLines.push(line.trim());
      index += 1;
    }
    html.push(`<p>${renderInlineMarkdown(paragraphLines.join(" "))}</p>`);
  }

  return html.join("\n");
}

function truncateText(value, maxLength = MAX_DISPLAY_TEXT_LENGTH) {
  const text = String(value ?? "");
  if (text.length <= maxLength) {
    return text;
  }
  const tailLength = Math.max(1, Math.floor(maxLength * 0.35));
  const headLength = Math.max(1, maxLength - tailLength);
  const omittedLength = Math.max(0, text.length - headLength - tailLength);
  return `${text.slice(0, headLength)}\n\n... ${omittedLength} characters omitted by rollout renderer ...\n\n${text.slice(-tailLength)}`;
}

function normalizeLanguage(language) {
  const cleaned = String(language ?? "").trim().split(/\s+/)[0] || "plaintext";
  return /^[A-Za-z0-9_.+-]+$/.test(cleaned) ? cleaned.toLowerCase() : "plaintext";
}

function renderCodeBlock(value, language = "plaintext") {
  return `<pre><code class="language-${escapeAttribute(normalizeLanguage(language))}">${escapeHtml(truncateText(value))}</code></pre>`;
}

function renderCollapsibleHtml(summary, html, rawLength, threshold = LONG_CONTENT_COLLAPSE_LENGTH, stateKey = "") {
  if (!Number.isFinite(rawLength) || rawLength <= threshold) {
    return html;
  }
  const stateAttribute = stateKey ? ` data-rollout-state-key="${escapeAttribute(stateKey)}"` : "";
  return `<details class="rollout-details"${stateAttribute}><summary>${escapeHtml(summary)}, ${formatNumber(rawLength)} characters</summary>${html}</details>`;
}

function renderMarkdownContent(value) {
  const text = truncateText(value);
  const fencePattern = /```([A-Za-z0-9_.+-]*)[^\n]*\n([\s\S]*?)```/g;
  let cursor = 0;
  let html = "";
  for (const match of text.matchAll(fencePattern)) {
    const index = match.index ?? 0;
    if (index > cursor) {
      html += renderMarkdownBlocks(text.slice(cursor, index));
    }
    html += renderCodeBlock(match[2], match[1] || "plaintext");
    cursor = index + match[0].length;
  }
  if (cursor < text.length) {
    html += renderMarkdownBlocks(text.slice(cursor));
  }
  return `<div class="markdown-lite">${html || "<p></p>"}</div>`;
}

function formatNumber(value) {
  const number = Number(value);
  return Number.isFinite(number) ? number.toLocaleString() : "";
}

function formatTimestamp(value) {
  if (!value) {
    return "";
  }
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return String(value);
  }
  return date.toLocaleString();
}

function formatDuration(milliseconds) {
  if (!Number.isFinite(milliseconds) || milliseconds < 0) {
    return "";
  }
  const totalSeconds = Math.round(milliseconds / 1000);
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  if (minutes <= 0) {
    return `${seconds}s`;
  }
  const hours = Math.floor(minutes / 60);
  const minuteRemainder = minutes % 60;
  if (hours <= 0) {
    return `${minutes}m ${seconds}s`;
  }
  return `${hours}h ${minuteRemainder}m`;
}

function getFileName(sourceUrl = location.href, fallback = "rollout.jsonl") {
  try {
    const pathname = decodeURIComponent(new URL(sourceUrl, location.href).pathname);
    return pathname.split("/").filter(Boolean).pop() || fallback;
  } catch {
    return fallback;
  }
}

function compactValue(value, depth = 0) {
  if (value == null || typeof value == "number" || typeof value == "boolean") {
    return value;
  }
  if (typeof value == "string") {
    if (value.length <= MAX_DETAILS_STRING_LENGTH) {
      return value;
    }
    return `${value.slice(0, MAX_DETAILS_STRING_LENGTH)}\n... ${value.length - MAX_DETAILS_STRING_LENGTH} characters omitted ...`;
  }
  if (depth >= 5) {
    return "[Max depth reached]";
  }
  if (Array.isArray(value)) {
    const items = value.slice(0, 30).map(item => compactValue(item, depth + 1));
    if (value.length > 30) {
      items.push(`... ${value.length - 30} more items omitted ...`);
    }
    return items;
  }
  if (typeof value == "object") {
    const output = {};
    for (const [key, child] of Object.entries(value)) {
      if (key === "encrypted_content" || key === "base_instructions") {
        continue;
      }
      output[key] = compactValue(child, depth + 1);
    }
    return output;
  }
  return String(value);
}

function stringifyCompact(value) {
  try {
    return JSON.stringify(compactValue(value), null, 2);
  } catch {
    return String(value ?? "");
  }
}

function renderDetails(summary, value, language = "json", stateKey = "") {
  const code = language === "json" ? stringifyCompact(value) : truncateText(value, MAX_DETAILS_STRING_LENGTH);
  const stateAttribute = stateKey ? ` data-rollout-state-key="${escapeAttribute(stateKey)}"` : "";
  return `<details class="rollout-details"${stateAttribute}><summary>${escapeHtml(summary)}</summary>${renderCodeBlock(code, language)}</details>`;
}

function storeLazyRolloutContent(value) {
  const key = `lazy-${lazyRolloutContentStore.size + 1}`;
  lazyRolloutContentStore.set(key, value);
  return key;
}

function renderLazyCodeDetails(summary, value, language = "json", stateKey = "") {
  const code = language === "json" ? stringifyCompact(value) : truncateText(value, MAX_DETAILS_STRING_LENGTH);
  const stateAttribute = stateKey ? ` data-rollout-state-key="${escapeAttribute(stateKey)}"` : "";
  const lazyKey = storeLazyRolloutContent(code);
  return `
    <details class="rollout-details"${stateAttribute} data-rollout-lazy-code data-rollout-language="${escapeAttribute(language)}" data-rollout-lazy-key="${escapeAttribute(lazyKey)}">
      <summary>${escapeHtml(summary)}</summary>
      <div data-rollout-lazy-code-body></div>
    </details>
  `;
}

function parseArguments(argumentsValue) {
  if (typeof argumentsValue != "string") {
    return argumentsValue ?? {};
  }
  try {
    return JSON.parse(argumentsValue);
  } catch {
    return argumentsValue;
  }
}

function isToolName(name, expected) {
  return new RegExp(`(^|[.])${expected.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}$`).test(String(name ?? ""));
}

function getPlanStatusMeta(status) {
  const normalized = String(status || "pending").toLowerCase().replace(/[\s-]+/g, "_");
  if (normalized === "completed") {
    return {
      status: "completed",
      label: "completed",
      icon: "&#10003;"
    };
  }
  if (normalized === "in_progress") {
    return {
      status: "in-progress",
      label: "in progress",
      icon: "&#9654;"
    };
  }
  if (normalized === "pending") {
    return {
      status: "pending",
      label: "pending",
      icon: "&#9675;"
    };
  }
  return {
    status: "unknown",
    label: normalized || "unknown",
    icon: "&#8226;"
  };
}

function renderUpdatePlanMarkdown(args) {
  if (!args || typeof args != "object" || Array.isArray(args)) {
    return "";
  }
  const plan = Array.isArray(args.plan) ? args.plan : [];
  const explanation = typeof args.explanation == "string" ? args.explanation.trim() : "";
  if (!plan.length && !explanation) {
    return "";
  }
  const explanationHtml = explanation
    ? `<p class="rollout-plan-explanation">${escapeHtml(explanation)}</p>`
    : "";
  const planHtml = plan.length
    ? `<ul>${plan.map(item => {
      const step = typeof item == "string" ? item : item?.step ?? item?.title ?? "";
      const meta = getPlanStatusMeta(typeof item == "string" ? "pending" : item?.status);
      return `
        <li>
          <span class="rollout-plan-icon rollout-plan-status-${escapeAttribute(meta.status)}" title="${escapeAttribute(meta.label)}" aria-label="${escapeAttribute(meta.label)}">${meta.icon}</span>
          <span>${escapeHtml(step)}</span>
        </li>
      `;
    }).join("")}</ul>`
    : "";
  return `<div class="markdown-lite rollout-plan-markdown">${explanationHtml}${planHtml}</div>`;
}

function parseUnifiedDiffLines(diffText) {
  const lines = [];
  let additions = 0;
  let deletions = 0;
  for (const rawLine of String(diffText ?? "").replace(/\r\n/g, "\n").split("\n")) {
    let type = "context";
    let text = rawLine;
    if (rawLine.startsWith("@@")) {
      type = "hunk";
    } else if (rawLine.startsWith("+++ ") || rawLine.startsWith("--- ") || rawLine.startsWith("\\ No newline")) {
      type = "meta";
    } else if (rawLine.startsWith("+")) {
      type = "add";
      text = rawLine.slice(1);
      additions += 1;
    } else if (rawLine.startsWith("-")) {
      type = "delete";
      text = rawLine.slice(1);
      deletions += 1;
    } else if (rawLine.startsWith(" ")) {
      text = rawLine.slice(1);
    }
    lines.push({ type, text });
  }
  return { lines, additions, deletions };
}

function parsePatchApplyEndChanges(changes) {
  if (!changes || typeof changes != "object" || Array.isArray(changes)) {
    return [];
  }
  return Object.entries(changes).map(([path, change]) => {
    const parsed = parseUnifiedDiffLines(change?.unified_diff);
    return {
      path,
      moveTo: change?.move_path || null,
      changeType: change?.type || "update",
      ...parsed
    };
  });
}

function getPatchStats(files) {
  return files.reduce((stats, file) => {
    stats.files += 1;
    stats.additions += file.additions;
    stats.deletions += file.deletions;
    return stats;
  }, {
    files: 0,
    additions: 0,
    deletions: 0
  });
}

function getDiffLineClass(type, prefix) {
  if (type === "add") {
    return `${prefix}-add`;
  }
  if (type === "delete") {
    return `${prefix}-delete`;
  }
  if (type === "hunk") {
    return `${prefix}-hunk`;
  }
  if (type === "meta") {
    return `${prefix}-meta`;
  }
  return "";
}

function renderUnifiedDiffLine(line) {
  const prefix = line.type === "add" ? "+" : line.type === "delete" ? "-" : line.type === "hunk" ? "@" : " ";
  const text = line.type === "hunk" ? `@ ${line.text.replace(/^@@\s*/, "")}` : line.text;
  return `
    <div class="rollout-diff-row ${getDiffLineClass(line.type, "rollout-diff-row")}">
      <span class="rollout-diff-prefix">${escapeHtml(prefix)}</span>
      <span class="rollout-diff-line">${escapeHtml(text)}</span>
    </div>
  `;
}

function renderSplitDiffCell(line, extraClass = "") {
  if (!line) {
    return `<div class="rollout-diff-cell is-blank ${extraClass}"><span class="rollout-diff-prefix"></span><span class="rollout-diff-line"></span></div>`;
  }
  const prefix = line.type === "add" ? "+" : line.type === "delete" ? "-" : " ";
  return `
    <div class="rollout-diff-cell ${getDiffLineClass(line.type, "rollout-diff-cell")} ${extraClass}">
      <span class="rollout-diff-prefix">${escapeHtml(prefix)}</span>
      <span class="rollout-diff-line">${escapeHtml(line.text)}</span>
    </div>
  `;
}

function renderSplitDiffRows(lines) {
  const rows = [];
  let pendingDeletes = [];
  for (const line of lines) {
    if (line.type === "hunk" || line.type === "meta") {
      while (pendingDeletes.length) {
        rows.push(`
          <div class="rollout-diff-split-row">
            ${renderSplitDiffCell(pendingDeletes.shift())}
            ${renderSplitDiffCell(null)}
          </div>
        `);
      }
      rows.push(`<div class="rollout-diff-split-row"><div class="rollout-diff-split-meta is-${escapeAttribute(line.type)}">${escapeHtml(line.text)}</div></div>`);
      continue;
    }
    if (line.type === "delete") {
      pendingDeletes.push(line);
      continue;
    }
    if (line.type === "add") {
      const deleted = pendingDeletes.shift() || null;
      rows.push(`
        <div class="rollout-diff-split-row">
          ${renderSplitDiffCell(deleted)}
          ${renderSplitDiffCell(line)}
        </div>
      `);
      continue;
    }
    while (pendingDeletes.length) {
      rows.push(`
        <div class="rollout-diff-split-row">
          ${renderSplitDiffCell(pendingDeletes.shift())}
          ${renderSplitDiffCell(null)}
        </div>
      `);
    }
    rows.push(`
      <div class="rollout-diff-split-row">
        ${renderSplitDiffCell(line)}
        ${renderSplitDiffCell(line)}
      </div>
    `);
  }
  while (pendingDeletes.length) {
    rows.push(`
      <div class="rollout-diff-split-row">
        ${renderSplitDiffCell(pendingDeletes.shift())}
        ${renderSplitDiffCell(null)}
      </div>
    `);
  }
  return rows.join("");
}

function renderPatchFileBody(lines) {
  return `
    <div class="rollout-diff-view rollout-diff-unified">${lines.map(renderUnifiedDiffLine).join("")}</div>
    <div class="rollout-diff-view rollout-diff-split">${renderSplitDiffRows(lines)}</div>
  `;
}

function renderPatchFileShell(file, index, record) {
  const lazyKey = storeLazyRolloutContent(file.lines);
  return `
    <details class="rollout-diff-file" data-rollout-state-key="record-${escapeAttribute(record.line)}:patch-file-${index}" data-rollout-lazy-diff-file data-rollout-lazy-key="${escapeAttribute(lazyKey)}">
      <summary>
        <span class="rollout-diff-path">${escapeHtml(file.moveTo ? `${file.path} -> ${file.moveTo}` : file.path)}</span>
        <span class="rollout-diff-file-stat">+${formatNumber(file.additions)} -${formatNumber(file.deletions)}</span>
      </summary>
      <div class="rollout-diff-body" data-rollout-diff-file-body></div>
    </details>
  `;
}

function renderPatchFiles(files, record) {
  if (!files.length) {
    return "";
  }
  const stats = getPatchStats(files);
  return `
    <details class="rollout-details rollout-patch-details" data-rollout-state-key="record-${escapeAttribute(record.line)}:patch">
      <summary>Patch diff, ${formatNumber(stats.files)} files, +${formatNumber(stats.additions)} -${formatNumber(stats.deletions)}</summary>
      <div class="rollout-diff is-unified" data-rollout-diff data-rollout-state-key="record-${escapeAttribute(record.line)}:patch-mode">
        <div class="rollout-diff-toolbar">
          <span class="rollout-diff-stats">${formatNumber(stats.files)} files changed, +${formatNumber(stats.additions)} -${formatNumber(stats.deletions)}</span>
          <span class="rollout-diff-mode" role="group" aria-label="Diff view mode">
            <button type="button" data-rollout-diff-mode="unified" aria-pressed="true">Unified</button>
            <button type="button" data-rollout-diff-mode="split" aria-pressed="false">Split</button>
          </span>
        </div>
        ${files.map((file, index) => renderPatchFileShell(file, index, record)).join("")}
      </div>
    </details>
  `;
}

function renderPatchApplyEndDiff(changes, record) {
  return renderPatchFiles(parsePatchApplyEndChanges(changes), record);
}

function getTimestampMilliseconds(record) {
  const value = record.value?.timestamp;
  if (!value) {
    return null;
  }
  const time = new Date(value).getTime();
  return Number.isNaN(time) ? null : time;
}

function getSessionMeta(records) {
  return records.find(record => record.value?.type === "session_meta")?.value?.payload ?? null;
}

function getTurnId(record) {
  return record.value?.payload?.internal_chat_message_metadata_passthrough?.turn_id
    ?? record.value?.payload?.turn_id
    ?? record.value?.turn_id
    ?? null;
}

function getPayloadType(record) {
  return record.value?.payload?.type || record.value?.type || "";
}

function isFunctionCallPayloadType(type) {
  return type === "function_call" || type === "custom_tool_call";
}

function isFunctionOutputPayloadType(type) {
  return type === "function_call_output" || type === "custom_tool_call_output";
}

function getPayloadRole(record) {
  const payload = record.value?.payload ?? {};
  if (payload.role) {
    return payload.role;
  }
  if (payload.type === "agent_message") {
    return "agent";
  }
  if (payload.type === "user_message") {
    return "user";
  }
  if (isFunctionCallPayloadType(payload.type) || isFunctionOutputPayloadType(payload.type)) {
    return "tool";
  }
  if (payload.type === "reasoning") {
    return "reasoning";
  }
  return record.value?.type === "session_meta" ? "session" : "event";
}

function getContentBlocks(content) {
  const values = Array.isArray(content) ? content : content == null ? [] : [content];
  return values.map(value => {
    if (typeof value == "string") {
      return {
        type: "text",
        text: value
      };
    }
    if (!value || typeof value != "object") {
      return {
        type: "value",
        text: String(value ?? "")
      };
    }
    const type = value.type || "content";
    const text = typeof value.text == "string" ? value.text
      : typeof value.input_text == "string" ? value.input_text
      : typeof value.output_text == "string" ? value.output_text
      : typeof value.content == "string" ? value.content
      : stringifyCompact(value);
    return {
      type,
      text
    };
  }).filter(block => block.text !== "");
}

function getMessageBlocks(record) {
  const payload = record.value?.payload ?? {};
  if (payload.content != null) {
    return getContentBlocks(payload.content);
  }
  for (const key of ["message", "text", "output_text", "input_text"]) {
    if (typeof payload[key] == "string" && payload[key]) {
      return [{
        type: key,
        text: payload[key]
      }];
    }
  }
  return [];
}

function getMessageText(record) {
  return getMessageBlocks(record).map(block => block.text).join("\n\n");
}

function normalizeMessageForDedup(value) {
  return String(value ?? "").replace(/\s+/g, " ").trim();
}

function getCanonicalMessageRole(record) {
  const role = getPayloadRole(record);
  return role === "agent" ? "assistant" : role;
}

function getMessageDedupKey(record) {
  if (!isMessageLikeRecord(record)) {
    return null;
  }
  const text = normalizeMessageForDedup(getMessageText(record));
  if (!text) {
    return null;
  }
  return `${getCanonicalMessageRole(record)}\u0000${text}`;
}

function getRecordPriority(record) {
  if (record.value?.type === "response_item" && getPayloadType(record) === "message") {
    return 3;
  }
  if (record.value?.type === "event_msg" && (getPayloadType(record) === "agent_message" || getPayloadType(record) === "user_message")) {
    return 2;
  }
  return 1;
}

function shouldDropRecord(record) {
  const payloadType = getPayloadType(record);
  const payload = record.value?.payload ?? {};
  if (record.value?.type === "event_msg" && payloadType === "agent_message" && payload.phase === "final_answer") {
    return true;
  }
  return payloadType === "reasoning" || payloadType === "token_count";
}

function createRenderableRecords(records) {
  const bestMessageByKey = new Map();
  for (const record of records) {
    if (shouldDropRecord(record)) {
      continue;
    }
    const key = getMessageDedupKey(record);
    if (!key) {
      continue;
    }
    const current = bestMessageByKey.get(key);
    if (!current || getRecordPriority(record) > getRecordPriority(current)) {
      bestMessageByKey.set(key, record);
    }
  }

  const seenMessages = new Set();
  return records.filter(record => {
    if (shouldDropRecord(record)) {
      return false;
    }
    const key = getMessageDedupKey(record);
    if (!key) {
      return true;
    }
    if (bestMessageByKey.get(key) !== record) {
      return false;
    }
    if (seenMessages.has(key)) {
      return false;
    }
    seenMessages.add(key);
    return true;
  });
}

function getCompactText(value) {
  return String(value ?? "")
    .replace(/<[^>]+>/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function summarizeText(value, maxLength = 90) {
  const text = getCompactText(value);
  if (!text) {
    return "No text";
  }
  return text.length > maxLength ? `${text.slice(0, maxLength - 1)}...` : text;
}

function getFullTitleText(value) {
  return getCompactText(value) || "No text";
}

function getRecordKind(record) {
  const payloadType = getPayloadType(record);
  const role = getPayloadRole(record);
  if (record.value?.type === "session_meta" || record.value?.type === "turn_context") {
    return "system";
  }
  if (role === "user") {
    return "user";
  }
  if (role === "assistant" || role === "agent") {
    return "assistant";
  }
  if (isFunctionCallPayloadType(payloadType)) {
    return "tool-call";
  }
  if (isFunctionOutputPayloadType(payloadType)) {
    return "tool-output";
  }
  if (payloadType === "reasoning") {
    return "reasoning";
  }
  return "event";
}

function isUserMessageRecord(record) {
  return getPayloadRole(record) === "user" && (getPayloadType(record) === "message" || getPayloadType(record) === "user_message");
}

function isMessageLikeRecord(record) {
  const type = getPayloadType(record);
  return type === "message" || type === "agent_message" || type === "user_message";
}

function isAgentOutputRecord(record) {
  const role = getPayloadRole(record);
  return role === "assistant" || role === "agent";
}

function isContextCompactRecord(record) {
  return record.value?.type === "compacted" || getPayloadType(record) === "context_compacted";
}

function isContextCompactFollowupRecord(record) {
  const recordType = record.value?.type;
  const payloadType = getPayloadType(record);
  return recordType === "world_state"
    || recordType === "turn_context"
    || payloadType === "token_count"
    || payloadType === "context_compacted";
}

function getOutputExitCode(output) {
  const match = String(output ?? "").match(/Process exited with code\s+(-?\d+)/i);
  return match ? Number(match[1]) : null;
}

function summarizeRecords(records, parseErrors) {
  const responseItems = records.filter(record => record.value?.type === "response_item");
  const calls = responseItems.filter(record => isFunctionCallPayloadType(record.value?.payload?.type));
  const outputs = responseItems.filter(record => isFunctionOutputPayloadType(record.value?.payload?.type));
  const messageLikes = records.filter(isMessageLikeRecord);
  const events = records.filter(record => record.value?.type === "event_msg");
  const turnIds = new Set(records.map(getTurnId).filter(Boolean));
  const timestamps = records.map(getTimestampMilliseconds).filter(value => value != null);
  const failedOutputs = outputs.filter(record => {
    const output = String(record.value?.payload?.output ?? "");
    const exitCode = getOutputExitCode(output);
    return exitCode != null && exitCode !== 0;
  });
  return {
    records: records.length,
    messages: messageLikes.length,
    calls: calls.length,
    outputs: outputs.length,
    events: events.length,
    turns: turnIds.size || records.filter(record => record.value?.type === "turn_context").length,
    parseErrors: parseErrors.length,
    failedOutputs: failedOutputs.length,
    duration: timestamps.length >= 2 ? Math.max(...timestamps) - Math.min(...timestamps) : null
  };
}

function renderStat(label, value) {
  return `
    <div class="rollout-stat">
      <p class="rollout-stat-label">${escapeHtml(label)}</p>
      <p class="rollout-stat-value">${escapeHtml(value || "0")}</p>
    </div>
  `;
}

function renderKeyValueList(items) {
  const rows = items.filter(([, value]) => value != null && value !== "").map(([key, value]) => `
    <dt>${escapeHtml(key)}</dt>
    <dd>${renderInlineMarkdown(String(value))}</dd>
  `);
  return rows.length ? `<dl class="rollout-kv">${rows.join("")}</dl>` : "";
}

function renderHeader(records, parseErrors, options = {}) {
  const session = getSessionMeta(records);
  const stats = summarizeRecords(records, parseErrors);
  const title = session?.id ? `Codex Rollout ${session.id}` : options.fileName || getFileName(options.sourceUrl);
  const chips = [
    session?.cwd,
    session?.model_provider,
    session?.originator,
    session?.cli_version ? `CLI ${session.cli_version}` : null
  ].filter(Boolean);
  return `
    <header class="rollout-hero" id="rollout-top">
      <div>
        <p class="rollout-eyebrow">Local Codex JSONL</p>
        <h1>${escapeHtml(title)}</h1>
      </div>
      <p class="rollout-subtitle">
        ${chips.map(chip => `<span class="rollout-chip">${escapeHtml(chip)}</span>`).join("")}
      </p>
    </header>
    <section class="rollout-stats" aria-label="Rollout summary">
      ${renderStat("Turns", formatNumber(stats.turns))}
      ${renderStat("Messages", formatNumber(stats.messages))}
      ${renderStat("Calls", formatNumber(stats.calls))}
      ${renderStat("Outputs", formatNumber(stats.outputs))}
      ${renderStat("Events", formatNumber(stats.events))}
      ${renderStat("Duration", stats.duration == null ? "n/a" : formatDuration(stats.duration))}
      ${stats.failedOutputs ? renderStat("Failed", formatNumber(stats.failedOutputs)) : ""}
      ${stats.parseErrors ? renderStat("Parse Err", formatNumber(stats.parseErrors)) : ""}
    </section>
  `;
}

function getRecordTitle(record, callById = new Map()) {
  const payload = record.value?.payload ?? {};
  const payloadType = getPayloadType(record);
  const role = getPayloadRole(record);
  if (isMessageLikeRecord(record)) {
    if (role === "assistant" || role === "agent") {
      return summarizeText(getMessageText(record), 70);
    }
    return `${role}: ${summarizeText(getMessageText(record), 70)}`;
  }
  if (isFunctionCallPayloadType(payloadType)) {
    return `call: ${payload.name || "function"}`;
  }
  if (isFunctionOutputPayloadType(payloadType)) {
    const call = callById.get(payload.call_id);
    return `output: ${call?.name || payload.call_id || "function"}`;
  }
  return payloadType || record.value?.type || "event";
}

function normalizeDuplicateUserText(value) {
  return String(value ?? "").replace(/\s+/g, " ").trim();
}

function buildGroups(records) {
  const groups = [];
  let current = {
    id: "preamble",
    index: 0,
    title: "Preamble",
    userText: "",
    records: [],
    isPreamble: true
  };
  let userIndex = 0;

  for (const record of records) {
    if (isUserMessageRecord(record)) {
      const text = normalizeDuplicateUserText(getMessageText(record));
      const isDuplicateUserRecord = !current.isPreamble
        && text
        && normalizeDuplicateUserText(current.userText) === text
        && current.records.length <= 4;
      if (isDuplicateUserRecord) {
        continue;
      }
      if (current.isPreamble && current.records.length) {
        groups.push(current);
      }
      userIndex += 1;
      current = {
        id: `turn-${userIndex}`,
        index: userIndex,
        title: summarizeText(text, 110),
        userText: text,
        records: [record],
        isPreamble: false
      };
      groups.push(current);
      continue;
    }
    current.records.push(record);
  }

  if (current.isPreamble && current.records.length && !groups.includes(current)) {
    groups.push(current);
  }
  return groups;
}

function summarizeGroup(group) {
  const counts = {
    calls: 0,
    outputs: 0,
    failed: 0,
    messages: 0
  };
  for (const record of group.records) {
    const payloadType = getPayloadType(record);
    if (isFunctionCallPayloadType(payloadType)) {
      counts.calls += 1;
    } else if (isFunctionOutputPayloadType(payloadType)) {
      counts.outputs += 1;
      const exitCode = getOutputExitCode(record.value?.payload?.output);
      if (exitCode != null && exitCode !== 0) {
        counts.failed += 1;
      }
    } else if (isMessageLikeRecord(record)) {
      counts.messages += 1;
    }
  }
  return counts;
}

function buildGroupSections(group) {
  const sections = [];
  let currentAssistantSection = null;
  let currentCompactSection = null;
  let currentActivitySection = null;

  for (const record of group.records) {
    if (isAgentOutputRecord(record)) {
      currentCompactSection = null;
      currentActivitySection = null;
      const text = getMessageText(record);
      currentAssistantSection = {
        id: `assistant-${record.line}`,
        title: getFullTitleText(text),
        navTitle: summarizeText(text, 100),
        records: [record],
        standalone: false
      };
      sections.push(currentAssistantSection);
      continue;
    }

    if (isContextCompactRecord(record)) {
      if (currentCompactSection && !currentActivitySection && record.value?.type !== "compacted") {
        currentCompactSection.records.push(record);
      } else {
        currentAssistantSection = null;
        currentActivitySection = null;
        currentCompactSection = {
          id: `compact-${record.line}`,
          kind: "compact",
          title: "Context compacted",
          navTitle: "Context compacted",
          records: [record],
          standalone: false
        };
        sections.push(currentCompactSection);
      }
      continue;
    }

    if (currentCompactSection && !currentActivitySection && isContextCompactFollowupRecord(record)) {
      currentCompactSection.records.push(record);
      continue;
    }

    if (currentCompactSection && !isUserMessageRecord(record)) {
      if (!currentActivitySection) {
        currentActivitySection = {
          id: `post-compact-${record.line}`,
          kind: "activity",
          title: "Post-compact activity",
          navTitle: "Post-compact activity",
          records: [],
          standalone: false
        };
        sections.push(currentActivitySection);
      }
      currentActivitySection.records.push(record);
      continue;
    }

    if (currentAssistantSection && !isUserMessageRecord(record)) {
      currentAssistantSection.records.push(record);
      continue;
    }

    if (!isUserMessageRecord(record)) {
      if (!currentActivitySection) {
        currentActivitySection = {
          id: `activity-${record.line}`,
          kind: "activity",
          title: "Activity without assistant",
          navTitle: "Activity without assistant",
          records: [],
          standalone: false
        };
        sections.push(currentActivitySection);
      }
      currentActivitySection.records.push(record);
      continue;
    }

    currentCompactSection = null;
    currentActivitySection = null;
    sections.push({
      id: `entry-${record.line}`,
      title: getRecordTitle(record),
      records: [record],
      standalone: true
    });
  }

  return sections;
}

function renderSidebar(records, groups, errors, callById, options = {}) {
  const session = getSessionMeta(records);
  const fileName = options.fileName || getFileName(options.sourceUrl);
  return `
    <aside class="rollout-sidebar" aria-label="Rollout outline">
      <p class="rollout-tree-title">Outline</p>
      <div class="rollout-tree-actions">
        <button class="rollout-tool-btn" type="button" data-rollout-collapse-all>Collapse</button>
        <button class="rollout-tool-btn" type="button" data-rollout-expand-level-one>Level 1</button>
        <button class="rollout-tool-btn" type="button" data-rollout-expand-all>All</button>
        <button class="rollout-tool-btn" type="button" data-rollout-toggle-wrap>Wrap</button>
      </div>
      <nav class="rollout-tree">
        <a href="#rollout-top">${escapeHtml(session?.id || fileName)}</a>
        ${errors.length ? `<a href="#parse-errors">Parse errors (${formatNumber(errors.length)})</a>` : ""}
        ${groups.map(group => renderSidebarGroup(group, callById)).join("")}
      </nav>
    </aside>
  `;
}

function renderSidebarGroup(group, callById) {
  const label = group.isPreamble ? "Preamble" : `${group.index}. ${group.title}`;
  const assistantSections = buildGroupSections(group).filter(section => !section.standalone);
  const children = assistantSections
    .map(section => renderSidebarAssistantSection(section, callById))
    .join("");
  return `
    <details data-rollout-level="1" data-rollout-nav-target="${escapeAttribute(group.id)}">
      <summary><span class="rollout-nav-label">${escapeHtml(label)}</span></summary>
      <div class="rollout-tree-children">
        <a href="#${escapeAttribute(group.id)}">${escapeHtml(label)}</a>
        ${children}
      </div>
    </details>
  `;
}

function renderSidebarAssistantSection(section, callById) {
  const title = section.navTitle || section.title;
  return `<a href="#${escapeAttribute(section.id)}">${escapeHtml(title)}</a>`;
}

function renderEntry(record, role, title, body, options = {}) {
  const timestamp = formatTimestamp(record.value?.timestamp);
  const line = formatNumber(record.line);
  const roleClass = options.roleClass || `rollout-role-${role || "event"}`;
  return `
    <article class="rollout-entry rollout-entry-${escapeAttribute(options.kind || role || "event")} ${options.className || ""} rollout-entry-anchor" id="record-${record.line}">
      <div class="rollout-entry-head">
        <span class="rollout-role ${roleClass}">${escapeHtml(role || "event")}</span>
        <span class="rollout-entry-title">${escapeHtml(timestamp || title)}</span>
        <span class="rollout-line">line ${line}</span>
      </div>
      <div class="rollout-entry-body">
        ${title ? `<div class="rollout-entry-meta"><span>${escapeHtml(title)}</span></div>` : ""}
        ${body}
      </div>
    </article>
  `;
}

function renderMessage(record) {
  const payload = record.value?.payload ?? {};
  const role = getPayloadRole(record);
  const phase = payload.phase ? `phase: ${payload.phase}` : "";
  const blocks = getMessageBlocks(record);
  const text = getMessageText(record);
  const shouldCollapse = role !== "assistant"
    && (role === "developer" || role === "system" || text.length > LONG_MESSAGE_COLLAPSE_LENGTH);
  const body = blocks.length ? blocks.map(block => `
    <div class="rollout-content-block">
      ${blocks.length > 1 ? `<p class="rollout-content-label">${escapeHtml(block.type)}</p>` : ""}
      ${isAgentOutputRecord(record) ? renderMarkdownContent(block.text) : `<p class="rollout-text">${renderInlineMarkdown(block.text)}</p>`}
    </div>
  `).join("") : `<p class="rollout-empty">No visible message content.</p>`;
  const visibleBody = shouldCollapse
    ? `<details class="rollout-details" data-rollout-state-key="record-${escapeAttribute(record.line)}:message"><summary>${escapeHtml(role)} message, ${formatNumber(text.length)} characters</summary>${body}</details>`
    : body;
  return renderEntry(record, role, `${role} message${phase ? ` (${phase})` : ""}`, visibleBody, {
    kind: getRecordKind(record)
  });
}

function getCommandFromArguments(args) {
  if (!args || typeof args != "object" || Array.isArray(args)) {
    return null;
  }
  return args.cmd ?? args.command ?? args.script ?? null;
}

function renderFunctionCall(record) {
  const payload = record.value?.payload ?? {};
  const argsSource = payload.arguments ?? payload.input ?? "";
  const args = parseArguments(argsSource);
  const command = getCommandFromArguments(args);
  const argsText = typeof args == "string" ? args : stringifyCompact(args);
  const commandText = String(command ?? "");
  const updatePlanMarkdown = isToolName(payload.name, "update_plan") ? renderUpdatePlanMarkdown(args) : "";
  const body = [
    renderKeyValueList([
      ["Tool", payload.name],
      ["Call ID", payload.call_id],
      ["Workdir", args && typeof args == "object" && !Array.isArray(args) ? args.workdir : null]
    ]),
    updatePlanMarkdown,
    command ? renderCollapsibleHtml("Command", renderCodeBlock(commandText, "shell"), commandText.length, LONG_CONTENT_COLLAPSE_LENGTH, `record-${record.line}:command`) : "",
    updatePlanMarkdown ? "" : command ? renderDetails("Arguments", args, "json", `record-${record.line}:arguments`) : renderCollapsibleHtml("Arguments", renderCodeBlock(argsText, "json"), argsText.length, LONG_CONTENT_COLLAPSE_LENGTH, `record-${record.line}:arguments`)
  ].filter(Boolean).join("\n");
  return renderEntry(record, "tool", payload.name || "function call", body, {
    kind: "tool-call",
    roleClass: "rollout-role-tool"
  });
}

function renderFunctionOutput(record, callById) {
  const payload = record.value?.payload ?? {};
  const output = String(payload.output ?? "");
  const exitCode = getOutputExitCode(output);
  const call = callById.get(payload.call_id);
  const title = `output: ${call?.name || payload.call_id || "function call"}`;
  const className = exitCode != null && exitCode !== 0 ? "is-error" : "";
  const roleClass = exitCode != null && exitCode !== 0 ? "rollout-role-error" : "rollout-role-tool";
  const summary = exitCode == null ? `${formatNumber(output.length)} characters` : `exit ${exitCode}, ${formatNumber(output.length)} characters`;
  const outputHtml = renderLazyCodeDetails(summary, output, "text", `record-${record.line}:output`);
  const body = [
    renderKeyValueList([
      ["Call ID", payload.call_id],
      ["Exit Code", exitCode]
    ]),
    outputHtml
  ].filter(Boolean).join("\n");
  return renderEntry(record, "tool", title, body, {
    kind: "tool-output",
    className,
    roleClass
  });
}

function renderEvent(record) {
  const payload = record.value?.payload ?? {};
  if (payload.type === "agent_message" || payload.type === "user_message") {
    return renderMessage(record);
  }
  if (payload.type === "patch_apply_end") {
    const body = [
      renderKeyValueList([
        ["Type", payload.type],
        ["Call ID", payload.call_id],
        ["Turn", payload.turn_id],
        ["Status", payload.status],
        ["Success", payload.success]
      ]),
      renderPatchApplyEndDiff(payload.changes, record),
      payload.stdout ? renderLazyCodeDetails("stdout", payload.stdout, "text", `record-${record.line}:stdout`) : "",
      payload.stderr ? renderLazyCodeDetails("stderr", payload.stderr, "text", `record-${record.line}:stderr`) : ""
    ].filter(Boolean).join("\n");
    return renderEntry(record, "event", payload.type, body, {
      kind: "patch-apply-end",
      roleClass: payload.success === false ? "rollout-role-error" : "rollout-role-event"
    });
  }
  const text = payload.message || payload.text || payload.reason || "";
  const body = text
    ? renderCollapsibleHtml(payload.type || "event", renderMarkdownContent(text), String(text).length, LONG_CONTENT_COLLAPSE_LENGTH, `record-${record.line}:event`)
    : renderKeyValueList([
      ["Type", payload.type || record.value?.type],
      ["Turn", payload.turn_id],
      ["Mode", payload.collaboration_mode_kind],
      ["Started", payload.started_at],
      ["Duration", payload.duration_ms != null ? formatDuration(payload.duration_ms) : null]
    ]);
  return renderEntry(record, "event", payload.type || record.value?.type || "event", body, {
    kind: "event"
  });
}

function renderContextCompactRecord(record) {
  const payload = record.value?.payload ?? {};
  const replacementHistory = Array.isArray(payload.replacement_history) ? payload.replacement_history : null;
  const replacementRoles = replacementHistory
    ? replacementHistory.reduce((counts, item) => {
      const role = item?.role || item?.type || "item";
      counts.set(role, (counts.get(role) || 0) + 1);
      return counts;
    }, new Map())
    : null;
  const roleSummary = replacementRoles
    ? [...replacementRoles.entries()].map(([role, count]) => `${role}: ${formatNumber(count)}`).join(", ")
    : "";
  const body = renderKeyValueList([
    ["Type", record.value?.type === "compacted" ? "compacted" : getPayloadType(record)],
    ["Replacement History", replacementHistory ? `${formatNumber(replacementHistory.length)} items` : null],
    ["Roles", roleSummary],
    ["Message", payload.message],
    ["Turn", payload.turn_id]
  ]) || `<p class="rollout-empty">Context was compacted.</p>`;
  return renderEntry(record, "event", "context compacted", body, {
    kind: "context-compact",
    roleClass: "rollout-role-event"
  });
}

function renderSessionMeta(record) {
  const payload = record.value?.payload ?? {};
  const body = renderKeyValueList([
    ["Session ID", payload.id || payload.session_id],
    ["Started", formatTimestamp(payload.timestamp)],
    ["CWD", payload.cwd],
    ["Originator", payload.originator],
    ["Source", payload.source],
    ["Thread Source", payload.thread_source],
    ["Model Provider", payload.model_provider],
    ["CLI Version", payload.cli_version]
  ]);
  return renderEntry(record, "session", "session metadata", body, {
    kind: "system"
  });
}

function renderTurnContext(record) {
  const payload = record.value?.payload ?? {};
  return renderEntry(record, "turn", "turn context", renderKeyValueList([
    ["Turn", payload.turn_id],
    ["CWD", payload.cwd],
    ["Mode", payload.collaboration_mode_kind]
  ]), {
    kind: "system"
  });
}

function renderUnknown(record) {
  const payload = record.value?.payload ?? {};
  const type = payload.type || record.value?.type || "unknown";
  const body = renderKeyValueList([
    ["Type", type],
    ["Role", payload.role],
    ["ID", payload.id],
    ["Call ID", payload.call_id]
  ]);
  return renderEntry(record, "event", type, body || `<p class="rollout-empty">No compact renderer for this event.</p>`, {
    kind: "event"
  });
}

function renderRecord(record, context) {
  const value = record.value;
  if (isContextCompactRecord(record)) {
    return renderContextCompactRecord(record);
  }
  if (value?.type === "session_meta") {
    return renderSessionMeta(record);
  }
  if (value?.type === "turn_context") {
    return renderTurnContext(record);
  }
  if (value?.type === "event_msg") {
    return renderEvent(record);
  }
  if (value?.type !== "response_item") {
    return renderUnknown(record);
  }

  const payloadType = value.payload?.type;
  if (payloadType === "message") {
    return renderMessage(record);
  }
  if (isFunctionCallPayloadType(payloadType)) {
    return renderFunctionCall(record);
  }
  if (isFunctionOutputPayloadType(payloadType)) {
    return renderFunctionOutput(record, context.callById);
  }
  if (payloadType === "reasoning") {
    return "";
  }
  return renderUnknown(record);
}

function renderParseErrors(errors) {
  if (!errors.length) {
    return "";
  }
  return `
    <section class="rollout-parse-errors" id="parse-errors">
      <h2>JSONL parse errors</h2>
      ${errors.map(error => renderKeyValueList([
        ["Line", error.line],
        ["Error", error.message],
        ["Text", error.text]
      ])).join("")}
    </section>
  `;
}

function renderAssistantSection(section, context) {
  return `
    <details class="rollout-assistant-section" id="${escapeAttribute(section.id)}" data-rollout-level="2" data-rollout-body-id="${escapeAttribute(section.id)}" data-rollout-state-key="${escapeAttribute(section.id)}:body">
      <summary>
        <span class="rollout-assistant-title">${escapeHtml(section.title)}</span>
        <span class="rollout-count">${formatNumber(section.records.length)}</span>
      </summary>
      <div class="rollout-assistant-body">
        ${section.records.map(record => renderRecord(record, context)).join("")}
      </div>
    </details>
  `;
}

function renderCompactSection(section, context) {
  const firstRecord = section.records[0];
  const timestamp = formatTimestamp(firstRecord?.value?.timestamp);
  const compacted = section.records.find(record => record.value?.type === "compacted");
  const replacementHistory = compacted?.value?.payload?.replacement_history;
  const replacementCount = Array.isArray(replacementHistory) ? replacementHistory.length : 0;
  const meta = [
    timestamp,
    replacementCount ? `${formatNumber(replacementCount)} history items` : "",
    `${formatNumber(section.records.length)} events`
  ].filter(Boolean).join(" / ");
  return `
    <details class="rollout-compact-section" id="${escapeAttribute(section.id)}" data-rollout-level="2" data-rollout-body-id="${escapeAttribute(section.id)}" data-rollout-state-key="${escapeAttribute(section.id)}:body">
      <summary>
        <span class="rollout-compact-rule"></span>
        <span class="rollout-compact-title">${escapeHtml(section.title)}</span>
        <span class="rollout-compact-rule"></span>
        <span class="rollout-count">${escapeHtml(meta)}</span>
      </summary>
      <div class="rollout-compact-body">
        ${section.records.map(record => renderRecord(record, context)).join("")}
      </div>
    </details>
  `;
}

function renderGroupSection(section, context) {
  if (section.standalone) {
    return section.records.map(record => renderRecord(record, context)).join("");
  }
  if (section.kind === "compact") {
    return renderCompactSection(section, context);
  }
  return renderAssistantSection(section, context);
}

function renderTurnGroup(group, context) {
  const counts = summarizeGroup(group);
  const title = group.isPreamble ? "Preamble" : group.title;
  const sections = buildGroupSections(group);
  const lazyBodyKey = storeLazyRolloutContent(sections.map(section => renderGroupSection(section, context)).join(""));
  const meta = [
    `${formatNumber(group.records.length)} events`,
    counts.messages ? `${formatNumber(counts.messages)} msg` : "",
    counts.calls ? `${formatNumber(counts.calls)} calls` : "",
    counts.outputs ? `${formatNumber(counts.outputs)} outputs` : "",
    counts.failed ? `${formatNumber(counts.failed)} failed` : ""
  ].filter(Boolean);
  return `
    <details class="rollout-turn" id="${escapeAttribute(group.id)}" data-rollout-level="1" data-rollout-body-id="${escapeAttribute(group.id)}" data-rollout-state-key="${escapeAttribute(group.id)}:body" data-rollout-lazy-turn data-rollout-lazy-key="${escapeAttribute(lazyBodyKey)}">
      <summary>
        <div class="rollout-turn-title">
          <h2>${escapeHtml(group.isPreamble ? title : `${group.index}. ${title}`)}</h2>
          <p class="rollout-turn-meta">${meta.map(item => `<span>${escapeHtml(item)}</span>`).join("")}</p>
        </div>
        <span class="rollout-count">${formatNumber(group.records.length)}</span>
      </summary>
      <div class="rollout-turn-body" data-rollout-lazy-turn-body></div>
    </details>
  `;
}

function createMeta(name, content) {
  const meta = document.createElement("meta");
  meta.setAttribute("name", name);
  meta.setAttribute("content", content);
  return meta;
}

function renderDocument(records, errors, options = {}) {
  lazyRolloutContentStore = new Map();
  const session = getSessionMeta(records);
  const sourceUrl = options.sourceUrl || location.href;
  const fileName = options.fileName || getFileName(sourceUrl);
  const title = session?.id ? `Codex Rollout ${session.id}` : fileName.replace(/\.jsonl$/i, "");
  const charset = document.createElement("meta");
  charset.setAttribute("charset", "utf-8");
  const viewport = createMeta("viewport", "width=device-width, initial-scale=1");
  const source = createMeta(SOURCE_META, sourceUrl);
  const canonical = createMeta(CANONICAL_META, sourceUrl);
  const titleElement = document.createElement("title");
  titleElement.textContent = title;
  const style = document.createElement("style");
  style.id = "local-codex-rollout-style";
  style.textContent = ROLLOUT_CSS;

  const callById = new Map();
  for (const record of records) {
    if (record.value?.type === "response_item" && isFunctionCallPayloadType(record.value?.payload?.type) && record.value.payload.call_id) {
      callById.set(record.value.payload.call_id, record.value.payload);
    }
  }
  const groups = buildGroups(records);
  const context = {
    callById
  };

  document.head.replaceChildren(charset, viewport, source, canonical, titleElement, style);
  document.title = title;
  document.documentElement.dataset.codexRolloutRendered = "rendered";
  if (!document.documentElement.lang) {
    document.documentElement.lang = navigator.language || "en";
  }

  const article = document.createElement("article");
  article.className = "codex-rollout";
  article.dataset.codexRolloutRendered = "true";
  article.innerHTML = `
    ${renderSidebar(records, groups, errors, callById, { fileName, sourceUrl })}
    <main class="rollout-main">
      ${renderHeader(records, errors, { fileName, sourceUrl })}
      ${renderParseErrors(errors)}
      <section class="rollout-turn-list" aria-label="Rollout turns">
        ${groups.map(group => renderTurnGroup(group, context)).join("")}
      </section>
    </main>
  `;

  document.body.className = "codex-rollout-page";
  document.body.replaceChildren(article);
  initRolloutControls();
}

function renderLazyCodeDetailsNode(details) {
  const body = details.querySelector("[data-rollout-lazy-code-body]");
  if (!body || body.childNodes.length) {
    return;
  }
  body.innerHTML = renderCodeBlock(lazyRolloutContentStore.get(details.dataset.rolloutLazyKey) || "", details.dataset.rolloutLanguage || "plaintext");
}

function renderLazyDiffFile(details) {
  const body = details.querySelector("[data-rollout-diff-file-body]");
  if (!body || body.childNodes.length) {
    return;
  }
  try {
    const lines = lazyRolloutContentStore.get(details.dataset.rolloutLazyKey) || [];
    body.innerHTML = renderPatchFileBody(lines);
  } catch (error) {
    body.innerHTML = `<p class="rollout-empty">Could not render diff: ${escapeHtml(error?.message || error)}</p>`;
  }
}

function renderLazyTurn(details) {
  const body = details.querySelector("[data-rollout-lazy-turn-body]");
  if (!body || body.childNodes.length) {
    return;
  }
  body.innerHTML = lazyRolloutContentStore.get(details.dataset.rolloutLazyKey) || "";
}

function renderOpenLazyRolloutDetails(defer = false, kind = "all") {
  const nodes = [
    ...document.querySelectorAll("details[open][data-rollout-lazy-turn], details[open][data-rollout-lazy-code], details[open][data-rollout-lazy-diff-file]")
  ].filter(node => {
    if (kind === "turn" && !node.matches("[data-rollout-lazy-turn]")) {
      return false;
    }
    if (kind === "content" && node.matches("[data-rollout-lazy-turn]")) {
      return false;
    }
    const body = node.querySelector("[data-rollout-lazy-turn-body], [data-rollout-lazy-code-body], [data-rollout-diff-file-body]");
    return body && !body.childNodes.length;
  });
  const renderNode = node => {
    if (node.matches("[data-rollout-lazy-turn]")) {
      renderLazyTurn(node);
    } else if (node.matches("[data-rollout-lazy-code]")) {
      renderLazyCodeDetailsNode(node);
    } else if (node.matches("[data-rollout-lazy-diff-file]")) {
      renderLazyDiffFile(node);
    }
  };
  if (!defer) {
    nodes.forEach(renderNode);
    return;
  }
  const schedule = globalThis.requestIdleCallback || (callback => setTimeout(callback, 0));
  let index = 0;
  const renderChunk = deadline => {
    const startedAt = performance.now();
    while (index < nodes.length) {
      renderNode(nodes[index]);
      index += 1;
      if (deadline?.timeRemaining && deadline.timeRemaining() <= 2) {
        break;
      }
      if (!deadline?.timeRemaining && performance.now() - startedAt > 12) {
        break;
      }
    }
    if (index < nodes.length) {
      schedule(renderChunk);
    } else {
      enhanceRenderedContent();
    }
  };
  schedule(renderChunk);
}

function setRolloutDirectoryLevel(mode) {
  document.documentElement.dataset.rolloutRestoringState = "true";
  try {
    document.querySelectorAll(".rollout-tree details, .rollout-turn, .rollout-assistant-section").forEach(node => {
      const level = Number(node.dataset.rolloutLevel || 0);
      if (mode === "collapse") {
        node.open = false;
      } else if (mode === "level-one") {
        node.open = level === 1;
      } else if (mode === "all") {
        node.open = true;
      }
    });
  } finally {
    delete document.documentElement.dataset.rolloutRestoringState;
  }
}

function openSidebarRolloutTarget(anchor) {
  const href = anchor?.getAttribute("href") || "";
  if (!href.startsWith("#") || href.length <= 1) {
    return false;
  }
  let targetId = href.slice(1);
  try {
    targetId = decodeURIComponent(targetId);
  } catch {
    // Keep the literal hash target when it is not URI encoded.
  }
  const sidebarGroup = anchor.closest('.rollout-tree details[data-rollout-level="1"][data-rollout-nav-target]');
  const turn = sidebarGroup
    ? document.getElementById(sidebarGroup.dataset.rolloutNavTarget || "")
    : null;
  if (turn instanceof HTMLDetailsElement) {
    turn.open = true;
    renderLazyTurn(turn);
  }
  const target = document.getElementById(targetId);
  if (!target) {
    return false;
  }
  if (target instanceof HTMLDetailsElement) {
    target.open = true;
  }
  const stateKeys = [turn, target]
    .filter(node => node instanceof HTMLDetailsElement && node.dataset.rolloutStateKey)
    .map(node => node.dataset.rolloutStateKey);
  document.dispatchEvent(new CustomEvent("codex-rollout-navigation-open", {
    detail: { stateKeys }
  }));
  try {
    history.pushState(null, "", `#${encodeURIComponent(targetId)}`);
  } catch {
    location.hash = targetId;
  }
  const scroll = () => target.scrollIntoView({ behavior: "auto", block: "start" });
  scroll();
  requestAnimationFrame(scroll);
  enhanceRenderedContent();
  return true;
}

function initRolloutControls() {
  document.querySelector("[data-rollout-collapse-all]")?.addEventListener("click", () => {
    setRolloutDirectoryLevel("collapse");
  });
  document.querySelector("[data-rollout-expand-level-one]")?.addEventListener("click", () => {
    setRolloutDirectoryLevel("level-one");
  });
  document.querySelector("[data-rollout-expand-all]")?.addEventListener("click", () => {
    setRolloutDirectoryLevel("all");
  });
  document.querySelector("[data-rollout-toggle-wrap]")?.addEventListener("click", event => {
    const root = document.querySelector(".codex-rollout");
    root?.classList.toggle("rollout-nav-wrap");
    event.currentTarget.textContent = root?.classList.contains("rollout-nav-wrap") ? "Truncate" : "Wrap";
  });
  document.addEventListener("toggle", event => {
    const details = event.target;
    if (!(details instanceof HTMLDetailsElement) || !details.open) {
      return;
    }
    if (document.documentElement?.dataset?.rolloutRestoringState === "true") {
      return;
    }
    if (details.matches("[data-rollout-lazy-code]")) {
      renderLazyCodeDetailsNode(details);
    }
    if (details.matches("[data-rollout-lazy-diff-file]")) {
      renderLazyDiffFile(details);
    }
    if (details.matches("[data-rollout-lazy-turn]")) {
      renderLazyTurn(details);
    }
    enhanceRenderedContent();
  }, true);
  document.addEventListener("click", event => {
    const navLink = event.target.closest('.rollout-tree a[href^="#"]');
    if (navLink && openSidebarRolloutTarget(navLink)) {
      event.preventDefault();
      return;
    }
    const button = event.target.closest("[data-rollout-diff-mode]");
    if (!button) {
      return;
    }
    const mode = button.dataset.rolloutDiffMode;
    const diff = button.closest("[data-rollout-diff]");
    if (!mode || !diff) {
      return;
    }
    diff.classList.toggle("is-unified", mode === "unified");
    diff.classList.toggle("is-split", mode === "split");
    diff.querySelectorAll("[data-rollout-diff-mode]").forEach(item => {
      item.setAttribute("aria-pressed", String(item === button));
      });
  });
  document.addEventListener("codex-rollout-render-open-lazy", event => {
    renderOpenLazyRolloutDetails(Boolean(event.detail?.defer), event.detail?.kind || "all");
  });
}

function getRuntimeUrl(path) {
  try {
    if (globalThis.chrome?.runtime?.getURL) {
      return chrome.runtime.getURL(path);
    }
  } catch {
    // Fall through to the module-relative path for the standalone HTML viewer.
  }
  try {
    return new URL(path, import.meta.url).href;
  } catch {
    return null;
  }
}

function loadPageScript(url, assetName) {
  return new Promise((resolve, reject) => {
    const script = document.createElement("script");
    script.src = url;
    script.async = true;
    script.dataset.codexRolloutRenderedAsset = assetName;
    script.addEventListener("load", () => resolve());
    script.addEventListener("error", () => {
      script.remove();
      reject(new Error(`Failed to load script: ${url}`));
    });
    document.head.append(script);
  });
}

function loadPageStylesheet(url, assetName) {
  return new Promise((resolve, reject) => {
    const link = document.createElement("link");
    link.rel = "stylesheet";
    link.href = url;
    link.dataset.codexRolloutRenderedAsset = assetName;
    link.addEventListener("load", () => resolve());
    link.addEventListener("error", () => {
      link.remove();
      reject(new Error(`Failed to load stylesheet: ${url}`));
    });
    document.head.append(link);
  });
}

function ensureCodeHighlightScript() {
  if (!codeHighlightScriptPromise) {
    const url = getRuntimeUrl(HIGHLIGHT_JS_VENDOR_PATH);
    codeHighlightScriptPromise = url
      ? loadPageScript(url, "highlightjs").catch(error => {
        codeHighlightScriptPromise = null;
        throw error;
      })
      : Promise.reject(new Error("Highlight.js URL unavailable"));
  }
  return codeHighlightScriptPromise;
}

function ensureMathRenderAssets() {
  if (window.katex) {
    return Promise.resolve();
  }
  if (!mathRenderAssetsPromise) {
    const scriptUrl = getRuntimeUrl(KATEX_JS_VENDOR_PATH);
    const stylesheetUrl = getRuntimeUrl(KATEX_CSS_VENDOR_PATH);
    mathRenderAssetsPromise = scriptUrl && stylesheetUrl
      ? Promise.all([
          loadPageStylesheet(stylesheetUrl, "katex-css"),
          loadPageScript(scriptUrl, "katex-js")
        ]).catch(error => {
          mathRenderAssetsPromise = null;
          throw error;
        })
      : Promise.reject(new Error("KaTeX asset URL unavailable"));
  }
  return mathRenderAssetsPromise;
}

function isCodeBlockVisibleForHighlight(node) {
  let current = node.parentElement;
  while (current && current !== document.body) {
    if (current instanceof HTMLDetailsElement && !current.open) {
      return false;
    }
    current = current.parentElement;
  }
  return true;
}

async function highlightCodeBlocks() {
  const nodes = [...document.querySelectorAll("article.codex-rollout pre code")]
    .filter(isCodeBlockVisibleForHighlight);
  if (!nodes.length) {
    return;
  }
  try {
    await ensureCodeHighlightScript();
    const hljs = window.hljs;
    if (!hljs) {
      return;
    }
    const aliases = {
      ps: "powershell",
      ps1: "powershell",
      sh: "bash",
      shell: "bash",
      txt: "plaintext",
      text: "plaintext"
    };
    for (const node of nodes) {
      if (node.dataset.highlighted === "yes") {
        continue;
      }
      const className = [...node.classList].find(name => /^(?:language|lang)-/.test(name));
      const language = className ? className.replace(/^(?:language|lang)-/, "").toLowerCase() : "plaintext";
      const normalized = aliases[language] ?? language;
      if (normalized !== language) {
        node.classList.remove(className);
        node.classList.add(`language-${normalized}`);
      }
      if (normalized && normalized !== "plaintext" && !hljs.getLanguage(normalized)) {
        node.classList.remove(...[...node.classList].filter(name => /^(?:language|lang)-/.test(name)));
        node.classList.add("language-plaintext");
      }
      hljs.highlightElement(node);
    }
  } catch (error) {
    console.warn("[codex-rollout-viewer] Highlight.js unavailable", error);
  }
}

async function renderMathExpressions() {
  const nodes = [...document.querySelectorAll("article.codex-rollout [data-rollout-math]:not([data-rollout-math-rendered])")]
    .filter(isCodeBlockVisibleForHighlight);
  if (!nodes.length) {
    return;
  }
  try {
    await ensureMathRenderAssets();
    if (!window.katex) {
      return;
    }
    for (const node of nodes) {
      const source = node.textContent || "";
      try {
        window.katex.render(source, node, {
          displayMode: node.dataset.rolloutDisplay === "true",
          throwOnError: false,
          strict: "warn",
          trust: false
        });
        node.dataset.rolloutMathRendered = "yes";
      } catch (error) {
        console.warn("[codex-rollout-viewer] Could not render math expression", error);
      }
    }
  } catch (error) {
    console.warn("[codex-rollout-viewer] KaTeX unavailable", error);
  }
}

async function enhanceRenderedContent() {
  await Promise.all([highlightCodeBlocks(), renderMathExpressions()]);
}

export async function renderCodexRolloutJsonlText(jsonl, options = {}) {
  ensureDocumentStructure();
  const parsed = parseCodexRolloutJsonl(jsonl);
  if (!isCodexRolloutRecords(parsed.records)) {
    return {
      rendered: false,
      records: parsed.records.length,
      errors: parsed.errors
    };
  }
  const records = createRenderableRecords(parsed.records);
  renderDocument(records, parsed.errors, {
    fileName: options.fileName,
    sourceUrl: options.sourceUrl || options.fileName || location.href
  });
  await enhanceRenderedContent();
  return {
    rendered: true,
    records: records.length,
    errors: parsed.errors
  };
}

export async function renderCodexRolloutRecords(parsed, options = {}) {
  ensureDocumentStructure();
  const records = createRenderableRecords(parsed?.records || []);
  renderDocument(records, parsed?.errors || [], {
    fileName: options.fileName,
    sourceUrl: options.sourceUrl || options.fileName || location.href
  });
  await enhanceRenderedContent();
  return {
    rendered: true,
    records: records.length,
    errors: parsed?.errors?.length || 0
  };
}

export async function renderLocalCodexRolloutDocument() {
  if (!isLocalCodexRolloutJsonlUrl()) {
    return false;
  }
  if (document.documentElement?.dataset?.codexRolloutRendered === "rendered") {
    await enhanceRenderedContent();
    return true;
  }
  ensureDocumentStructure();
  const raw = getRawJsonlFromDocument();
  if (raw === null) {
    await enhanceRenderedContent();
    return true;
  }
  const parsed = parseCodexRolloutJsonl(raw);
  if (!isCodexRolloutRecords(parsed.records)) {
    return false;
  }
  renderDocument(createRenderableRecords(parsed.records), parsed.errors);
  await enhanceRenderedContent();
  return true;
}
