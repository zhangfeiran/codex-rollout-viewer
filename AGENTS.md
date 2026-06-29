# Codex Rollout Viewer

Standalone Chrome MV3 extension for rendering local Codex rollout `.jsonl` files.

## Scope

This project only owns Codex rollout JSONL viewing. It is intentionally separate from `web-highlights-local` and does not include webpage highlighting, bookmark management, Markdown rendering, local sync, SingleFile export, or Web Highlights UI components.

## Source Layout

- `manifest.json`
  MV3 manifest. The content script only matches `file:///*`; Chrome still requires enabling "Allow access to file URLs" for the unpacked extension.

- `content-loader.js`
  Small loader that detects local `.jsonl` files and imports `rollout-renderer.js`.

- `rollout-renderer.js`
  Self-contained Codex rollout parser and dark-mode HTML renderer.

- `vendor/highlightjs/`
  Local Highlight.js runtime used for code block highlighting. Keep vendored files local; do not fetch CDN assets at runtime.

- `scripts/check.mjs`
  Syntax and manifest sanity checks.

## Workflow

- Edit files in this directory directly.
- Run `npm run check`.
- Load this directory as an unpacked Chrome extension.
- Enable file URL access for the extension before opening local rollout `.jsonl` files.

There is no build step. The files in this directory are the loadable extension.

## Modification Rules

- Keep this extension focused on local Codex rollout viewing.
- Do not add Web Highlights highlighter/sidebar/local-sync behavior here.
- Preserve the compact dark-mode outline/body layout unless the user asks for a UI change.
- Long content and tool outputs should stay collapsed by default.
- When changing parser behavior, validate with a real Codex rollout JSONL file.
