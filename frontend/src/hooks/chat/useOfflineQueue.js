import { useCallback } from "react";

export function sendQueuedMessage(socket, item) {
  if (!socket || !item) return false;

  if (item.type === "message" && item.replyTo?.messageId) {
    return socket.sendReplyMessage(item.message, item.id, item.replyTo.messageId);
  }

  return socket.sendMessage(item.message, item.id);
}

export function useOfflineQueue({
  getSocket,
  offlineQueue,
  setMessages,
}) {
  const flushQueue = useCallback(() => {
    const socket = getSocket();
    if (!socket || offlineQueue.length === 0) return;

    for (const item of offlineQueue) {
      setMessages((current) =>
        current.map((message) =>
          message.messageId === item.id
            ? { ...message, offline: false, deliveryStatus: "sending" }
            : message,
        ),
      );

      sendQueuedMessage(socket, item);
    }
  }, [getSocket, offlineQueue, setMessages]);

  return { flushQueue };
}
