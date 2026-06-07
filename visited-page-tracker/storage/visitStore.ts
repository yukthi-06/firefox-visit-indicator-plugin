/**
 * storage/visitStore.ts
 *
 * Defines the VisitStore abstraction interface.
 *
 * Design rationale:
 *   Having a single interface allows the background script to be written
 *   against the abstraction, not a concrete implementation. This means we can
 *   swap between browser.storage.local (Option A) and native messaging
 *   (Option B) by changing a single line in background.ts, without touching
 *   any other code.
 *
 *   Both implementations must be functionally identical from the caller's
 *   perspective — they are interchangeable.
 */

import { VisitRecord } from '../shared/types';

/**
 * VisitStore — the storage abstraction interface.
 *
 * All methods are async (return Promises) because every storage backend
 * performs I/O which is inherently asynchronous in the browser.
 */
export interface VisitStore {
  /**
   * Retrieves the visit record for the given normalized URL.
   *
   * @param url Normalized URL string (no fragment)
   * @returns The VisitRecord if the URL has been visited before, null otherwise.
   */
  getVisit(url: string): Promise<VisitRecord | null>;

  /**
   * Creates or updates the visit record for the URL in the record.
   * The implementation is responsible for persistence.
   *
   * @param record Complete VisitRecord to persist.
   */
  saveVisit(record: VisitRecord): Promise<void>;

  /**
   * Returns all visit records as a dictionary keyed by URL.
   * Used for data export and the options page statistics.
   */
  getAllVisits(): Promise<Record<string, VisitRecord>>;

  /**
   * Replaces all stored data with the provided records.
   * Used for data import. The implementation must clear existing data first.
   *
   * @param records Dictionary of URL → VisitRecord to import.
   */
  importVisits(records: Record<string, VisitRecord>): Promise<void>;

  /**
   * Deletes all stored visit records.
   * Should prompt for confirmation at the UI layer before calling this.
   */
  clearAll(): Promise<void>;
}
