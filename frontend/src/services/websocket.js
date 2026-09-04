import { notifyDirectMessage } from "../notifications";

const DEFAULT_WS_URL = "wss://nexchat-backend-2cyf.onrender.com/ws";
const LOCAL_WS_URL = `ws://${window.location.hostname}:8000/ws`;
const WS_URL = import.meta.env.VITE_WS_URL || (window.location.hostname === "localhost" || window.location.hostname === "127.0.0.1" ? LOCAL_WS_URL : DEFAULT_WS_URL);
const RECONNECT_INTERVAL = 10000;
const AUTH_CLOSE_CODE = 1008;
const AUTH_CLOSE_REASON = "authentication required";
const MODERATION_LOCK_STORAGE_KEY = "pokinex.moderationLock";
const CLEAR_ALL_MARKER = "__pokinex_clear_all__::";

function publishModerationLock(data) {
  const muteMinutes = Number(data?.muteMinutes || 0);
  if (!Number.isFinite(muteMinutes) || muteMinutes <= 0) return;

  const durationMs = Math.max(1000, Math.round(muteMinutes * 60 * 1000));
  const startedAt = Date.now();
  const lock = {
    until: startedAt + durationMs,
    startedAt,
    durationMs,
    muteRemainingSeconds: Math.ceil(durationMs / 1000),
    category: data?.category || "moderation",
    severity: data?.severity || "medium",
    message: data?.message || "Envio temporariamente bloqueado pela moderação.",
  };

  try {
    sessionStorage.setItem(MODERATION_LOCK_STORAGE_KEY, JSON.stringify(lock));
  } catch {
    // Ignore storage failures; the in-memory event is enough for the active page.
  }

  window.dispatchEvent(new CustomEvent("pokinex:moderation-lock", { detail: lock }));
}

export function getModerationLock() {
  try {
    const stored = JSON.parse(sessionStorage.getItem(MODERATION_LOCK_STORAGE_KEY) || "null");
    if (!stored || Number(stored.until) <= Date.now()) {
      sessionStorage.removeItem(MODERATION_LOCK_STORAGE_KEY);
      return null;
    }
    return stored;
  } catch {
    return null;
  }
}

export function clearModerationLock() {
  try {
    sessionStorage.removeItem(MODERATION_LOCK_STORAGE_KEY);
  } catch {
    // Ignore storage failures.
  }
  window.dispatchEvent(new CustomEvent("pokinex:moderation-unlock"));
}

