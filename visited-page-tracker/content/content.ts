/**
 * content/content.ts
 *
 * Content Script — the entry point injected into every web page.
 *
 * Responsibilities:
 *   1. Normalize the current page URL
 *   2. Request visit info from the background service worker
 *   3. Render banner and overlay if applicable
 *   4. Detect SPA navigation (pushState, replaceState, popstate)
 *   5. Re-run visit check on SPA route changes
 *
 * Performance:
 *   - No storage access — all I/O is delegated to the background worker
 *   - The background request is made asynchronously; the page renders normally
 *   - Banner/overlay injection is deferred to `requestAnimationFrame` to
 *     avoid blocking the main thread during critical page load
 *
 * SPA Navigation Detection:
 *   SPAs use history.pushState / replaceState to navigate without a full
 *   page reload. We patch these methods on the window object and also listen
 *   for the `popstate` event (fired on browser back/forward).
 *
 *   We compare the new URL to the last checked URL to avoid re-running
 *   the visit check if the URL hasn't actually changed (e.g., pushState
 *   called with the same URL, or hash-only change without fragment tracking).
 */

import { normalizeUrl, isTrackableUrlSafe } from '../shared/urlUtils';
import { VisitInfoResponse } from '../shared/types';
import { showBanner, removeBanner } from './banner';
import { showOverlay, removeOverlay } from './overlay';

// ---------------------------------------------------------------------------
// Guards: prevent multiple injections on the same page
// ---------------------------------------------------------------------------

/** The last URL we ran a visit check for */
let lastCheckedUrl = '';

/** Whether the script is currently processing a visit check */
let isProcessing = false;

// ---------------------------------------------------------------------------
// Core visit check
// ---------------------------------------------------------------------------

/**
 * Main function: normalizes URL, queries background, renders UI.
 *
 * This is called:
 *   1. On initial page load (DOMContentLoaded)
 *   2. On SPA navigation (pushState/replaceState/popstate)
 */
async function checkVisit(rawUrl: string): Promise<void> {
  const url = normalizeUrl(rawUrl);

  // Skip if this URL was already checked this session (prevents duplicate
  // checks from multiple navigation events firing for the same URL)
  if (url === lastCheckedUrl) return;
  if (isProcessing) return;

  // Skip non-trackable URLs (about:, moz-extension:, etc.)
  if (!isTrackableUrlSafe(url)) return;

  isProcessing = true;
  lastCheckedUrl = url;

  try {
    // Remove any previous banner/overlay from a prior SPA route
    removeBanner();
    removeOverlay();

    // ------------------------------------------------------------------
    // Step 1: Query background for existing record + current settings
    //         This returns the PREVIOUS visit state BEFORE incrementing.
    // ------------------------------------------------------------------
    const response = await browser.runtime.sendMessage({
      type: 'GET_VISIT_INFO',
      url,
    }) as VisitInfoResponse;

    const { record: existingRecord, settings } = response;

    // Check if the current hostname is excluded from tracking
    const isExcluded = settings.excludedSites?.includes(window.location.hostname) ?? false;
    if (isExcluded) {
      return;
    }

    // ------------------------------------------------------------------
    // Step 2: Render UI if this is a repeat visit
    //         We show the banner/overlay BEFORE updating the record
    //         so the displayed "last visited" timestamp is the PREVIOUS visit.
    // ------------------------------------------------------------------
    if (existingRecord !== null) {
      // Schedule UI injection on the next animation frame to minimize
      // layout thrash and avoid blocking page rendering
      requestAnimationFrame(() => {
        if (settings.enableBanner) {
          showBanner(existingRecord);
        }
        if (settings.enableHighlight) {
          showOverlay(settings.highlightColor);
        }
      });
    }

    // ------------------------------------------------------------------
    // Step 3: Update the visit record in background storage
    //         This happens regardless of whether it's a first or repeat visit
    // ------------------------------------------------------------------
    await browser.runtime.sendMessage({
      type: 'UPDATE_VISIT',
      url,
    });

  } catch (err) {
    console.error('[VPT Content] Error during visit check:', err);
  } finally {
    isProcessing = false;
  }
}

// ---------------------------------------------------------------------------
// SPA Navigation Patching
// ---------------------------------------------------------------------------

/**
 * Patches history.pushState and history.replaceState to detect SPA navigation.
 *
 * These methods don't fire any events by default, so we wrap them to emit
 * a custom 'vpt:urlchange' event that our listener can react to.
 *
 * This is the standard technique used by analytics and tracking tools.
 * We apply it carefully to avoid breaking the original methods.
 */
function patchHistoryMethods(): void {
  const originalPushState = history.pushState.bind(history);
  const originalReplaceState = history.replaceState.bind(history);

  history.pushState = function (state, title, url) {
    originalPushState(state, title, url);
    window.dispatchEvent(new CustomEvent('vpt:urlchange', { detail: { url: window.location.href } }));
  };

  history.replaceState = function (state, title, url) {
    originalReplaceState(state, title, url);
    window.dispatchEvent(new CustomEvent('vpt:urlchange', { detail: { url: window.location.href } }));
  };
}

// ---------------------------------------------------------------------------
// Event Listeners
// ---------------------------------------------------------------------------

/**
 * Listen for our custom URL change event (from pushState/replaceState patches)
 * and for the native popstate event (browser back/forward).
 *
 * We use a small debounce (100ms) to handle cases where SPAs call pushState
 * multiple times in rapid succession during a single navigation.
 */
let spaDebounceTimer: ReturnType<typeof setTimeout> | null = null;

function onUrlChange(): void {
  if (spaDebounceTimer) clearTimeout(spaDebounceTimer);
  spaDebounceTimer = setTimeout(() => {
    checkVisit(window.location.href);
  }, 100);
}

window.addEventListener('vpt:urlchange', onUrlChange);
window.addEventListener('popstate', onUrlChange);

// ---------------------------------------------------------------------------
// Initial page load
// ---------------------------------------------------------------------------

/**
 * Run the visit check when the DOM is ready.
 * Using DOMContentLoaded (not load) to catch visits before heavy resources load.
 *
 * If the script was injected after DOMContentLoaded has already fired
 * (which can happen in some MV3 scenarios), run immediately.
 */
function init(): void {
  patchHistoryMethods();
  checkVisit(window.location.href);
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', init, { once: true });
} else {
  // DOM already ready (script injected late)
  init();
}
