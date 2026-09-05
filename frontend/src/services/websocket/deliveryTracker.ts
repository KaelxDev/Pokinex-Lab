import {
  DELIVERY_TIMEOUT_MS,
  MAX_PENDING_OUTGOING,
} from "./constants.ts";
import type {
  DeliveryFailedEvent,
  DeliveryTrackerOptions,
  MessageId,
  OutgoingMessagePayload,
} from "../../types/websocket";

export class DeliveryTracker {
  private readonly pendingIds: MessageId[] = [];
  private readonly pendingPayloads = new Map<string, OutgoingMessagePayload>();
  private readonly timers = new Map<string, ReturnType<typeof setTimeout>>();
  private readonly onFailed?: (event: DeliveryFailedEvent) => void;
  private readonly timeoutMs: number;

  constructor({ onFailed, timeoutMs = DELIVERY_TIMEOUT_MS }: DeliveryTrackerOptions = {}) {
    this.onFailed = onFailed;
    this.timeoutMs = timeoutMs;
  }

  clearTimer(messageId: MessageId): void {
    const id = String(messageId);
    const timer = this.timers.get(id);
    if (timer) clearTimeout(timer);
    this.timers.delete(id);
  }

  forget(messageId: MessageId | null | undefined): void {
    const id = String(messageId ?? "");
    if (messageId != null) {
      const index = this.pendingIds.indexOf(messageId);
      if (index >= 0) this.pendingIds.splice(index, 1);
    }
    this.clearTimer(id);
    this.pendingPayloads.delete(id);
  }

  remember(payload: OutgoingMessagePayload): void {
    const messageId = payload.messageId;
    if (!messageId) return;
    const id = String(messageId);

    const previousIndex = this.pendingIds.indexOf(messageId);
    if (previousIndex >= 0) this.pendingIds.splice(previousIndex, 1);
    this.pendingIds.push(messageId);
    this.pendingPayloads.set(id, { ...payload });
    this.clearTimer(messageId);

    const timer = setTimeout(() => {
      if (!this.pendingPayloads.has(id)) return;
      const pending = this.pendingPayloads.get(id);
      this.forget(messageId);
      if (pending) {
        this.onFailed?.({
          type: "delivery_failed",
          messageId,
          message: pending.message,
          replyTo: pending.replyTo ?? null,
        });
      }
    }, this.timeoutMs);

    this.timers.set(id, timer);

    if (this.pendingIds.length > MAX_PENDING_OUTGOING) {
      const oldest = this.pendingIds.shift();
      if (oldest !== undefined) {
        this.clearTimer(oldest);
        this.pendingPayloads.delete(String(oldest));
      }
    }
  }

  rejectOldest(): MessageId | null {
    const messageId = this.pendingIds.shift() ?? null;
    if (messageId !== null) {
      this.clearTimer(messageId);
      this.pendingPayloads.delete(String(messageId));
    }
    return messageId;
  }

  clear(): void {
    for (const messageId of this.pendingIds) this.clearTimer(messageId);
    this.pendingIds.length = 0;
    this.pendingPayloads.clear();
  }

  get ids(): MessageId[] {
    return [...this.pendingIds];
  }

  readCachedMessageIds(): string[] {
    const ids = new Set<string>();

    try {
      for (let index = 0; index < localStorage.length; index += 1) {
        const key = localStorage.key(index);
        if (!key || (!key.startsWith("poknex_messages:user:") && key !== "poknex_messages")) {
          continue;
        }

        const cached: unknown = JSON.parse(localStorage.getItem(key) || "[]");
        if (!Array.isArray(cached)) continue;
        for (const item of cached) {
          if (typeof item === "object" && item !== null && "messageId" in item) {
            const value = item.messageId;
            if (value) ids.add(String(value));
          }
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
