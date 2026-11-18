# Scheduled Executor (Chrome extension)

A Manifest V3 Chrome extension that runs JavaScript you enter **every minute** inside open tabs whose URL
matches a pattern you choose, but only between a **start time** and **stop time** you choose.

## Install (load unpacked)

1. Clone this repo (or download it as a ZIP and unzip it).
2. Open `chrome://extensions` in Chrome.
3. Turn on **Developer mode** (top-right toggle).
4. Click **Load unpacked** and select the repo folder (the one containing `manifest.json`).
5. On the extension's card click **Details** and turn on **Allow User Scripts**. Chrome requires this
   for any extension that runs code you type in rather than code it shipped with; until it's on, the
   settings page shows a banner with a button that takes you there.
6. The settings page opens automatically on first install. You can reopen it any time from the
   toolbar icon (pin it via the puzzle-piece menu) or from the extension's **Details → Extension options**.

After editing code, click the reload icon on the extension's card in `chrome://extensions`.

## Settings

| Setting           | Meaning                                                                  |
|-------------------|--------------------------------------------------------------------------|
| Executing enabled | Master on/off switch.                                                    |
| Start / Stop      | Local-time window (24h). Executes at the start minute, stops at the stop minute. |
| URL pattern       | Required. A regular expression tested (case-insensitive) against each open tab's full URL. Execution only runs in tabs that match. |
| Indicators        | Turn the tab-title ⏱ and the page overlay on or off (both on by default). See below. |
| Code to execute   | The JavaScript run in each matching tab every minute. See below. Starts as the keydown snippet. |

Window rules:

- `09:00` → `17:00`: executes 09:00 through 16:59.
- `22:00` → `06:00`: **crosses midnight**, executes 22:00 through 05:59 the next morning.
- Start equal to stop: executes all day.

URL pattern examples:

- `teams\.cloud\.microsoft`: any page on that domain.
- `^https://teams\.cloud\.microsoft`: only that path, and only when the host really is that domain
  (the `^` anchor stops it matching the text elsewhere in another site's URL).

If no open tab matches, that minute is skipped. The settings page shows how many open tabs match as
you type, and refuses to save an invalid pattern. Settings saved under the old `pollUrl` name are
moved to `url` automatically.

The result of the last execution is shown on the settings page.

## Indicators

Tabs whose URL matches the pattern can show two indicators. Each has its own checkbox under
**Indicators on matching tabs** on the settings page; both are on by default and sync like the other
settings.

**Tab title.** While executing (enabled and inside the time window, or turned on for 1 hour), the tab title starts with ⏱.
It's re-added if the page changes its own title (for example unread counts), and removed when
executing stops.

**Overlay.** A small faded badge in the bottom-right corner of every matching tab. It's always there
(when turned on) and its look tells you the state:

| Look                                   | State     | Meaning                                         |
|----------------------------------------|-----------|-------------------------------------------------|
| Solid blue ⏱ (red if the last run failed) | Executing | Enabled and inside the time window, or turned on for 1 hour. |
| Hollow white ring with ⏸               | Waiting   | Enabled, but outside the time window.           |
| Dark, dashed ring with ⊘               | Disabled  | "Executing enabled" is turned off, or turned off for 1 hour. |

Hover it to open a small panel with the details (the time window, and while executing, the time and
result of the last execution in that tab) and these buttons:

| Button            | What it does                                                                 |
|-------------------|------------------------------------------------------------------------------|
| On for 1 hour     | Executes every minute for the next hour, even outside the time window or when "Executing enabled" is off. Runs once immediately. |
| Off for 1 hour    | Stops executing for the next hour, even inside the time window.             |
| Back to schedule  | Shown while one of the above is running; cancels it early.                  |
| Settings          | Opens the settings page.                                                     |

While a 1-hour override is running, the badge has a small amber dot and the panel says when it ends.
After the hour, it goes back to the normal schedule on its own. Overrides sync like the settings, so
they apply in every signed-in Chrome. The same three override buttons are also on the settings page,
under **Status**.

The overlay sits in its own shadow DOM so it doesn't pick up or affect the page's styles.

Indicators update when settings change, when a page loads, and once a minute (so they switch as the
time window opens and closes). They're removed when a tab stops matching the pattern. They don't need
"Allow User Scripts".

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

## The code to execute

Type the code in the **Code to execute** box on the settings page and click **Save**. It syncs with
the other settings, so it's the same in every Chrome you're signed in to.

The code runs inside each matching page, the same as if you pasted it into that page's DevTools
console:

- `document`, `window` and the page's own JavaScript globals are available.
- It runs inside an `async` function, so you can use `await`.
- Whatever you `return` is shown as **Last execution** on the settings page (objects are shown as JSON).
- If it throws, the error message is shown as **Last execution** in red, and the full error is logged to the
  page's DevTools console.
- `console.log` output appears in the **page's** DevTools console. The extension's own log lines
  appear in its service worker console (`chrome://extensions` → **service worker**).
- The code can be up to about 8 KB, which is Chrome sync's limit for one setting.

Example:

```js
const unread = document.querySelectorAll('.unread').length;
return `${unread} unread`;
```

Behind the scenes, `execute()` in `src/background.js` wraps the code and injects it with
`chrome.userScripts.execute()` into the page's main world. Pages' Content Security Policy doesn't block
it, unlike `eval`, which Manifest V3 doesn't allow in extensions.

## How it works

- `chrome.alarms` fires once a minute (aligned to the top of the minute). This is the minimum period
  Chrome allows and it survives the service worker being suspended.
- On each tick the service worker loads settings, checks `isWithinWindow()` against the current local
  time, finds open tabs where `urlMatches()` is true, and runs your code in each of them with `execute()`.
- The extension asks for access to all sites (`<all_urls>`) because the pattern is a regex and can
  match any site. It only runs code in tabs your pattern matches.
- Chrome must be running for anything to execute. If the computer is asleep, missed ticks are skipped.

## Project layout

```
manifest.json
src/background.js   service worker: alarm + execute()
src/schedule.js     pure time-window helpers (unit tested)
src/match.js        URL-pattern matching (unit tested)
src/indicator.js    tab-title prefix and corner badge injected into active tabs
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
