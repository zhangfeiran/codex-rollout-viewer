# Codex Rollout Viewer

Browser-based viewer for local Codex rollout `.jsonl` files.

## Recommended

Use the hosted GitHub Pages version:

https://zhangfeiran.github.io/codex-rollout-viewer/

Open the page in Chrome to enter the `Sessions folders` page directly. Use `Add sessions folder` to remember one or more `.codex/sessions` folders, then open a folder from that remembered list. You can also use `Choose JSONL` or drag and drop rollout files. The viewer runs fully in the browser; local JSONL files and session folders are read only after browser file-permission prompts and are not uploaded. Browsers do not expose absolute folder paths to the page, so remembered folders can store an editable display path.

The left vertical tab pane tracks open folders and rollout files. Use its top-left button to collapse it to an icon rail; hover or focus the rail to expand it temporarily, or pin it open again. The pinned/collapsed preference survives reloads. On narrow screens the pane overlays the content. Rollout tabs are indented under their source folder, with the same folder color; files opened without a source folder appear under `Standalone rollouts`. Each folder shows its open rollout count and a summary dot for updates, refresh activity, or errors, including while collapsed. Click the arrow to collapse or expand a folder, and its name to open the folder list. Folder collapse states survive reloads in this window; background refresh preserves them, while switching to a rollout expands its folder. Closing a folder group closes its folder tab and all its rollout tabs, leaving other groups and remembered folders available.

Opening another rollout creates a separate session when the current session already has a file. Each session keeps its own file handle, view state, expanded/collapsed state, incremental parse cache, and automatic-refresh interval. Use `Refresh` for the active session, `Refresh all` for every tracked file, or select an automatic interval per session. `New window` clones the active session: the file and current state are inherited once, then the two windows save and refresh independently. Double-click a session tab to rename it.

`Reopen tab` at the bottom of the tab pane restores the most recent close action. Single rollout tabs, folder groups (including their rollouts), and `Close rollouts` can all be reopened. The last 20 close actions survive reloads, retaining file references, titles, turn expansion state, folder grouping, and automatic-refresh settings; source files are read again when reopened. Already open files are reused. Ctrl/Cmd+Shift+T also works when the browser forwards that shortcut to the page; the button is always available.

Rollout titles come from Codex's `session_index.jsonl`, matched by session ID. In `Add sessions folder`, choose the parent `.codex` folder to automatically find `sessions/` and its sibling index, or choose a sessions folder to look for the index inside it. Browsers cannot read the parent of an already selected folder. If the index is missing or outside that folder, use `Choose title index` on the folder row, folder page, or rollout toolbar to select it. Each remembered folder keeps its own index-file association. Opening or refreshing a session rereads the index, so Codex title changes appear even when the rollout itself is unchanged. If several entries share an ID, the latest `updated_at` wins, with the last entry breaking ties. Missing titles fall back to the first user message or filename. Browsers without the persistent file picker can load a title index for the current visit.

Use the pencil beside a rollout's title in the folder list, `Edit title` in the rollout toolbar, or double-click its tab to set a custom title. The list, tab, detail heading, browser title, search results, and fork references use that name. Custom titles override Codex titles and are saved in this browser by rollout identity; open viewer windows share custom title changes. Leave the title empty to return to the Codex title or the original fallback. This changes the viewer's display title and does not edit or rename the JSONL file.

Forked rollouts show a `Forked from` link below their heading, using `session_meta.forked_from_id`. Click it to open the source in a separate workspace tab, or switch to its existing tab. The viewer searches the current sessions folder first, then other remembered folders with read permission. If the source is unavailable, grant access to its folder or use `Choose source JSONL`; the selected file's session ID must match the fork source. Source links also use saved custom titles. At the beginning of the rollout, expand `Source rollout · expand / collapse` to read the source inline. Its own fork source can be expanded in the same way, with cycle detection. Each preview can be collapsed and reopened without rereading the file; its expansion state survives switching tabs and refreshes. Long messages and tool outputs stay collapsed by default. Inline previews use the same folder-permission and matching-file fallback as tab navigation.

Newer paginated rollouts store their own suffix and reference inherited history through `session_meta.history_base`. Their inline previews read only the referenced byte prefix and records before `end_ordinal_exclusive`, so later changes to a parent do not appear in the child's inherited history. Nested previews retain that cutoff. A separate `History from` link appears when the physical history file differs from the logical fork parent. Opening a source in its own tab shows the complete source file. The current rollout's search and statistics cover its own file; inherited prefixes are available through the inline previews, and their files can be searched from their own tabs or folder scope.

Rewind/revert can retain a stable thread ID while creating `rollout-<timestamp>-<thread-id>_<rollout-id>.jsonl`. The viewer uses the final UUID as the file identity for tabs, titles, search, and history lookup, and shows it beside the thread heading. Keep that suffix when choosing an inherited reversion file: its metadata's thread ID alone cannot identify the physical rollout. Older single-ID filenames and copied-history forks remain supported.

Legacy `thread_rolled_back` markers remove the specified number of user inputs from the active conversation, including their outputs and tool changes. The removed source records remain in a collapsed rollback event. They do not contribute to active statistics or default message search; select `System / context / other events` to search them. Internal context messages do not create user groups, and token-accounting records remain searchable as system events while staying out of the main conversation. Unknown record types retain a collapsed `Source record` view for inspection.

Vertical tabs are the recommended way to track multiple rollouts. Use Up/Down or Home/End to focus a tab, then Enter/Space to open it. Left/Right collapse or expand a focused folder; Left on a rollout focuses its folder, and Right on an expanded folder focuses its first rollout. Hidden rollout tabs are skipped by keyboard navigation. The pane scrolls independently from the content; close buttons appear on the active, hovered, or focused tab. `Open JSONL` and `Add sessions folder` stay at the bottom.

Rollout content uses the full area to the right of the tabs. The rollout outline has been removed. `Collapse L0`, `Collapse L1`, and `Expand L1` live in the top toolbar alongside search, refresh, automatic refresh, bulk tab actions, and independent windows. Long tool outputs stay collapsed by default.

Search is available on all three views: `Sessions folders` searches every remembered folder with read permission; a folder page searches its rollouts (respecting the selected CWD); a rollout page searches that file. Use the search box or the toolbar's `Search` button. Searches match literal text without case sensitivity, including collapsed content, and show highlighted excerpts with source filenames and line numbers. Click a result to open its rollout and expand the matching record; records omitted from the normal view can be read as source text. Results are paginated in groups of 40.

Only `User messages` and `Assistant messages` are selected by default. You can also include reasoning, tool inputs, tool outputs/file changes, and system/context/other events. Each view remembers its query and selections within the current browser window. Before searching content, the viewer reads file modification times and scans the entire search scope newest first, including across remembered folders; results appear in that order. Files with unknown modification times come last. File scans show progress and report missing folder permissions or unreadable files. Search text is cached only in memory, and changed files are read again on the next search.

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
