/**
 * background/background.ts
 *
 * Background Service Worker (Manifest V3).
 *
 * Responsibilities:
 *   1. Listen for messages from content scripts (GET_VISIT_INFO, UPDATE_VISIT)
 *   2. Perform atomic read-modify-write on the VisitStore
 *   3. Respond with visit data and current user settings
 *   4. Handle options page requests (export, import, clear)
 *
 * Why background handles storage:
 *   Content scripts run in the page's context and can be injected into many
 *   tabs simultaneously. If each tab read-and-wrote storage independently,
 *   race conditions could cause visit counts to be lost. By routing all
 *   storage through a single background service worker, we serialize writes
 *   and eliminate races.
 *
 *   The background worker also has access to browser.storage (content scripts
 *   do not in MV3 without explicit permission grants).
 *
 * Permission rationale:
 *   "storage"  — required to read/write browser.storage.local
 *   "tabs"     — required to detect tab URL changes for redirect handling
 */

import { VisitStore } from '../storage/visitStore';
import { LocalStore } from '../storage/localStore';
import { NativeStore } from '../storage/nativeStore';
import {
  ExtensionMessage,
  VisitRecord,
  VisitInfoResponse,
  UpdateVisitResponse,
  UserSettings,
  defaultSettings,
} from '../shared/types';
import { now } from '../shared/dateUtils';

// ---------------------------------------------------------------------------
// Store factory — swap between Option A and Option B here
// ---------------------------------------------------------------------------

let store: VisitStore = new LocalStore();

/**
 * Re-initializes the store based on the user's current settings.
 * Called on startup and when the user changes the storageBackend setting.
 */
async function initStore(settings: UserSettings): Promise<void> {
  if (settings.storageBackend === 'native') {
    store = new NativeStore();
    console.log('[VPT Background] Using NativeStore (Option B)');
  } else {
    store = new LocalStore();
    console.log('[VPT Background] Using LocalStore (Option A)');
  }
}

// ---------------------------------------------------------------------------
// Settings helpers
// ---------------------------------------------------------------------------

const SETTINGS_KEY = 'vpt_settings';

async function loadSettings(): Promise<UserSettings> {
  const result = await browser.storage.local.get(SETTINGS_KEY);
  if (result[SETTINGS_KEY]) {
    // Merge with defaults to handle new settings added in updates
    return { ...defaultSettings(), ...result[SETTINGS_KEY] };
  }
  return defaultSettings();
}

async function saveSettings(settings: UserSettings): Promise<void> {
  await browser.storage.local.set({ [SETTINGS_KEY]: settings });
}

// ---------------------------------------------------------------------------
// In-flight request deduplication
// ---------------------------------------------------------------------------

/**
 * Tracks URLs currently being processed to prevent duplicate writes
 * from rapid-fire messages (e.g., SPA that emits multiple navigation events).
 *
 * Key: normalized URL
 * Value: Promise resolving to the saved record
 */
const inFlight = new Map<string, Promise<VisitRecord>>();

/**
 * Atomically reads, updates, and saves a VisitRecord.
 * Uses the inFlight map to coalesce concurrent requests for the same URL.
 */
async function processVisit(url: string): Promise<VisitRecord> {
  // If this URL is already being processed (e.g., two tabs opened simultaneously),
  // wait for the existing operation instead of starting a new one.
  if (inFlight.has(url)) {
    return inFlight.get(url)!;
  }

  const promise = (async (): Promise<VisitRecord> => {
    const existing = await store.getVisit(url);
    const timestamp = now();

    let record: VisitRecord;
    if (existing) {
      // Repeat visit: increment count, update lastVisited
      record = {
        ...existing,
        lastVisited: timestamp,
        visitCount: existing.visitCount + 1,
      };
    } else {
      // First visit: create new record
      record = {
        url,
        firstVisited: timestamp,
        lastVisited: timestamp,
        visitCount: 1,
      };
    }

    await store.saveVisit(record);
    return record;
  })();

  inFlight.set(url, promise);

  try {
    return await promise;
  } finally {
    inFlight.delete(url);
  }
}

// ---------------------------------------------------------------------------
// Message handler
// ---------------------------------------------------------------------------

/**
 * Handles messages from content scripts and the options page.
 *
 * TypeScript narrows `msg` in each case branch via the discriminated union
 * on the `type` field — no explicit casts needed.
 *
 * The return value of the listener is treated as the response:
 *   - Return a Promise → Firefox awaits it and sends the resolved value
 *   - Return false     → no async response (unknown message type)
 */
