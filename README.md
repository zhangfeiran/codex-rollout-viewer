# Codex Rollout Viewer

Browser-based viewer for local Codex rollout `.jsonl` files.

## Recommended

Use the hosted GitHub Pages version:

https://zhangfeiran.github.io/codex-rollout-viewer/

Open the page in Chrome to enter the `Sessions folders` page directly. Use `Add sessions folder` to remember one or more `.codex/sessions` folders, then open a folder from that remembered list. You can also use `Choose JSONL` or drag and drop rollout files. The viewer runs fully in the browser; local JSONL files and session folders are read only after browser file-permission prompts and are not uploaded. Browsers do not expose absolute folder paths to the page, so remembered folders can store an editable display path.

The left vertical tab pane tracks open folders and rollout files. Use its top-left button to collapse it to an icon rail; hover or focus the rail to expand it temporarily, or pin it open again. The pinned/collapsed preference survives reloads. On narrow screens the pane overlays the content. Folder colors also identify their rollout tabs, and dots show updates, refresh activity, or errors.

Opening another rollout creates a separate session when the current session already has a file. Each session keeps its own file handle, view state, expanded/collapsed state, incremental parse cache, and automatic-refresh interval. Use `Refresh` for the active session, `Refresh all` for every tracked file, or select an automatic interval per session. `New window` clones the active session: the file and current state are inherited once, then the two windows save and refresh independently. Double-click a session tab to rename it.

Use the pencil beside a rollout's title in the folder list, `Edit title` in the rollout toolbar, or double-click its tab to set a custom title. The list, tab, detail heading, browser title, and search results use that name. Titles are saved in this browser by rollout identity and survive refreshes, closing tabs, and reopening files; open viewer windows share title changes. Leave the title empty to restore the original. This changes the viewer's display title and does not edit or rename the JSONL file.

Forked rollouts show a `Forked from` link below their heading, using `session_meta.forked_from_id`. Click it to open the source in a separate workspace tab, or switch to its existing tab. The viewer searches the current sessions folder first, then other remembered folders with read permission. If the source is unavailable, grant access to its folder or use `Choose source JSONL`; the selected file's session ID must match the fork source. Source links also use saved custom titles.

Vertical tabs are the recommended way to track multiple rollouts. Use Up/Down or Home/End to focus a tab, then Enter/Space to open it. The pane scrolls independently from the content; close buttons appear on the active, hovered, or focused tab. `Open JSONL` and `Add sessions folder` stay at the bottom.

Rollout content uses the full area to the right of the tabs. The rollout outline has been removed. `Collapse L0`, `Collapse L1`, and `Expand L1` live in the top toolbar alongside search, refresh, automatic refresh, bulk tab actions, and independent windows. Long tool outputs stay collapsed by default.

Search is available on all three views: `Sessions folders` searches every remembered folder with read permission; a folder page searches its rollouts (respecting the selected CWD); a rollout page searches that file. Use the search box or the toolbar's `Search` button. Searches match literal text without case sensitivity, including collapsed content, and show highlighted excerpts with source filenames and line numbers. Click a result to open its rollout and expand the matching record; records omitted from the normal view can be read as source text. Results are paginated in groups of 40.

Only `User messages` and `Assistant messages` are selected by default. You can also include reasoning, tool inputs, tool outputs/file changes, and system/context/other events. Each view remembers its query and selections within the current browser window. File scans show progress and report missing folder permissions or unreadable files. Search text is cached only in memory, and changed files are read again on the next search.

## Local HTML

For local/offline use, open `codex-rollout-viewer.html` in Chrome.

The local HTML file has the same viewer UI and can read local rollout files after the same browser permission prompts. Markdown content supports GFM-style tables, inline math with `\(...\)` or `$...$`, and display math with `\[...\]` or `$$...$$`. KaTeX and its fonts are vendored locally, so formula rendering also works offline.

### Map Linux file links to a Windows drive

In `Sessions folders`, click a folder's `Link drive` value and enter a drive letter such as `X` or `X:`. The setting is saved separately for each remembered folder. Its Markdown links to `/home/feiran/file.txt` (or `file:///home/feiran/file.txt`) will then point to `file:///X:/home/feiran/file.txt`, for example through an existing SSHFS-Win mount. Leave the value empty to disable mapping. Link labels and copied Markdown retain their original text; web links, relative links, images, and paths that already specify a Windows drive keep their existing behavior.

Use the local HTML entrypoint for opening mapped file links. Chrome can block navigation from the hosted HTTPS page to local `file:` URLs.

## Development

Stage the GitHub Pages artifact after changing `codex-rollout-viewer.html` or `rollout-renderer.js`:

```bash
npm run export:pages
npm run check
```

The export assembles `index.html`, with path-local Highlight.js and KaTeX assets, in the system temporary directory. The repository no longer keeps a generated `pages/` copy. The GitHub Actions workflow in `.github/workflows/pages.yml` uploads that temporary artifact when `main` is pushed.

In the GitHub repository settings, configure Pages to use **GitHub Actions** as the source. If the workflow fails with `Get Pages site failed ... Not Found`, Pages has not been enabled for the repository yet.
