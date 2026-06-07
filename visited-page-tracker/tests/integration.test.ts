/**
 * tests/integration.test.ts
 *
 * Integration tests simulating the full visit tracking flow.
 *
 * These tests exercise the interaction between the URL normalization,
 * storage layer, and visit processing logic as they work together.
 * We simulate the background script's processVisit() logic here.
 */

import { LocalStore } from '../storage/localStore';
import { normalizeUrl } from '../shared/urlUtils';
import { VisitRecord } from '../shared/types';

// ---------------------------------------------------------------------------
// Mock browser.storage.local (same as localStore.test.ts)
// ---------------------------------------------------------------------------

const storageMap = new Map<string, unknown>();

const mockStorage = {
  get: jest.fn(async (keys: string | string[] | null) => {
    if (keys === null) {
      const result: Record<string, unknown> = {};
      storageMap.forEach((v, k) => { result[k] = v; });
      return result;
    }
    const keyList = typeof keys === 'string' ? [keys] : keys;
    const result: Record<string, unknown> = {};
    for (const k of keyList) {
      if (storageMap.has(k)) result[k] = storageMap.get(k);
    }
    return result;
  }),
  set: jest.fn(async (items: Record<string, unknown>) => {
    Object.entries(items).forEach(([k, v]) => storageMap.set(k, v));
  }),
  remove: jest.fn(async (keys: string | string[]) => {
    const keyList = typeof keys === 'string' ? [keys] : keys;
    keyList.forEach((k) => storageMap.delete(k));
  }),
};

(global as unknown as { browser: unknown }).browser = {
  storage: { local: mockStorage },
};

// ---------------------------------------------------------------------------
// Simulate the background script's processVisit() logic
// ---------------------------------------------------------------------------

async function processVisit(store: LocalStore, rawUrl: string, timestamp: number): Promise<VisitRecord> {
  const url = normalizeUrl(rawUrl);
  const existing = await store.getVisit(url);

  let record: VisitRecord;
  if (existing) {
    record = {
      ...existing,
      lastVisited: timestamp,
      visitCount: existing.visitCount + 1,
    };
  } else {
    record = {
      url,
      firstVisited: timestamp,
      lastVisited: timestamp,
      visitCount: 1,
    };
  }

  await store.saveVisit(record);
  return record;
}

// ---------------------------------------------------------------------------
// Integration tests
// ---------------------------------------------------------------------------

describe('Full visit tracking flow', () => {
  let store: LocalStore;

  beforeEach(() => {
    storageMap.clear();
    jest.clearAllMocks();
    store = new LocalStore();
  });

  // Scenario 1: First visit
  test('Scenario 1: First visit creates record with visitCount = 1', async () => {
    const record = await processVisit(store, 'https://example.com/page', 1000);

    expect(record.url).toBe('https://example.com/page');
    expect(record.visitCount).toBe(1);
    expect(record.firstVisited).toBe(1000);
    expect(record.lastVisited).toBe(1000);
  });

  // Scenario 2: Repeat visit
  test('Scenario 2: Repeat visit returns previous lastVisited before updating', async () => {
    // First visit
    await processVisit(store, 'https://example.com/page', 1000);

    // Check state before second visit
    const beforeSecond = await store.getVisit('https://example.com/page');
    expect(beforeSecond!.lastVisited).toBe(1000);
    expect(beforeSecond!.visitCount).toBe(1);

    // Second visit
    const record = await processVisit(store, 'https://example.com/page', 2000);
    expect(record.lastVisited).toBe(2000);
    expect(record.visitCount).toBe(2);
    // firstVisited unchanged
    expect(record.firstVisited).toBe(1000);
  });

  // Scenario 3: Visit count increment
  test('Scenario 3: Visit count increments correctly over 10 visits', async () => {
    const url = 'https://example.com/page';
    for (let i = 1; i <= 10; i++) {
      await processVisit(store, url, i * 1000);
    }

    const final = await store.getVisit(url);
    expect(final!.visitCount).toBe(10);
    expect(final!.firstVisited).toBe(1000);
    expect(final!.lastVisited).toBe(10000);
  });

  // Scenario 4: URL normalization
  test('Scenario 4: URLs with fragments are treated as the same URL', async () => {
    await processVisit(store, 'https://example.com/page?id=1#section1', 1000);
    await processVisit(store, 'https://example.com/page?id=1#section2', 2000);
    await processVisit(store, 'https://example.com/page?id=1', 3000);

    // All three should map to the same normalized URL
    const record = await store.getVisit('https://example.com/page?id=1');
    expect(record!.visitCount).toBe(3);
  });

  test('Scenario 4: Different query strings are treated as different URLs', async () => {
    await processVisit(store, 'https://example.com/search?q=cats', 1000);
    await processVisit(store, 'https://example.com/search?q=dogs', 1000);

    const cats = await store.getVisit('https://example.com/search?q=cats');
    const dogs = await store.getVisit('https://example.com/search?q=dogs');

    expect(cats!.visitCount).toBe(1);
    expect(dogs!.visitCount).toBe(1);
  });

  // Scenario 5: SPA route changes
  test('Scenario 5: SPA navigation between routes creates separate records', async () => {
    // Simulate SPA navigation: same domain, different paths
    await processVisit(store, 'https://spa.example.com/', 1000);
    await processVisit(store, 'https://spa.example.com/dashboard', 2000);
    await processVisit(store, 'https://spa.example.com/settings', 3000);

    // Navigate back to home (repeat visit)
    await processVisit(store, 'https://spa.example.com/', 4000);

    const home = await store.getVisit('https://spa.example.com/');
    const dashboard = await store.getVisit('https://spa.example.com/dashboard');
    const settings = await store.getVisit('https://spa.example.com/settings');

    expect(home!.visitCount).toBe(2);
    expect(dashboard!.visitCount).toBe(1);
    expect(settings!.visitCount).toBe(1);
  });

  // Scenario 6: Data export / import
  test('Scenario 6: Export and import round-trips correctly', async () => {
    // Create some visit data
    await processVisit(store, 'https://example.com/', 1000);
    await processVisit(store, 'https://other.com/', 2000);
    await processVisit(store, 'https://example.com/', 3000);

    // Export
    const exported = await store.getAllVisits();
    expect(Object.keys(exported)).toHaveLength(2);

    // Clear and import into fresh store
    await store.clearAll();
    const allAfterClear = await store.getAllVisits();
    expect(Object.keys(allAfterClear)).toHaveLength(0);

    await store.importVisits(exported);
    const allAfterImport = await store.getAllVisits();
    expect(Object.keys(allAfterImport)).toHaveLength(2);

    const example = await store.getVisit('https://example.com/');
    expect(example!.visitCount).toBe(2);
  });

  // Page reloads (same URL, multiple calls)
  test('Page reload increments count each time', async () => {
    const url = 'https://example.com/news';
    await processVisit(store, url, 1000); // visit 1
    await processVisit(store, url, 2000); // reload = visit 2

    const record = await store.getVisit(url);
    expect(record!.visitCount).toBe(2);
  });

  // Browser restart simulation
  test('Browser restart: persisted data survives (storage not cleared between calls)', async () => {
    // Simulate "before restart"
    await processVisit(store, 'https://persisted.com/', 1000);

    // Simulate "after restart" — create a new store instance (new background worker)
    const store2 = new LocalStore();
    const record = await store2.getVisit('https://persisted.com/');

    // Data should still be there (storageMap is module-level, simulating persistence)
    expect(record).not.toBeNull();
    expect(record!.visitCount).toBe(1);
  });
});
