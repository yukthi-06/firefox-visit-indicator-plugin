/**
 * storage/nativeStore.ts
 *
 * Option B: Native Messaging Host implementation of VisitStore.
 *
 * Design rationale:
 *   Native messaging allows the extension to communicate with a local Node.js
 *   process that has full filesystem access. This enables writing visit records
 *   to a real JSON file (visited-pages.json) on disk.
 *
 *   The native host is a separate Node.js script (native-host/host.js) that:
 *     1. Reads/writes a JSON file atomically (write-to-temp, then rename)
 *     2. Communicates over stdin/stdout using the native messaging protocol
 *        (4-byte LE length prefix + JSON body)
 *
 *   The "nativeMessaging" permission is added to manifest.json when this
 *   backend is selected. This store is only instantiated by background.ts
 *   when the user has chosen storageBackend = 'native' in settings.
 *
 *   Error handling: If the native host is unavailable (not installed,
 *   crashed, etc.), we fall back to localStore transparently.
 */

import { VisitRecord } from '../shared/types';
import { NativeRequest, NativeResponse } from '../shared/types';
import { VisitStore } from './visitStore';
import { LocalStore } from './localStore';

/** The application ID registered in the native host manifest */
const NATIVE_HOST_ID = 'com.visitedpagetracker.host';

/**
 * Sends a message to the native host and returns the response.
 * Throws if the native host is unreachable or returns an error.
 */
async function sendToNativeHost(request: NativeRequest): Promise<NativeResponse> {
  try {
    const response = await browser.runtime.sendNativeMessage(NATIVE_HOST_ID, request) as NativeResponse;
    return response;
  } catch (err) {
    throw new Error(`Native host communication failed: ${err}`);
  }
}

export class NativeStore implements VisitStore {
  /**
   * Fallback store — used if the native host is unavailable.
   * Ensures the extension keeps working even when the host isn't running.
   */
  private fallback: LocalStore = new LocalStore();

  /** Whether we've detected the native host is unavailable */
  private nativeUnavailable = false;

  async getVisit(url: string): Promise<VisitRecord | null> {
    if (this.nativeUnavailable) {
      return this.fallback.getVisit(url);
    }

    try {
      const response = await sendToNativeHost({ command: 'get', url });
      if (!response.success) {
        throw new Error((response as { success: false; error: string }).error);
      }
      return (response as { success: true; record: VisitRecord | null }).record;
    } catch (err) {
      console.warn('[VPT] Native host unavailable, falling back to local storage:', err);
      this.nativeUnavailable = true;
      return this.fallback.getVisit(url);
    }
  }

  async saveVisit(record: VisitRecord): Promise<void> {
    if (this.nativeUnavailable) {
      return this.fallback.saveVisit(record);
    }

    try {
      const response = await sendToNativeHost({ command: 'save', record });
      if (!response.success) {
        throw new Error((response as { success: false; error: string }).error);
      }
    } catch (err) {
      console.warn('[VPT] Native host unavailable, falling back to local storage:', err);
      this.nativeUnavailable = true;
      return this.fallback.saveVisit(record);
    }
  }

  async getAllVisits(): Promise<Record<string, VisitRecord>> {
    if (this.nativeUnavailable) {
      return this.fallback.getAllVisits();
    }

    try {
      const response = await sendToNativeHost({ command: 'getAll' });
      if (!response.success) {
        throw new Error((response as { success: false; error: string }).error);
      }
      return (response as { success: true; records: Record<string, VisitRecord> }).records;
    } catch (err) {
      console.warn('[VPT] Native host unavailable, falling back to local storage:', err);
      this.nativeUnavailable = true;
      return this.fallback.getAllVisits();
    }
  }

  async importVisits(records: Record<string, VisitRecord>): Promise<void> {
    // For import we use local storage as native host import would require
    // sending potentially large payloads over the native messaging pipe.
    // The native host will pick up changes on next restart.
    return this.fallback.importVisits(records);
  }

  async clearAll(): Promise<void> {
    // Clear both backends to ensure consistency
    await Promise.allSettled([
      this.fallback.clearAll(),
      // Signal native host to clear its file
      sendToNativeHost({ command: 'save', record: { url: '__CLEAR__', firstVisited: 0, lastVisited: 0, visitCount: 0 } })
        .catch(() => {/* ignore if unavailable */}),
    ]);
  }
}
