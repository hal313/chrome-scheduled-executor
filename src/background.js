// Service worker. Wakes once a minute via chrome.alarms and, while the current
// local time is inside the configured start/stop window, runs the code from the
// settings page (see execute()) in every open tab whose URL matches the configured `url` regular expression.

import { effectiveState, endOfDay, nextMinuteBoundary, OVERRIDE_MS } from './schedule.js';
import { urlMatches } from './match.js';
import { getSettings, userScriptsAvailable } from './settings.js';
import { setIndicator, TITLE_PREFIX } from './indicator.js';

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

/**
 * Open tabs whose URL matches the configured pattern, split into loaded tabs
 * and discarded ones (put to sleep by Memory Saver), which can't run code.
 */
async function findMatchingTabs(pattern) {
  const tabs = (await chrome.tabs.query({})).filter((tab) => urlMatches(pattern, tab.url));
  return {
    loaded: tabs.filter((tab) => !tab.discarded),
    asleep: tabs.filter((tab) => tab.discarded),
  };
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

function isActive(settings) {
  return effectiveState(settings, new Date()).executing;
}

function hhmm(ms) {
  return new Date(ms).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
}

// ---------------------------------------------------------------------------
// Indicators (title prefix + corner overlay) on tabs whose URL matches
// ---------------------------------------------------------------------------
// The title prefix shows only while executing. The overlay shows on every
// matching tab, with a different look for executing / waiting / disabled.
// Tabs currently showing something are remembered in session storage, so a
// tab that stops matching gets cleaned up.

/** What a matching tab should show right now. */
function indicatorState(settings) {
  const { mode, executing, override } = effectiveState(settings, new Date());
  const allDay = settings.startTime === settings.stopTime;
  let label;
  if (override && override.mode === 'on') {
    label = `Scheduled Executor: on until ${hhmm(override.until)} (1-hour override)`;
  } else if (override && override.span === 'day') {
    label = 'Scheduled Executor: sleep until the end of the day';
  } else if (override) {
    label = `Scheduled Executor: turned off until ${hhmm(override.until)} (1-hour override)`;
  } else {
    label = {
      executing: `Scheduled Executor: executing every minute ${allDay ? 'all day' : `until ${settings.stopTime}`}`,
      waiting: `Scheduled Executor: waiting, executes from ${settings.startTime} to ${settings.stopTime}`,
      disabled: 'Scheduled Executor: executing is turned off',
    }[mode];
  }
  return {
    prefix: TITLE_PREFIX,
    title: executing && settings.showTitleIndicator,
    overlay: settings.showOverlay ? mode : null,
    overridden: Boolean(override),
    overrideMode: override ? override.mode : null,
    // Which overlay button started the override, so it can be highlighted.
    overrideAction: override ? (override.span === 'day' ? 'sleep-day' : override.mode) : null,
    enabled: Boolean(settings.enabled),
    label,
  };
}

const NOTHING = {
  prefix: TITLE_PREFIX, title: false, overlay: null, overridden: false, overrideMode: null, overrideAction: null, enabled: false, label: '',
};

async function applyIndicator(tabId, state) {
  try {
    await chrome.scripting.executeScript({
      target: { tabId },
      func: setIndicator,
      args: [state],
    });
    return true;
  } catch {
    return false; // e.g. chrome:// pages, the Web Store, or a tab that just closed
  }
}

async function refreshIndicators(settings, onlyTabId) {
  settings ??= await getSettings();
  const base = indicatorState(settings);
  const wantsAny = base.title || base.overlay !== null;
  const { indicatorTabs = [] } = await chrome.storage.session.get('indicatorTabs');
  const { tabRuns = {} } = await chrome.storage.session.get('tabRuns');
  const shown = new Set(indicatorTabs);

  const tabs = onlyTabId === undefined
    ? await chrome.tabs.query({})
    : [await chrome.tabs.get(onlyTabId).catch(() => null)].filter(Boolean);

  await Promise.all(tabs.map(async (tab) => {
    if (urlMatches(settings.url, tab.url)) {
      // Always send matching tabs their full state, even "show nothing", so turning
      // an indicator off removes it whether or not the tab is in `shown` (which is
      // wiped when the extension reloads, and can lose tabs to overlapping refreshes).
      const state = wantsAny ? { ...base, lastRun: tabRuns[tab.id] } : NOTHING;
      if (await applyIndicator(tab.id, state)) shown.add(tab.id);
    } else if (shown.has(tab.id)) {
      await applyIndicator(tab.id, NOTHING);
      shown.delete(tab.id);
    }
  }));

  if (onlyTabId === undefined) {
    // Forget tabs that no longer exist.
    const open = new Set(tabs.map((t) => t.id));
    for (const id of shown) if (!open.has(id)) shown.delete(id);
  }
  await chrome.storage.session.set({ indicatorTabs: [...shown] });
}

async function recordTabRuns(tabs, results) {
  const { tabRuns = {} } = await chrome.storage.session.get('tabRuns');
  const at = Date.now();
  tabs.forEach((tab, i) => {
    const r = results[i];
    tabRuns[tab.id] = r.status === 'fulfilled'
      ? { ok: true, summary: r.value === undefined ? 'ok' : String(r.value), at }
      : { ok: false, summary: String(r.reason?.message ?? r.reason), at };
  });
  await chrome.storage.session.set({ tabRuns });
}

async function runTick(settings) {
  if (!isActive(settings)) return;

  const { loaded: tabs, asleep } = await findMatchingTabs(settings.url);
  if (tabs.length === 0) {
    const summary = asleep.length > 0
      ? `Skipped: ${asleep.length} matching tab(s), all asleep (discarded by Chrome)`
      : 'Skipped: no open tab matches the URL pattern';
    await recordStatus({ ok: true, summary });
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
  await recordTabRuns(tabs, results);

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

async function onTick() {
  const settings = await getSettings();
  try {
    await runTick(settings);
  } finally {
    // Every minute, so indicators change as the time window opens/closes.
    await refreshIndicators(settings);
  }
}

chrome.runtime.onInstalled.addListener(async (details) => {
  await ensureAlarm();
  // After a reload or update, open pages still have overlays from the previous
  // copy of the extension, with dead buttons; replace or remove them right away.
  await refreshIndicators();
  if (details.reason === 'install') chrome.runtime.openOptionsPage();
});

chrome.runtime.onStartup.addListener(async () => {
  await ensureAlarm();
  await refreshIndicators();
});

// The settings page asks here: an already-open page doesn't notice when
// "Allow User Scripts" is switched on, but the service worker does.
chrome.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
  if (!msg) return;
  if (msg.type === 'userScriptsAvailable') sendResponse(userScriptsAvailable());
  if (msg.type === 'setOverride') setOverride(msg.mode, msg.span).then(() => sendResponse(true));
  if (msg.type === 'setSchedule') setSchedule(msg.enabled).then(() => sendResponse(true));
  if (msg.type === 'openOptions') chrome.runtime.openOptionsPage();
  return msg.type === 'setOverride' || msg.type === 'setSchedule'; // keep the channel open for the async reply
});

/**
 * Buttons on the overlay: 'on' / 'off' for the next hour, 'off' with span 'day'
 * until midnight ("Sleep until the end of the day"), or null to go back to the
 * normal schedule. Stored in sync storage so every signed-in browser follows it.
 */
async function setOverride(mode, span = 'hour') {
  if (mode === 'off' && span === 'day') {
    await chrome.storage.sync.set({ override: { mode, until: endOfDay(new Date()), span: 'day' } });
  } else if (mode === 'on' || mode === 'off') {
    await chrome.storage.sync.set({ override: { mode, until: Date.now() + OVERRIDE_MS, span: 'hour' } });
  } else {
    await chrome.storage.sync.remove('override');
  }
  // Execute right away when switched on, instead of waiting for the next minute.
  if (mode === 'on') await onTick();
}

/**
 * Enable / disable buttons on the overlay: turn the normal schedule on or off
 * (the "Executing enabled" setting) and cancel any 1-hour override, so the
 * choice takes effect right away instead of after the override ends.
 */
async function setSchedule(enabled) {
  await chrome.storage.sync.set({ enabled: Boolean(enabled) });
  await chrome.storage.sync.remove('override');
}

chrome.alarms.onAlarm.addListener((alarm) => {
  if (alarm.name === ALARM_NAME) onTick();
});

// Settings changed (here or synced from another browser): update indicators now.
chrome.storage.onChanged.addListener((_changes, area) => {
  if (area === 'sync') refreshIndicators();
});

// A reload or navigation wipes the page's indicator; put it back.
chrome.tabs.onUpdated.addListener((tabId, info) => {
  if (info.status === 'complete' || info.url) refreshIndicators(undefined, tabId);
});

chrome.tabs.onRemoved.addListener(async (tabId) => {
  const { tabRuns = {} } = await chrome.storage.session.get('tabRuns');
  if (tabId in tabRuns) {
    delete tabRuns[tabId];
    await chrome.storage.session.set({ tabRuns });
  }
});

// Service workers can be restarted at any time; make sure the alarm exists.
ensureAlarm();
