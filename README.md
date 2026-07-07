# Codex Rollout Viewer

A standalone Chrome extension for rendering local Codex rollout `.jsonl` files.

## Standalone HTML

Open `standalone.html` in Chrome. Use `Open .codex/sessions` to grant access to the sessions directory, or drop rollout `.jsonl` files onto the page.

The standalone viewer lists indexed rollouts in a sortable table, defaulting to last modified time, with a `cwd` filter whose options default to modified-time order and can switch back to name order. Selecting a rollout opens the full renderer.

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

## GitHub Pages

The public Pages build is generated from `standalone.html`:

```bash
npm run export:pages
```

This writes `pages/index.html` and the local Highlight.js asset. The GitHub Actions workflow in `.github/workflows/pages.yml` runs the same export step and deploys the `pages/` directory to GitHub Pages when `main` is pushed.

In the GitHub repository settings, configure Pages to use **GitHub Actions** as the source:

1. Open `Settings -> Pages`.
2. Under `Build and deployment`, set `Source` to `GitHub Actions`.
3. Save, then rerun the `Deploy GitHub Pages` workflow or push to `main`.

If the workflow fails with `Get Pages site failed ... Not Found`, Pages has not been enabled for the repository yet; complete the settings step above and rerun the workflow. The deployed site runs fully in the browser; local JSONL files and session folders are read only after browser file-permission prompts and are not uploaded.
