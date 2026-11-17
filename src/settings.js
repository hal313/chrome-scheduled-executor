// Shared settings defaults and storage helpers (used by the service worker and the options page).

export const DEFAULT_SETTINGS = Object.freeze({
  enabled: true,
  startTime: '08:00', // HH:MM, 24h, local time
  stopTime: '17:00', // HH:MM, 24h, local time
  pollUrl: '', // optional: URL fetched by the placeholder poll()
});

export async function getSettings() {
  const stored = await chrome.storage.sync.get(DEFAULT_SETTINGS);
  return { ...DEFAULT_SETTINGS, ...stored };
}

export async function saveSettings(settings) {
  await chrome.storage.sync.set(settings);
}