browser.runtime.onMessage.addListener(
  (rawMessage: unknown, _sender, _sendResponse) => {
    // Cast to our full union. Any message from an unknown sender that doesn't
    // match a known type will fall through to the default branch.
    const msg = rawMessage as ExtensionMessage;

    switch (msg.type) {
      // ------------------------------------------------------------------
      // GET_VISIT_INFO
      // Called by content script immediately on page load.
      // Returns existing record (before this visit is recorded) + settings.
      // ------------------------------------------------------------------
      case 'GET_VISIT_INFO': {
        return (async (): Promise<VisitInfoResponse> => {
          const settings = await loadSettings();
          let isExcluded = false;
          try {
            const host = new URL(msg.url).hostname;
            isExcluded = settings.excludedSites?.includes(host) ?? false;
          } catch (e) {
            // ignore
          }

          if (isExcluded) {
            return {
              record: null,
              settings: {
                ...settings,
                enableBanner: false,
                enableHighlight: false,
              },
            };
          }

          const record = await store.getVisit(msg.url);
          return { record, settings };
        })();
      }

      // ------------------------------------------------------------------
      // UPDATE_VISIT
      // Called by content script after displaying the banner/overlay.
      // Records/increments the visit.
      // ------------------------------------------------------------------
      case 'UPDATE_VISIT': {
        return (async (): Promise<UpdateVisitResponse> => {
          const settings = await loadSettings();
          let isExcluded = false;
          try {
            const host = new URL(msg.url).hostname;
            isExcluded = settings.excludedSites?.includes(host) ?? false;
          } catch (e) {
            // ignore
          }

          if (isExcluded) {
            return { success: false, record: null as any };
          }

          const record = await processVisit(msg.url);
          return { success: true, record };
        })();
      }

      // ------------------------------------------------------------------
      // EXCLUDE_SITE
      // Adds a host/domain to the exclusion list.
      // ------------------------------------------------------------------
      case 'EXCLUDE_SITE': {
        return (async () => {
          const settings = await loadSettings();
          if (!settings.excludedSites) {
            settings.excludedSites = [];
          }
          if (!settings.excludedSites.includes(msg.host)) {
            settings.excludedSites.push(msg.host);
            await saveSettings(settings);
          }
          return { success: true };
        })();
      }

      // ------------------------------------------------------------------
      // GET_SETTINGS — options page requests current settings
      // ------------------------------------------------------------------
      case 'GET_SETTINGS': {
        return loadSettings();
      }

      // ------------------------------------------------------------------
      // SAVE_SETTINGS — options page saves updated settings
      // ------------------------------------------------------------------
      case 'SAVE_SETTINGS': {
        return (async () => {
          await saveSettings(msg.settings);
          // Re-initialize store if backend changed
          await initStore(msg.settings);
          return { success: true };
        })();
      }

      // ------------------------------------------------------------------
      // EXPORT_DATA — options page requests all visit records
      // ------------------------------------------------------------------
      case 'EXPORT_DATA': {
        return store.getAllVisits();
      }

      // ------------------------------------------------------------------
      // IMPORT_DATA — options page sends imported records
      // ------------------------------------------------------------------
      case 'IMPORT_DATA': {
        return store.importVisits(msg.records).then(() => ({ success: true }));
      }

      // ------------------------------------------------------------------
      // CLEAR_DATA — options page requests data wipe
      // ------------------------------------------------------------------
      case 'CLEAR_DATA': {
        return store.clearAll().then(() => ({ success: true }));
      }

      default: {
        // `msg` is `never` here if all union members are handled above.
        // Cast to `{ type?: string }` to safely log the unknown type.
        const unknown = rawMessage as { type?: string };
        console.warn('[VPT Background] Unknown message type:', unknown.type);
        return false;
      }
    }
  }
);

// ---------------------------------------------------------------------------
// Extension lifecycle
// ---------------------------------------------------------------------------

/** Initialize on service worker startup */
(async () => {
  const settings = await loadSettings();
  await initStore(settings);
  console.log('[VPT Background] Service worker started. Backend:', settings.storageBackend);
})();

/** Re-initialize when the extension is updated */
browser.runtime.onInstalled.addListener(async (details) => {
  const settings = await loadSettings();
  await initStore(settings);

  if (details.reason === 'install') {
    console.log('[VPT Background] Extension installed for the first time.');
    // Open options page on first install so user can configure it
    browser.runtime.openOptionsPage();
  } else if (details.reason === 'update') {
    console.log('[VPT Background] Extension updated from', details.previousVersion);
  }
});
