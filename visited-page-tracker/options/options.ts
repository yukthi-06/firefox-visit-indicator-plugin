/**
 * options/options.ts
 *
 * Logic for the extension options page.
 *
 * Handles:
 *   - Loading and saving user settings
 *   - Export (download JSON file)
 *   - Import (read uploaded JSON file)
 *   - Clear all data (with confirmation dialog)
 *   - Statistics display (URL count, total visits, tracking age)
 *   - Color picker ↔ rgba string conversion
 */

import { UserSettings, VisitRecord, defaultSettings } from '../shared/types';
import { formatDisplayDate } from '../shared/dateUtils';

// ---------------------------------------------------------------------------
// DOM element references
// ---------------------------------------------------------------------------

const enableBannerEl = document.getElementById('enable-banner') as HTMLInputElement;
const enableHighlightEl = document.getElementById('enable-highlight') as HTMLInputElement;
const storageBackendEl = document.getElementById('storage-backend') as HTMLSelectElement;
const highlightColorHexEl = document.getElementById('highlight-color-hex') as HTMLInputElement;
const highlightOpacityEl = document.getElementById('highlight-opacity') as HTMLInputElement;
const opacityValueEl = document.getElementById('opacity-value') as HTMLSpanElement;
const highlightColorSettingEl = document.getElementById('highlight-color-setting') as HTMLDivElement;
const nativeWarningEl = document.getElementById('native-warning') as HTMLDivElement;

const exportBtn = document.getElementById('export-btn') as HTMLButtonElement;
const importBtn = document.getElementById('import-btn') as HTMLButtonElement;
const importFileEl = document.getElementById('import-file') as HTMLInputElement;
const clearBtn = document.getElementById('clear-btn') as HTMLButtonElement;

const confirmDialog = document.getElementById('confirm-dialog') as HTMLDivElement;
const dialogCancel = document.getElementById('dialog-cancel') as HTMLButtonElement;
const dialogConfirm = document.getElementById('dialog-confirm') as HTMLButtonElement;

const saveStatusEl = document.getElementById('save-status') as HTMLDivElement;
const totalUrlsEl = document.getElementById('total-urls') as HTMLSpanElement;
const totalVisitsEl = document.getElementById('total-visits') as HTMLSpanElement;
const oldestVisitEl = document.getElementById('oldest-visit') as HTMLSpanElement;
const extVersionEl = document.getElementById('ext-version') as HTMLSpanElement;

// ---------------------------------------------------------------------------
// State
// ---------------------------------------------------------------------------

let currentSettings: UserSettings = defaultSettings();

// ---------------------------------------------------------------------------
// Color picker utilities
// ---------------------------------------------------------------------------

/**
 * Parses an rgba string like "rgba(255,255,0,0.03)" into components.
 * Returns null if parsing fails.
 */
function parseRgba(rgba: string): { r: number; g: number; b: number; a: number } | null {
  const match = rgba.match(/rgba?\((\d+),\s*(\d+),\s*(\d+)(?:,\s*([\d.]+))?\)/);
  if (!match) return null;
  return {
    r: parseInt(match[1], 10),
    g: parseInt(match[2], 10),
    b: parseInt(match[3], 10),
    a: parseFloat(match[4] ?? '1'),
  };
}

/**
 * Converts r,g,b to a hex color string (#rrggbb).
 */
function rgbToHex(r: number, g: number, b: number): string {
  return '#' + [r, g, b].map((v) => v.toString(16).padStart(2, '0')).join('');
}

/**
 * Converts hex color string + opacity to rgba string.
 */
function hexToRgba(hex: string, opacity: number): string {
  const r = parseInt(hex.slice(1, 3), 16);
  const g = parseInt(hex.slice(3, 5), 16);
  const b = parseInt(hex.slice(5, 7), 16);
  const a = opacity / 100;
  return `rgba(${r},${g},${b},${a})`;
}

/**
 * Syncs the color picker and opacity slider from the current rgba setting.
 */
function syncColorControls(rgba: string): void {
  const parsed = parseRgba(rgba);
  if (parsed) {
    highlightColorHexEl.value = rgbToHex(parsed.r, parsed.g, parsed.b);
    const opacityPct = Math.round(parsed.a * 100);
    highlightOpacityEl.value = String(Math.max(1, Math.min(20, opacityPct)));
    opacityValueEl.textContent = String(Math.max(1, Math.min(20, opacityPct)));
  }
}

