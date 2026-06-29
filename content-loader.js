(() => {
  const scheduleIdle = typeof requestIdleCallback === "function" ? requestIdleCallback : callback => setTimeout(callback, 0);

  function isLocalJsonlUrl() {
    try {
      const url = new URL(location.href);
      return url.protocol === "file:" && /\.jsonl$/i.test(decodeURIComponent(url.pathname));
    } catch {
      return false;
    }
  }

  scheduleIdle(() => {
    if (!isLocalJsonlUrl()) {
      return;
    }

    (async function () {
      try {
        const renderer = await import(chrome.runtime.getURL("rollout-renderer.js"));
        await renderer.renderLocalCodexRolloutDocument?.();
      } catch (error) {
        console.error("Failed to render local Codex rollout file:", error);
      }
    })();
  });
})();
