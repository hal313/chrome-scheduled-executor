import { effectiveState, parseTime } from './schedule.js';
import { compilePattern, urlMatches } from './match.js';
import { getSettings, saveSettings, userScriptsAvailable, MAX_CODE_BYTES } from './settings.js';

const $ = (id) => document.getElementById(id);

function describeWindow(start, stop) {
  const s = parseTime(start);
  const e = parseTime(stop);
  if (s === null || e === null) return '';
  if (s === e) return 'Start equals stop: executes all day.';
  if (s > e) return `Crosses midnight: executes from ${start} until ${stop} the next day.`;
  return `Executes every minute from ${start} until ${stop}.`;
}

/** Hint lines are grey normally and red when they report a problem. */
function setHintError(el, isError) {
  el.classList.toggle('text-bad', isError);
  el.classList.toggle('text-muted', !isError);
}

async function renderStatus() {
  const settings = await getSettings();
  const { mode, override } = effectiveState(settings, new Date());
  const until = override
    ? new Date(override.until).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
    : '';

  const state = $('state');
  if (override && override.mode === 'on') {
    state.innerHTML = `<span class="font-semibold text-ok">Executing now</span> (turned on until ${until})`;
  } else if (override) {
    state.innerHTML = `<span class="font-semibold text-muted">Off</span> (turned off until ${until})`;
  } else if (mode === 'disabled') {
    state.innerHTML = '<span class="font-semibold text-muted">Disabled</span>';
  } else if (mode === 'executing') {
    state.innerHTML = '<span class="font-semibold text-ok">Executing now</span> (inside the window)';
  } else {
    state.innerHTML = '<span class="font-semibold text-muted">Waiting</span> (outside the window)';
  }
  document.querySelector('[data-override="resume"]').hidden = !override;

  const { lastStatus } = await chrome.storage.local.get('lastStatus');
  const el = $('lastStatus');
  if (lastStatus) {
    el.textContent = `Last execution ${new Date(lastStatus.at).toLocaleString()}: ${lastStatus.summary}`;
    setHintError(el, !lastStatus.ok);
  } else {
    el.textContent = 'No executions yet.';
    setHintError(el, false);
  }
}

async function updateUrlHint() {
  const pattern = $('url').value.trim();
  const el = $('urlHint');
  if (!pattern) {
    el.textContent = 'Required. Code only runs in tabs whose URL matches this pattern.';
    setHintError(el, true);
    return;
  }
  if (!compilePattern(pattern)) {
    el.textContent = 'Not a valid regular expression.';
    setHintError(el, true);
    return;
  }
  const tabs = await chrome.tabs.query({});
  const n = tabs.filter((t) => urlMatches(pattern, t.url)).length;
  el.textContent = `Case-insensitive match against the full page URL. ${n} open tab(s) match right now.`;
  setHintError(el, false);
}

async function renderUserScriptsBanner() {
  let ok = userScriptsAvailable();
  if (!ok) {
    try { ok = await chrome.runtime.sendMessage({ type: 'userScriptsAvailable' }); } catch { /* worker asleep */ }
  }
  $('userScriptsBanner').hidden = Boolean(ok);
}

function codeTooLong(code) {
  return new TextEncoder().encode(code).length > MAX_CODE_BYTES;
}

function updateCodeHint() {
  const el = $('codeHint');
  if (codeTooLong($('code').value)) {
    el.dataset.base ??= el.innerHTML;
    el.textContent = `Too long: Chrome sync allows about ${MAX_CODE_BYTES / 1000} KB of code.`;
    setHintError(el, true);
  } else if (el.dataset.base) {
    el.innerHTML = el.dataset.base;
    delete el.dataset.base;
    setHintError(el, false);
  }
}

function updateHint() {
  $('windowHint').textContent = describeWindow($('startTime').value, $('stopTime').value);
}

async function fillForm() {
  const settings = await getSettings();
  $('enabled').checked = settings.enabled;
  $('startTime').value = settings.startTime;
  $('stopTime').value = settings.stopTime;
  $('url').value = settings.url;
  $('code').value = settings.code;
  $('showTitleIndicator').checked = settings.showTitleIndicator;
  $('showOverlay').checked = settings.showOverlay;
  updateHint();
  updateUrlHint();
  updateCodeHint();
}

async function init() {
  await fillForm();
  renderUserScriptsBanner();
  renderStatus();

  $('startTime').addEventListener('input', updateHint);
  $('stopTime').addEventListener('input', updateHint);
  $('url').addEventListener('input', updateUrlHint);
  $('code').addEventListener('input', updateCodeHint);
  $('code').addEventListener('keydown', (e) => {
    if (e.key === 'Tab' && !e.shiftKey) {
      e.preventDefault();
      e.target.setRangeText('  ', e.target.selectionStart, e.target.selectionEnd, 'end');
    }
  });
  document.querySelectorAll('[data-override]').forEach((btn) => {
    btn.addEventListener('click', () => {
      const mode = btn.dataset.override === 'resume' ? null : btn.dataset.override;
      chrome.runtime.sendMessage({ type: 'setOverride', mode });
    });
  });
  // Overrides expire on their own; keep the status line current.
  setInterval(renderStatus, 30 * 1000);
  $('openDetails').addEventListener('click', () => {
    chrome.tabs.create({ url: `chrome://extensions/?id=${chrome.runtime.id}` });
  });
  // Re-check when the user comes back from turning the switch on.
  window.addEventListener('focus', renderUserScriptsBanner);
  document.addEventListener('visibilitychange', renderUserScriptsBanner);

  $('form').addEventListener('submit', async (e) => {
    e.preventDefault();
    const url = $('url').value.trim();
    if (!compilePattern(url)) {
      updateUrlHint();
      return;
    }
    const code = $('code').value;
    if (codeTooLong(code)) {
      updateCodeHint();
      return;
    }

    await saveSettings({
      enabled: $('enabled').checked,
      startTime: $('startTime').value,
      stopTime: $('stopTime').value,
      url,
      code,
      showTitleIndicator: $('showTitleIndicator').checked,
      showOverlay: $('showOverlay').checked,
    });

    $('saved').hidden = false;
    setTimeout(() => { $('saved').hidden = true; }, 1500);
    renderStatus();
  });

  chrome.storage.onChanged.addListener((changes, area) => {
    // Settings saved in another Chrome (same Google account) arrive via sync.
    if (area === 'sync' && Object.keys(changes).some((k) => k !== 'override')) fillForm();
    renderStatus();
  });
}

init();
