/**
 * storage/localStore.ts
 *
 * Option A: browser.storage.local implementation of VisitStore.
 *
 * Design rationale:
 *   browser.storage.local provides:
 *     - Unlimited storage (unlike storage.sync's 100KB limit)
 *     - Synchronous-feeling async API
 *     - Automatic persistence across browser restarts
 *     - O(1) key lookups — we use the URL as the storage key directly
 *
 *   We prefix each key with "vpt:" (Visited Page Tracker) to avoid
 *   collisions with any future keys we add (e.g., settings).
 *
 *   Performance note for 100,000+ URLs:
 *     Each URL is stored as its own key. browser.storage.local uses IndexedDB
 *     under the hood, so individual key lookups are O(log N) at worst.
 *     We never do a full scan during normal operation.
 */

import { VisitRecord } from '../shared/types';
import { VisitStore } from './visitStore';

/** Key prefix to namespace visit records within browser.storage.local */
const VISIT_KEY_PREFIX = 'vpt:';

/** Converts a URL to its storage key */
function toKey(url: string): string {
  return `${VISIT_KEY_PREFIX}${url}`;
}

/** Strips the prefix from a storage key to recover the URL */
function fromKey(key: string): string {
  return key.startsWith(VISIT_KEY_PREFIX) ? key.slice(VISIT_KEY_PREFIX.length) : key;
}

export class LocalStore implements VisitStore {
  /**
   * Retrieves a single VisitRecord from browser.storage.local.
   * Returns null if the URL has never been visited.
   */
  async getVisit(url: string): Promise<VisitRecord | null> {
    const key = toKey(url);
    const result = await browser.storage.local.get(key);
    return (result[key] as VisitRecord) ?? null;
  }

  /**
   * Saves a VisitRecord to browser.storage.local.
   * Uses the URL as the key, prefixed with VISIT_KEY_PREFIX.
   */
  async saveVisit(record: VisitRecord): Promise<void> {
    const key = toKey(record.url);
    await browser.storage.local.set({ [key]: record });
  }

  /**
   * Returns all visit records.
   *
   * Implementation: We fetch everything from storage and filter by prefix.
   * This is only called for export/import, not in the hot path.
   * For 100K records this will be slow but is acceptable for a one-off operation.
   *
   * Future optimization: maintain a separate index key with all URLs.
   */
  async getAllVisits(): Promise<Record<string, VisitRecord>> {
    const all = await browser.storage.local.get(null);
    const result: Record<string, VisitRecord> = {};

    for (const [key, value] of Object.entries(all)) {
      if (key.startsWith(VISIT_KEY_PREFIX)) {
        const url = fromKey(key);
        result[url] = value as VisitRecord;
      }
    }

    return result;
  }

  /**
   * Imports visit records, merging with existing data.
   * Records from the import file take precedence on conflict.
   *
   * We do NOT clear first — we merge, so users don't accidentally
   * wipe their current history during a partial import.
   */
  async importVisits(records: Record<string, VisitRecord>): Promise<void> {
    const toStore: Record<string, VisitRecord> = {};
    for (const [url, record] of Object.entries(records)) {
      toStore[toKey(url)] = record;
    }
    await browser.storage.local.set(toStore);
  }

  /**
   * Removes all visit records from browser.storage.local.
   * Also removes the VISIT_KEY_PREFIX-prefixed keys only, not settings.
   */
  async clearAll(): Promise<void> {
    const all = await browser.storage.local.get(null);
    const keysToRemove = Object.keys(all).filter((k) => k.startsWith(VISIT_KEY_PREFIX));
    if (keysToRemove.length > 0) {
      await browser.storage.local.remove(keysToRemove);
    }
  }
}
