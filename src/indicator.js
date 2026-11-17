// Page indicators: a prefix on the tab title and a small badge in the page's
// bottom-right corner, shown on matching tabs while the executor is active.
//
// setIndicator() is injected into tabs with chrome.scripting.executeScript, so
// it must be self-contained (no imports or outer variables). It runs in the
// extension's isolated world, which keeps its state between calls and is
// invisible to the page's own JavaScript.

export const TITLE_PREFIX = '⏱ '; // "⏱ "

/**
 * @param {{ active: boolean, prefix: string, lastRun?: { ok: boolean, summary: string, at: number } }} state
 */
export function setIndicator(state) {
  const HOST_ID = 'scheduled-executor-indicator';
  const prefix = state.prefix;
  const ctx = (globalThis.__scheduledExecutor ??= { observer: null });

  // ---- Tab title -----------------------------------------------------------
  const stripPrefix = (t) => (t.startsWith(prefix) ? t.slice(prefix.length) : t);

  if (ctx.observer) {
    ctx.observer.disconnect();
    ctx.observer = null;
  }

  if (state.active) {
    const apply = () => {
      if (!document.title.startsWith(prefix)) document.title = prefix + document.title;
    };
    apply();
    // Apps like Teams rewrite the title constantly (unread counts etc.), so
    // re-apply the prefix whenever the <title> element changes.
    ctx.observer = new MutationObserver(apply);
    ctx.observer.observe(document.head || document.documentElement, {
      subtree: true,
      childList: true,
      characterData: true,
    });
  } else {
    document.title = stripPrefix(document.title);
  }

  // ---- Corner badge --------------------------------------------------------
  let host = document.getElementById(HOST_ID);
  if (!state.active) {
    if (host) host.remove();
    return;
  }

  if (!host) {
    host = document.createElement('div');
    host.id = HOST_ID;
    // Shadow DOM keeps the page's CSS out and ours in.
    const root = host.attachShadow({ mode: 'open' });
    root.innerHTML = `
      <style>
        :host { all: initial; }
        .badge {
          position: fixed; right: 10px; bottom: 10px; z-index: 2147483647;
          display: flex; align-items: center; gap: 6px;
          height: 22px; max-width: 22px; padding: 0 5px; box-sizing: border-box;
          overflow: hidden; white-space: nowrap; cursor: default;
          font: 12px/22px system-ui, -apple-system, "Segoe UI", sans-serif;
          color: #fff; background: rgba(9, 105, 218, .85); border-radius: 11px;
          box-shadow: 0 1px 3px rgba(0, 0, 0, .25);
          opacity: .45; transition: opacity .15s, max-width .2s;
        }
        .badge:hover { opacity: 1; max-width: 420px; padding-right: 10px; }
        .badge.err { background: rgba(207, 34, 46, .85); }
        .dot { flex: none; width: 12px; text-align: center; }
        .text { overflow: hidden; text-overflow: ellipsis; }
      </style>
      <div class="badge" role="status"><span class="dot">⏱</span><span class="text"></span></div>`;
    (document.body || document.documentElement).appendChild(host);
  }

  const badge = host.shadowRoot.querySelector('.badge');
  const text = host.shadowRoot.querySelector('.text');
  const last = state.lastRun;
  let label = 'Scheduled Executor active';
  if (last) {
    const time = new Date(last.at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    label += ` · last run ${time}${last.ok ? '' : ' failed'}: ${last.summary}`;
  }
  text.textContent = label;
  badge.title = label;
  badge.classList.toggle('err', Boolean(last && !last.ok));
}