export function createWebSocket(
  _legacyToken,
  { onMessage, onOpen, onClose, onError, onReconnecting, onAuthenticationRequired } = {},
) {
  let socket = null;
  let reconnectTimer = null;
  let reconnectAttempt = 0;
  let manuallyClosed = false;
  const pendingMessageIds = [];

  function rememberOutgoingMessage(messageId) {
    if (!messageId) return;
    pendingMessageIds.push(messageId);
    if (pendingMessageIds.length > 100) pendingMessageIds.shift();
  }

  function forgetOutgoingMessage(messageId) {
    const index = pendingMessageIds.indexOf(messageId);
    if (index >= 0) pendingMessageIds.splice(index, 1);
  }

  function rejectOldestOutgoingMessage() {
    return pendingMessageIds.shift() || null;
  }

  function readCachedMessageIds() {
    const ids = new Set();

    try {
      for (let index = 0; index < localStorage.length; index += 1) {
        const key = localStorage.key(index);
        if (!key || (!key.startsWith("poknex_messages:user:") && key !== "poknex_messages")) continue;

        const raw = localStorage.getItem(key);
        const cached = JSON.parse(raw || "[]");
        if (!Array.isArray(cached)) continue;

        for (const item of cached) {
          if (item?.messageId) ids.add(String(item.messageId));
        }
      }
    } catch {
      // Ignore cache parsing failures.
    }

    for (const messageId of pendingMessageIds) {
      if (messageId) ids.add(String(messageId));
    }

    return [...ids];
  }

  function emitFullChannelClear(data) {
    const rawIds = Array.isArray(data?.messageIds)
      ? data.messageIds.map((id) => String(id))
      : [];
    const marker = rawIds.find((id) => id.startsWith(CLEAR_ALL_MARKER));
    if (!marker) return false;

    const databaseIds = rawIds
      .filter((id) => !id.startsWith(CLEAR_ALL_MARKER))
      .map((id) => id.trim())
      .filter(Boolean);
    const localIds = readCachedMessageIds();
    const commandId = pendingMessageIds.length
      ? pendingMessageIds[pendingMessageIds.length - 1]
      : `moderation-command-${Date.now()}-${Math.random().toString(36).slice(2)}`;

    pendingMessageIds.length = 0;

    const clearIds = [...new Set([...localIds, ...databaseIds, commandId])];
    onMessage?.({
      ...data,
      messageIds: clearIds,
      clearAll: true,
    });

    const moderatorUsername = String(data?.moderator || "staff").trim() || "staff";
    const normalizedUsername = moderatorUsername.toLowerCase();
    const role = normalizedUsername === "kael1nk" ? "owner" : "moderator";
    onMessage?.({
      type: "message",
      messageId: commandId,
      username: moderatorUsername,
      displayName: moderatorUsername,
      role,
      message: "!clear all",
      timestamp: data?.timestamp || Date.now(),
      deliveryStatus: "sent",
      offline: false,
      reactions: {},
      moderationCommand: true,
      ephemeral: true,
    });

    return true;
  }

  function emitModerationEvent(data) {
    const messageId = data.messageId || rejectOldestOutgoingMessage();
    const enriched = messageId ? { ...data, messageId } : data;
    publishModerationLock(enriched);

    window.dispatchEvent(
      new CustomEvent("pokinex:moderation", {
        detail: enriched,
      }),
    );
  }

  function connect() {
    if (manuallyClosed) return;
    socket = new WebSocket(WS_URL);
    socket.onopen = () => {
      const reconnected = reconnectAttempt > 0;
      reconnectAttempt = 0;
      onOpen?.({ reconnected });
    };
    socket.onmessage = (event) => {
      try {
        const data = JSON.parse(event.data);
        if (data?.type === "direct_message" && data.notifyRecipient === true) {
          notifyDirectMessage({
            ...data,
            senderId: Number(data.senderId ?? data.userId),
            userId: Number(data.senderId ?? data.userId),
            displayName: data.displayName || data.username || "Usuário",
          });
        }
        if (data?.type === "ack" && data.messageId) {
          forgetOutgoingMessage(data.messageId);
        }
        if (data?.type === "moderation") {
          emitModerationEvent(data);
        }
        if (data?.type === "messages_cleared" && emitFullChannelClear(data)) {
          return;
        }
        onMessage?.(data);
      } catch (error) {
        console.error("Erro ao interpretar mensagem:", error);
      }
    };
    socket.onerror = (error) => onError?.(error);
    socket.onclose = (event) => {
      const reason = String(event.reason || "").trim().toLowerCase();
      if (event.code === AUTH_CLOSE_CODE && reason === AUTH_CLOSE_REASON) {
        manuallyClosed = true;
        if (reconnectTimer) {
          clearTimeout(reconnectTimer);
          reconnectTimer = null;
        }
        onAuthenticationRequired?.();
        return;
      }
      if (manuallyClosed) {
        onClose?.();
        return;
      }
      scheduleReconnect();
    };
  }

  function scheduleReconnect() {
    if (manuallyClosed || reconnectTimer) return;
    reconnectAttempt += 1;
    onReconnecting?.(RECONNECT_INTERVAL, reconnectAttempt);
    reconnectTimer = setTimeout(() => {
      reconnectTimer = null;
      connect();
    }, RECONNECT_INTERVAL);
  }

  function send(payload) {
    if (!socket || socket.readyState !== WebSocket.OPEN) return false;
    if (payload?.type === "message") rememberOutgoingMessage(payload.messageId);
    socket.send(JSON.stringify(payload));
    return true;
  }

  connect();

  return {
    get socket() {
      return socket;
    },
    sendMessage(message, messageId = null) {
      return send({ type: "message", message, messageId });
    },
    sendDirectMessage(message, messageId = null, recipientId, replyTo = null) {
      return send({ type: "direct_message", message, messageId, recipientId, replyTo });
    },
    sendDirectEditMessage(messageId, message) {
      return send({ type: "direct_message_edit", messageId, message });
    },
    sendDirectDeleteMessage(messageId) {
      return send({ type: "direct_message_delete", messageId });
    },
    sendDirectReaction(messageId, reaction) {
      return send({ type: "direct_message_reaction", messageId, reaction });
    },
    sendEditMessage(messageId, message) {
      return send({ type: "edit_message", messageId, message });
    },
    sendDeleteMessage(messageId) {
      return send({ type: "delete_message", messageId });
    },
    sendReplyMessage(message, messageId = null, replyTo = null) {
      return send({ type: "message", message, messageId, replyTo });
    },
    sendReaction(messageId, reaction) {
      return send({ type: "reaction", messageId, reaction });
    },
    close() {
      manuallyClosed = true;
      pendingMessageIds.length = 0;
      if (reconnectTimer) {
        clearTimeout(reconnectTimer);
        reconnectTimer = null;
      }
      socket?.close();
    },
  };
}
