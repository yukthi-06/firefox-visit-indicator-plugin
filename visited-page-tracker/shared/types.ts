/**
 * shared/types.ts
 *
 * Central type definitions shared across background, content scripts, options,
 * and storage layers. Keeping all types here prevents circular imports and
 * ensures the entire extension agrees on data shapes.
 */

// ---------------------------------------------------------------------------
// Core Data Model
// ---------------------------------------------------------------------------

/**
 * VisitRecord represents the persisted metadata for a single normalized URL.
 * Timestamps are stored as Unix epoch milliseconds for easy arithmetic,
 * but formatted as "yyyy-MM-dd.hhmmss" when displayed to the user.
 */
export interface VisitRecord {
  /** Normalized URL (no fragment, preserves protocol/path/query) */
  url: string;

  /** Unix timestamp (ms) of the very first visit */
  firstVisited: number;

  /** Unix timestamp (ms) of the most recent visit */
  lastVisited: number;

  /** Total number of times this URL has been visited */
  visitCount: number;
}

// ---------------------------------------------------------------------------
// Extension Settings
// ---------------------------------------------------------------------------

/**
 * UserSettings controls the user-configurable behaviour of the extension.
 * Persisted via browser.storage.sync so settings follow the user across devices.
 */
export interface UserSettings {
  /** Whether to show the "last visited" banner on repeat visits */
  enableBanner: boolean;

  /** Whether to apply the subtle background tint overlay */
  enableHighlight: boolean;

  /**
   * CSS color value for the overlay tint.
   * Should be a low-opacity rgba value to avoid obscuring content.
   * Default: "rgba(255,255,0,0.03)"
   */
  highlightColor: string;

  /**
   * Storage backend selection.
   * "local"  = browser.storage.local (Option A, default)
   * "native" = Native Messaging Host (Option B, advanced)
   */
  storageBackend: 'local' | 'native';
}

/** Factory that returns default settings — used on first install */
export function defaultSettings(): UserSettings {
  return {
    enableBanner: true,
    enableHighlight: true,
    highlightColor: 'rgba(255,255,0,0.03)',
    storageBackend: 'local',
  };
}

// ---------------------------------------------------------------------------
// Message Protocol (Content Script <-> Background Service Worker)
// ---------------------------------------------------------------------------

/**
 * Message sent by the content script to ask the background worker for the
 * visit record of the current normalized URL.
 */
export interface GetVisitInfoMessage {
  type: 'GET_VISIT_INFO';
  url: string;
}

/**
 * Message sent by the content script to notify the background worker that
 * the user just (re-)visited a URL.  The background worker handles the
 * read-modify-write atomically so the content script stays stateless.
 */
export interface UpdateVisitMessage {
  type: 'UPDATE_VISIT';
  url: string;
}

// ---------------------------------------------------------------------------
// Options Page Message Protocol (Options Page <-> Background Service Worker)
// ---------------------------------------------------------------------------

/** Options page requests the current settings object */
export interface GetSettingsMessage {
  type: 'GET_SETTINGS';
}

/** Options page sends updated settings to persist */
export interface SaveSettingsMessage {
  type: 'SAVE_SETTINGS';
  settings: UserSettings;
}

/** Options page requests all visit records for export */
export interface ExportDataMessage {
  type: 'EXPORT_DATA';
}

/** Options page sends imported records to persist */
export interface ImportDataMessage {
  type: 'IMPORT_DATA';
  records: Record<string, VisitRecord>;
}

/** Options page requests all visit history be deleted */
export interface ClearDataMessage {
  type: 'CLEAR_DATA';
}

/**
 * Union type for ALL messages the background worker accepts —
 * from both content scripts and the options page.
 */
export type ExtensionMessage =
  | GetVisitInfoMessage
  | UpdateVisitMessage
  | GetSettingsMessage
  | SaveSettingsMessage
  | ExportDataMessage
  | ImportDataMessage
  | ClearDataMessage;

// ---------------------------------------------------------------------------
// Message Responses
// ---------------------------------------------------------------------------

/**
 * Response to GET_VISIT_INFO.
 * `record` is null if the URL has never been visited before.
 * `settings` is always present so the content script can decide whether to
 * render the banner / overlay without a second round-trip.
 */
export interface VisitInfoResponse {
  record: VisitRecord | null;
  settings: UserSettings;
}

/**
 * Response to UPDATE_VISIT.
 * Returns the newly saved record so the caller can confirm success.
 */
export interface UpdateVisitResponse {
  success: boolean;
  record: VisitRecord;
}

// ---------------------------------------------------------------------------
// Native Messaging Protocol
// ---------------------------------------------------------------------------

/** Commands sent from extension → native host */
export interface NativeGetRequest {
  command: 'get';
  url: string;
}

export interface NativeSaveRequest {
  command: 'save';
  record: VisitRecord;
}

export interface NativeGetAllRequest {
  command: 'getAll';
}

export type NativeRequest = NativeGetRequest | NativeSaveRequest | NativeGetAllRequest;

/** Responses from native host → extension */
export interface NativeGetResponse {
  success: true;
  record: VisitRecord | null;
}

export interface NativeSaveResponse {
  success: true;
}

export interface NativeGetAllResponse {
  success: true;
  records: Record<string, VisitRecord>;
}

export interface NativeErrorResponse {
  success: false;
  error: string;
}

export type NativeResponse =
  | NativeGetResponse
  | NativeSaveResponse
  | NativeGetAllResponse
  | NativeErrorResponse;
