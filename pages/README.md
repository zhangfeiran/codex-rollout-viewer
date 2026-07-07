# Codex Rollout Viewer

Static GitHub Pages build for the standalone Codex rollout viewer.

## Deploy

1. Push this directory to a GitHub repository.
2. In GitHub, open Settings -> Pages.
3. Select the branch that contains this directory as the Pages source.
4. Open the generated `https://<user>.github.io/<repo>/` URL.

The viewer runs fully in the browser. JSONL files and session folders are read through browser file permissions and are not uploaded.

## Refresh

From the source project, run:

```sh
npm run export:pages
```
