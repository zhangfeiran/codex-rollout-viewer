# Codex Rollout Viewer

Browser-based viewer for local Codex rollout `.jsonl` files.

## Recommended

Use the hosted GitHub Pages version:

https://zhangfeiran.github.io/codex-rollout-viewer/

Open the page in Chrome, then use `Add sessions folder` to remember one or more `.codex/sessions` folders, choose a remembered folder from `Sessions folders`, use `Choose JSONL`, or drag and drop rollout files. The viewer runs fully in the browser; local JSONL files and session folders are read only after browser file-permission prompts and are not uploaded.

## Local HTML

For local/offline use, open `codex-rollout-viewer.html` in Chrome.

The local HTML file has the same viewer UI and can read local rollout files after the same browser permission prompts.

## Development

```bash
npm run check
```

Regenerate the GitHub Pages build after changing `codex-rollout-viewer.html` or `rollout-renderer.js`:

```bash
npm run export:pages
```

The export writes `pages/index.html` and the local Highlight.js asset. The GitHub Actions workflow in `.github/workflows/pages.yml` runs the same export step and deploys `pages/` to GitHub Pages when `main` is pushed.

In the GitHub repository settings, configure Pages to use **GitHub Actions** as the source. If the workflow fails with `Get Pages site failed ... Not Found`, Pages has not been enabled for the repository yet.
