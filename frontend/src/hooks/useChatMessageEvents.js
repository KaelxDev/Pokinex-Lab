import { useCallback } from "react";

export function useChatMessageEvents({
  clearLocalHistory,
  contextMenu,
  editingId,
  mergeUser,
  reactionPickerMessageId,
  replyingTo,
  setContextMenu,
  setEditError,
  setEditSaving,
  setEditingId,
  setEditingText,
  setMessages,
  setOfflineQueue,
  setReactionPickerMessageId,
  setReplyingTo,
  syncProfile,
  userRef,
}) {
  return useCallback((data) => {
    if (data?.type === "users") {
      const list = Array.isArray(data.users) ? data.users : [];
      mergeUser.__setUsers?.(list);
      list.forEach(mergeUser);
      return;
    }

    if (data?.type === "profile_updated" && data.user) {
      mergeUser(data.user);
      if (String(userRef.current?.id) === String(data.user.id)) {
        syncProfile({ ...userRef.current, ...data.user });
      }
      setMessages((current) =>
        current.map((item) =>
          String(item.userId) === String(data.user.id)
            ? { ...item, ...data.user }
            : item,
        ),
      );
      return;
    }

    if (data?.type === "chat_reset") {
      const command = data.commandMessage;
      if (!command?.messageId) return;

      clearLocalHistory();
      setOfflineQueue([]);
      setMessages([{
        ...command,
        ephemeral: true,
        offline: false,
        deliveryStatus: "sent",
      }]);
      setContextMenu(null);
      setReactionPickerMessageId(null);
      setReplyingTo(null);
      setEditingId(null);
      setEditingText("");
      setEditSaving(false);
      setEditError("");
      return;
    }

    if (data?.type === "messages_cleared") {
      const messageIds = new Set(
        Array.isArray(data.messageIds) ? data.messageIds.map((id) => String(id)) : [],
      );
      if (messageIds.size === 0) return;

      setMessages((current) =>
        current.filter((item) => !messageIds.has(String(item.messageId))),
      );

      if (contextMenu?.message?.messageId && messageIds.has(String(contextMenu.message.messageId))) {
        setContextMenu(null);
      }
      if (editingId && messageIds.has(String(editingId))) {
        setEditingId(null);
        setEditingText("");
        setEditSaving(false);
        setEditError("");
      }
      if (replyingTo?.messageId && messageIds.has(String(replyingTo.messageId))) {
        setReplyingTo(null);
      }
      if (reactionPickerMessageId && messageIds.has(String(reactionPickerMessageId))) {
        setReactionPickerMessageId(null);
      }
      return;
    }

    if (data?.type === "ack") {
      setOfflineQueue((current) =>
        current.filter((item) => item.id !== data.messageId),
      );
      setMessages((current) =>
        current.map((item) =>
          item.messageId === data.messageId
            ? { ...item, offline: false, deliveryStatus: "sent" }
            : item,
        ),
      );
      return;
    }

    if (data?.type === "edit_ack") {
      setEditSaving(false);
      return;
    }

    if (data?.type === "delete_ack") return;

    if (data?.type === "error" && data.action === "edit_message") {
      setEditError(data.message || "Não foi possível editar a mensagem.");
      setEditSaving(false);
      return;
    }

    if (data?.type === "error" && data.action === "delete_message") {
      console.error("Não foi possível excluir:", data.message);
      return;
    }

    if (data?.type === "error" && data.action === "reaction") {
      console.error("Não foi possível reagir:", data.message);
      return;
    }

    if (data?.type === "message_edited") {
      setMessages((current) =>
        current.map((item) =>
          item.messageId === data.messageId
            ? {
                ...item,
                ...data,
                deliveryStatus: "sent",
                offline: false,
                editPending: false,
                edited: true,
              }
            : item,
        ),
      );
      return;
    }

    if (data?.type === "message_deleted") {
      setMessages((current) =>
        current.map((item) =>
          item.messageId === data.messageId
            ? {
                ...item,
                ...data,
                message: "Esta mensagem foi excluída",
                deleted: true,
                deliveryStatus: "sent",
                offline: false,
                editPending: false,
              }
            : item,
        ),
      );
      return;
    }

    if (data?.type === "message_reaction") {
      setMessages((current) =>
        current.map((item) =>
          item.messageId === data.messageId
            ? { ...item, reactions: data.reactions || {} }
            : item,
        ),
      );
      return;
    }

    if (data?.type === "message" && data.messageId) {
      mergeUser({
        id: data.userId,
        username: data.username,
        displayName: data.displayName,
        avatar: data.avatar || "",
        status: data.status || "",
        online: true,
        ...(data.role ? { role: data.role } : {}),
      });
      setMessages((current) => {
        const index = current.findIndex((item) => item.messageId === data.messageId);
        const incoming = {
          ...data,
          deliveryStatus: "sent",
          offline: false,
          reactions: data.reactions || {},
        };
        if (index >= 0) {
          const next = [...current];
          next[index] = { ...next[index], ...incoming };
          return next;
        }
        return [...current, incoming];
      });
      return;
    }

    if (data?.type === "system") {
      setMessages((current) => [
        ...current,
        { ...data, timestamp: data.timestamp || Date.now() },
      ]);
    }
  }, [clearLocalHistory, contextMenu?.message?.messageId, editingId, mergeUser, reactionPickerMessageId, replyingTo?.messageId, setContextMenu, setEditError, setEditSaving, setEditingId, setEditingText, setMessages, setOfflineQueue, setReactionPickerMessageId, setReplyingTo, syncProfile, userRef]);
}
