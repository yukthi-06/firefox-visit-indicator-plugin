/**
 * content/overlay.ts
 *
 * Renders a subtle full-page color tint overlay for previously visited pages.
 *
 * Design decisions:
 *   - Uses a fixed <div> overlay instead of modifying body/html background-color.
 *     This is critical because:
 *       a) We don't know or want to override the page's own background styles.
 *       b) A fixed overlay with pointer-events:none is completely non-intrusive.
 *       c) It works even on pages that use body background images.
 *
 *   - The default tint is rgba(255,255,0,0.03) — extremely subtle yellow.
 *     At 3% opacity it provides just enough visual differentiation without
 *     being distracting or changing the page's apparent color scheme.
 *
 *   - pointer-events:none ensures clicks, drags, and selections pass through.
 *   - z-index is set high but below the banner (2147483640 vs 2147483647).
 */

/** ID for the overlay element */
const OVERLAY_ID = 'vpt-page-overlay';

/**
 * Injects the subtle tint overlay into the page.
 *
 * @param color CSS color string, e.g. "rgba(255,255,0,0.03)"
 */
export function showOverlay(color: string): void {
  // Don't inject twice
  if (document.getElementById(OVERLAY_ID)) {
    updateOverlayColor(color);
    return;
  }

  const overlay = document.createElement('div');
  overlay.id = OVERLAY_ID;
  overlay.className = 'vpt-overlay';

  // Apply critical layout styles inline to guarantee they work
  // even if the CSS file hasn't loaded yet
  Object.assign(overlay.style, {
    position: 'fixed',
    inset: '0',
    backgroundColor: color,
    pointerEvents: 'none',
    zIndex: '2147483640',
    // Will-change hint for GPU compositing — prevents layout repaints
    willChange: 'opacity',
  });

  // Insert as first child of <html> element (not body) so it's truly behind
  // all body content. Using document.documentElement avoids being affected by
  // body overflow:hidden which could clip fixed children in some browsers.
  document.documentElement.insertBefore(overlay, document.documentElement.firstChild);
}

/**
 * Updates the color of an existing overlay.
 * Useful when the user changes the highlight color in the options page.
 */
export function updateOverlayColor(color: string): void {
  const overlay = document.getElementById(OVERLAY_ID);
  if (overlay) {
    overlay.style.backgroundColor = color;
  }
}

/**
 * Removes the overlay from the page.
 * Called by content.ts when the user navigates away (SPA) or the
 * URL is not trackable.
 */
export function removeOverlay(): void {
  const overlay = document.getElementById(OVERLAY_ID);
  if (overlay) {
    overlay.remove();
  }
}
