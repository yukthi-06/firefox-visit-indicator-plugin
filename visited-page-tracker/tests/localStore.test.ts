/**
 * tests/localStore.test.ts
 *
 * Unit tests for LocalStore — browser.storage.local implementation.
 *
 * We mock browser.storage.local using an in-memory Map since these tests
 * run in a Node.js/Jest environment (not a browser).
 */

import { LocalStore } from '../storage/localStore';
import { VisitRecord } from '../shared/types';

// ---------------------------------------------------------------------------
// Mock browser.storage.local
// ---------------------------------------------------------------------------

const storageMap = new Map<string, unknown>();

const mockStorage = {
  get: jest.fn(async (keys: string | string[] | null) => {
    if (keys === null) {
      // Return all
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

// Inject mock into global scope (simulating Firefox browser API)
(global as unknown as { browser: unknown }).browser = {
  storage: { local: mockStorage },
};

// ---------------------------------------------------------------------------
// Test helpers
// ---------------------------------------------------------------------------

function makeRecord(url: string, overrides: Partial<VisitRecord> = {}): VisitRecord {
  return {
    url,
    firstVisited: 1000000,
    lastVisited: 1000000,
    visitCount: 1,
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('LocalStore', () => {
  let store: LocalStore;

  beforeEach(() => {
    storageMap.clear();
    jest.clearAllMocks();
    store = new LocalStore();
  });

  // Scenario 1: First visit
  describe('getVisit — first visit', () => {
    test('returns null for never-visited URL', async () => {
      const result = await store.getVisit('https://example.com/');
      expect(result).toBeNull();
    });
  });

  // Scenario 2: Repeat visit
  describe('saveVisit + getVisit — repeat visit', () => {
    test('saves and retrieves a visit record', async () => {
      const record = makeRecord('https://example.com/page');
      await store.saveVisit(record);

      const retrieved = await store.getVisit('https://example.com/page');
      expect(retrieved).toEqual(record);
    });

    test('overwrites existing record on re-save', async () => {
      const url = 'https://example.com/page';
      const first = makeRecord(url, { visitCount: 1 });
      await store.saveVisit(first);

      const updated = makeRecord(url, { visitCount: 2, lastVisited: 2000000 });
      await store.saveVisit(updated);

      const retrieved = await store.getVisit(url);
      expect(retrieved!.visitCount).toBe(2);
      expect(retrieved!.lastVisited).toBe(2000000);
    });
  });

  // Scenario 3: Visit count increment
  describe('visitCount tracking', () => {
    test('stores arbitrary visit counts', async () => {
      const url = 'https://example.com/';
      for (let i = 1; i <= 5; i++) {
        await store.saveVisit(makeRecord(url, { visitCount: i }));
      }
      const result = await store.getVisit(url);
      expect(result!.visitCount).toBe(5);
    });
  });

  // Scenario 4: URL normalization (storage uses normalized URL as key)
  describe('URL as key', () => {
    test('different URLs are stored separately', async () => {
      await store.saveVisit(makeRecord('https://example.com/page?id=1', { visitCount: 1 }));
      await store.saveVisit(makeRecord('https://example.com/page?id=2', { visitCount: 2 }));

      const r1 = await store.getVisit('https://example.com/page?id=1');
      const r2 = await store.getVisit('https://example.com/page?id=2');

      expect(r1!.visitCount).toBe(1);
      expect(r2!.visitCount).toBe(2);
    });

    test('uses vpt: prefix in storage keys', async () => {
      await store.saveVisit(makeRecord('https://example.com/'));
      expect(storageMap.has('vpt:https://example.com/')).toBe(true);
    });
  });

  // Scenario 6: Export/Import
  describe('getAllVisits', () => {
    test('returns all stored records', async () => {
      await store.saveVisit(makeRecord('https://a.com/'));
      await store.saveVisit(makeRecord('https://b.com/'));

      const all = await store.getAllVisits();
      expect(Object.keys(all)).toHaveLength(2);
      expect(all['https://a.com/']).toBeDefined();
    });

    test('returns empty object when no records', async () => {
      const all = await store.getAllVisits();
      expect(all).toEqual({});
    });
  });

  describe('importVisits', () => {
    test('imports multiple records', async () => {
      const records = {
        'https://a.com/': makeRecord('https://a.com/', { visitCount: 3 }),
        'https://b.com/': makeRecord('https://b.com/', { visitCount: 7 }),
      };
      await store.importVisits(records);

      const a = await store.getVisit('https://a.com/');
      expect(a!.visitCount).toBe(3);

      const b = await store.getVisit('https://b.com/');
      expect(b!.visitCount).toBe(7);
    });
  });

  describe('clearAll', () => {
    test('removes all visit records', async () => {
      await store.saveVisit(makeRecord('https://a.com/'));
      await store.saveVisit(makeRecord('https://b.com/'));
      await store.clearAll();

      const all = await store.getAllVisits();
      expect(Object.keys(all)).toHaveLength(0);
    });

    test('does not remove non-visit keys', async () => {
      // Add a settings key that should not be deleted
      storageMap.set('vpt_settings', { enableBanner: true });
      await store.saveVisit(makeRecord('https://a.com/'));
      await store.clearAll();

      // Settings key should still exist
      expect(storageMap.has('vpt_settings')).toBe(true);
    });
  });
});
