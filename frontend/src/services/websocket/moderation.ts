import {
  CLEAR_ALL_MARKER,
  MODERATION_LOCK_STORAGE_KEY,
} from "./constants.ts";
import type { DeliveryTracker } from "./deliveryTracker.ts";
import type { MessageId } from "../../types/websocket";

export interface ModerationEventData {
  [key: string]: unknown;
  type?: string;
  messageId?: MessageId | null;
  muteMinutes?: number | string | null;
  category?: string;
  severity?: string;
  message?: string;
  messageIds?: unknown;
  moderator?: string;
  moderatorRole?: string;
  timestamp?: number;
}

export interface ModerationLock {
  until: number;
  startedAt: number;
  durationMs: number;
  muteRemainingSeconds: number;
  category: string;
  severity: string;
  message: string;
}

type MessageHandler = (event: ModerationEventData) => void;

type StoredModerationLock = ModerationLock & Record<string, unknown>;

function dispatch(name: string, detail?: unknown): void {
  window.dispatchEvent(new CustomEvent(name, detail === undefined ? undefined : { detail }));
}

export function publishModerationLock(data: ModerationEventData): void {
  const muteMinutes = Number(data.muteMinutes || 0);
  if (!Number.isFinite(muteMinutes) || muteMinutes <= 0) return;

  const durationMs = Math.max(1000, Math.round(muteMinutes * 60 * 1000));
  const startedAt = Date.now();
  const lock: ModerationLock = {
    until: startedAt + durationMs,
    startedAt,
    durationMs,
    muteRemainingSeconds: Math.ceil(durationMs / 1000),
    category: data.category || "moderation",
    severity: data.severity || "medium",
    message: data.message || "Envio temporariamente bloqueado pela moderação.",
  };

  try {
    sessionStorage.setItem(MODERATION_LOCK_STORAGE_KEY, JSON.stringify(lock));
  } catch {
    // Ignore storage failures; the in-memory event is enough for the active page.
  }

  dispatch("pokinex:moderation-lock", lock);
}

export function getModerationLock(): ModerationLock | null {
  try {
    const stored = JSON.parse(sessionStorage.getItem(MODERATION_LOCK_STORAGE_KEY) || "null") as
      | StoredModerationLock
      | null;
    if (!stored || Number(stored.until) <= Date.now()) {
      sessionStorage.removeItem(MODERATION_LOCK_STORAGE_KEY);
      return null;
    }
    return stored;
  } catch {
    return null;
  }
}

export function clearModerationLock(): void {
  try {
    sessionStorage.removeItem(MODERATION_LOCK_STORAGE_KEY);
  } catch {
    // Ignore storage failures.
  }
  dispatch("pokinex:moderation-unlock");
}

export function emitModerationEvent(
  data: ModerationEventData,
  rejectOldestOutgoingMessage?: () => MessageId | null,
): void {
  const messageId = data.messageId || rejectOldestOutgoingMessage?.() || null;
  const enriched = messageId ? { ...data, messageId } : data;
  publishModerationLock(enriched);
  dispatch("pokinex:moderation", enriched);
}

export function emitFullChannelClear(
  data: ModerationEventData,
  deliveryTracker: Pick<DeliveryTracker, "readCachedMessageIds" | "ids" | "clear">,
  onMessage?: MessageHandler,
): boolean {
  const rawIds = Array.isArray(data.messageIds)
    ? data.messageIds.map((id) => String(id))
    : [];
  const marker = rawIds.find((id) => id.startsWith(CLEAR_ALL_MARKER));
  if (!marker) return false;

  const databaseIds = rawIds
    .filter((id) => !id.startsWith(CLEAR_ALL_MARKER))
    .map((id) => id.trim())
    .filter(Boolean);
  const localIds = deliveryTracker.readCachedMessageIds();
  const pendingIds = deliveryTracker.ids;
  const commandId = pendingIds.length
    ? pendingIds[pendingIds.length - 1]
    : `moderation-command-${Date.now()}-${Math.random().toString(36).slice(2)}`;

  deliveryTracker.clear();

  const clearIds = [...new Set([...localIds, ...databaseIds, String(commandId)])];
  onMessage?.({
    ...data,
    messageIds: clearIds,
    clearAll: true,
  });

  const moderatorUsername = String(data.moderator || "staff").trim() || "staff";
  onMessage?.({
    type: "message",
    messageId: commandId,
    username: moderatorUsername,
    displayName: moderatorUsername,
    role: data.moderatorRole || "moderator",
    message: "!clear all",
    timestamp: data.timestamp || Date.now(),
    deliveryStatus: "sent",
    offline: false,
    reactions: {},
    moderationCommand: true,
    ephemeral: true,
  });

  return true;
}
