// Shared settings defaults and storage helpers (used by the service worker and the options page).

export const DEFAULT_SETTINGS = Object.freeze({
  enabled: true,
  startTime: '08:00', // HH:MM, 24h, local time
  stopTime: '17:00', // HH:MM, 24h, local time
  url: '', // regular expression; polling only runs in tabs whose URL matches it
});

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