// ---------------------------------------------------------------------------
// Settings load/save
// ---------------------------------------------------------------------------

async function loadSettings(): Promise<void> {
  try {
    const response = await browser.runtime.sendMessage({ type: 'GET_SETTINGS' }) as UserSettings;
    currentSettings = response;
  } catch {
    currentSettings = defaultSettings();
  }

  // Populate UI
  enableBannerEl.checked = currentSettings.enableBanner;
  enableHighlightEl.checked = currentSettings.enableHighlight;
  storageBackendEl.value = currentSettings.storageBackend;
  syncColorControls(currentSettings.highlightColor);

  updateHighlightColorVisibility();
  updateNativeWarningVisibility();
  loadStats();
}

async function saveSettings(): Promise<void> {
  try {
    await browser.runtime.sendMessage({ type: 'SAVE_SETTINGS', settings: currentSettings });
    showSaveStatus('✓ Settings saved', 'success');
  } catch (err) {
    showSaveStatus('✗ Error saving settings', 'error');
    console.error('[VPT Options] Save failed:', err);
  }
}

function showSaveStatus(message: string, type: 'success' | 'error'): void {
  saveStatusEl.textContent = message;
  saveStatusEl.className = `vpt-save-status vpt-save-status--${type} vpt-save-status--visible`;
  setTimeout(() => {
    saveStatusEl.className = 'vpt-save-status';
    saveStatusEl.textContent = '';
  }, 2500);
}

function updateHighlightColorVisibility(): void {
  highlightColorSettingEl.style.display = currentSettings.enableHighlight ? '' : 'none';
}

function updateNativeWarningVisibility(): void {
  nativeWarningEl.hidden = currentSettings.storageBackend !== 'native';
}

// ---------------------------------------------------------------------------
// Statistics
// ---------------------------------------------------------------------------

async function loadStats(): Promise<void> {
  try {
    const records = await browser.runtime.sendMessage({ type: 'EXPORT_DATA' }) as Record<string, VisitRecord>;
    const values = Object.values(records);

    totalUrlsEl.textContent = values.length.toLocaleString();
    totalVisitsEl.textContent = values.reduce((sum, r) => sum + r.visitCount, 0).toLocaleString();

    if (values.length > 0) {
      const oldest = Math.min(...values.map((r) => r.firstVisited));
      oldestVisitEl.textContent = formatDisplayDate(oldest);
    } else {
      oldestVisitEl.textContent = 'No visits yet';
    }
  } catch {
    totalUrlsEl.textContent = '—';
  }
}

// ---------------------------------------------------------------------------
// Export
// ---------------------------------------------------------------------------

/**
 * Produces a timestamp string in yyyyMMdd-hhmmss format for use in filenames.
 * Uses local time so the timestamp matches the user's clock.
 * Example: 20260607-151502
 */
function formatExportTimestamp(d: Date): string {
  const yyyy = d.getFullYear();
  const MM = String(d.getMonth() + 1).padStart(2, '0');
  const dd = String(d.getDate()).padStart(2, '0');
  const hh = String(d.getHours()).padStart(2, '0');
  const mm = String(d.getMinutes()).padStart(2, '0');
  const ss = String(d.getSeconds()).padStart(2, '0');
  return `${yyyy}${MM}${dd}-${hh}${mm}${ss}`;
}

async function handleExport(): Promise<void> {
  exportBtn.disabled = true;
  exportBtn.textContent = 'Exporting...';
  try {
    const records = await browser.runtime.sendMessage({ type: 'EXPORT_DATA' }) as Record<string, VisitRecord>;
    const json = JSON.stringify({ version: 1, exportedAt: new Date().toISOString(), records }, null, 2);
    const blob = new Blob([json], { type: 'application/json' });
    const url = URL.createObjectURL(blob);

    const a = document.createElement('a');
    a.href = url;
    a.download = `visited-page-tracker-export-${formatExportTimestamp(new Date())}.json`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);

    showSaveStatus(`✓ Exported ${Object.keys(records).length} records`, 'success');
  } catch (err) {
    showSaveStatus('✗ Export failed', 'error');
    console.error('[VPT Options] Export failed:', err);
  } finally {
    exportBtn.disabled = false;
    exportBtn.innerHTML = '<span>⬇️</span> Export JSON';
  }
}

// ---------------------------------------------------------------------------
// Import
// ---------------------------------------------------------------------------

