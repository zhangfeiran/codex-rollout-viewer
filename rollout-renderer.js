const SOURCE_META = "codex-rollout-source-url";
const CANONICAL_META = "codex-rollout-canonical-url";
const JSONL_FILE_PATTERN = /\.jsonl(?:$|[?#])/i;
const HIGHLIGHT_JS_VENDOR_PATH = "vendor/highlightjs/highlight.min.js";
const MAX_DETAILS_STRING_LENGTH = 8000;
const MAX_DISPLAY_TEXT_LENGTH = 120000;
const LONG_CONTENT_COLLAPSE_LENGTH = 2200;
const LONG_MESSAGE_COLLAPSE_LENGTH = LONG_CONTENT_COLLAPSE_LENGTH;
const LONG_OUTPUT_COLLAPSE_LENGTH = LONG_CONTENT_COLLAPSE_LENGTH;

let codeHighlightScriptPromise = null;

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
  overflow-wrap: anywhere;
  color: var(--wh-rollout-fg);
  font-size: 13px;
  font-weight: 650;
}

.rollout-assistant-body {
  min-width: 0;
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

.markdown-lite blockquote {
  padding-left: 10px;
  color: var(--wh-rollout-muted);
  border-left: 3px solid var(--wh-rollout-border);
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

function renderInlineMarkdown(value) {
  const tokenStore = createTokenStore();
  let text = String(value ?? "");
  text = text.replace(/\\([\\`*_[\]{}()#+\-.!|>])/g, (_match, character) => tokenStore.push(escapeHtml(character)));
  text = text.replace(/`([^`\n]+)`/g, (_match, code) => tokenStore.push(`<code>${escapeHtml(code)}</code>`));
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

function isBlockStart(lines, index) {
  const line = lines[index] ?? "";
  return isBlank(line) || Boolean(isHeading(line)) || /^\s{0,3}>/.test(line) || Boolean(getListMatch(line));
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
  return `${text.slice(0, maxLength)}\n\n... ${text.length - maxLength} characters omitted by rollout renderer ...`;
}

function normalizeLanguage(language) {
  const cleaned = String(language ?? "").trim().split(/\s+/)[0] || "plaintext";
  return /^[A-Za-z0-9_.+-]+$/.test(cleaned) ? cleaned.toLowerCase() : "plaintext";
}

function renderCodeBlock(value, language = "plaintext") {
  return `<pre><code class="language-${escapeAttribute(normalizeLanguage(language))}">${escapeHtml(truncateText(value))}</code></pre>`;
}

function renderCollapsibleHtml(summary, html, rawLength, threshold = LONG_CONTENT_COLLAPSE_LENGTH) {
  if (!Number.isFinite(rawLength) || rawLength <= threshold) {
    return html;
  }
  return `<details class="rollout-details"><summary>${escapeHtml(summary)}, ${formatNumber(rawLength)} characters</summary>${html}</details>`;
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

function renderDetails(summary, value, language = "json") {
  const code = language === "json" ? stringifyCompact(value) : truncateText(value, MAX_DETAILS_STRING_LENGTH);
  return `<details class="rollout-details"><summary>${escapeHtml(summary)}</summary>${renderCodeBlock(code, language)}</details>`;
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
  if (payload.type === "function_call" || payload.type === "function_call_output") {
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
  if (payloadType === "function_call") {
    return "tool-call";
  }
  if (payloadType === "function_call_output") {
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

function getOutputExitCode(output) {
  const match = String(output ?? "").match(/Process exited with code\s+(-?\d+)/i);
  return match ? Number(match[1]) : null;
}

function summarizeRecords(records, parseErrors) {
  const responseItems = records.filter(record => record.value?.type === "response_item");
  const calls = responseItems.filter(record => record.value?.payload?.type === "function_call");
  const outputs = responseItems.filter(record => record.value?.payload?.type === "function_call_output");
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
  if (payloadType === "function_call") {
    return `call: ${payload.name || "function"}`;
  }
  if (payloadType === "function_call_output") {
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
    if (payloadType === "function_call") {
      counts.calls += 1;
    } else if (payloadType === "function_call_output") {
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

  for (const record of group.records) {
    if (isAgentOutputRecord(record)) {
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

    if (currentAssistantSection && !isUserMessageRecord(record)) {
      currentAssistantSection.records.push(record);
      continue;
    }

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
  const children = section.records
    .slice(1)
    .map(record => `<a href="#record-${record.line}">${escapeHtml(getRecordTitle(record, callById))}</a>`)
    .join("");
  return `
    <details data-rollout-level="2" data-rollout-nav-target="${escapeAttribute(section.id)}">
      <summary><span class="rollout-nav-label">${escapeHtml(title)}</span></summary>
      <div class="rollout-tree-children">
        <a href="#${escapeAttribute(section.id)}">${escapeHtml(title)}</a>
        ${children}
      </div>
    </details>
  `;
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
  const shouldCollapse = role === "developer" || role === "system" || text.length > LONG_MESSAGE_COLLAPSE_LENGTH;
  const body = blocks.length ? blocks.map(block => `
    <div class="rollout-content-block">
      ${blocks.length > 1 ? `<p class="rollout-content-label">${escapeHtml(block.type)}</p>` : ""}
      ${isAgentOutputRecord(record) ? renderMarkdownContent(block.text) : `<p class="rollout-text">${renderInlineMarkdown(block.text)}</p>`}
    </div>
  `).join("") : `<p class="rollout-empty">No visible message content.</p>`;
  const visibleBody = shouldCollapse
    ? `<details class="rollout-details"><summary>${escapeHtml(role)} message, ${formatNumber(text.length)} characters</summary>${body}</details>`
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
  const args = parseArguments(payload.arguments);
  const command = getCommandFromArguments(args);
  const argsText = typeof args == "string" ? args : stringifyCompact(args);
  const commandText = String(command ?? "");
  const body = [
    renderKeyValueList([
      ["Tool", payload.name],
      ["Call ID", payload.call_id],
      ["Workdir", args && typeof args == "object" && !Array.isArray(args) ? args.workdir : null]
    ]),
    command ? renderCollapsibleHtml("Command", renderCodeBlock(commandText, "shell"), commandText.length) : renderCollapsibleHtml("Arguments", renderCodeBlock(argsText, "json"), argsText.length),
    command ? renderDetails("Arguments", args) : ""
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
  const outputHtml = `<details class="rollout-details"><summary>${escapeHtml(summary)}</summary>${renderCodeBlock(output, "text")}</details>`;
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
  const text = payload.message || payload.text || payload.reason || "";
  const body = text
    ? renderCollapsibleHtml(payload.type || "event", renderMarkdownContent(text), String(text).length)
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
  if (payloadType === "function_call") {
    return renderFunctionCall(record);
  }
  if (payloadType === "function_call_output") {
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
    <details class="rollout-assistant-section" id="${escapeAttribute(section.id)}" data-rollout-level="2" data-rollout-body-id="${escapeAttribute(section.id)}">
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

function renderGroupSection(section, context) {
  if (section.standalone) {
    return section.records.map(record => renderRecord(record, context)).join("");
  }
  return renderAssistantSection(section, context);
}

function renderTurnGroup(group, context) {
  const counts = summarizeGroup(group);
  const title = group.isPreamble ? "Preamble" : group.title;
  const sections = buildGroupSections(group);
  const meta = [
    `${formatNumber(group.records.length)} events`,
    counts.messages ? `${formatNumber(counts.messages)} msg` : "",
    counts.calls ? `${formatNumber(counts.calls)} calls` : "",
    counts.outputs ? `${formatNumber(counts.outputs)} outputs` : "",
    counts.failed ? `${formatNumber(counts.failed)} failed` : ""
  ].filter(Boolean);
  return `
    <details class="rollout-turn" id="${escapeAttribute(group.id)}" data-rollout-level="1" data-rollout-body-id="${escapeAttribute(group.id)}">
      <summary>
        <div class="rollout-turn-title">
          <h2>${escapeHtml(group.isPreamble ? title : `${group.index}. ${title}`)}</h2>
          <p class="rollout-turn-meta">${meta.map(item => `<span>${escapeHtml(item)}</span>`).join("")}</p>
        </div>
        <span class="rollout-count">${formatNumber(group.records.length)}</span>
      </summary>
      <div class="rollout-turn-body">
        ${sections.map(section => renderGroupSection(section, context)).join("")}
      </div>
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
    if (record.value?.type === "response_item" && record.value?.payload?.type === "function_call" && record.value.payload.call_id) {
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

function getSynchronizedDetails(targetId) {
  if (!targetId) {
    return [];
  }
  const escaped = CSS.escape(targetId);
  return [...document.querySelectorAll(`[data-rollout-nav-target="${escaped}"],[data-rollout-body-id="${escaped}"]`)];
}

function syncRolloutDetails(source) {
  const targetId = source.dataset.rolloutNavTarget || source.dataset.rolloutBodyId;
  for (const node of getSynchronizedDetails(targetId)) {
    if (node !== source && node.open !== source.open) {
      node.open = source.open;
    }
  }
}

function setRolloutDirectoryLevel(mode) {
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
  document.querySelectorAll("[data-rollout-nav-target], [data-rollout-body-id]").forEach(node => {
    node.addEventListener("toggle", () => {
      syncRolloutDetails(node);
    });
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

function loadPageScript(url) {
  return new Promise((resolve, reject) => {
    const script = document.createElement("script");
    script.src = url;
    script.async = true;
    script.dataset.codexRolloutRenderedAsset = "highlightjs";
    script.addEventListener("load", () => resolve());
    script.addEventListener("error", () => {
      script.remove();
      reject(new Error(`Failed to load script: ${url}`));
    });
    document.head.append(script);
  });
}

function ensureCodeHighlightScript() {
  if (!codeHighlightScriptPromise) {
    const url = getRuntimeUrl(HIGHLIGHT_JS_VENDOR_PATH);
    codeHighlightScriptPromise = url
      ? loadPageScript(url).catch(error => {
        codeHighlightScriptPromise = null;
        throw error;
      })
      : Promise.reject(new Error("Highlight.js URL unavailable"));
  }
  return codeHighlightScriptPromise;
}

async function highlightCodeBlocks() {
  const nodes = [...document.querySelectorAll("article.codex-rollout pre code")];
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
  await highlightCodeBlocks();
  return {
    rendered: true,
    records: records.length,
    errors: parsed.errors
  };
}

export async function renderLocalCodexRolloutDocument() {
  if (!isLocalCodexRolloutJsonlUrl()) {
    return false;
  }
  if (document.documentElement?.dataset?.codexRolloutRendered === "rendered") {
    await highlightCodeBlocks();
    return true;
  }
  ensureDocumentStructure();
  const raw = getRawJsonlFromDocument();
  if (raw === null) {
    await highlightCodeBlocks();
    return true;
  }
  const parsed = parseCodexRolloutJsonl(raw);
  if (!isCodexRolloutRecords(parsed.records)) {
    return false;
  }
  renderDocument(createRenderableRecords(parsed.records), parsed.errors);
  await highlightCodeBlocks();
  return true;
}
