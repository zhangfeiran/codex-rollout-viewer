# Codex Rollout Viewer

Browser-based viewer for local Codex rollout `.jsonl` files.

## Scope

This project only owns Codex rollout JSONL viewing. It is intentionally separate from `web-highlights-local` and does not include webpage highlighting, bookmark management, local sync, SingleFile export, or Web Highlights UI components.

## Source Layout

- `codex-rollout-viewer.html`
  Local/offline HTML entrypoint. It embeds `rollout-renderer.js` between sync markers.

- `rollout-renderer.js`
  Self-contained Codex rollout parser and dark-mode HTML renderer.

- `pages/`
  GitHub Pages build output. `pages/index.html` is generated from `codex-rollout-viewer.html`.

- `vendor/highlightjs/`
  Local Highlight.js runtime used for code block highlighting. Keep vendored files local; do not fetch CDN assets at runtime.

- `scripts/check.mjs`
  Syntax and embedded-renderer sync checks.

- `scripts/export-pages.mjs`
  Regenerates the GitHub Pages build.

## Workflow

- Edit files in this directory directly.
- Run `npm run check`.
- Run `npm run export:pages` after changing `codex-rollout-viewer.html` or `rollout-renderer.js`.
- Prefer the hosted Pages version for normal use: https://zhangfeiran.github.io/codex-rollout-viewer/
- For local/offline use, open `codex-rollout-viewer.html` in Chrome.

## Modification Rules

- Keep this project focused on local Codex rollout viewing.
- Do not add Web Highlights highlighter/sidebar/local-sync behavior here.
- Preserve the compact dark-mode outline/body layout unless the user asks for a UI change.
- Long content and tool outputs should stay collapsed by default.
- When changing parser behavior, validate with a real Codex rollout JSONL file when practical.
