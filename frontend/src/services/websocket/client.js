import { WS_URL } from "../../config/runtime";
import { notifyDirectMessage } from "../../notifications";
import {
  AUTH_CLOSE_CODE,
  AUTH_CLOSE_REASON,
  RECONNECT_BASE_DELAY_MS,
  RECONNECT_JITTER_MS,
  RECONNECT_MAX_DELAY_MS,
} from "./constants";
import { DeliveryTracker } from "./deliveryTracker";
import {
  emitFullChannelClear,
  emitModerationEvent,
} from "./moderation";

export function createWebSocket(
  _legacyToken,
  { onMessage, onOpen, onClose, onError, onReconnecting, onAuthenticationRequired } = {},
) {
  let socket = null;
  let reconnectTimer = null;
  let reconnectAttempt = 0;
  let manuallyClosed = false;

  const deliveryTracker = new DeliveryTracker({
    onFailed: (event) => onMessage?.(event),
  });

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
          deliveryTracker.forget(data.messageId);
        }
        if (data?.type === "message" && data.messageId) {
          deliveryTracker.forget(data.messageId);
        }
        if (data?.type === "moderation") {
          emitModerationEvent(data, () => deliveryTracker.rejectOldest());
        }
        if (data?.type === "messages_cleared" && emitFullChannelClear(data, deliveryTracker, onMessage)) {
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
        deliveryTracker.clear();
        onAuthenticationRequired?.();
        return;
      }

      if (manuallyClosed) {
        deliveryTracker.clear();
        onClose?.();
        return;
      }

      onClose?.();
      scheduleReconnect();
    };
  }

  function scheduleReconnect() {
    if (manuallyClosed || reconnectTimer) return;

    reconnectAttempt += 1;
    const exponentialDelay = Math.min(
      RECONNECT_BASE_DELAY_MS * 2 ** (reconnectAttempt - 1),
      RECONNECT_MAX_DELAY_MS,
    );
    const jitter = Math.floor(Math.random() * (RECONNECT_JITTER_MS + 1));
    const delay = Math.min(exponentialDelay + jitter, RECONNECT_MAX_DELAY_MS);

    onReconnecting?.(delay, reconnectAttempt);
    reconnectTimer = setTimeout(() => {
      reconnectTimer = null;
      connect();
    }, delay);
  }

  function send(payload) {
    if (!socket || socket.readyState !== WebSocket.OPEN) return false;
    if (payload?.type === "message" && payload.messageId) {
      deliveryTracker.remember(payload);
    }
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
      deliveryTracker.clear();
      if (reconnectTimer) {
        clearTimeout(reconnectTimer);
        reconnectTimer = null;
      }
      socket?.close();
    },
  };
}
