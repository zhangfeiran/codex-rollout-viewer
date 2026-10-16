# fzstd 0.1.1

Vendored, unmodified UMD build of [101arrowz/fzstd](https://github.com/101arrowz/fzstd), licensed under MIT (see LICENSE).

Source artifacts:

- https://cdn.jsdelivr.net/npm/fzstd@0.1.1/umd/index.js
- https://cdn.jsdelivr.net/npm/fzstd@0.1.1/LICENSE

The viewer loads this local copy when opening Zstandard-compressed rollouts. No CDN request is made at runtime.

Upstream documents a maximum backreference distance of 32 MiB. Archives made with ultra compression levels (20+) and larger windows may require another decoder; normal Codex archives are validated against real rollout samples.
