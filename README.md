# Scheduled Executor (Chrome extension)

A Manifest V3 Chrome extension that runs execution code **every minute** inside open tabs whose URL
matches a pattern you choose, but only between a **start time** and **stop time** you choose.

## Install (load unpacked)

1. Clone this repo (or download it as a ZIP and unzip it).
2. Open `chrome://extensions` in Chrome.
3. Turn on **Developer mode** (top-right toggle).
4. Click **Load unpacked** and select the repo folder (the one containing `manifest.json`).
5. The settings page opens automatically on first install. You can reopen it any time from the
   toolbar icon (pin it via the puzzle-piece menu) or from the extension's **Details → Extension options**.

After editing code, click the reload icon on the extension's card in `chrome://extensions`.

## Settings

| Setting           | Meaning                                                                  |
|-------------------|--------------------------------------------------------------------------|
| Executing enabled | Master on/off switch.                                                    |
| Start / Stop      | Local-time window (24h). Executes at the start minute, stops at the stop minute. |
| URL pattern       | Required. A regular expression tested (case-insensitive) against each open tab's full URL. Execution only runs in tabs that match. |

Window rules:

- `09:00` → `17:00`: executes 09:00 through 16:59.
- `22:00` → `06:00`: **crosses midnight**, executes 22:00 through 05:59 the next morning.
- Start equal to stop: executes all day.

URL pattern examples:

- `teams\.microsoft\.com`: any page on that domain.
- `^https://teams\.microsoft\.com/v2/`: only that path, and only when the host really is that domain
  (the `^` anchor stops it matching the text elsewhere in another site's URL).

If no open tab matches, that minute is skipped. The settings page shows how many open tabs match as
you type, and refuses to save an invalid pattern. Settings saved under the old `pollUrl` name are
moved to `url` automatically.

The result of the last execution is shown on the settings page.

## Syncing settings across browsers

Settings are stored in `chrome.storage.sync`, so every Chrome where you're signed in to the same
Google account shares them. A change saved on one machine shows up on the others within a few
seconds to a minute, and an open settings page refreshes itself when it arrives. The last-execution status
is kept per browser and isn't synced.

For this to work:

- Sign in to Chrome and turn on sync (Settings → **You and Google**), with **Extensions** included in
  what's synced (or "Sync everything").
- Load the extension on each machine. The `key` in `manifest.json` gives it the same extension ID
  (`lljoikaibpmdnlhgjfegegbkogjbipon`) wherever it's loaded from, which is what lets the copies share
  storage. Don't remove it: without it, an unpacked extension's ID depends on its folder path and each
  machine would keep separate settings.

## Adding your polling logic

Open `src/background.js` and edit `poll()` (between the `YOUR POLLING CODE GOES HERE` markers). It is
injected into each matching tab with `chrome.scripting.executeScript`, so it runs in the page and
`document`/`window` are that page's. Because it is serialised and sent to the tab, it can't use other
variables or imports from `background.js`; it receives the settings as its only argument. Return a
short summary string; it is shown on the settings page.

Logs from `poll()` appear in the **page's** DevTools console. Logs from the scheduler appear in the
extension's service worker console (`chrome://extensions` → **service worker**).

## How it works

- `chrome.alarms` fires once a minute (aligned to the top of the minute). This is the minimum period
  Chrome allows and it survives the service worker being suspended.
- On each tick the service worker loads settings, checks `isWithinWindow()` against the current local
  time, finds open tabs where `urlMatches()` is true, and injects `poll()` into each of them.
- The extension asks for access to all sites (`<all_urls>`) because the pattern is a regex and can
  match any site. It only runs code in tabs your pattern matches.
- Chrome must be running for polling to happen. If the computer is asleep, missed ticks are skipped.

## Project layout

```
manifest.json
src/background.js   service worker: alarm + poll()
src/schedule.js     pure time-window helpers (unit tested)
src/match.js        URL-pattern matching (unit tested)
src/settings.js     defaults + chrome.storage helpers
src/options.*       settings / status page (also the toolbar popup)
test/               Node unit tests
icons/
```

## Tests

```
npm test
```

Requires Node 18+. No dependencies to install.
