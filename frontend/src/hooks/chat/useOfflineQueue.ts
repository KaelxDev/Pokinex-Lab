import { useCallback } from "react";
import type { Dispatch, SetStateAction } from "react";
import type { WebSocketClient } from "../../services/websocket/client.ts";
import type { ChatMessage, OfflineQueueItem } from "../useChatHistory.ts";

export interface OfflineQueueState {
  flushQueue: () => void;
}

export function sendQueuedMessage(
  socket: WebSocketClient | null,
  item: OfflineQueueItem | null | undefined,
): boolean {
  if (!socket || !item) return false;

  if (item.type === "message" && typeof item.replyTo === "object" && item.replyTo !== null) {
    const replyToId = "messageId" in item.replyTo ? item.replyTo.messageId : null;
    if (typeof replyToId === "string" || typeof replyToId === "number") {
      return socket.sendReplyMessage(item.message, item.id, replyToId);
    }
  }

  return socket.sendMessage(item.message, item.id);
}

export function useOfflineQueue({
  getSocket,
  offlineQueue,
  setMessages,
}: {
  getSocket: () => WebSocketClient | null;
  offlineQueue: OfflineQueueItem[];
  setMessages: Dispatch<SetStateAction<ChatMessage[]>>;
}): OfflineQueueState {
  const flushQueue = useCallback(() => {
    const socket = getSocket();
    if (!socket || offlineQueue.length === 0) return;

    for (const item of offlineQueue) {
      setMessages((current) =>
        current.map((message) =>
          String(message.messageId) === String(item.id)
            ? { ...message, offline: false, deliveryStatus: "sending" }
            : message,
        ),
      );

      sendQueuedMessage(socket, item);
    }
  }, [getSocket, offlineQueue, setMessages]);

  return { flushQueue };
}
