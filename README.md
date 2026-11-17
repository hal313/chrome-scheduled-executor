# Scheduled Poller (Chrome extension)

A Manifest V3 Chrome extension that runs polling code in the background **every minute**, but only
between a **start time** and **stop time** you choose.

## Install (load unpacked)

1. Clone this repo (or download it as a ZIP and unzip it).
2. Open `chrome://extensions` in Chrome.
3. Turn on **Developer mode** (top-right toggle).
4. Click **Load unpacked** and select the repo folder (the one containing `manifest.json`).
5. The settings page opens automatically on first install. You can reopen it any time from the
   toolbar icon (pin it via the puzzle-piece menu) or from the extension's **Details → Extension options**.

After editing code, click the reload icon on the extension's card in `chrome://extensions`.

## Settings

| Setting         | Meaning                                                                  |
|-----------------|--------------------------------------------------------------------------|
| Polling enabled | Master on/off switch.                                                    |
| Start / Stop    | Local-time window (24h). Polls at the start minute, stops at the stop minute. |
| URL to poll     | Optional. Used by the placeholder poll; Chrome asks for access to that site when you save. |

Window rules:

- `09:00` → `17:00`: polls 09:00 through 16:59.
- `22:00` → `06:00`: **crosses midnight**, polls 22:00 through 05:59 the next morning.
- Start equal to stop: polls all day.

Settings are stored in `chrome.storage.sync`, so they follow your Chrome profile. The result of the
last poll is shown on the settings page.

## Adding your polling logic

Open `src/background.js` and replace the body of `poll()` (between the `YOUR POLLING CODE GOES HERE`
markers). It receives the saved settings and should return a short summary string; throw to report a
failure. The placeholder fetches the configured URL and logs the response.

To see logs, open `chrome://extensions`, find the extension, and click **service worker** to open its
DevTools console.

If your code needs to reach a site that isn't the configured URL, add it to `host_permissions` in
`manifest.json`.

## How it works

- `chrome.alarms` fires once a minute (aligned to the top of the minute). This is the minimum period
  Chrome allows and it survives the service worker being suspended.
- On each tick the service worker loads settings, checks `isWithinWindow()` against the current local
  time, and calls `poll()` only when inside the window.
- Chrome must be running for polling to happen. If the computer is asleep, missed ticks are skipped.

## Project layout

```
manifest.json
src/background.js   service worker: alarm + poll()
src/schedule.js     pure time-window helpers (unit tested)
src/settings.js     defaults + chrome.storage helpers
src/options.*       settings / status page (also the toolbar popup)
test/               Node unit tests for schedule.js
icons/
```

## Tests

```
npm test
```

Requires Node 18+. No dependencies to install.
