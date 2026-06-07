/**
 * shared/dateUtils.ts
 *
 * Date and timestamp utilities for the Visited Page Tracker extension.
 *
 * Two formats are used:
 *   1. Internal storage format: "yyyy-MM-dd.hhmmss"
 *      Compact, sortable, human-readable in filenames and JSON exports.
 *      Example: "2026-01-12.101500"
 *
 *   2. Display format: "Jan 12, 2026, 10:15 AM"
 *      Locale-friendly format for the banner message.
 */

/**
 * Formats a Unix timestamp (milliseconds) as "yyyy-MM-dd.hhmmss".
 *
 * Uses local time (not UTC) so the stored value matches what the user sees
 * on their clock. This is intentional — we want timestamps to feel natural
 * to the user, not be in UTC which can be confusing.
 *
 * @param ms Unix timestamp in milliseconds
 * @returns Formatted string, e.g. "2026-01-12.101500"
 */
export function formatTimestamp(ms: number): string {
  const d = new Date(ms);

  const yyyy = d.getFullYear();
  const MM = String(d.getMonth() + 1).padStart(2, '0');
  const dd = String(d.getDate()).padStart(2, '0');
  const hh = String(d.getHours()).padStart(2, '0');
  const mm = String(d.getMinutes()).padStart(2, '0');
  const ss = String(d.getSeconds()).padStart(2, '0');

  return `${yyyy}-${MM}-${dd}.${hh}${mm}${ss}`;
}

/**
 * Parses a "yyyy-MM-dd.hhmmss" string back to a Unix timestamp (ms).
 * Returns NaN if the string is malformed.
 *
 * @param ts Formatted timestamp string
 */
export function parseTimestamp(ts: string): number {
  // Expected format: "2026-01-12.101500"
  const match = ts.match(/^(\d{4})-(\d{2})-(\d{2})\.(\d{2})(\d{2})(\d{2})$/);
  if (!match) return NaN;

  const [, yyyy, MM, dd, hh, mm, ss] = match;
  return new Date(
    Number(yyyy),
    Number(MM) - 1,
    Number(dd),
    Number(hh),
    Number(mm),
    Number(ss)
  ).getTime();
}

/**
 * Formats a Unix timestamp (ms) as a human-friendly display string.
 * Uses the browser's built-in Intl.DateTimeFormat for locale-awareness.
 *
 * Example output: "Jan 12, 2026, 10:15 AM"
 *
 * @param ms Unix timestamp in milliseconds
 * @param locale Optional BCP 47 locale tag (defaults to system locale)
 */
export function formatDisplayDate(ms: number, locale?: string): string {
  return new Intl.DateTimeFormat(locale, {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
    hour12: true,
  }).format(new Date(ms));
}

/**
 * Returns the current Unix timestamp in milliseconds.
 * Wrapped in a function to make it easy to mock in tests.
 */
export function now(): number {
  return Date.now();
}
