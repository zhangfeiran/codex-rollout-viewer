# Codex Rollout Viewer

Browser-based viewer for local Codex rollout `.jsonl` files.

## Recommended

Use the hosted GitHub Pages version:

https://zhangfeiran.github.io/codex-rollout-viewer/

Open the page in Chrome to enter the `Sessions folders` page directly. Use `Add sessions folder` to remember one or more `.codex/sessions` folders, then open a folder from that remembered list. You can also use `Choose JSONL` or drag and drop rollout files. The viewer runs fully in the browser; local JSONL files and session folders are read only after browser file-permission prompts and are not uploaded. Browsers do not expose absolute folder paths to the page, so remembered folders can store an editable display path.

The session bar tracks multiple rollout files in one viewer. Opening another rollout creates a separate session when the current session already has a file. Each session keeps its own file handle, view state, expanded/collapsed state, incremental parse cache, and automatic-refresh interval. Use `Refresh` for the active session, `Refresh all` for every tracked file, or select an automatic interval per session. `New window` clones the active session into a newly generated `?slot=...` URL: the file and current state are inherited once, then the two windows save and refresh independently. Double-click a session tab to rename it.

The session bar is the recommended way to track multiple rollouts and replaces separate path-level viewer copies.

## Local HTML

For local/offline use, open `codex-rollout-viewer.html` in Chrome.

The local HTML file has the same viewer UI and can read local rollout files after the same browser permission prompts. Markdown content supports GFM-style tables, inline math with `\(...\)` or `$...$`, and display math with `\[...\]` or `$$...$$`. KaTeX and its fonts are vendored locally, so formula rendering also works offline.

## Development

Stage the GitHub Pages artifact after changing `codex-rollout-viewer.html` or `rollout-renderer.js`:

```bash
npm run export:pages
npm run check
```

The export assembles `index.html`, with path-local Highlight.js and KaTeX assets, in the system temporary directory. The repository no longer keeps a generated `pages/` copy. The GitHub Actions workflow in `.github/workflows/pages.yml` uploads that temporary artifact when `main` is pushed.

In the GitHub repository settings, configure Pages to use **GitHub Actions** as the source. If the workflow fails with `Get Pages site failed ... Not Found`, Pages has not been enabled for the repository yet.
