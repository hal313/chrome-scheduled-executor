// Service worker. Wakes once a minute via chrome.alarms and runs poll() only
// while the current local time is inside the configured start/stop window.

import { isWithinWindow, nextMinuteBoundary } from './schedule.js';
import { getSettings } from './settings.js';

const ALARM_NAME = 'poll-tick';

// ---------------------------------------------------------------------------
// YOUR POLLING CODE GOES HERE
// ---------------------------------------------------------------------------
// This is a placeholder. It fetches the URL from the options page (if one is
// set) and logs the result. Replace the body with whatever you need to poll.
// Return a short summary string; it is shown on the options page.
async function poll(settings) {


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
  return 'updated at' + new Date();


  // if (!settings.pollUrl) {
  //   console.log('[poller] tick (no URL configured)');
  //   return 'Ran (no URL configured)';
  // }

  // const res = await fetch(settings.pollUrl, { cache: 'no-store' });
  // const body = await res.text();
  // console.log(`[poller] ${settings.pollUrl} -> ${res.status}`, body.slice(0, 200));
  // return `HTTP ${res.status} (${body.length} bytes)`;
}
// ---------------------------------------------------------------------------

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

  try {
    const summary = await poll(settings);
    await recordStatus({ ok: true, summary });
  } catch (err) {
    console.error('[poller] poll failed', err);
    await recordStatus({ ok: false, summary: String(err && err.message ? err.message : err) });
  }
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
