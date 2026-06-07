/**
 * tests/dateUtils.test.ts
 *
 * Unit tests for timestamp formatting and parsing utilities.
 */

import { formatTimestamp, parseTimestamp, formatDisplayDate } from '../shared/dateUtils';

describe('formatTimestamp', () => {
  test('formats timestamp in yyyy-MM-dd.hhmmss format', () => {
    // January 12, 2026, 10:15:00 local time
    const date = new Date(2026, 0, 12, 10, 15, 0); // month is 0-indexed
    const ts = formatTimestamp(date.getTime());
    expect(ts).toBe('2026-01-12.101500');
  });

  test('pads single-digit month with zero', () => {
    const date = new Date(2026, 5, 7, 9, 3, 5); // June 7
    const ts = formatTimestamp(date.getTime());
    expect(ts).toMatch(/^2026-06-07\.090305$/);
  });

  test('pads single-digit hours and minutes', () => {
    const date = new Date(2026, 0, 1, 0, 0, 0);
    const ts = formatTimestamp(date.getTime());
    expect(ts).toMatch(/^\d{4}-\d{2}-\d{2}\.\d{6}$/);
  });

  test('output matches format yyyy-MM-dd.hhmmss', () => {
    const ts = formatTimestamp(Date.now());
    expect(ts).toMatch(/^\d{4}-\d{2}-\d{2}\.\d{6}$/);
  });
});

describe('parseTimestamp', () => {
  test('parses formatted timestamp back to milliseconds', () => {
    const date = new Date(2026, 0, 12, 10, 15, 0);
    const ts = formatTimestamp(date.getTime());
    const parsed = parseTimestamp(ts);
    expect(parsed).toBe(date.getTime());
  });

  test('returns NaN for invalid format', () => {
    expect(parseTimestamp('not-a-timestamp')).toBeNaN();
    expect(parseTimestamp('')).toBeNaN();
    expect(parseTimestamp('2026-01-12')).toBeNaN();
  });

  test('round-trips correctly', () => {
    const original = new Date(2026, 5, 7, 12, 34, 56).getTime();
    const formatted = formatTimestamp(original);
    const reparsed = parseTimestamp(formatted);
    expect(reparsed).toBe(original);
  });
});

describe('formatDisplayDate', () => {
  test('returns a non-empty string', () => {
    const result = formatDisplayDate(Date.now());
    expect(result.length).toBeGreaterThan(0);
  });

  test('includes year, month, day components', () => {
    const date = new Date(2026, 0, 12);
    const result = formatDisplayDate(date.getTime(), 'en-US');
    expect(result).toContain('2026');
    expect(result).toContain('Jan');
    expect(result).toContain('12');
  });
});
