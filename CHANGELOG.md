# Changelog

All notable changes to Scheduled Executor. Versions match `manifest.json`.

## [1.7.1] - 2026-11-22

### Removed
- **On for 1 hour** and **Off for 1 hour** buttons on the settings page. Use **Run for 1 hour** and **Sleep for 1 hour** in the overlay instead. **Back to schedule** still appears under **Status** while an override is running.

## [1.7.0] - 2026-11-22

### Changed
- The settings page is redesigned to match the Google Calendar Enhancements options page: a header with the name and version, settings grouped into cards (**Schedule**, **Pages and code**, **Indicators on matching tabs**, **Status**), and switches for the on/off settings. Light and dark mode follow the system.
- Settings save as soon as they change (text boxes when you leave them), with **Saved** shown in the header. The **Save** button is gone. Invalid values aren't saved; the hint under them says why.
- The toolbar pop-up keeps a fixed width (it opens the page as `options.html?popup`).

## [1.6.5] - 2026-11-22

### Fixed
- Turning off **Show the overlay in the page corner** (or the tab-title indicator) now always removes it from matching tabs. Before, tabs could keep their overlay if the extension had been reloaded or two refreshes overlapped.
- After the extension is reloaded or updated, or Chrome starts, overlays left in open pages by the previous copy of the extension (with buttons that did nothing) are replaced right away instead of at the next minute.

### Changed
- The settings page is styled with [Tailwind CSS](https://tailwindcss.com/). It looks the same as before, in light and dark mode. `src/options.css` is now compiled from `styles/options.tailwind.css` with `npm run build:css` (or `npm run watch:css` while editing) and committed, so the extension still loads unpacked without a build step.
- The overlay checkbox on the settings page now reads **Show the overlay in the page corner**.

## [1.6.4] - 2026-11-22

### Changed
- Hovering the overlay opens a row of icon buttons instead of the text pill and **⋯** pop-up, left to right: **Extension options**, **Sleep for 1 hour**, **Run for 1 hour**, **Back to schedule**, **Enable the normal schedule** and **Disable the normal schedule**. The state icon stays on the right.
- Each overlay button shows its name in a tooltip as soon as you hover it.
- The button for what's in effect (a running override, or else the schedule switch) is highlighted. **Back to schedule** is dimmed when no override is running.
- **Enable** and **Disable the normal schedule** turn "Executing enabled" on or off and cancel any 1-hour override.
- The time window, last execution and when an override ends are in the state icon's tooltip.

## [1.6.3] - 2026-11-22

### Fixed
- Tabs that Chrome has put to sleep (discarded by Memory Saver) are skipped instead of being reported as failures every minute. When every matching tab is asleep, the status says so.

## [1.6.2] - 2026-11-18

### Changed
- **Settings** in the overlay pop-up is a gear icon button.

## [1.6.1] - 2026-11-18

### Changed
- The overlay is back to a one-line pill that slides open on hover. A **⋯** button at the end opens a pop-up with the details and the override and Settings buttons. It closes after a button, on a click elsewhere, or on Escape.

## [1.6.0] - 2026-11-18

### Added
- **On for 1 hour**, **Off for 1 hour** and **Back to schedule** overrides, in an overlay flyout and on the settings page. Overrides sync and expire on their own. **On** runs once immediately. A small amber dot on the overlay marks a running override.
- **Settings** button in the overlay flyout.

## [1.5.0] - 2026-11-17

### Added
- Settings for the indicators: the ⏱ tab-title prefix while executing, and the corner overlay. Both on by default.

### Changed
- The overlay shows on every matching tab, with a different look for executing, waiting (outside the time window) and disabled.

## [1.4.0] - 2026-11-17

### Added
- Indicators on tabs where the executor is active: a ⏱ prefix on the tab title, and a faded badge in the corner that shows the last run on hover.

## [1.3.0] - 2026-11-17

### Added
- Code to execute is entered on the settings page and synced. It runs in each matching page like code typed into the DevTools console, can use `await`, and whatever it returns is shown as the last execution. Needs Chrome's **Allow User Scripts** switch for the extension; the settings page shows a banner when it's off.

## [1.2.1] - 2026-11-17

### Changed
- Renamed from Scheduled Poller to Scheduled Executor.

## [1.2.0] - 2026-11-17

### Added
- Settings sync across every Chrome signed in to the same account (the extension ID is pinned in the manifest). The settings page refreshes when synced changes arrive.

## [1.1.0] - 2026-11-17

### Added
- URL pattern (regular expression): code only runs in open tabs whose URL matches. The settings page checks the pattern and shows how many open tabs match.

### Changed
- The `pollUrl` setting is renamed to `url`; existing settings are migrated.

## [1.0.0] - 2026-11-17

### Added
- First version: runs every minute, only between a start and stop time (windows can cross midnight), with a settings page.
