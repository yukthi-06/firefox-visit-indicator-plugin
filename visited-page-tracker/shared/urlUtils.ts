/**
 * shared/urlUtils.ts
 *
 * URL normalization utilities.
 *
 * Design rationale:
 *   - We strip the fragment (#hash) because fragments are client-side only and
 *     do not change the server-side resource being accessed.
 *   - We preserve query strings because ?id=1 and ?id=2 are distinct pages.
 *   - We preserve protocol (http vs https) as they can serve different content.
 *   - We preserve path exactly to avoid false matches between /page and /page/.
 *
 * Using the built-in URL constructor ensures correct parsing of edge cases
 * (international domain names, percent-encoded characters, etc.).
 */

/**
 * Normalizes a URL for use as a datastore key.
 *
 * Rules:
 *   1. Strip the fragment/hash component.
 *   2. Preserve protocol, hostname, port, path, and query string.
 *   3. Return the original string if parsing fails (e.g., data: or blob: URLs).
 *
 * @example
 * normalizeUrl("https://example.com/page?id=1#section")
 * // → "https://example.com/page?id=1"
 *
 * normalizeUrl("https://example.com/page#top")
 * // → "https://example.com/page"
 */
export function normalizeUrl(rawUrl: string): string {
  try {
    const parsed = new URL(rawUrl);

    // Remove the fragment — this is the primary normalization step.
    parsed.hash = '';

    // Return the reconstructed URL string.
    // URL.toString() always includes the trailing colon after protocol,
    // and omits default ports (80 for http, 443 for https).
    return parsed.toString();
  } catch {
    // Malformed URL (e.g., "about:blank", "moz-extension://...").
    // Return as-is; the caller decides whether to track it.
    return rawUrl;
  }
}

/**
 * Determines whether a URL is one the extension should track.
 *
 * We exclude:
 *   - about:* pages (Firefox internals)
 *   - moz-extension:* pages (our own options page)
 *   - file:* pages (local files — optional: could be enabled later)
 *   - data: and blob: URLs (generated content, not stable addresses)
 *   - chrome:* and chrome-extension:* (Chromium internals, shouldn't appear in FF)
 *
 * @param url Already-normalized URL string.
 */
export function isTrackableUrl(url: string): boolean {
  try {
    const parsed = new URL(url);
    const untrackedSchemes = ['about:', 'moz-extension:', 'data:', 'blob:', 'chrome:', 'chrome-extension:', 'file:'];
    return !untrackedSchemes.some((scheme) => parsed.protocol === scheme.replace(':', ':'));
  } catch {
    return false;
  }
}

/**
 * More precise check using startsWith for protocol matching.
 */
export function isTrackableUrlSafe(url: string): boolean {
  const untrackedPrefixes = [
    'about:',
    'moz-extension://',
    'data:',
    'blob:',
    'chrome://',
    'chrome-extension://',
    'file://',
    'javascript:',
    'view-source:',
  ];
  return !untrackedPrefixes.some((prefix) => url.startsWith(prefix));
}

/**
 * Checks if a URL matches any of the patterns in the excluded list.
 * Supports exact matches, wildcards (using *), and regex patterns (starting and ending with /).
 */
export function isUrlExcluded(url: string, excludedList: string[] | undefined): boolean {
  if (!excludedList || excludedList.length === 0) return false;

  let hostname = '';
  try {
    hostname = new URL(url).hostname;
  } catch (e) {
    // If it's not a valid URL, match string as-is
  }

  for (const pattern of excludedList) {
    const trimmed = pattern.trim();
    if (!trimmed) continue;

    // 1. Regex pattern check (e.g. /regex/flags)
    const regexMatch = trimmed.match(/^\/(.+)\/([a-z]*)$/i);
    if (regexMatch) {
      try {
        const regex = new RegExp(regexMatch[1], regexMatch[2]);
        if (regex.test(url) || (hostname && regex.test(hostname))) {
          return true;
        }
      } catch (e) {
        // Fallback if compilation fails
      }
    }

    // 2. Wildcard check (contains *)
    if (trimmed.includes('*')) {
      try {
        const escaped = trimmed.replace(/[-\/\\^$*+?.()|[\]{}]/g, (char) => {
          if (char === '*') return '*';
          return '\\' + char;
        });
        const regexStr = '^' + escaped.replace(/\*/g, '.*') + '$';
        const regex = new RegExp(regexStr, 'i');
        if (regex.test(url) || (hostname && regex.test(hostname))) {
          return true;
        }
      } catch (e) {
        // Fallback
      }
    }

    // 3. Exact match check
    const lowerTrimmed = trimmed.toLowerCase();
    if (url.toLowerCase() === lowerTrimmed || (hostname && hostname.toLowerCase() === lowerTrimmed)) {
      return true;
    }
  }

  return false;
}
