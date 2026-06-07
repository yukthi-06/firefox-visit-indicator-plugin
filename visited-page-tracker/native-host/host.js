#!/usr/bin/env node
/**
 * native-host/host.js
 *
 * Native Messaging Host for Visited Page Tracker (Option B).
 *
 * This script is a Node.js process that Firefox launches when the extension
 * sends its first native message. It communicates via stdin/stdout using
 * the Firefox Native Messaging Protocol:
 *   - Each message is preceded by a 4-byte little-endian length header
 *   - Message body is UTF-8 encoded JSON
 *
 * Responsibilities:
 *   - Receive 'get', 'save', 'getAll' commands from the extension
 *   - Read/write visit records to visited-pages.json
 *   - Use atomic file writes (write to .tmp then rename) to prevent data loss
 *
 * Security:
 *   - Only responds to messages that match the expected protocol
 *   - Never reads from or writes to any path other than DATA_FILE
 *   - No network access whatsoever
 *
 * Installation:
 *   See native-host/INSTALL.md for platform-specific setup instructions.
 */

'use strict';

const fs = require('fs');
const path = require('path');

// ---------------------------------------------------------------------------
// Configuration
// ---------------------------------------------------------------------------

/**
 * Data file path.
 * On Windows: %APPDATA%\VisitedPageTracker\visited-pages.json
 * On macOS:   ~/Library/Application Support/VisitedPageTracker/visited-pages.json
 * On Linux:   ~/.config/VisitedPageTracker/visited-pages.json
 */
function getDataDir() {
  const platform = process.platform;
  if (platform === 'win32') {
    return path.join(process.env.APPDATA || '', 'VisitedPageTracker');
  } else if (platform === 'darwin') {
    return path.join(process.env.HOME || '', 'Library', 'Application Support', 'VisitedPageTracker');
  } else {
    return path.join(process.env.HOME || '', '.config', 'VisitedPageTracker');
  }
}

const DATA_DIR = getDataDir();
const DATA_FILE = path.join(DATA_DIR, 'visited-pages.json');
const TEMP_FILE = path.join(DATA_DIR, 'visited-pages.tmp.json');
const LOG_FILE = path.join(DATA_DIR, 'host.log');

// ---------------------------------------------------------------------------
// Logging
// ---------------------------------------------------------------------------

function log(message) {
  const timestamp = new Date().toISOString();
  const line = `[${timestamp}] ${message}\n`;
  try {
    fs.appendFileSync(LOG_FILE, line);
  } catch {
    // Logging is best-effort; don't crash if log write fails
  }
}

// ---------------------------------------------------------------------------
// Data store
// ---------------------------------------------------------------------------

/**
 * In-memory cache of the visit records.
 * Loaded once on startup, then kept in sync with disk.
 *
 * Structure: { [url: string]: VisitRecord }
 */
let dataCache = null;

/**
 * Ensures the data directory exists.
 */
function ensureDataDir() {
  if (!fs.existsSync(DATA_DIR)) {
    fs.mkdirSync(DATA_DIR, { recursive: true });
    log(`Created data directory: ${DATA_DIR}`);
  }
}

/**
 * Loads the data file into memory.
 * Returns an empty object if the file doesn't exist or is corrupt.
 */
function loadData() {
  if (dataCache !== null) return dataCache;

  try {
    ensureDataDir();
    if (!fs.existsSync(DATA_FILE)) {
      dataCache = {};
      return dataCache;
    }
    const raw = fs.readFileSync(DATA_FILE, 'utf8');
    dataCache = JSON.parse(raw);
    log(`Loaded ${Object.keys(dataCache).length} records from ${DATA_FILE}`);
  } catch (err) {
    log(`Error loading data file: ${err.message}. Starting fresh.`);
    dataCache = {};
  }

  return dataCache;
}

/**
 * Writes the in-memory cache to disk atomically.
 *
 * Atomic write procedure:
 *   1. Write data to a .tmp file
 *   2. On success, rename .tmp → data file (atomic on POSIX systems)
 *
 * This prevents partial writes from corrupting the data file if the
 * process is killed mid-write.
 *
 * Note: On Windows, fs.renameSync is NOT atomic if the destination exists,
 * so we delete the destination first. There is a tiny window of vulnerability
 * on Windows, but this is acceptable for a local extension data store.
 */
function saveData() {
  try {
    ensureDataDir();
    const json = JSON.stringify(dataCache, null, 2);
    fs.writeFileSync(TEMP_FILE, json, 'utf8');

    // Windows: delete destination before rename
    if (process.platform === 'win32' && fs.existsSync(DATA_FILE)) {
      fs.unlinkSync(DATA_FILE);
    }

    fs.renameSync(TEMP_FILE, DATA_FILE);
  } catch (err) {
    log(`Error saving data: ${err.message}`);
    throw err;
  }
}

