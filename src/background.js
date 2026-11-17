// Service worker. Wakes once a minute via chrome.alarms and, while the current
// local time is inside the configured start/stop window, runs poll() inside
// every open tab whose URL matches the configured `url` regular expression.

import { isWithinWindow, nextMinuteBoundary } from './schedule.js';
import { urlMatches } from './match.js';
import { getSettings } from './settings.js';

const ALARM_NAME = 'execute-tick';

// ---------------------------------------------------------------------------
// YOUR EXECUTION CODE GOES HERE
// ---------------------------------------------------------------------------
// This function is injected into each matching tab and runs in that page, so
// `document` and `window` are the page's. It cannot use variables from this
// file (it is serialised and sent to the tab), and it receives the settings as
// its only argument. Return a short summary string; it is shown on the
// options page.
function poll(settings) {
  var keyboardEvent = document.createEvent('KeyboardEvent');
  var initMethod = typeof keyboardEvent.initKeyboardEvent !== 'undefined' ? 'initKeyboardEvent' : 'initKeyEvent';

  keyboardEvent[initMethod](
    'keydown', // event type: keydown, keyup, keypress
    true, // bubbles
    true, // cancelable
    window, // view: should be window
    false, // ctrlKey
    false, // altKey
    false, // shiftKey
    false, // metaKey
    0, // keyCode: unsigned long - the virtual key code, else 0
    60, // charCode: unsigned long - the Unicode character associated with the depressed key, else 0
  );
  document.dispatchEvent(keyboardEvent);
  console.log('updated at', new Date());
  return 'updated at ' + new Date().toLocaleTimeString();
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

  const results = await Promise.allSettled(
    tabs.map((tab) =>
      chrome.scripting.executeScript({
        target: { tabId: tab.id },
        func: poll,
        args: [settings],
      }),
    ),
  );

  const failures = results.filter((r) => r.status === 'rejected');
  failures.forEach((f) => console.error('[executor] poll failed', f.reason));

  const first = results.find((r) => r.status === 'fulfilled');
  const summary = first ? first.value[0]?.result : String(failures[0].reason?.message ?? failures[0].reason);
  await recordStatus({
    ok: failures.length === 0,
    summary: `${tabs.length} tab(s), ${failures.length} failed. ${summary ?? ''}`.trim(),
  });
}

chrome.runtime.onInstalled.addListener(async (details) => {
  await ensureAlarm();
  if (details.reason === 'install') chrome.runtime.openOptionsPage();
});

chrome.runtime.onStartup.addListener(ensureAlarm);

chrome.alarms.onAlarm.addListener((alarm) => {
  if (alarm.name === ALARM_NAME) onTick();
});

// Service workers can be restarted at any time; make sure the alarm exists.
ensureAlarm();
