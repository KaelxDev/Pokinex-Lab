import { useCallback } from "react";

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

      if (item.type === "message" && item.replyTo?.messageId) {
        socket.sendReplyMessage(item.message, item.id, item.replyTo.messageId);
      } else {
        socket.sendMessage(item.message, item.id);
      }
    }
  }, [getSocket, offlineQueue, setMessages]);

  return { flushQueue };
}
