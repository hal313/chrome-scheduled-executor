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
 *   overridden: boolean,                              // a 1-hour override is running
 *   label: string,                                    // overlay flyout text
 *   lastRun?: { ok: boolean, summary: string, at: number },
 * }} state
 */
export function setIndicator(state) {
  const HOST_ID = 'scheduled-executor-indicator';
  const prefix = state.prefix;
  const ctx = (globalThis.__scheduledExecutor ??= { observer: null, host: null });

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
  // An overlay left behind by an earlier copy of the extension (e.g. after a
  // reload) has dead buttons; replace it with one wired to this context.
  if (host && ctx.host !== host) {
    host.remove();
    host = null;
  }
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
        .wrap {
          position: fixed; right: 10px; bottom: 10px; z-index: 2147483647;
          display: flex; flex-direction: column; align-items: flex-end;
          font: 12px/1.4 system-ui, -apple-system, "Segoe UI", sans-serif;
        }
        .badge {
          position: relative; width: 22px; height: 22px; box-sizing: border-box;
          display: flex; align-items: center; justify-content: center; cursor: default;
          border: 1px solid transparent; border-radius: 11px;
          box-shadow: 0 1px 3px rgba(0, 0, 0, .25); transition: opacity .15s;
        }
        .wrap:hover .badge { opacity: 1; }

        /* Executing: solid blue clock. */
        .executing { color: #fff; background: rgba(9, 105, 218, .9); opacity: .5; }
        .executing.err { background: rgba(207, 34, 46, .9); }
        /* Waiting (outside the time window): hollow grey ring with a pause sign. */
        .waiting { color: #57606a; background: rgba(255, 255, 255, .85); border-color: #8c959f; box-shadow: none; opacity: .5; }
        /* Disabled: dashed dark ring with a "no" sign. */
        .disabled { color: #fff; background: rgba(66, 74, 83, .85); border: 1px dashed #d0d7de; opacity: .45; }
        /* A 1-hour override is running: small amber dot on the badge. */
        .overridden::after {
          content: ''; position: absolute; top: -2px; right: -2px; width: 7px; height: 7px;
          border-radius: 50%; background: #d4a72c; border: 1px solid #fff;
        }

        /* Flyout: appears above the badge on hover. The padding bridges the gap
           so the pointer can move from the badge onto the buttons. */
        .flyout { display: none; padding-bottom: 6px; }
        .wrap:hover .flyout, .wrap:focus-within .flyout { display: block; }
        .panel {
          width: 280px; padding: 10px 12px; border-radius: 8px; box-sizing: border-box;
          color: #1f2328; background: #fff; border: 1px solid #d1d9e0;
          box-shadow: 0 4px 16px rgba(0, 0, 0, .18);
        }
        .label { font-weight: 600; }
        .last { color: #59636e; margin-top: 2px; overflow-wrap: anywhere; }
        .last.err { color: #cf222e; }
        .buttons { display: flex; flex-wrap: wrap; gap: 6px; margin-top: 8px; }
        button {
          font: inherit; font-weight: 600; padding: 3px 8px; border-radius: 6px; cursor: pointer;
          border: 1px solid #d1d9e0; background: #f6f8fa; color: #1f2328;
        }
        button:hover { background: #eef1f4; }
        button.primary { background: #0969da; border-color: #0969da; color: #fff; }
        button.primary:hover { background: #0860c4; }
        button[hidden] { display: none; }
      </style>
      <div class="wrap">
        <div class="flyout">
          <div class="panel" role="dialog" aria-label="Scheduled Executor">
            <div class="label"></div>
            <div class="last"></div>
            <div class="buttons">
              <button type="button" class="primary" data-action="on">On for 1 hour</button>
              <button type="button" data-action="off">Off for 1 hour</button>
              <button type="button" data-action="resume">Back to schedule</button>
              <button type="button" data-action="options">Settings</button>
            </div>
          </div>
        </div>
        <div class="badge" role="status"><span class="icon"></span></div>
      </div>`;

    root.querySelector('.buttons').addEventListener('click', (e) => {
      const action = e.target.closest('button')?.dataset.action;
      if (!action) return;
      if (action === 'options') chrome.runtime.sendMessage({ type: 'openOptions' });
      else chrome.runtime.sendMessage({ type: 'setOverride', mode: action === 'resume' ? null : action });
    });
    (document.body || document.documentElement).appendChild(host);
    ctx.host = host;
  }

  const ICONS = { executing: '⏱', waiting: '⏸', disabled: '⊘' }; // ⏱ ⏸ ⊘
  const root = host.shadowRoot;
  const badge = root.querySelector('.badge');
  const last = state.lastRun;
  const failed = Boolean(state.overlay === 'executing' && last && !last.ok);

  badge.className = `badge ${state.overlay}`;
  badge.classList.toggle('err', failed);
  badge.classList.toggle('overridden', Boolean(state.overridden));
  badge.dataset.state = state.overlay;
  badge.title = state.label;
  root.querySelector('.icon').textContent = ICONS[state.overlay];
  root.querySelector('.label').textContent = state.label;

  const lastEl = root.querySelector('.last');
  if (last && state.overlay === 'executing') {
    const time = new Date(last.at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    lastEl.textContent = `Last execution ${time}${last.ok ? '' : ' failed'}: ${last.summary}`;
    lastEl.hidden = false;
  } else {
    lastEl.hidden = true;
  }
  lastEl.classList.toggle('err', failed);
  root.querySelector('[data-action="resume"]').hidden = !state.overridden;
}
