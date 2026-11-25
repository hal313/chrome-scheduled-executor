import { effectiveState, parseTime } from './schedule.js';
import { compilePattern, urlMatches } from './match.js';
import { getSettings, saveSettings, userScriptsAvailable, MAX_CODE_BYTES } from './settings.js';

const $ = (id) => document.getElementById(id);

// The toolbar pop-up opens this page as options.html?popup; give it a fixed width there.
if (new URLSearchParams(location.search).has('popup')) document.documentElement.classList.add('popup');

const HINT_CLASSES = ['text-slate-500', 'dark:text-slate-400'];
const ERROR_CLASSES = ['text-red-600', 'dark:text-red-400'];
const ON_CLASS = 'font-semibold text-emerald-600 dark:text-emerald-400';
const OFF_CLASS = 'font-semibold text-slate-500 dark:text-slate-400';

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
  for (const c of ERROR_CLASSES) el.classList.toggle(c, isError);
  for (const c of HINT_CLASSES) el.classList.toggle(c, !isError);
}

async function renderStatus() {
  const settings = await getSettings();
  const { mode, override } = effectiveState(settings, new Date());
  const until = override
    ? new Date(override.until).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
    : '';

  const state = $('state');
  if (override && override.mode === 'on') {
    state.innerHTML = `<span class="${ON_CLASS}">Executing now</span> (turned on until ${until})`;
  } else if (override && override.span === 'day') {
    state.innerHTML = `<span class="${OFF_CLASS}">Paused</span> (until the end of the day)`;
  } else if (override) {
    state.innerHTML = `<span class="${OFF_CLASS}">Off</span> (turned off until ${until})`;
  } else if (mode === 'disabled') {
    state.innerHTML = `<span class="${OFF_CLASS}">Disabled</span>`;
  } else if (mode === 'executing') {
    state.innerHTML = `<span class="${ON_CLASS}">Executing now</span> (inside the window)`;
  } else {
    state.innerHTML = `<span class="${OFF_CLASS}">Waiting</span> (outside the window)`;
  }

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

// Fields that each save one setting as soon as they change, by element ID.
const CHECKBOXES = ['enabled', 'showTitleIndicator', 'showOverlay'];
const TEXT_FIELDS = ['startTime', 'stopTime', 'url', 'code'];

async function fillForm() {
  const settings = await getSettings();
  // Leave the field being typed in alone, so a synced change doesn't wipe unsaved edits.
  for (const id of CHECKBOXES) $(id).checked = settings[id];
  for (const id of TEXT_FIELDS) if (document.activeElement !== $(id)) $(id).value = settings[id];
  updateHint();
  updateUrlHint();
  updateCodeHint();
}

let saveStatusTimer;

/** Saves some settings and briefly shows "Saved" in the header. */
async function save(partial) {
  await saveSettings(partial);
  const el = $('saveStatus');
  el.textContent = 'Saved';
  clearTimeout(saveStatusTimer);
  saveStatusTimer = setTimeout(() => { el.textContent = ''; }, 1500);
  renderStatus();
}

async function init() {
  $('version').textContent = `Version ${chrome.runtime.getManifest().version}`;
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
  // Overrides expire on their own; keep the status line current.
  setInterval(renderStatus, 30 * 1000);
  $('openDetails').addEventListener('click', () => {
    chrome.tabs.create({ url: `chrome://extensions/?id=${chrome.runtime.id}` });
  });
  // Re-check when the user comes back from turning the switch on.
  window.addEventListener('focus', renderUserScriptsBanner);
  document.addEventListener('visibilitychange', renderUserScriptsBanner);

  // Save each field as soon as it changes (text fields: when you leave them),
  // like the Google Calendar Enhancements options page. Invalid values aren't saved;
  // their hint explains why.
  for (const id of CHECKBOXES) {
    $(id).addEventListener('change', () => save({ [id]: $(id).checked }));
  }
  for (const id of ['startTime', 'stopTime']) {
    $(id).addEventListener('change', () => {
      if (parseTime($(id).value) !== null) save({ [id]: $(id).value });
    });
  }
  $('url').addEventListener('change', () => {
    const url = $('url').value.trim();
    if (compilePattern(url)) save({ url });
    else updateUrlHint();
  });
  $('code').addEventListener('change', () => {
    const code = $('code').value;
    if (!codeTooLong(code)) save({ code });
    else updateCodeHint();
  });

  chrome.storage.onChanged.addListener((changes, area) => {
    // Settings saved in another Chrome (same Google account) arrive via sync.
    if (area === 'sync' && Object.keys(changes).some((k) => k !== 'override')) fillForm();
    renderStatus();
  });
}

init();
