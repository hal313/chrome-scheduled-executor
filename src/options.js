import { isWithinWindow, parseTime } from './schedule.js';
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

function updateHint() {
  $('windowHint').textContent = describeWindow($('startTime').value, $('stopTime').value);
}

async function init() {
  const settings = await getSettings();
  $('enabled').checked = settings.enabled;
  $('startTime').value = settings.startTime;
  $('stopTime').value = settings.stopTime;
  $('pollUrl').value = settings.pollUrl;
  updateHint();
  renderStatus();

  $('startTime').addEventListener('input', updateHint);
  $('stopTime').addEventListener('input', updateHint);

  $('form').addEventListener('submit', async (e) => {
    e.preventDefault();
    const pollUrl = $('pollUrl').value.trim();

    // Ask for access to the URL's origin. Must happen inside the click handler.
    if (pollUrl) {
      const origin = `${new URL(pollUrl).origin}/*`;
      const granted = await chrome.permissions.request({ origins: [origin] });
      if (!granted) {
        $('lastStatus').textContent = `Permission to access ${origin} was declined; polling that URL will fail.`;
        $('lastStatus').className = 'hint err';
      }
    }

    await saveSettings({
      enabled: $('enabled').checked,
      startTime: $('startTime').value,
      stopTime: $('stopTime').value,
      pollUrl,
    });

    $('saved').hidden = false;
    setTimeout(() => { $('saved').hidden = true; }, 1500);
    renderStatus();
  });

  chrome.storage.onChanged.addListener(renderStatus);
}

init();
