/**
 * tests/urlUtils.test.ts
 *
 * Unit tests for URL normalization utilities.
 */

import { normalizeUrl, isTrackableUrlSafe } from '../shared/urlUtils';

describe('normalizeUrl', () => {
  test('removes fragment from URL', () => {
    expect(normalizeUrl('https://example.com/page?id=1#section'))
      .toBe('https://example.com/page?id=1');
  });

  test('removes fragment-only hash', () => {
    expect(normalizeUrl('https://example.com/page#top'))
      .toBe('https://example.com/page');
  });

  test('preserves query string', () => {
    expect(normalizeUrl('https://example.com/search?q=test&page=2'))
      .toBe('https://example.com/search?q=test&page=2');
  });

  test('preserves protocol (https)', () => {
    expect(normalizeUrl('https://example.com/')).toContain('https:');
  });

  test('preserves protocol (http)', () => {
    expect(normalizeUrl('http://example.com/')).toContain('http:');
  });

  test('preserves path', () => {
    expect(normalizeUrl('https://example.com/some/deep/path'))
      .toBe('https://example.com/some/deep/path');
  });

  test('handles URL with no path', () => {
    expect(normalizeUrl('https://example.com')).toBe('https://example.com/');
  });

  test('handles URL with no fragment already', () => {
    expect(normalizeUrl('https://example.com/page?id=1'))
      .toBe('https://example.com/page?id=1');
  });

  test('returns original string for malformed URL', () => {
    expect(normalizeUrl('not-a-url')).toBe('not-a-url');
  });

  test('handles international domain names', () => {
    const result = normalizeUrl('https://münchen.de/page#hash');
    expect(result).not.toContain('#hash');
  });

  test('preserves port number', () => {
    expect(normalizeUrl('https://example.com:8080/path#hash'))
      .toBe('https://example.com:8080/path');
  });
});

describe('isTrackableUrlSafe', () => {
  test('tracks https URLs', () => {
    expect(isTrackableUrlSafe('https://example.com/page')).toBe(true);
  });

  test('tracks http URLs', () => {
    expect(isTrackableUrlSafe('http://example.com/page')).toBe(true);
  });

  test('does not track about: URLs', () => {
    expect(isTrackableUrlSafe('about:blank')).toBe(false);
    expect(isTrackableUrlSafe('about:newtab')).toBe(false);
  });

  test('does not track moz-extension: URLs', () => {
    expect(isTrackableUrlSafe('moz-extension://abc/options/options.html')).toBe(false);
  });

  test('does not track data: URLs', () => {
    expect(isTrackableUrlSafe('data:text/html,<h1>test</h1>')).toBe(false);
  });

  test('does not track blob: URLs', () => {
    expect(isTrackableUrlSafe('blob:https://example.com/uuid')).toBe(false);
  });

  test('does not track file: URLs', () => {
    expect(isTrackableUrlSafe('file:///home/user/index.html')).toBe(false);
  });

  test('does not track javascript: URLs', () => {
    expect(isTrackableUrlSafe('javascript:void(0)')).toBe(false);
  });
});
