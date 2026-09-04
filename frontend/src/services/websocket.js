import { notifyDirectMessage } from "../notifications";

const DEFAULT_WS_URL = "wss://nexchat-backend-2cyf.onrender.com/ws";
const LOCAL_WS_URL = `ws://${window.location.hostname}:8000/ws`;
const WS_URL = import.meta.env.VITE_WS_URL || (window.location.hostname === "localhost" || window.location.hostname === "127.0.0.1" ? LOCAL_WS_URL : DEFAULT_WS_URL);
const RECONNECT_INTERVAL = 10000;
const AUTH_CLOSE_CODE = 1008;
const AUTH_CLOSE_REASON = "authentication required";

export function createWebSocket(
  _legacyToken,
  { onMessage, onOpen, onClose, onError, onReconnecting, onAuthenticationRequired } = {},
) {
  let socket = null;
  let reconnectTimer = null;
  let reconnectAttempt = 0;
  let manuallyClosed = false;

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
      if (reconnectTimer) {
        clearTimeout(reconnectTimer);
        reconnectTimer = null;
      }
      socket?.close();
    },
  };
}
