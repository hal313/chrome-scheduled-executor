import { isWithinWindow, parseTime } from './schedule.js';
import { compilePattern, urlMatches } from './match.js';
import { getSettings, saveSettings } from './settings.js';

const $ = (id) => document.getElementById(id);

function describeWindow(start, stop) {
  const s = parseTime(start);
  const e = parseTime(stop);
  if (s === null || e === null) return '';
  if (s === e) return 'Start equals stop: polls all day.';
  if (s > e) return `Crosses midnight: polls from ${start} until ${stop} the next day.`;
  return `Polls every minute from ${start} until ${stop}.`;
}

async function renderStatus() {
  const settings = await getSettings();
  const active = settings.enabled && isWithinWindow(new Date(), settings.startTime, settings.stopTime);

  const state = $('state');
  if (!settings.enabled) {
    state.innerHTML = '<span class="off">Disabled</span>';
  } else if (active) {
    state.innerHTML = '<span class="on">Polling now</span> (inside the window)';
  } else {
    state.innerHTML = '<span class="off">Waiting</span> (outside the window)';
  }

  const { lastStatus } = await chrome.storage.local.get('lastStatus');
  const el = $('lastStatus');
  if (lastStatus) {
    el.textContent = `Last poll ${new Date(lastStatus.at).toLocaleString()}: ${lastStatus.summary}`;
    el.className = lastStatus.ok ? 'hint' : 'hint err';
  } else {
    el.textContent = 'No polls yet.';
    el.className = 'hint';
  }
}

async function updateUrlHint() {
  const pattern = $('url').value.trim();
  const el = $('urlHint');
  if (!pattern) {
    el.textContent = 'Required. Polling only runs in tabs whose URL matches this pattern.';
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

function updateHint() {
  $('windowHint').textContent = describeWindow($('startTime').value, $('stopTime').value);
}

async function fillForm() {
  const settings = await getSettings();
  $('enabled').checked = settings.enabled;
  $('startTime').value = settings.startTime;
  $('stopTime').value = settings.stopTime;
  $('url').value = settings.url;
  updateHint();
  updateUrlHint();
}

async function init() {
  await fillForm();
  renderStatus();

  $('startTime').addEventListener('input', updateHint);
  $('stopTime').addEventListener('input', updateHint);
  $('url').addEventListener('input', updateUrlHint);

  $('form').addEventListener('submit', async (e) => {
    e.preventDefault();
    const url = $('url').value.trim();
    if (!compilePattern(url)) {
      updateUrlHint();
      return;
    }

    await saveSettings({
      enabled: $('enabled').checked,
      startTime: $('startTime').value,
      stopTime: $('stopTime').value,
      url,
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
