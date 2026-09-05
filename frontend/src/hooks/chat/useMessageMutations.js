import { useCallback } from "react";

export function useMessageMutations({
  userRef,
  messageInput,
  setMessageInput,
  replyingTo,
  setReplyingTo,
  isConnected,
  getSocket,
  setOfflineQueue,
  setMessages,
  setContextMenu,
  setReactionPickerMessageId,
  editingId,
  setEditingId,
  editingText,
  setEditingText,
  editSaving,
  setEditSaving,
  setEditError,
}) {
  const sendMessage = useCallback((event) => {
    event.preventDefault();
    const text = messageInput.trim();
    if (!text) return;

    const connected = isConnected();
    const socket = getSocket();
    const id = `${Date.now()}-${Math.random().toString(36).slice(2)}`;
    const sender = userRef.current;
    const role = String(sender?.role || "").toLowerCase();
    const isStaff = ["owner", "admin", "moderator", "staff"].includes(role);
    const isClearAllCommand = connected && isStaff && /^(?:!clear|!purge)\s+all$/i.test(text);
    const replyTo = replyingTo
      ? {
          messageId: replyingTo.messageId,
          userId: replyingTo.userId,
          username: replyingTo.username,
          displayName: replyingTo.displayName,
          message: replyingTo.message,
          deleted: replyingTo.deleted,
        }
      : null;

    const optimistic = {
      type: "message",
      messageId: id,
      userId: sender?.id,
      username: sender?.username,
      displayName: sender?.displayName,
      avatar: sender?.avatar || "",
      status: sender?.status || "",
      role: sender?.role || "member",
      message: text,
      timestamp: Date.now(),
      offline: !connected,
      deliveryStatus: connected ? "sending" : "pending",
      reactions: {},
      ...(isClearAllCommand ? { ephemeral: true, moderationCommand: true } : {}),
      ...(replyTo ? { replyTo } : {}),
    };

    setMessages((current) => [...current, optimistic]);

    const sent = connected && (
      replyTo
        ? socket?.sendReplyMessage(text, id, replyTo.messageId)
        : socket?.sendMessage(text, id)
    );

    if (!sent) {
      setOfflineQueue((current) => [
        ...current,
        {
          id,
          type: "message",
          message: text,
          createdAt: Date.now(),
          userId: sender?.id,
          username: sender?.username,
          displayName: sender?.displayName,
          avatar: sender?.avatar || "",
          ...(replyTo ? { replyTo } : {}),
        },
      ]);
    }

    setMessageInput("");
    setReplyingTo(null);
  }, [getSocket, isConnected, messageInput, replyingTo, setMessageInput, setOfflineQueue, setMessages, setReplyingTo, userRef]);

  const beginEdit = useCallback((message) => {
    setContextMenu(null);
    setReactionPickerMessageId(null);
    setEditError("");
    setEditingId(message.messageId);
    setEditingText(message.message);
    setReplyingTo(null);
  }, [setContextMenu, setEditError, setEditingId, setEditingText, setReactionPickerMessageId, setReplyingTo]);

  const cancelEdit = useCallback(() => {
    if (editSaving) return;
    setEditingId(null);
    setEditingText("");
    setEditError("");
  }, [editSaving, setEditError, setEditingId, setEditingText]);

  const saveEdit = useCallback((event) => {
    event.preventDefault();
    const text = editingText.trim();
    if (!editingId || !text) {
      setEditError("A mensagem não pode ficar vazia.");
      return;
    }
    const socket = getSocket();
    if (!isConnected() || !socket?.sendEditMessage(editingId, text)) {
      setEditError("Aguardando conexão para editar.");
      return;
    }

    setEditSaving(true);
    setMessages((current) =>
      current.map((message) =>
        message.messageId === editingId
          ? { ...message, message: text, edited: true, editPending: true }
          : message,
      ),
    );
    setEditingId(null);
    setEditingText("");
  }, [editingId, editingText, getSocket, isConnected, setEditError, setEditSaving, setEditingId, setEditingText, setMessages]);

  const deleteMessage = useCallback((message) => {
    setContextMenu(null);
    setReactionPickerMessageId(null);
    const socket = getSocket();
    if (!isConnected() || !socket?.sendDeleteMessage(message.messageId)) return;

    setMessages((current) =>
      current.map((item) =>
        item.messageId === message.messageId
          ? { ...item, message: "Esta mensagem foi excluída", deleted: true, deletePending: true }
          : item,
      ),
    );
  }, [getSocket, isConnected, setContextMenu, setMessages, setReactionPickerMessageId]);

  const confirmDelete = useCallback((message) => {
    if (window.confirm("Excluir esta mensagem?")) deleteMessage(message);
    else setContextMenu(null);
  }, [deleteMessage, setContextMenu]);

  const beginReply = useCallback((message) => {
    setContextMenu(null);
    setReactionPickerMessageId(null);
    setEditingId(null);
    setEditError("");
    setReplyingTo(message);
  }, [setContextMenu, setEditError, setEditingId, setReactionPickerMessageId, setReplyingTo]);

  const handleReaction = useCallback((messageId, reaction) => {
    const socket = getSocket();
    if (!isConnected() || !socket?.sendReaction(messageId, reaction)) return;
    setReactionPickerMessageId(null);
  }, [getSocket, isConnected, setReactionPickerMessageId]);

  return {
    sendMessage,
    beginEdit,
    cancelEdit,
    saveEdit,
    confirmDelete,
    beginReply,
    handleReaction,
  };
}
