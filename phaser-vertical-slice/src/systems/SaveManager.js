const DEFAULT_STORAGE_KEY = "skywood.save.slot0";

function hasWindowStorage() {
  if (typeof window === "undefined") {
    return false;
  }
  try {
    return typeof window.localStorage !== "undefined" && window.localStorage !== null;
  } catch (error) {
    console.warn("[Skywood] localStorage unavailable:", error);
    return false;
  }
}

function probeStorage(storage, key) {
  const probeKey = `${key}.__probe`;
  try {
    storage.setItem(probeKey, "1");
    storage.removeItem(probeKey);
    return true;
  } catch (error) {
    console.warn("[Skywood] Failed to probe storage:", error);
    return false;
  }
}

export default class SaveManager {
  constructor(storageKey = DEFAULT_STORAGE_KEY) {
    this.storageKey = storageKey;
    this.available = false;
    this.storage = null;

    if (hasWindowStorage()) {
      try {
        const candidate = window.localStorage;
        if (candidate && probeStorage(candidate, storageKey)) {
          this.storage = candidate;
          this.available = true;
        }
      } catch (error) {
        console.warn("[Skywood] Save system disabled:", error);
        this.available = false;
        this.storage = null;
      }
    }
  }

  isAvailable() {
    return this.available && Boolean(this.storage);
  }

  load() {
    if (!this.isAvailable()) {
      return null;
    }
    try {
      const raw = this.storage.getItem(this.storageKey);
      if (!raw) {
        return null;
      }
      const parsed = JSON.parse(raw);
      if (parsed && typeof parsed === "object") {
        return parsed;
      }
    } catch (error) {
      console.warn("[Skywood] Failed to load save data:", error);
    }
    return null;
  }

  save(data) {
    if (!this.isAvailable()) {
      return { ok: false, reason: "unavailable" };
    }
    try {
      const now = Date.now();
      const payload = { version: 1, timestamp: now, ...data };
      this.storage.setItem(this.storageKey, JSON.stringify(payload));
      return { ok: true, timestamp: now };
    } catch (error) {
      console.warn("[Skywood] Failed to save progress:", error);
      this.available = probeStorage(this.storage, this.storageKey);
      if (!this.available) {
        return { ok: false, reason: "unavailable" };
      }
      return { ok: false, reason: "error" };
    }
  }

  clear() {
    if (!this.isAvailable()) {
      return false;
    }
    try {
      this.storage.removeItem(this.storageKey);
      return true;
    } catch (error) {
      console.warn("[Skywood] Failed to clear save data:", error);
      return false;
    }
  }
}