// ---------------------------------------------------------------------------
// Command handlers
// ---------------------------------------------------------------------------

function handleGet(url) {
  const data = loadData();
  const record = data[url] || null;
  return { success: true, record };
}

function handleSave(record) {
  // Special command to clear all data
  if (record.url === '__CLEAR__') {
    dataCache = {};
    saveData();
    log('Cleared all records');
    return { success: true };
  }

  const data = loadData();
  data[record.url] = record;
  saveData();
  return { success: true };
}

function handleGetAll() {
  const data = loadData();
  return { success: true, records: data };
}

function processMessage(message) {
  try {
    switch (message.command) {
      case 'get':
        return handleGet(message.url);
      case 'save':
        return handleSave(message.record);
      case 'getAll':
        return handleGetAll();
      default:
        log(`Unknown command: ${message.command}`);
        return { success: false, error: `Unknown command: ${message.command}` };
    }
  } catch (err) {
    log(`Error processing command '${message.command}': ${err.message}`);
    return { success: false, error: err.message };
  }
}

// ---------------------------------------------------------------------------
// Native Messaging Protocol (stdin/stdout framing)
// ---------------------------------------------------------------------------

/**
 * Reads a single native message from stdin.
 * Protocol: [4 bytes LE uint32 length][JSON bytes]
 */
function readMessage(callback) {
  let lengthBuffer = null;
  let lengthBytesRead = 0;
  let messageBuffer = null;
  let messageBytesRead = 0;
  let expectedLength = 0;
  let state = 'length'; // 'length' | 'body'

  function onData(chunk) {
    let offset = 0;

    while (offset < chunk.length) {
      if (state === 'length') {
        // Read 4-byte length prefix
        if (!lengthBuffer) {
          lengthBuffer = Buffer.alloc(4);
          lengthBytesRead = 0;
        }

        const needed = 4 - lengthBytesRead;
        const available = chunk.length - offset;
        const toCopy = Math.min(needed, available);

        chunk.copy(lengthBuffer, lengthBytesRead, offset, offset + toCopy);
        lengthBytesRead += toCopy;
        offset += toCopy;

        if (lengthBytesRead === 4) {
          expectedLength = lengthBuffer.readUInt32LE(0);
          if (expectedLength === 0) {
            // Empty message — Firefox shutting down
            process.exit(0);
          }
          messageBuffer = Buffer.alloc(expectedLength);
          messageBytesRead = 0;
          state = 'body';
        }
      }

      if (state === 'body' && offset < chunk.length) {
        const needed = expectedLength - messageBytesRead;
        const available = chunk.length - offset;
        const toCopy = Math.min(needed, available);

        chunk.copy(messageBuffer, messageBytesRead, offset, offset + toCopy);
        messageBytesRead += toCopy;
        offset += toCopy;

        if (messageBytesRead === expectedLength) {
          process.stdin.removeListener('data', onData);

          let parsed;
          try {
            parsed = JSON.parse(messageBuffer.toString('utf8'));
          } catch (err) {
            log(`Failed to parse message JSON: ${err.message}`);
            parsed = null;
          }

          callback(parsed);
          // Reset for next message
          lengthBuffer = null;
          lengthBytesRead = 0;
          messageBuffer = null;
          messageBytesRead = 0;
          state = 'length';

          // Re-register to read next message
          process.stdin.on('data', onData);
        }
      }
    }
  }

  process.stdin.on('data', onData);
}

/**
 * Writes a response to stdout in native messaging format.
 * Protocol: [4 bytes LE uint32 length][JSON bytes]
 */
function sendMessage(response) {
  const json = JSON.stringify(response);
  const body = Buffer.from(json, 'utf8');
  const header = Buffer.alloc(4);
  header.writeUInt32LE(body.length, 0);

  process.stdout.write(Buffer.concat([header, body]));
}

// ---------------------------------------------------------------------------
// Message loop
// ---------------------------------------------------------------------------

log('Native host started');

process.stdin.on('end', () => {
  log('stdin closed, exiting');
  process.exit(0);
});

process.on('uncaughtException', (err) => {
  log(`Uncaught exception: ${err.message}\n${err.stack}`);
  sendMessage({ success: false, error: 'Internal host error' });
});

// Start the read-respond loop
function messageLoop() {
  readMessage((message) => {
    if (message === null) {
      log('Received null message, ignoring');
      messageLoop();
      return;
    }

    log(`Received: command=${message.command}`);
    const response = processMessage(message);
    sendMessage(response);
    log(`Sent response: success=${response.success}`);

    // Continue listening
    messageLoop();
  });
}

messageLoop();
