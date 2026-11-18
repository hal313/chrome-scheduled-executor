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
          font: 12px/1.4 system-ui, -apple-system, "Segoe UI", sans-serif;
        }

        /* The badge: a small dot that slides open into a pill on hover. */
        .badge {
          position: relative; display: flex; align-items: center; gap: 6px;
          height: 22px; max-width: 22px; padding: 0 4px; box-sizing: border-box;
          white-space: nowrap; cursor: default;
          font: 12px/20px system-ui, -apple-system, "Segoe UI", sans-serif;
          border: 1px solid transparent; border-radius: 11px;
          box-shadow: 0 1px 3px rgba(0, 0, 0, .25);
          transition: opacity .15s, max-width .2s;
        }
        .clip { display: flex; align-items: center; gap: 6px; overflow: hidden; min-width: 0; }
        .wrap:hover .badge, .wrap.open .badge { opacity: 1; max-width: 480px; padding-right: 3px; }
        .icon { flex: none; width: 12px; text-align: center; }
        .text { overflow: hidden; text-overflow: ellipsis; }
        .more {
          flex: none; display: none; width: 18px; height: 16px; padding: 0; margin-left: 2px;
          font: 700 12px/14px system-ui, sans-serif; letter-spacing: 1px; cursor: pointer;
          color: inherit; background: rgba(255, 255, 255, .22); border: 0; border-radius: 8px;
        }
        .more:hover { background: rgba(255, 255, 255, .4); }
        .waiting .more { background: rgba(0, 0, 0, .08); }
        .waiting .more:hover { background: rgba(0, 0, 0, .16); }
        .wrap:hover .more, .wrap.open .more { display: block; }

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

        /* Pop-up with the controls, opened by the "..." button. */
        .panel {
          display: none; position: absolute; right: 0; bottom: 30px;
          width: 280px; padding: 10px 12px; border-radius: 8px; box-sizing: border-box;
          color: #1f2328; background: #fff; border: 1px solid #d1d9e0;
          box-shadow: 0 4px 16px rgba(0, 0, 0, .18);
        }
        .wrap.open .panel { display: block; }
        .head { display: flex; align-items: flex-start; gap: 8px; }
        .label { font-weight: 600; flex: 1; }
        .gear {
          flex: none; width: 24px; height: 24px; margin: -3px -5px 0 0; padding: 0;
          display: flex; align-items: center; justify-content: center; cursor: pointer;
          color: #59636e; background: transparent; border: 0; border-radius: 6px;
        }
        .gear:hover { color: #1f2328; background: #eef1f4; }
        .gear svg { width: 16px; height: 16px; display: block; }
        .last { color: #59636e; margin-top: 2px; overflow-wrap: anywhere; }
        .last.err { color: #cf222e; }
        .buttons { display: flex; flex-wrap: wrap; gap: 6px; margin-top: 8px; }
        .buttons button {
          font: inherit; font-weight: 600; padding: 3px 8px; border-radius: 6px; cursor: pointer;
          border: 1px solid #d1d9e0; background: #f6f8fa; color: #1f2328;
        }
        .buttons button:hover { background: #eef1f4; }
        .buttons button.primary { background: #0969da; border-color: #0969da; color: #fff; }
        .buttons button.primary:hover { background: #0860c4; }
        [hidden] { display: none !important; }
      </style>
      <div class="wrap">
        <div class="panel" role="dialog" aria-label="Scheduled Executor">
          <div class="head">
            <div class="label"></div>
            <button type="button" class="gear" data-action="options" title="Settings" aria-label="Settings">
              <svg viewBox="0 0 16 16" fill="currentColor" aria-hidden="true"><path d="M8 0a8.2 8.2 0 0 1 .701.031C9.444.095 9.99.645 10.16 1.29l.288 1.107c.018.066.079.158.212.224.231.114.454.243.668.386.123.082.233.09.299.071l1.103-.303c.644-.176 1.392.021 1.82.63.27.385.506.792.704 1.218.315.675.111 1.422-.364 1.891l-.814.806c-.049.048-.098.147-.088.294.016.257.016.515 0 .772-.01.147.038.246.088.294l.814.806c.475.469.679 1.216.364 1.891a7.977 7.977 0 0 1-.704 1.217c-.428.61-1.176.807-1.82.63l-1.102-.302c-.067-.019-.177-.011-.3.071a5.909 5.909 0 0 1-.668.386c-.133.066-.194.158-.211.224l-.29 1.106c-.168.646-.715 1.196-1.458 1.26a8.006 8.006 0 0 1-1.402 0c-.743-.064-1.289-.614-1.458-1.26l-.289-1.106c-.018-.066-.079-.158-.212-.224a5.738 5.738 0 0 1-.668-.386c-.123-.082-.233-.09-.299-.071l-1.103.303c-.644.176-1.392-.021-1.82-.63a8.12 8.12 0 0 1-.704-1.218c-.315-.675-.111-1.422.363-1.891l.815-.806c.05-.048.098-.147.088-.294a6.214 6.214 0 0 1 0-.772c.01-.147-.038-.246-.088-.294l-.815-.806C.635 6.045.431 5.298.746 4.623a7.92 7.92 0 0 1 .704-1.217c.428-.61 1.176-.807 1.82-.63l1.102.302c.067.019.177.011.3-.071.214-.143.437-.272.668-.386.133-.066.194-.158.211-.224l.29-1.106C6.009.645 6.556.095 7.299.03 7.53.01 7.764 0 8 0Zm-.571 1.525c-.036.003-.108.036-.137.146l-.289 1.105c-.147.561-.549.967-.998 1.189-.173.086-.34.183-.5.29-.417.278-.97.423-1.529.27l-1.103-.303c-.109-.03-.175.016-.195.045-.22.312-.412.644-.573.99-.014.031-.021.11.059.19l.815.806c.411.406.562.957.53 1.456a4.709 4.709 0 0 0 0 .582c.032.499-.119 1.05-.53 1.456l-.815.806c-.081.08-.073.159-.059.19.162.346.353.677.573.989.02.03.085.076.195.046l1.102-.303c.56-.153 1.113-.008 1.53.27.161.107.328.204.501.29.447.222.85.629.997 1.189l.289 1.105c.029.109.101.143.137.146a6.6 6.6 0 0 0 1.142 0c.036-.003.108-.036.137-.146l.289-1.105c.147-.561.549-.967.998-1.189.173-.086.34-.183.5-.29.417-.278.97-.423 1.529-.27l1.103.303c.109.029.175-.016.195-.045.22-.313.411-.644.573-.99.014-.031.021-.11-.059-.19l-.815-.806c-.411-.406-.562-.957-.53-1.456a4.709 4.709 0 0 0 0-.582c-.032-.499.119-1.05.53-1.456l.815-.806c.081-.08.073-.159.059-.19a6.464 6.464 0 0 0-.573-.989c-.02-.03-.085-.076-.195-.046l-1.102.303c-.56.153-1.113.008-1.53-.27a4.44 4.44 0 0 0-.501-.29c-.447-.222-.85-.629-.997-1.189l-.289-1.105c-.029-.11-.101-.143-.137-.146a6.6 6.6 0 0 0-1.142 0ZM11 8a3 3 0 1 1-6 0 3 3 0 0 1 6 0ZM9.5 8a1.5 1.5 0 1 0-3.001.001A1.5 1.5 0 0 0 9.5 8Z"/></svg>
            </button>
          </div>
          <div class="last"></div>
          <div class="buttons">
            <button type="button" class="primary" data-action="on">On for 1 hour</button>
            <button type="button" data-action="off">Off for 1 hour</button>
            <button type="button" data-action="resume">Back to schedule</button>
          </div>
        </div>
        <div class="badge" role="status">
          <span class="clip"><span class="icon"></span><span class="text"></span></span>
          <button type="button" class="more" title="Controls" aria-label="Controls" aria-haspopup="dialog">⋯</button>
        </div>
      </div>`;

    const wrap = root.querySelector('.wrap');
    const setOpen = (open) => wrap.classList.toggle('open', open);
    root.querySelector('.more').addEventListener('click', (e) => {
      e.stopPropagation();
      setOpen(!wrap.classList.contains('open'));
    });
    root.querySelector('.panel').addEventListener('click', (e) => {
      const action = e.target.closest('button')?.dataset.action;
      if (!action) return;
      if (action === 'options') chrome.runtime.sendMessage({ type: 'openOptions' });
      else chrome.runtime.sendMessage({ type: 'setOverride', mode: action === 'resume' ? null : action });
      setOpen(false);
    });
    // Close the pop-up on a click elsewhere on the page, or on Escape.
    document.addEventListener('click', (e) => {
      if (!e.composedPath().includes(host)) setOpen(false);
    }, true);
    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape') setOpen(false);
    }, true);
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

  // Hover pill: one line, as before.
  const pill = lastText ? `${state.label} · ${lastText}` : state.label;
  root.querySelector('.text').textContent = pill;
  root.querySelector('.clip').title = pill;

  // Pop-up: the same details plus the controls.
  root.querySelector('.label').textContent = state.label;
  const lastEl = root.querySelector('.last');
  lastEl.textContent = lastText;
  lastEl.hidden = !lastText;
  lastEl.classList.toggle('err', failed);
  root.querySelector('[data-action="resume"]').hidden = !state.overridden;
}
