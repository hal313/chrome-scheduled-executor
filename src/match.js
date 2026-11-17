// Pure URL-matching helpers. No chrome.* APIs here, so they can be unit tested in Node.

/**
 * Compile the configured `url` pattern into a case-insensitive RegExp.
 * Returns null if the pattern is empty or not a valid regular expression.
 * @param {string} pattern
 * @returns {RegExp|null}
 */
export function compilePattern(pattern) {
  if (typeof pattern !== 'string' || pattern.trim() === '') return null;
  try {
    return new RegExp(pattern.trim(), 'i');
  } catch {
    return null;
  }
}

/**
 * Does `pageUrl` match the configured pattern? The pattern is a regular
 * expression tested against the full page URL, so a bare domain such as
 * `teams\.cloud\.microsoft` matches any page on that site.
 * @param {string} pattern
 * @param {string} pageUrl
 * @returns {boolean}
 */
export function urlMatches(pattern, pageUrl) {
  const re = compilePattern(pattern);
  if (!re || typeof pageUrl !== 'string' || pageUrl === '') return false;
  return re.test(pageUrl);
}
