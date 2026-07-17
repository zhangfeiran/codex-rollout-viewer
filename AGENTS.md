# Codex Rollout Viewer

Browser-based viewer for local Codex rollout `.jsonl` files.

## Scope

This project only owns Codex rollout JSONL viewing. It is intentionally separate from `web-highlights-local` and does not include webpage highlighting, bookmark management, local sync, SingleFile export, or Web Highlights UI components.

## Source Layout

- `codex-rollout-viewer.html`
  Canonical local/offline HTML entrypoint. It embeds `rollout-renderer.js` between sync markers.

- `codex-rollout-viewer2.html`
  Generated synchronized local/offline copy. Do not edit it directly; `npm run export:pages` refreshes it from `codex-rollout-viewer.html`. Its distinct path keeps remembered rollout state separate.

- `rollout-renderer.js`
  Self-contained Codex rollout parser and dark-mode HTML renderer.

- GitHub Pages output
  Generated outside the repository in a temporary directory. It contains the primary root viewer and `codex-rollout-viewer2/`, whose distinct hosted path keeps remembered rollout state separate. The deployment workflow uploads that temporary artifact; do not restore a committed `pages/` tree.

- `vendor/highlightjs/`
  Local Highlight.js runtime used for code block highlighting. Keep vendored files local; do not fetch CDN assets at runtime.

- `scripts/check.mjs`
  Syntax and embedded-renderer sync checks.

- `scripts/export-pages.mjs`
  Synchronizes `codex-rollout-viewer2.html` and stages the GitHub Pages artifact in the system temporary directory, or in `CODEX_ROLLOUT_PAGES_DIR` when set.

## Workflow

- Edit files in this directory directly.
- Run `npm run export:pages` after changing `codex-rollout-viewer.html` or `rollout-renderer.js`; this refreshes `codex-rollout-viewer2.html` and stages Pages outside the repository.
- Run `npm run check` after exporting; it verifies both local HTML files and their embedded renderer copies.
- Prefer the hosted Pages version for normal use: https://zhangfeiran.github.io/codex-rollout-viewer/
- Use https://zhangfeiran.github.io/codex-rollout-viewer/codex-rollout-viewer2/ for a second independent hosted rollout state.
- For local/offline use, open `codex-rollout-viewer.html` or `codex-rollout-viewer2.html` in Chrome.

## Modification Rules

- Keep this project focused on local Codex rollout viewing.
- Do not add Web Highlights highlighter/sidebar/local-sync behavior here.
- Preserve the compact dark-mode outline/body layout unless the user asks for a UI change.
- Long content and tool outputs should stay collapsed by default.
- When changing parser behavior, validate with a real Codex rollout JSONL file when practical.
