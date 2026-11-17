import { isWithinWindow, parseTime } from './schedule.js';
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

async function renderStatus() {
  const settings = await getSettings();
  const active = settings.enabled && isWithinWindow(new Date(), settings.startTime, settings.stopTime);

  const state = $('state');
  if (!settings.enabled) {
    state.innerHTML = '<span class="off">Disabled</span>';
  } else if (active) {
    state.innerHTML = '<span class="on">Executing now</span> (inside the window)';
  } else {
    state.innerHTML = '<span class="off">Waiting</span> (outside the window)';
  }

  const { lastStatus } = await chrome.storage.local.get('lastStatus');
  const el = $('lastStatus');
  if (lastStatus) {
    el.textContent = `Last run ${new Date(lastStatus.at).toLocaleString()}: ${lastStatus.summary}`;
    el.className = lastStatus.ok ? 'hint' : 'hint err';
  } else {
    el.textContent = 'No runs yet.';
    el.className = 'hint';
  }
}

async function updateUrlHint() {
  const pattern = $('url').value.trim();
  const el = $('urlHint');
  if (!pattern) {
    el.textContent = 'Required. Code only runs in tabs whose URL matches this pattern.';
    el.className = 'hint err';
    return;
  }
  if (!compilePattern(pattern)) {
    el.textContent = 'Not a valid regular expression.';
    el.className = 'hint err';
    return;
  }
  const tabs = await chrome.tabs.query({});
  const n = tabs.filter((t) => urlMatches(pattern, t.url)).length;
  el.textContent = `Case-insensitive match against the full page URL. ${n} open tab(s) match right now.`;
  el.className = 'hint';
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
    el.className = 'hint err';
  } else if (el.dataset.base) {
    el.innerHTML = el.dataset.base;
    delete el.dataset.base;
    el.className = 'hint';
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
    });

    $('saved').hidden = false;
    setTimeout(() => { $('saved').hidden = true; }, 1500);
    renderStatus();
  });

  chrome.storage.onChanged.addListener((changes, area) => {
    // Settings saved in another Chrome (same Google account) arrive via sync.
    if (area === 'sync') fillForm();
    renderStatus();
  });
}

init();
