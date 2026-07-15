# Codex Rollout Viewer

Browser-based viewer for local Codex rollout `.jsonl` files.

## Recommended

Use the hosted GitHub Pages version:

https://zhangfeiran.github.io/codex-rollout-viewer/

Open the page in Chrome, then use `Add sessions folder` to remember one or more `.codex/sessions` folders, choose a remembered folder from `Sessions folders`, use `Choose JSONL`, or drag and drop rollout files. The viewer runs fully in the browser; local JSONL files and session folders are read only after browser file-permission prompts and are not uploaded. Browsers do not expose absolute folder paths to the page, so remembered folders can store an editable display path.

## Local HTML

For local/offline use, open `codex-rollout-viewer.html` or `codex-rollout-viewer2.html` in Chrome.

The local HTML file has the same viewer UI and can read local rollout files after the same browser permission prompts. Markdown content supports GFM-style tables, inline math with `\(...\)` or `$...$`, and display math with `\[...\]` or `$$...$$`. KaTeX and its fonts are vendored locally, so formula rendering also works offline.

`codex-rollout-viewer2.html` is a synchronized copy for a second independent remembered rollout state. Treat `codex-rollout-viewer.html` as the source: `npm run export:pages` refreshes `codex-rollout-viewer2.html`. Each local HTML path uses its own current rollout, current view, expanded/collapsed state, and render cache.

## Development

Synchronize the second local HTML file and stage the GitHub Pages artifact after changing `codex-rollout-viewer.html` or `rollout-renderer.js`:

```bash
npm run export:pages
npm run check
```

The export synchronizes `codex-rollout-viewer2.html` and assembles `index.html` plus the Highlight.js and KaTeX assets in the system temporary directory. The repository no longer keeps a generated `pages/` copy. The GitHub Actions workflow in `.github/workflows/pages.yml` uploads that temporary artifact when `main` is pushed.

In the GitHub repository settings, configure Pages to use **GitHub Actions** as the source. If the workflow fails with `Get Pages site failed ... Not Found`, Pages has not been enabled for the repository yet.
