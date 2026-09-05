import {
  DELIVERY_TIMEOUT_MS,
  MAX_PENDING_OUTGOING,
} from "./constants.js";

export class DeliveryTracker {
  constructor({ onFailed, timeoutMs = DELIVERY_TIMEOUT_MS } = {}) {
    this.pendingIds = [];
    this.pendingPayloads = new Map();
    this.timers = new Map();
    this.onFailed = onFailed;
    this.timeoutMs = timeoutMs;
  }

  clearTimer(messageId) {
    const timer = this.timers.get(String(messageId));
    if (timer) clearTimeout(timer);
    this.timers.delete(String(messageId));
  }

  forget(messageId) {
    const id = String(messageId || "");
    const index = this.pendingIds.indexOf(messageId);
    if (index >= 0) this.pendingIds.splice(index, 1);
    this.clearTimer(id);
    this.pendingPayloads.delete(id);
  }

  remember(payload) {
    const messageId = payload?.messageId;
    if (!messageId) return;
    const id = String(messageId);

    const previousIndex = this.pendingIds.indexOf(messageId);
    if (previousIndex >= 0) this.pendingIds.splice(previousIndex, 1);
    this.pendingIds.push(messageId);
    this.pendingPayloads.set(id, { ...payload });
    this.clearTimer(id);

    const timer = setTimeout(() => {
      if (!this.pendingPayloads.has(id)) return;
      const pending = this.pendingPayloads.get(id);
      this.forget(messageId);
      this.onFailed?.({
        type: "delivery_failed",
        messageId,
        message: pending?.message || "",
        replyTo: pending?.replyTo || null,
      });
    }, this.timeoutMs);

    this.timers.set(id, timer);

    if (this.pendingIds.length > MAX_PENDING_OUTGOING) {
      const oldest = this.pendingIds.shift();
      if (oldest) {
        const oldestId = String(oldest);
        this.clearTimer(oldestId);
        this.pendingPayloads.delete(oldestId);
      }
    }
  }

  rejectOldest() {
    const messageId = this.pendingIds.shift() || null;
    if (messageId) {
      const id = String(messageId);
      this.clearTimer(id);
      this.pendingPayloads.delete(id);
    }
    return messageId;
  }

  clear() {
    for (const messageId of this.pendingIds) this.clearTimer(messageId);
    this.pendingIds.length = 0;
    this.pendingPayloads.clear();
  }

  get ids() {
    return [...this.pendingIds];
  }

  readCachedMessageIds() {
    const ids = new Set();

    try {
      for (let index = 0; index < localStorage.length; index += 1) {
        const key = localStorage.key(index);
        if (!key || (!key.startsWith("poknex_messages:user:") && key !== "poknex_messages")) continue;

        const cached = JSON.parse(localStorage.getItem(key) || "[]");
        if (!Array.isArray(cached)) continue;
        for (const item of cached) {
          if (item?.messageId) ids.add(String(item.messageId));
        }
      }
    } catch {
      // Ignore cache parsing failures.
    }

    for (const messageId of this.pendingIds) {
      if (messageId) ids.add(String(messageId));
    }

    return [...ids];
  }
}
