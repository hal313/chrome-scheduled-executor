// Page indicators: a prefix on the tab title and a small badge in the page's
// bottom-right corner, shown on matching tabs while the executor is active.
// The badge slides open on hover into a row of icon buttons: extension options
// on the left, then sleep until the end of the day, sleep for 1 hour, run for
// 1 hour, back to schedule, and enable /
// disable the normal schedule, with the state icon staying on the right.
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
 *   overrideMode: null | 'on' | 'off',                // which override is running
 *   overrideAction: null | 'on' | 'off' | 'sleep-day', // the overlay button that started it
 *   enabled: boolean,                                 // the normal schedule's on/off switch
 *   label: string,                                    // state icon tooltip
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
          font: 12px/1.4 system-ui, -apple-system, "Segoe UI", sans-serif;
        }

        /* The badge: a small dot that slides open on hover into a row of icon buttons. */
        .badge {
          position: relative; display: flex; align-items: center; justify-content: flex-end; gap: 6px;
          height: 22px; max-width: 22px; padding: 0 4px; box-sizing: border-box;
          white-space: nowrap; cursor: default;
          font: 12px/20px system-ui, -apple-system, "Segoe UI", sans-serif;
          border: 1px solid transparent; border-radius: 11px;
          box-shadow: 0 1px 3px rgba(0, 0, 0, .25);
          transition: opacity .15s, max-width .2s;
        }
        .clip { display: flex; align-items: center; overflow: hidden; min-width: 0; }
        .wrap:hover .badge, .wrap:focus-within .badge { opacity: 1; max-width: 480px; padding-left: 2px; }
        .icon { flex: none; width: 12px; text-align: center; }
        .ops { display: none; align-items: center; gap: 2px; margin-right: 2px; }
        .wrap:hover .ops, .wrap:focus-within .ops { display: flex; }
        .op {
          flex: none; display: flex; align-items: center; justify-content: center;
          width: 20px; height: 16px; padding: 0; cursor: pointer;
          color: inherit; background: transparent; border: 0; border-radius: 8px;
        }
        .op:hover { background: rgba(255, 255, 255, .3); }
        .op[aria-pressed="true"] { background: rgba(255, 255, 255, .4); }
        .op:focus-visible { outline: 2px solid currentColor; outline-offset: -1px; }
        .op svg { width: 12px; height: 12px; display: block; }
        .op[aria-disabled="true"] { opacity: .4; cursor: default; }
        .op[aria-disabled="true"]:hover { background: transparent; }
        /* Tooltips: shown as soon as the pointer (or keyboard focus) is on a button.
           Right-aligned to the button so they don't run off the edge of the page. */
        .op { position: relative; }
        .op::after {
          content: attr(data-tip); position: absolute; right: -4px; bottom: calc(100% + 8px);
          padding: 3px 7px; border-radius: 5px; white-space: nowrap; pointer-events: none;
          font: 12px/1.4 system-ui, -apple-system, "Segoe UI", sans-serif;
          color: #fff; background: #1f2328; box-shadow: 0 2px 6px rgba(0, 0, 0, .2);
          opacity: 0; transition: opacity .1s;
        }
        .op:hover::after, .op:focus-visible::after { opacity: 1; }
        .waiting .op:hover { background: rgba(0, 0, 0, .08); }
        .waiting .op[aria-pressed="true"] { background: rgba(0, 0, 0, .14); }

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
      </style>
      <div class="wrap">
        <div class="badge" role="status">
          <span class="ops">
            <button type="button" class="op" data-action="options" data-tip="Extension options" aria-label="Extension options">
              <svg viewBox="0 0 16 16" fill="currentColor" aria-hidden="true"><path d="M8 0a8.2 8.2 0 0 1 .701.031C9.444.095 9.99.645 10.16 1.29l.288 1.107c.018.066.079.158.212.224.231.114.454.243.668.386.123.082.233.09.299.071l1.103-.303c.644-.176 1.392.021 1.82.63.27.385.506.792.704 1.218.315.675.111 1.422-.364 1.891l-.814.806c-.049.048-.098.147-.088.294.016.257.016.515 0 .772-.01.147.038.246.088.294l.814.806c.475.469.679 1.216.364 1.891a7.977 7.977 0 0 1-.704 1.217c-.428.61-1.176.807-1.82.63l-1.102-.302c-.067-.019-.177-.011-.3.071a5.909 5.909 0 0 1-.668.386c-.133.066-.194.158-.211.224l-.29 1.106c-.168.646-.715 1.196-1.458 1.26a8.006 8.006 0 0 1-1.402 0c-.743-.064-1.289-.614-1.458-1.26l-.289-1.106c-.018-.066-.079-.158-.212-.224a5.738 5.738 0 0 1-.668-.386c-.123-.082-.233-.09-.299-.071l-1.103.303c-.644.176-1.392-.021-1.82-.63a8.12 8.12 0 0 1-.704-1.218c-.315-.675-.111-1.422.363-1.891l.815-.806c.05-.048.098-.147.088-.294a6.214 6.214 0 0 1 0-.772c.01-.147-.038-.246-.088-.294l-.815-.806C.635 6.045.431 5.298.746 4.623a7.92 7.92 0 0 1 .704-1.217c.428-.61 1.176-.807 1.82-.63l1.102.302c.067.019.177.011.3-.071.214-.143.437-.272.668-.386.133-.066.194-.158.211-.224l.29-1.106C6.009.645 6.556.095 7.299.03 7.53.01 7.764 0 8 0Zm-.571 1.525c-.036.003-.108.036-.137.146l-.289 1.105c-.147.561-.549.967-.998 1.189-.173.086-.34.183-.5.29-.417.278-.97.423-1.529.27l-1.103-.303c-.109-.03-.175.016-.195.045-.22.312-.412.644-.573.99-.014.031-.021.11.059.19l.815.806c.411.406.562.957.53 1.456a4.709 4.709 0 0 0 0 .582c.032.499-.119 1.05-.53 1.456l-.815.806c-.081.08-.073.159-.059.19.162.346.353.677.573.989.02.03.085.076.195.046l1.102-.303c.56-.153 1.113-.008 1.53.27.161.107.328.204.501.29.447.222.85.629.997 1.189l.289 1.105c.029.109.101.143.137.146a6.6 6.6 0 0 0 1.142 0c.036-.003.108-.036.137-.146l.289-1.105c.147-.561.549-.967.998-1.189.173-.086.34-.183.5-.29.417-.278.97-.423 1.529-.27l1.103.303c.109.029.175-.016.195-.045.22-.313.411-.644.573-.99.014-.031.021-.11-.059-.19l-.815-.806c-.411-.406-.562-.957-.53-1.456a4.709 4.709 0 0 0 0-.582c-.032-.499.119-1.05.53-1.456l.815-.806c.081-.08.073-.159.059-.19a6.464 6.464 0 0 0-.573-.989c-.02-.03-.085-.076-.195-.046l-1.102.303c-.56.153-1.113.008-1.53-.27a4.44 4.44 0 0 0-.501-.29c-.447-.222-.85-.629-.997-1.189l-.289-1.105c-.029-.11-.101-.143-.137-.146a6.6 6.6 0 0 0-1.142 0ZM11 8a3 3 0 1 1-6 0 3 3 0 0 1 6 0ZM9.5 8a1.5 1.5 0 1 0-3.001.001A1.5 1.5 0 0 0 9.5 8Z"/></svg>
            </button>
            <button type="button" class="op" data-action="sleep-day" data-tip="Sleep until the end of the day" aria-label="Sleep until the end of the day" aria-pressed="false">
              <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M1.75 12.75h12.5M4.25 12.75a3.75 3.75 0 0 1 7.5 0M8 1.75v4.5M6 4.25l2 2 2-2"/></svg>
            </button>
            <button type="button" class="op" data-action="off" data-tip="Sleep for 1 hour" aria-label="Sleep for 1 hour" aria-pressed="false">
              <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M13.75 9.75A6 6 0 0 1 6.25 2.25a6 6 0 1 0 7.5 7.5Z"/></svg>
            </button>
            <button type="button" class="op" data-action="on" data-tip="Run for 1 hour" aria-label="Run for 1 hour" aria-pressed="false">
              <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M4.5 2.5v11L13 8Z"/></svg>
            </button>
            <button type="button" class="op" data-action="resume" data-tip="Back to schedule" aria-label="Back to schedule" aria-disabled="true">
              <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M2.75 8A5.25 5.25 0 1 0 4.3 4.3M2.25 1.75v3.5h3.5"/></svg>
            </button>
            <button type="button" class="op" data-action="enable" data-tip="Enable the normal schedule" aria-label="Enable the normal schedule" aria-pressed="false">
              <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="8" cy="8" r="6.25"/><path d="M8 4.5V8l2.5 1.5"/></svg>
            </button>
            <button type="button" class="op" data-action="disable" data-tip="Disable the normal schedule" aria-label="Disable the normal schedule" aria-pressed="false">
              <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="8" cy="8" r="6.25"/><path d="M3.6 3.6l8.8 8.8"/></svg>
            </button>
          </span>
          <span class="clip"><span class="icon"></span></span>
        </div>
      </div>`;

    root.querySelector('.ops').addEventListener('click', (e) => {
      const button = e.target.closest('button');
      const action = button?.dataset.action;
      if (!action || button.getAttribute('aria-disabled') === 'true') return;
      if (action === 'resume') chrome.runtime.sendMessage({ type: 'setOverride', mode: null });
      else if (action === 'options') chrome.runtime.sendMessage({ type: 'openOptions' });
      else if (action === 'on' || action === 'off') chrome.runtime.sendMessage({ type: 'setOverride', mode: action });
      else if (action === 'sleep-day') chrome.runtime.sendMessage({ type: 'setOverride', mode: 'off', span: 'day' });
      else chrome.runtime.sendMessage({ type: 'setSchedule', enabled: action === 'enable' });
    });
    (document.body || document.documentElement).appendChild(host);
    ctx.host = host;
  }

  const ICONS = { executing: '⏱', waiting: '⏸', disabled: '⊘' }; // ⏱ ⏸ ⊘
  const root = host.shadowRoot;
  const badge = root.querySelector('.badge');
  const last = state.lastRun;
  const failed = Boolean(state.overlay === 'executing' && last && !last.ok);
  let lastText = '';
  if (last && state.overlay === 'executing') {
    const time = new Date(last.at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    lastText = `Last execution ${time}${last.ok ? '' : ' failed'}: ${last.summary}`;
  }

  badge.className = `badge ${state.overlay}`;
  badge.classList.toggle('err', failed);
  badge.classList.toggle('overridden', Boolean(state.overridden));
  badge.dataset.state = state.overlay;
  root.querySelector('.icon').textContent = ICONS[state.overlay];

  // Details (time window, last execution) are in the state icon's tooltip.
  root.querySelector('.clip').title = lastText ? `${state.label}\n${lastText}` : state.label;

  // Mark the button matching what's in effect: an override, or else the schedule switch.
  const current = state.overrideAction ?? (state.enabled ? 'enable' : 'disable');
  for (const b of root.querySelectorAll('.op[aria-pressed]')) {
    b.setAttribute('aria-pressed', String(b.dataset.action === current));
  }
  // "Back to schedule" only does something while an override is running.
  root.querySelector('[data-action="resume"]').setAttribute('aria-disabled', String(!state.overrideMode));
}
