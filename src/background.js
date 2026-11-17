// Service worker. Wakes once a minute via chrome.alarms and, while the current
// local time is inside the configured start/stop window, runs the code from the
// settings page (see execute()) in every open tab whose URL matches the configured `url` regular expression.

import { isWithinWindow, nextMinuteBoundary } from './schedule.js';
import { urlMatches } from './match.js';
import { getSettings, userScriptsAvailable } from './settings.js';

const ALARM_NAME = 'execute-tick';

// ---------------------------------------------------------------------------
// execute(): runs the code from the settings page inside one tab
// ---------------------------------------------------------------------------
// The code is injected with chrome.userScripts.execute() into the page's MAIN
// world, so it behaves like code typed into that page's DevTools console:
// `document`, `window` and the page's own globals are all available. It is
// wrapped in an async function, so it may use `await` and `return` a value;
// the returned value is shown as the last-run summary on the settings page.

// Runs the user's code and reports back { ok, value } or { ok: false, error },
// because an exception thrown inside the page doesn't reach the extension.
function wrap(code) {
  return `(async () => {
  try {
    const value = await (async () => {
${code}
    })();
    if (value === undefined) return { ok: true };
    let text;
    try { text = typeof value === 'string' ? value : JSON.stringify(value); } catch { text = String(value); }
    return { ok: true, value: text };
  } catch (e) {
    console.error('[executor]', e);
    return { ok: false, error: String((e && e.message) || e) };
  }
})()`;
}

async function execute(tab, settings) {
  const [injection] = await chrome.userScripts.execute({
    target: { tabId: tab.id },
    world: 'MAIN',
    injectImmediately: true,
    js: [{ code: wrap(settings.code) }],
  });
  if (injection && injection.error) throw new Error(injection.error);
  const outcome = injection && injection.result;
  if (!outcome) throw new Error('No result from page (it may have navigated away)');
  if (!outcome.ok) throw new Error(outcome.error);
  return outcome.value;
}
// ---------------------------------------------------------------------------

/** Open tabs whose URL matches the configured pattern. */
async function findMatchingTabs(pattern) {
  const tabs = await chrome.tabs.query({});
  return tabs.filter((tab) => urlMatches(pattern, tab.url));
}

async function ensureAlarm() {
  const existing = await chrome.alarms.get(ALARM_NAME);
  if (existing) return;
  await chrome.alarms.create(ALARM_NAME, {
    when: nextMinuteBoundary(new Date()),
    periodInMinutes: 1,
  });
}

async function recordStatus(status) {
  await chrome.storage.local.set({ lastStatus: { ...status, at: Date.now() } });
}

async function onTick() {
  const settings = await getSettings();

  if (!settings.enabled) return;
  if (!isWithinWindow(new Date(), settings.startTime, settings.stopTime)) return;

  const tabs = await findMatchingTabs(settings.url);
  if (tabs.length === 0) {
    await recordStatus({ ok: true, summary: 'Skipped: no open tab matches the URL pattern' });
    return;
  }

  if (!settings.code || settings.code.trim() === '') {
    await recordStatus({ ok: true, summary: 'Skipped: no code configured' });
    return;
  }
  if (!userScriptsAvailable()) {
    await recordStatus({
      ok: false,
      summary: 'Not run: turn on "Allow User Scripts" for this extension in chrome://extensions (Details).',
    });
    return;
  }

  const results = await Promise.allSettled(tabs.map((tab) => execute(tab, settings)));

  const failures = results.filter((r) => r.status === 'rejected');
  failures.forEach((f) => console.error('[executor] execute failed', f.reason));

  const first = results.find((r) => r.status === 'fulfilled');
  const detail = first
    ? (first.value === undefined ? '' : String(first.value))
    : String(failures[0].reason?.message ?? failures[0].reason);
  await recordStatus({
    ok: failures.length === 0,
    summary: `${tabs.length} tab(s), ${failures.length} failed. ${detail}`.trim(),
  });
}

chrome.runtime.onInstalled.addListener(async (details) => {
  await ensureAlarm();
  if (details.reason === 'install') chrome.runtime.openOptionsPage();
});

chrome.runtime.onStartup.addListener(ensureAlarm);

// The settings page asks here: an already-open page doesn't notice when
// "Allow User Scripts" is switched on, but the service worker does.
chrome.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
  if (msg && msg.type === 'userScriptsAvailable') sendResponse(userScriptsAvailable());
});

chrome.alarms.onAlarm.addListener((alarm) => {
  if (alarm.name === ALARM_NAME) onTick();
});

// Service workers can be restarted at any time; make sure the alarm exists.
ensureAlarm();
