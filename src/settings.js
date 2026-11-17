// Shared settings defaults and storage helpers (used by the service worker and the options page).

// Starting code for new installs (the keydown code from v1.1).
export const DEFAULT_CODE = `var keyboardEvent = document.createEvent('KeyboardEvent');
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
return 'SUCCESS'`;

export const DEFAULT_SETTINGS = Object.freeze({
  enabled: true,
  startTime: '08:00', // HH:MM, 24h, local time
  stopTime: '17:00', // HH:MM, 24h, local time
  url: '', // regular expression; code only runs in tabs whose URL matches it
  code: DEFAULT_CODE, // JavaScript run in each matching tab (see execute() in background.js)
  showTitleIndicator: true, // prefix the tab title while executing
  showOverlay: true, // corner overlay on matching tabs (executing / waiting / disabled)
});

// chrome.storage.sync allows at most 8 KB per setting.
export const MAX_CODE_BYTES = 8000;

export async function getSettings() {
  const stored = await chrome.storage.sync.get(null);

  // Migrate the old `pollUrl` key (versions before 1.1.0) to `url`.
  if (stored.pollUrl !== undefined) {
    if (stored.url === undefined) stored.url = stored.pollUrl;
    delete stored.pollUrl;
    await chrome.storage.sync.set({ url: stored.url });
    await chrome.storage.sync.remove('pollUrl');
  }

  return { ...DEFAULT_SETTINGS, ...stored };
}

export async function saveSettings(settings) {
  await chrome.storage.sync.set(settings);
}

/**
 * chrome.userScripts only works when "Allow User Scripts" is turned on for this
 * extension (chrome://extensions -> Details). Chrome requires that switch for any
 * extension that runs code it didn't ship with.
 */
export function userScriptsAvailable() {
  try {
    chrome.userScripts.getScripts();
    return true;
  } catch {
    return false;
  }
}
