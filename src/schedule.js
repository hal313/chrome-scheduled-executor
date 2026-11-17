// Pure time-window helpers. No chrome.* APIs here, so they can be unit tested in Node.

/**
 * Parse "HH:MM" (24h) into minutes since midnight. Returns null if invalid.
 * @param {string} hhmm
 * @returns {number|null}
 */
export function parseTime(hhmm) {
  if (typeof hhmm !== 'string') return null;
  const m = /^(\d{1,2}):(\d{2})$/.exec(hhmm.trim());
  if (!m) return null;
  const h = Number(m[1]);
  const min = Number(m[2]);
  if (h > 23 || min > 59) return null;
  return h * 60 + min;
}

/**
 * Is `date` (local time) inside the [start, stop) window?
 *
 * - start < stop: a normal same-day window, e.g. 09:00-17:00.
 * - start > stop: the window crosses midnight, e.g. 22:00-06:00.
 * - start == stop: treated as "all day".
 *
 * The start minute is included and the stop minute is excluded, so a 09:00-17:00
 * window polls at 09:00 and 16:59 but not at 17:00.
 *
 * @param {Date} date
 * @param {string} startHHMM
 * @param {string} stopHHMM
 * @returns {boolean}
 */
export function isWithinWindow(date, startHHMM, stopHHMM) {
  const start = parseTime(startHHMM);
  const stop = parseTime(stopHHMM);
  if (start === null || stop === null) return false;

  const now = date.getHours() * 60 + date.getMinutes();

  if (start === stop) return true;
  if (start < stop) return now >= start && now < stop;
  return now >= start || now < stop; // crosses midnight
}

/**
 * Timestamp (ms) of the start of the next whole minute after `date`.
 * Used to line the alarm up on minute boundaries.
 * @param {Date} date
 * @returns {number}
 */
export function nextMinuteBoundary(date) {
  const d = new Date(date.getTime());
  d.setSeconds(0, 0);
  d.setMinutes(d.getMinutes() + 1);
  return d.getTime();
}
