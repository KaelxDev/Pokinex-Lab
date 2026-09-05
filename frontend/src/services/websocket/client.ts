import { WS_URL } from "../../config/runtime.ts";
import { notifyDirectMessage } from "../../notifications.ts";
import {
  AUTH_CLOSE_CODE,
  AUTH_CLOSE_REASON,
  RECONNECT_BASE_DELAY_MS,
  RECONNECT_JITTER_MS,
  RECONNECT_MAX_DELAY_MS,
} from "./constants.ts";
import { DeliveryTracker } from "./deliveryTracker.ts";
import {
  emitFullChannelClear,
  emitModerationEvent,
  type ModerationEventData,
} from "./moderation.ts";
import {
  directMessageDeletePayload,
  directMessageEditPayload,
  directMessagePayload,
  directMessageReactionPayload,
  editMessagePayload,
  messagePayload,
  deleteMessagePayload,
  reactionPayload,
} from "./protocol.ts";
import type {
  DeliveryFailedEvent,
  DirectMessagePayload,
  MessageId,
  MessagePayload,
  OutgoingMessagePayload,
} from "../../types/websocket";

export interface WebSocketCallbacks {
  onMessage?: (data: ServerEvent | DeliveryFailedEvent) => void;
  onOpen?: (info: { reconnected: boolean }) => void;
  onClose?: () => void;
  onError?: (error: Event) => void;
  onReconnecting?: (delay: number, attempt: number) => void;
  onAuthenticationRequired?: () => void;
}

export interface WebSocketClient {
  readonly socket: WebSocket | null;
  sendMessage(message: string, messageId?: MessageId | null): boolean;
  sendDirectMessage(
    message: string,
    messageId?: MessageId | null,
    recipientId?: number,
    replyTo?: MessageId | null,
  ): boolean;
  sendDirectEditMessage(messageId: MessageId, message: string): boolean;
  sendDirectDeleteMessage(messageId: MessageId): boolean;
  sendDirectReaction(messageId: MessageId, reaction: string): boolean;
  sendEditMessage(messageId: MessageId, message: string): boolean;
  sendDeleteMessage(messageId: MessageId): boolean;
  sendReplyMessage(message: string, messageId?: MessageId | null, replyTo?: MessageId | null): boolean;
  sendReaction(messageId: MessageId, reaction: string): boolean;
  close(): void;
}

export type ServerEvent = Record<string, unknown> & {
  type?: string;
  messageId?: MessageId | null;
};

type OutgoingEvent = MessagePayload | DirectMessagePayload;

function isMessageId(value: unknown): value is MessageId {
  return typeof value === "string" || typeof value === "number";
}

export function createWebSocket(
  _legacyToken?: string | null,
  {
    onMessage,
    onOpen,
    onClose,
    onError,
    onReconnecting,
    onAuthenticationRequired,
  }: WebSocketCallbacks = {},
): WebSocketClient {
  let socket: WebSocket | null = null;
  let reconnectTimer: ReturnType<typeof setTimeout> | null = null;
  let reconnectAttempt = 0;
  let manuallyClosed = false;

  const deliveryTracker = new DeliveryTracker({
    onFailed: (event) => onMessage?.(event),
  });

  function connect(): void {
    if (manuallyClosed) return;

    socket = new WebSocket(WS_URL);
    socket.onopen = () => {
      const reconnected = reconnectAttempt > 0;
      reconnectAttempt = 0;
      onOpen?.({ reconnected });
    };

    socket.onmessage = (event: MessageEvent<string>) => {
      try {
        if (typeof event.data !== "string") return;
        const data = JSON.parse(event.data) as ServerEvent;

        if (data.type === "direct_message" && data.notifyRecipient === true) {
          notifyDirectMessage({
            ...data,
            senderId: Number(data.senderId ?? data.userId),
            userId: Number(data.senderId ?? data.userId),
            displayName: String(data.displayName || data.username || "Usuário"),
          });
        }

        if (data.type === "ack" && isMessageId(data.messageId)) {
          deliveryTracker.forget(data.messageId);
        }
        if (data.type === "message" && isMessageId(data.messageId)) {
          deliveryTracker.forget(data.messageId);
        }
        if (data.type === "moderation") {
          emitModerationEvent(data as ModerationEventData, () => deliveryTracker.rejectOldest());
        }
        if (
          data.type === "messages_cleared" &&
          emitFullChannelClear(data as ModerationEventData, deliveryTracker, (event) =>
            onMessage?.(event as ServerEvent),
          )
        ) {
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

  function scheduleReconnect(): void {
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

  function send(payload: OutgoingEvent): boolean {
    if (!socket || socket.readyState !== WebSocket.OPEN) return false;

    if (payload.type === "message" && isMessageId(payload.messageId)) {
      deliveryTracker.remember(payload as OutgoingMessagePayload);
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
      return send(messagePayload(message, messageId));
    },
    sendDirectMessage(message, messageId = null, recipientId, replyTo = null) {
      if (recipientId == null) return false;
      return send(directMessagePayload(message, messageId, recipientId, replyTo));
    },
    sendDirectEditMessage(messageId, message) {
      return send(directMessageEditPayload(messageId, message));
    },
    sendDirectDeleteMessage(messageId) {
      return send(directMessageDeletePayload(messageId));
    },
    sendDirectReaction(messageId, reaction) {
      return send(directMessageReactionPayload(messageId, reaction));
    },
    sendEditMessage(messageId, message) {
      return send(editMessagePayload(messageId, message));
    },
    sendDeleteMessage(messageId) {
      return send(deleteMessagePayload(messageId));
    },
    sendReplyMessage(message, messageId = null, replyTo = null) {
      return send(messagePayload(message, messageId, replyTo));
    },
    sendReaction(messageId, reaction) {
      return send(reactionPayload(messageId, reaction));
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
