// Page indicators: a prefix on the tab title and a small badge in the page's
// bottom-right corner, shown on matching tabs while the executor is active.
//
// setIndicator() is injected into tabs with chrome.scripting.executeScript, so
// it must be self-contained (no imports or outer variables). It runs in the
// extension's isolated world, which keeps its state between calls and is
// invisible to the page's own JavaScript.

export const TITLE_PREFIX = '⏱ '; // "⏱ "

/**
 * @param {{
 *   prefix: string,
 *   title: boolean,                                   // show the title prefix
 *   overlay: null | 'executing' | 'waiting' | 'disabled',  // overlay look, or null for none
 *   label: string,                                    // overlay hover text
 *   lastRun?: { ok: boolean, summary: string, at: number },
 * }} state
 */
export function setIndicator(state) {
  const HOST_ID = 'scheduled-executor-indicator';
  const prefix = state.prefix;
  const ctx = (globalThis.__scheduledExecutor ??= { observer: null });

  // ---- Tab title -----------------------------------------------------------
  if (ctx.observer) {
    ctx.observer.disconnect();
    ctx.observer = null;
  }

  if (state.title) {
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
  } else if (document.title.startsWith(prefix)) {
    document.title = document.title.slice(prefix.length);
  }

  // ---- Overlay -------------------------------------------------------------
  let host = document.getElementById(HOST_ID);
  if (!state.overlay) {
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
          height: 22px; max-width: 22px; padding: 0 4px; box-sizing: border-box;
          overflow: hidden; white-space: nowrap; cursor: default;
          font: 12px/20px system-ui, -apple-system, "Segoe UI", sans-serif;
          border: 1px solid transparent; border-radius: 11px;
          box-shadow: 0 1px 3px rgba(0, 0, 0, .25);
          transition: opacity .15s, max-width .2s;
        }
        .badge:hover { opacity: 1; max-width: 460px; padding-right: 10px; }
        .icon { flex: none; width: 12px; text-align: center; }
        .text { overflow: hidden; text-overflow: ellipsis; }

        /* Executing: solid blue clock. */
        .executing { color: #fff; background: rgba(9, 105, 218, .9); opacity: .5; }
        .executing.err { background: rgba(207, 34, 46, .9); }
        /* Waiting (outside the time window): hollow grey ring with a pause sign. */
        .waiting { color: #57606a; background: rgba(255, 255, 255, .85); border-color: #8c959f; box-shadow: none; opacity: .5; }
        /* Disabled: dashed dark ring with a "no" sign. */
        .disabled { color: #fff; background: rgba(66, 74, 83, .85); border: 1px dashed #d0d7de; opacity: .45; }
      </style>
      <div class="badge" role="status"><span class="icon"></span><span class="text"></span></div>`;
    (document.body || document.documentElement).appendChild(host);
  }

  const ICONS = { executing: '⏱', waiting: '⏸', disabled: '⊘' }; // ⏱ ⏸ ⊘
  const badge = host.shadowRoot.querySelector('.badge');
  const last = state.lastRun;
  let label = state.label;
  if (last && state.overlay === 'executing') {
    const time = new Date(last.at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    label += ` · Last execution ${time}${last.ok ? '' : ' failed'}: ${last.summary}`;
  }
  badge.className = `badge ${state.overlay}`;
  badge.classList.toggle('err', Boolean(state.overlay === 'executing' && last && !last.ok));
  badge.dataset.state = state.overlay;
  host.shadowRoot.querySelector('.icon').textContent = ICONS[state.overlay];
  host.shadowRoot.querySelector('.text').textContent = label;
  badge.title = label;
}
