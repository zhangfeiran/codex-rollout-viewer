# Codex Rollout Viewer

A standalone Chrome extension for rendering local Codex rollout `.jsonl` files.

## Standalone HTML

Open `standalone.html` in Chrome. Use `Open .codex/sessions` to grant access to the sessions directory, or drop rollout `.jsonl` files onto the page.

The standalone viewer lists indexed rollouts in a sortable table, defaulting to last modified time, with a `cwd` filter. Selecting a rollout opens the full renderer.

## Usage

1. Open `chrome://extensions`.
2. Enable Developer mode.
3. Load this directory as an unpacked extension.
4. Enable "Allow access to file URLs" for the extension.
5. Open or drag & drop a local Codex rollout `.jsonl` file in Chrome.

## Development

```bash
npm run check
```

There is no build step; the files in this directory are loaded directly by Chrome.
