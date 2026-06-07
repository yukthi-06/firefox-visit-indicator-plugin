# Visited Page Tracker — Firefox WebExtension

> Track your page visit history **privately and locally**. See when you last visited any page, with a count of total visits — without relying on Firefox's built-in history.

---

## Table of Contents

1. [Architecture Overview](#architecture-overview)
2. [Features](#features)
3. [Setup & Build Instructions](#setup--build-instructions)
4. [Loading the Extension in Firefox](#loading-the-extension-in-firefox)
5. [Native Messaging Setup (Option B)](#native-messaging-setup-option-b)
6. [Options Page](#options-page)
7. [Troubleshooting Guide](#troubleshooting-guide)
8. [Security & Privacy](#security--privacy)
9. [Future Enhancements](#future-enhancements)

---

## Architecture Overview

```
┌─────────────────────────────────────────────────────────────────┐
│                       Firefox Browser                           │
│                                                                  │
│  ┌──────────────────────────┐    ┌───────────────────────────┐  │
│  │     Content Script       │    │   Background Service      │  │
│  │   (content/content.ts)   │    │    Worker (MV3)           │  │
│  │                          │◄──►│  (background/background)  │  │
│  │  • URL normalization      │    │                           │  │
│  │  • SPA detection         │    │  • All storage I/O        │  │
│  │  • Banner injection      │    │  • Message routing        │  │
│  │  • Overlay injection     │    │  • Settings management    │  │
│  └──────────────────────────┘    └──────────┬────────────────┘  │
│                                             │                    │
│  ┌──────────────────────────┐    ┌──────────▼────────────────┐  │
│  │     Options Page         │    │      Storage Layer        │  │
│  │   (options/options.ts)   │    │                           │  │
│  │                          │    │  LocalStore (Option A)    │  │
│  │  • Settings toggles      │    │  → browser.storage.local  │  │
│  │  • Export/Import JSON    │    │                           │  │
│  │  • Statistics display    │    │  NativeStore (Option B)   │  │
│  │  • Clear history         │    │  → JSON file on disk      │  │
│  └──────────────────────────┘    └───────────────────────────┘  │
└─────────────────────────────────────────────────────────────────┘
```

### Key Design Principles

| Principle | Implementation |
|-----------|----------------|
| **Separation of concerns** | Content scripts have zero storage logic |
| **Storage abstraction** | `VisitStore` interface makes backends swappable |
| **No race conditions** | All writes serialized through background service worker |
| **SPA support** | Patches `history.pushState/replaceState` + `popstate` listener |
| **Performance** | O(1) URL lookups; no full-store scans in the hot path |
| **Privacy** | Zero external network calls; all data stays on device |

### File Structure

```
visited-page-tracker/
├── manifest.json             # Extension manifest (MV3)
├── background/
│   └── background.ts         # Service worker: storage, message handler
├── content/
│   ├── content.ts            # Entry: URL check, SPA detection
│   ├── banner.ts             # Banner DOM injection
│   ├── overlay.ts            # Full-page tint overlay
│   └── styles.css            # Banner/overlay styles
├── storage/
│   ├── visitStore.ts         # VisitStore interface
│   ├── localStore.ts         # browser.storage.local (Option A)
│   └── nativeStore.ts        # Native Messaging (Option B)
├── shared/
│   ├── types.ts              # All TypeScript types
│   ├── urlUtils.ts           # URL normalization
│   └── dateUtils.ts          # Timestamp formatting
├── options/
│   ├── options.html          # Settings UI
│   ├── options.ts            # Settings logic
│   └── options.css           # Options page styles
├── native-host/
│   ├── host.js               # Node.js native messaging host
│   ├── manifest-win.json     # Windows host manifest
│   ├── manifest-mac-linux.json
│   └── INSTALL.md            # Platform installation guide
├── tests/
│   ├── urlUtils.test.ts
│   ├── dateUtils.test.ts
│   ├── localStore.test.ts
│   ├── nativeStore.test.ts
│   └── integration.test.ts
├── package.json
├── tsconfig.json
├── tsconfig.test.json
└── webpack.config.js
```

### Message Flow

```
Page loads
    │
    ▼
content.ts: normalizeUrl(window.location.href)
    │
    ├── isTrackableUrl? No → exit
    │
    ▼
browser.runtime.sendMessage({ type: 'GET_VISIT_INFO', url })
    │
    ▼
background.ts: store.getVisit(url)
    │
    ├── Returns: { record: VisitRecord | null, settings: UserSettings }
    │
    ▼ (if record !== null)
banner.ts: showBanner(record)     ← shows PREVIOUS lastVisited
overlay.ts: showOverlay(color)
    │
    ▼
browser.runtime.sendMessage({ type: 'UPDATE_VISIT', url })
    │
    ▼
background.ts: processVisit(url)  ← increments visitCount, updates lastVisited
```

---

## Features

- 🕐 **Last visited timestamp** banner on repeat visits
- 🔢 **Visit count** displayed in the banner
- 🎨 **Subtle background tint** for instant visual recognition
- 📱 **SPA-aware** — works with React, Vue, Angular apps
- 💾 **Two storage backends**: browser.storage.local or native file JSON
- 📤 **Export / Import** visit history as JSON
- ⚙️ **Settings page** with toggles and color picker
- 🔒 **100% local** — no analytics, no telemetry, no network calls

---

## Setup & Build Instructions

### Prerequisites

- **Node.js** v18 or later
- **npm** v9 or later
- **Firefox** 109 or later (Manifest V3 support)

### 1. Install Dependencies

```bash
cd visited-page-tracker
npm install
```

### 2. Build the Extension

**Production build** (minified):
```bash
npm run build
```

**Development build** (with source maps):
```bash
npm run build:dev
```

**Watch mode** (auto-rebuild on file changes):
```bash
npm run watch
```

Build output goes to `dist/`.

### 3. Run Tests

```bash
npm test                 # Run all tests
npm run test:watch       # Watch mode
npm run test:coverage    # With coverage report
```

### 4. Type Check

```bash
npm run typecheck
```

---

## Loading the Extension in Firefox

1. Open Firefox and navigate to `about:debugging#/runtime/this-firefox`
2. Click **"Load Temporary Add-on..."**
3. Navigate to the `dist/` folder inside `visited-page-tracker/`
4. Select `manifest.json`
5. The extension is now active — visit any webpage to test it!

> **Note**: Temporary extensions are removed when Firefox restarts. For persistent installation, the extension must be signed by Mozilla or you must enable `xpinstall.signatures.required = false` in `about:config` (developer mode).

### First-Time Setup

On first install, the options page opens automatically. You can:
- Enable/disable the banner and background highlight
- Choose storage backend (browser storage is recommended for most users)
- Customize the highlight color

---

## Native Messaging Setup (Option B)

See [`native-host/INSTALL.md`](native-host/INSTALL.md) for complete platform-specific instructions.

### Quick Summary

| Platform | Manifest Location |
|----------|-------------------|
| **Windows** | `HKCU\SOFTWARE\Mozilla\NativeMessagingHosts\` registry key |
| **macOS** | `~/Library/Application Support/Mozilla/NativeMessagingHosts/` |
| **Linux** | `~/.mozilla/native-messaging-hosts/` |

The native host writes data to:
- **Windows**: `%APPDATA%\VisitedPageTracker\visited-pages.json`
- **macOS**: `~/Library/Application Support/VisitedPageTracker/visited-pages.json`
- **Linux**: `~/.config/VisitedPageTracker/visited-pages.json`

---

## Options Page

Access via: right-click extension icon → **Manage Extension** → **Options**

| Setting | Default | Description |
|---------|---------|-------------|
| Show Visit Banner | ✅ On | Display "last visited" banner on repeat visits |
| Background Highlight | ✅ On | Subtle color tint on previously visited pages |
| Highlight Color | Yellow 3% | Base color + opacity for the tint |
| Storage Method | Browser Storage | Where visit records are stored |
| Export Data | — | Download all records as JSON |
| Import Data | — | Merge records from JSON file |
| Clear All Data | — | Delete all history (with confirmation) |

---

## Troubleshooting Guide

### Banner not showing

1. Check that "Show Visit Banner" is enabled in Options.
2. Verify the page URL is not `about:`, `file:`, or `moz-extension:` (not tracked by design).
3. This is your **first** visit to the page — banner only shows on repeat visits.
4. Open Firefox DevTools → Console and look for `[VPT]` prefixed messages.

### Banner shows but count seems wrong

- The count displayed is the count **as of the previous visit** (before the current one is recorded). The next page load will show the updated count.

### SPA navigation not detected

- Some SPAs may use non-standard navigation methods. Check the console for `[VPT Content]` messages.
- The extension patches `history.pushState` and `history.replaceState`. If the SPA replaces these methods after the content script runs, detection may fail.

### Native host not connecting

1. Check the log file (path varies by OS — see INSTALL.md).
2. Verify Node.js is in the system PATH that Firefox uses.
3. Ensure the registry key / manifest file path is exact and uses the correct separator.
4. The extension **automatically falls back** to browser storage if the native host is unavailable.

### "Could not establish connection" error in console

- The background service worker may have gone to sleep (MV3 behavior). The content script will retry automatically on the next page load.

### Data export file is empty

- Verify the storage backend is correct in Options.
- If using native storage, check that `visited-pages.json` exists in the data directory.

---

## Security & Privacy

- ✅ **No external network calls** — `connect-src: 'none'` in Content Security Policy
- ✅ **No analytics or telemetry** — code has no tracking whatsoever
- ✅ **Minimum permissions** — only `storage`, `tabs`, `nativeMessaging`, and `<all_urls>` host permission
- ✅ **Data stays local** — browser.storage.local is encrypted with the OS keychain on some platforms
- ✅ **No content modification** — overlay uses `pointer-events: none` and doesn't alter DOM

### Permission Rationale

| Permission | Why it's needed |
|------------|-----------------|
| `storage` | Read/write `browser.storage.local` for visit records and settings |
| `tabs` | Detect active tab URL changes for redirect handling |
| `nativeMessaging` | Communicate with the optional native file storage host |
| `<all_urls>` | Content script must run on all web pages to track visits |

---

## Future Enhancements

### Near-term

- [ ] **Popup UI** — quick stats and recent visits in the toolbar popup
- [ ] **Search & browse history** — searchable list of all tracked URLs in Options
- [ ] **Domain grouping** — group visit records by domain for overview
- [ ] **Keyboard shortcut** — quickly toggle banner visibility

### Storage Improvements

- [ ] **IndexedDB backend** — for better performance with very large (1M+) URL datasets
- [ ] **Compression** — gzip export files for large histories
- [ ] **Cloud sync** — optional end-to-end encrypted sync via browser.storage.sync

### UI Enhancements

- [ ] **Customizable banner position** (top/bottom)
- [ ] **Different banner styles** per domain
- [ ] **Dark/light mode banner** auto-detection
- [ ] **First-visit mode** — optionally show banner on first visits too

### Analytics (local only)

- [ ] **Visit heatmap** — most visited domains visualization
- [ ] **Time-of-day patterns** — when do you visit pages most?
- [ ] **Session tracking** — group visits into browsing sessions

### Developer

- [ ] **End-to-end tests** using Selenium/WebDriver
- [ ] **CI/CD pipeline** for automated testing and packaging
- [ ] **Web-ext integration** for easier development workflow
- [ ] **Content script hot reload** in development mode

---

## Contributing

1. Fork the repository
2. Create a feature branch: `git checkout -b feature/my-feature`
3. Make changes and add tests
4. Run `npm test` and `npm run typecheck`
5. Submit a pull request

---

## License

MIT License — see [LICENSE](../LICENSE) for details.
