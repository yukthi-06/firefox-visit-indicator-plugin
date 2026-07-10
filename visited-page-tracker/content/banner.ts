/**
 * content/banner.ts
 *
 * Renders the "You last visited this page on..." banner.
 *
 * Design decisions:
 *   - The banner is injected as a <div> directly into the page's <body>,
 *     not into a shadow DOM, to ensure it overlays above all content.
 *   - We use inline styles supplemented by a class (vpt-banner) so the
 *     styles.css can add any additional polish while the critical layout
 *     properties are guaranteed even if the CSS file fails to load.
 *   - The banner uses z-index: 2147483647 (max 32-bit signed int) to sit
 *     above everything, including most modal overlays.
 *   - Dismiss only hides for the current page load (sessionStorage flag).
 *     The record is still updated — dismiss is purely cosmetic.
 *   - We push the page body down by 40px to prevent the banner from
 *     obscuring page content. A mutation observer cleans up on dismiss.
 */

import { VisitRecord } from '../shared/types';
import { formatDisplayDate } from '../shared/dateUtils';
import { removeOverlay } from './overlay';
import { normalizeUrl } from '../shared/urlUtils';

/** ID for the banner element — ensures only one banner exists per page */
const BANNER_ID = 'vpt-visited-banner';

/** sessionStorage key used to remember that the user dismissed the banner */
const DISMISSED_KEY = 'vpt-banner-dismissed';

/**
 * Injects the visit notification banner into the page.
 *
 * @param record  The VisitRecord for the current URL.
 *                record.lastVisited is the PREVIOUS visit time (before this visit).
 *                record.visitCount is the PREVIOUS count (before incrementing).
 */
export function showBanner(record: VisitRecord): void {
  // Don't show if already dismissed this session
  if (sessionStorage.getItem(DISMISSED_KEY) === 'true') return;

  // Don't inject twice
  if (document.getElementById(BANNER_ID)) return;

  // Format the previous lastVisited timestamp for display
  // record.visitCount here is the count AS OF the previous visit
  const lastVisitDisplay = formatDisplayDate(record.lastVisited);
  // The visit count shown is what it was before this visit (+1 will be saved by background)
  const visitCountDisplay = record.visitCount;

  const banner = document.createElement('div');
  banner.id = BANNER_ID;
  banner.className = 'vpt-banner';
  banner.setAttribute('role', 'status');
  banner.setAttribute('aria-live', 'polite');

  // Banner content
  const message = document.createElement('span');
  message.className = 'vpt-banner__message';
  message.innerHTML = `
    <span class="vpt-banner__icon">🕐</span>
    <span class="vpt-banner__text">
      You last visited this page on <strong>${lastVisitDisplay}</strong>
      &nbsp;·&nbsp;
      Visit count: <strong>${visitCountDisplay}</strong>
    </span>
  `.trim();

  // Exclude button
  const excludeBtn = document.createElement('button');
  excludeBtn.className = 'vpt-banner__exclude';
  excludeBtn.setAttribute('type', 'button');
  excludeBtn.setAttribute('aria-label', 'Exclude this page from tracking');
  excludeBtn.textContent = 'Exclude this page from tracking';
  excludeBtn.addEventListener('click', async () => {
    try {
      const normalizedUrl = normalizeUrl(window.location.href);
      const host = window.location.hostname;
      await browser.runtime.sendMessage({
        type: 'EXCLUDE_SITE',
        host,
        url: normalizedUrl,
      });
      removeBanner();
      removeOverlay();
    } catch (err) {
      console.error('[VPT Banner] Error excluding page:', err);
    }
  });

  // Dismiss button
  const dismissBtn = document.createElement('button');
  dismissBtn.className = 'vpt-banner__dismiss';
  dismissBtn.setAttribute('type', 'button');
  dismissBtn.setAttribute('aria-label', 'Dismiss visit notification');
  dismissBtn.textContent = '✕';
  dismissBtn.addEventListener('click', dismissBanner);

  banner.appendChild(message);
  banner.appendChild(excludeBtn);
  banner.appendChild(dismissBtn);

  // Insert at the very beginning of body to ensure top placement
  document.body.insertBefore(banner, document.body.firstChild);

  // Push body content down so the banner doesn't cover it
  applyBodyPadding(true);
}

/**
 * Hides the banner and remembers the dismissal for this page session.
 * Also removes the body padding and background color overlay added when the banner was shown.
 */
function dismissBanner(): void {
  const banner = document.getElementById(BANNER_ID);
  if (banner) {
    banner.classList.add('vpt-banner--dismissing');

    // Wait for CSS transition to complete before removing from DOM
    banner.addEventListener('transitionend', () => {
      banner.remove();
      applyBodyPadding(false);
      removeOverlay();
    }, { once: true });

    // Fallback: force remove after 400ms if transitionend never fires
    setTimeout(() => {
      if (document.getElementById(BANNER_ID)) {
        banner.remove();
        applyBodyPadding(false);
        removeOverlay();
      }
    }, 400);
  } else {
    removeOverlay();
  }

  sessionStorage.setItem(DISMISSED_KEY, 'true');
}

/** Tracks the original body padding-top so we can restore it on dismiss */
let originalBodyPaddingTop = '';

/**
 * Adjusts the document body's padding-top to compensate for the fixed banner.
 * This prevents the banner from overlapping page content.
 *
 * @param apply true = add padding, false = restore original
 */
function applyBodyPadding(apply: boolean): void {
  if (apply) {
    originalBodyPaddingTop = document.body.style.paddingTop || '';
    const currentPadding = parseInt(getComputedStyle(document.body).paddingTop, 10) || 0;
    document.body.style.paddingTop = `${currentPadding + 40}px`;
  } else {
    document.body.style.paddingTop = originalBodyPaddingTop;
  }
}

/**
 * Removes the banner and clears session state.
 * Called by content.ts when the SPA navigates to a new URL so the banner
 * can be re-evaluated for the new page.
 */
export function removeBanner(): void {
  const banner = document.getElementById(BANNER_ID);
  if (banner) {
    banner.remove();
    applyBodyPadding(false);
  }
  // Clear dismissed state so the new URL can show its own banner
  sessionStorage.removeItem(DISMISSED_KEY);
}