function handleImport(): void {
  importFileEl.click();
}

async function handleFileSelected(event: Event): Promise<void> {
  const input = event.target as HTMLInputElement;
  const file = input.files?.[0];
  if (!file) return;

  importBtn.disabled = true;
  importBtn.textContent = 'Importing...';

  try {
    const text = await file.text();
    const data = JSON.parse(text) as { version?: number; records?: Record<string, VisitRecord> } | Record<string, VisitRecord>;

    // Support both wrapped format ({ version, records }) and raw format
    const records = 'records' in data && data.records ? data.records : data as Record<string, VisitRecord>;

    // Validate basic structure
    const valid = Object.values(records).every(
      (r) => typeof r.url === 'string' && typeof r.firstVisited === 'number' && typeof r.visitCount === 'number'
    );

    if (!valid) {
      throw new Error('Invalid import file format');
    }

    await browser.runtime.sendMessage({ type: 'IMPORT_DATA', records });
    showSaveStatus(`✓ Imported ${Object.keys(records).length} records`, 'success');
    loadStats();
  } catch (err) {
    showSaveStatus('✗ Import failed: invalid file', 'error');
    console.error('[VPT Options] Import failed:', err);
  } finally {
    importBtn.disabled = false;
    importBtn.innerHTML = '<span>⬆️</span> Import JSON';
    input.value = ''; // Reset file input
  }
}

// ---------------------------------------------------------------------------
// Clear All
// ---------------------------------------------------------------------------

function showConfirmDialog(): void {
  confirmDialog.hidden = false;
  dialogConfirm.focus();
}

function hideConfirmDialog(): void {
  confirmDialog.hidden = true;
  clearBtn.focus();
}

async function handleClearConfirmed(): Promise<void> {
  hideConfirmDialog();
  clearBtn.disabled = true;
  clearBtn.textContent = 'Clearing...';

  try {
    await browser.runtime.sendMessage({ type: 'CLEAR_DATA' });
    showSaveStatus('✓ All history cleared', 'success');
    loadStats();
  } catch (err) {
    showSaveStatus('✗ Clear failed', 'error');
    console.error('[VPT Options] Clear failed:', err);
  } finally {
    clearBtn.disabled = false;
    clearBtn.innerHTML = '<span>🗑️</span> Clear All History';
  }
}

// ---------------------------------------------------------------------------
// Event wiring
// ---------------------------------------------------------------------------

// Settings auto-save on change
enableBannerEl.addEventListener('change', () => {
  currentSettings.enableBanner = enableBannerEl.checked;
  saveSettings();
});

enableHighlightEl.addEventListener('change', () => {
  currentSettings.enableHighlight = enableHighlightEl.checked;
  updateHighlightColorVisibility();
  saveSettings();
});

storageBackendEl.addEventListener('change', () => {
  currentSettings.storageBackend = storageBackendEl.value as 'local' | 'native';
  updateNativeWarningVisibility();
  saveSettings();
});

highlightColorHexEl.addEventListener('input', () => {
  const rgba = hexToRgba(highlightColorHexEl.value, parseInt(highlightOpacityEl.value, 10));
  currentSettings.highlightColor = rgba;
  saveSettings();
});

highlightOpacityEl.addEventListener('input', () => {
  opacityValueEl.textContent = highlightOpacityEl.value;
  const rgba = hexToRgba(highlightColorHexEl.value, parseInt(highlightOpacityEl.value, 10));
  currentSettings.highlightColor = rgba;
  saveSettings();
});

exportBtn.addEventListener('click', handleExport);
importBtn.addEventListener('click', handleImport);
importFileEl.addEventListener('change', handleFileSelected);
clearBtn.addEventListener('click', showConfirmDialog);
dialogCancel.addEventListener('click', hideConfirmDialog);
dialogConfirm.addEventListener('click', handleClearConfirmed);

// Close dialog on backdrop click
confirmDialog.addEventListener('click', (e) => {
  if (e.target === confirmDialog) hideConfirmDialog();
});

// Close dialog on Escape key
document.addEventListener('keydown', (e) => {
  if (e.key === 'Escape' && !confirmDialog.hidden) hideConfirmDialog();
});

// Display extension version
extVersionEl.textContent = browser.runtime.getManifest().version;

// ---------------------------------------------------------------------------
// Initialize
// ---------------------------------------------------------------------------

loadSettings();
