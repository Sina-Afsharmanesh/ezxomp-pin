import { createRequire as __gwbCreateRequireInit } from "node:module";

// ../../../../../../../../tmp/gsd-pi/src/resources/extensions/gsd/notification-store.ts
import { appendFileSync, existsSync, mkdirSync, openSync, closeSync, readFileSync, renameSync, unlinkSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { randomUUID } from "node:crypto";
var MAX_ENTRIES = 500;
var FILENAME = "notifications.jsonl";
var LOCKFILE = "notifications.lock";
var DEDUP_WINDOW_MS = 3e4;
var DEDUP_PRUNE_THRESHOLD = 200;
var _basePath = null;
var _lineCount = 0;
var _suppressCount = 0;
var _recentMessageTimestamps = /* @__PURE__ */ new Map();
var _changeListeners = /* @__PURE__ */ new Set();
function initNotificationStore(basePath) {
  if (_basePath !== basePath) {
    _recentMessageTimestamps.clear();
  }
  _basePath = basePath;
  _lineCount = _readEntriesFromDisk(basePath).length;
}
function appendNotification(message, severity, source = "notify", meta) {
  if (!_basePath) return;
  if (_suppressCount > 0) return;
  const persistedMessage = message.length > 500 ? message.slice(0, 500) + "\u2026" : message;
  const identity = meta?.kind ? `${meta.kind}:${meta.scope ?? ""}` : persistedMessage;
  const dedupKey = `${_basePath}:${severity}:${source}:${identity}`;
  const now = Date.now();
  const lastSeen = _recentMessageTimestamps.get(dedupKey);
  if (lastSeen !== void 0 && now - lastSeen < DEDUP_WINDOW_MS) return;
  _recentMessageTimestamps.set(dedupKey, now);
  if (_recentMessageTimestamps.size > DEDUP_PRUNE_THRESHOLD) {
    for (const [key, ts] of _recentMessageTimestamps) {
      if (now - ts > DEDUP_WINDOW_MS) _recentMessageTimestamps.delete(key);
    }
  }
  const entry = {
    id: randomUUID(),
    ts: (/* @__PURE__ */ new Date()).toISOString(),
    severity,
    message: persistedMessage,
    source,
    read: false,
    ...meta?.kind ? { kind: meta.kind } : {},
    ...meta?.scope ? { scope: meta.scope } : {}
  };
  try {
    const dir = join(_basePath, ".gsd");
    mkdirSync(dir, { recursive: true });
    appendFileSync(join(dir, FILENAME), JSON.stringify(entry) + "\n", "utf-8");
    _lineCount++;
    if (_lineCount > MAX_ENTRIES) {
      _rotate();
    }
    _emitChange();
  } catch {
  }
}
function readNotifications(basePath, filter) {
  const bp = basePath ?? _basePath;
  if (!bp) return [];
  const entries = _readEntriesFromDisk(bp).filter(
    (e) => (!filter?.kind || e.kind === filter.kind) && (!filter?.scope || e.scope === filter.scope)
  );
  return entries.reverse();
}
function markAllRead(basePath) {
  const bp = basePath ?? _basePath;
  if (!bp) return;
  const entries = _readEntriesFromDisk(bp);
  if (entries.length === 0) return;
  const hasUnread = entries.some((e) => !e.read);
  if (!hasUnread) return;
  let changed = false;
  try {
    _withLock(bp, () => {
      const fresh = _readEntriesFromDisk(bp);
      if (fresh.length === 0 || !fresh.some((e) => !e.read)) return;
      const lines = fresh.map((e) => JSON.stringify({ ...e, read: true }));
      _atomicWrite(bp, lines.join("\n") + "\n");
      changed = true;
    });
  } catch {
  }
  if (changed) _emitChange();
}
function clearNotifications(basePath) {
  const bp = basePath ?? _basePath;
  if (!bp) return;
  try {
    _withLock(bp, () => {
      _atomicWrite(bp, "");
    });
    _lineCount = 0;
    _emitChange();
  } catch {
  }
}
function getUnreadCount() {
  if (!_basePath) return 0;
  try {
    const entries = _readEntriesFromDisk(_basePath);
    return entries.filter((e) => !e.read).length;
  } catch {
    return 0;
  }
}
function getLineCount() {
  if (!_basePath) return 0;
  try {
    return _readEntriesFromDisk(_basePath).length;
  } catch {
    return 0;
  }
}
function suppressPersistence() {
  _suppressCount++;
}
function unsuppressPersistence() {
  _suppressCount = Math.max(0, _suppressCount - 1);
}
function onNotificationStoreChange(listener) {
  _changeListeners.add(listener);
  return () => {
    _changeListeners.delete(listener);
  };
}
function _resetNotificationStore() {
  _basePath = null;
  _lineCount = 0;
  _suppressCount = 0;
  _recentMessageTimestamps = /* @__PURE__ */ new Map();
  _changeListeners.clear();
}
function _readEntriesFromDisk(basePath) {
  const filePath = join(basePath, ".gsd", FILENAME);
  if (!existsSync(filePath)) return [];
  try {
    const content = readFileSync(filePath, "utf-8");
    return content.split("\n").filter((l) => l.length > 0).map((l) => {
      try {
        return JSON.parse(l);
      } catch {
        return null;
      }
    }).filter((e) => e !== null);
  } catch {
    return [];
  }
}
function _rotate() {
  if (!_basePath) return;
  try {
    _withLock(_basePath, () => {
      const entries = _readEntriesFromDisk(_basePath);
      if (entries.length <= MAX_ENTRIES) return;
      const trimmed = entries.slice(entries.length - MAX_ENTRIES);
      const lines = trimmed.map((e) => JSON.stringify(e));
      _atomicWrite(_basePath, lines.join("\n") + "\n");
      _lineCount = trimmed.length;
    });
  } catch {
  }
}
function _emitChange() {
  for (const listener of _changeListeners) {
    try {
      listener();
    } catch {
    }
  }
}
function _atomicWrite(basePath, content) {
  const dir = join(basePath, ".gsd");
  mkdirSync(dir, { recursive: true });
  const target = join(dir, FILENAME);
  const tmp = target + ".tmp." + process.pid;
  writeFileSync(tmp, content, "utf-8");
  renameSync(tmp, target);
}
function _withLock(basePath, fn) {
  const lockPath = join(basePath, ".gsd", LOCKFILE);
  let fd = null;
  try {
    mkdirSync(join(basePath, ".gsd"), { recursive: true });
    fd = openSync(lockPath, "wx");
  } catch (err) {
    if (err?.code === "EEXIST") {
      try {
        const stat = readFileSync(lockPath, "utf-8");
        const lockTime = parseInt(stat, 10);
        if (Date.now() - lockTime > 5e3) {
          try {
            unlinkSync(lockPath);
          } catch {
          }
          try {
            fd = openSync(lockPath, "wx");
          } catch {
          }
        }
      } catch {
      }
    }
  }
  const createdLock = fd !== null;
  try {
    if (createdLock && fd !== null) {
      writeFileSync(lockPath, String(Date.now()), "utf-8");
      closeSync(fd);
    }
    return fn();
  } finally {
    if (createdLock) {
      try {
        unlinkSync(lockPath);
      } catch {
      }
    }
  }
}
export {
  _resetNotificationStore,
  appendNotification,
  clearNotifications,
  getLineCount,
  getUnreadCount,
  initNotificationStore,
  markAllRead,
  onNotificationStoreChange,
  readNotifications,
  suppressPersistence,
  unsuppressPersistence
};
