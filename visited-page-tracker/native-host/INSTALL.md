# Native Messaging Host — Installation Guide

## Overview

The Native Messaging Host (`host.js`) allows the Visited Page Tracker extension to
write visit history directly to a JSON file on your disk instead of using browser storage.

This is **Option B** (advanced mode). Option A (browser.storage.local) requires no setup.

## Prerequisites

- **Node.js** v18 or later must be installed and available in your system PATH.
- The extension must be installed in Firefox.
- Your extension ID must be `visited-page-tracker@example.com` (set in manifest.json).

---

## Windows

### 1. Copy the host script

```powershell
$dir = "$env:APPDATA\VisitedPageTracker"
New-Item -ItemType Directory -Force -Path $dir
Copy-Item .\native-host\host.js "$dir\host.js"
```

### 2. Create a wrapper batch file

Create `%APPDATA%\VisitedPageTracker\host.bat`:

```batch
@echo off
node "%APPDATA%\VisitedPageTracker\host.js"
```

### 3. Update the manifest

Edit `native-host\manifest-win.json` and set the `path` to the full path of `host.bat`:

```json
{
  "name": "com.visitedpagetracker.host",
  "description": "Visited Page Tracker Native Messaging Host",
  "path": "C:\\Users\\YOUR_USERNAME\\AppData\\Roaming\\VisitedPageTracker\\host.bat",
  "type": "stdio",
  "allowed_extensions": ["visited-page-tracker@example.com"]
}
```

### 4. Register in the Windows Registry

```powershell
$manifestPath = "$env:APPDATA\VisitedPageTracker\manifest.json"
Copy-Item .\native-host\manifest-win.json $manifestPath

$registryKey = "HKCU:\SOFTWARE\Mozilla\NativeMessagingHosts\com.visitedpagetracker.host"
New-Item -Path $registryKey -Force
Set-ItemProperty -Path $registryKey -Name "(Default)" -Value $manifestPath
```

### 5. Verify

Restart Firefox and switch the extension to **Native File Storage** in the options page.
Check `%APPDATA%\VisitedPageTracker\host.log` for activity logs.

---

## macOS

### 1. Copy the host script

```bash
sudo mkdir -p /usr/local/lib/visited-page-tracker
sudo cp native-host/host.js /usr/local/lib/visited-page-tracker/host.js
sudo chmod +x /usr/local/lib/visited-page-tracker/host.js
```

Add a Node.js shebang line at the top of host.js (already included):
```
#!/usr/bin/env node
```

### 2. Install the manifest

```bash
mkdir -p ~/Library/Application\ Support/Mozilla/NativeMessagingHosts
cp native-host/manifest-mac-linux.json \
   ~/Library/Application\ Support/Mozilla/NativeMessagingHosts/com.visitedpagetracker.host.json
```

Update the path in the manifest to match your installation:

```json
"path": "/usr/local/lib/visited-page-tracker/host.js"
```

### 3. Verify

```bash
echo '{"command":"getAll"}' | node /usr/local/lib/visited-page-tracker/host.js
```

---

## Linux

### 1. Copy the host script

```bash
sudo mkdir -p /usr/local/lib/visited-page-tracker
sudo cp native-host/host.js /usr/local/lib/visited-page-tracker/host.js
sudo chmod +x /usr/local/lib/visited-page-tracker/host.js
```

### 2. Install the manifest

For a per-user installation:
```bash
mkdir -p ~/.mozilla/native-messaging-hosts
cp native-host/manifest-mac-linux.json \
   ~/.mozilla/native-messaging-hosts/com.visitedpagetracker.host.json
```

For a system-wide installation:
```bash
sudo cp native-host/manifest-mac-linux.json \
   /usr/lib/mozilla/native-messaging-hosts/com.visitedpagetracker.host.json
```

### 3. Verify

```bash
node /usr/local/lib/visited-page-tracker/host.js
# Type a message manually to test (Ctrl+C to exit)
```

---

## Troubleshooting

| Problem | Solution |
|---------|----------|
| Banner still shows without native host | Extension auto-falls back to browser storage. Check `host.log`. |
| "Receiving end does not exist" error | The manifest path or registry key is wrong. Double-check paths. |
| `host.log` not created | Data directory couldn't be created. Check permissions. |
| Empty responses from host | Ensure Node.js is in PATH accessible by Firefox. |

### Check host.log location

- **Windows**: `%APPDATA%\VisitedPageTracker\host.log`
- **macOS**: `~/Library/Application Support/VisitedPageTracker/host.log`
- **Linux**: `~/.config/VisitedPageTracker/host.log`
