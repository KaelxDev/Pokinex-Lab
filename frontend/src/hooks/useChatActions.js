import { useCallback, useEffect, useRef, useState } from "react";
import { copyText } from "../utils/chat";

export function useChatActions({
  user,
  userRef,
  connected,
  socketRef,
  messageInput,
  setMessageInput,
  replyingTo,
  setReplyingTo,
  messages,
  setMessages,
  offlineQueue,
  setOfflineQueue,
}) {
  const [contextMenu, setContextMenu] = useState(null);
  const [editingId, setEditingId] = useState(null);
  const [editingText, setEditingText] = useState("");
  const [editSaving, setEditSaving] = useState(false);
  const [editError, setEditError] = useState("");
  const [reactionPickerMessageId, setReactionPickerMessageId] = useState(null);
  const longPressRef = useRef(null);

  const sendMessage = useCallback((event) => {
    event.preventDefault();
    const text = messageInput.trim();
    if (!text) return;

    const id = `${Date.now()}-${Math.random().toString(36).slice(2)}`;
    const sender = userRef.current;
    const role = String(sender?.role || "").toLowerCase();
    const isStaff = ["owner", "admin", "moderator", "staff"].includes(role);
    const isClearAllCommand = connected && isStaff && /^(?:!clear|!purge)\s+all$/i.test(text);

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
      ...(replyingTo
        ? {
            replyTo: {
              messageId: replyingTo.messageId,
              userId: replyingTo.userId,
              username: replyingTo.username,
              displayName: replyingTo.displayName,
              message: replyingTo.message,
              deleted: replyingTo.deleted,
            },
          }
        : {}),
    };

    setMessages((current) => [...current, optimistic]);

    const sent = connected &&
      (replyingTo
        ? socketRef.current?.sendReplyMessage(text, id, replyingTo.messageId)
        : socketRef.current?.sendMessage(text, id));

    if (!sent) {
      setOfflineQueue((current) => [
        ...current,
        {
          id,
          message: text,
          createdAt: Date.now(),
          userId: sender?.id,
          username: sender?.username,
          displayName: sender?.displayName,
          avatar: sender?.avatar || "",
          ...(replyingTo ? { replyTo: { messageId: replyingTo.messageId } } : {}),
        },
      ]);
    }

    setMessageInput("");
    setReplyingTo(null);
  }, [connected, messageInput, replyingTo, setMessageInput, setMessages, setOfflineQueue, setReplyingTo, socketRef, userRef]);

  const beginEdit = useCallback((message) => {
    setContextMenu(null);
    setReactionPickerMessageId(null);
    setEditError("");
    setEditingId(message.messageId);
    setEditingText(message.message);
    setReplyingTo(null);
  }, [setReplyingTo]);

  const cancelEdit = useCallback(() => {
    if (editSaving) return;
    setEditingId(null);
    setEditingText("");
    setEditError("");
  }, [editSaving]);

  const saveEdit = useCallback((event) => {
    event.preventDefault();
    const text = editingText.trim();
    if (!editingId || !text) {
      setEditError("A mensagem não pode ficar vazia.");
      return;
    }
    if (!connected || !socketRef.current?.sendEditMessage(editingId, text)) {
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
  }, [connected, editingId, editingText, setMessages, socketRef]);

  const deleteMessage = useCallback((message) => {
    setContextMenu(null);
    setReactionPickerMessageId(null);
    if (!connected || !socketRef.current?.sendDeleteMessage(message.messageId)) return;

    setMessages((current) =>
      current.map((item) =>
        item.messageId === message.messageId
          ? {
              ...item,
              message: "Esta mensagem foi excluída",
              deleted: true,
              deletePending: true,
            }
          : item,
      ),
    );
  }, [connected, setMessages, socketRef]);

  const confirmDelete = useCallback((message) => {
    if (window.confirm("Excluir esta mensagem?")) deleteMessage(message);
    else setContextMenu(null);
  }, [deleteMessage]);

  const beginReply = useCallback((message) => {
    setContextMenu(null);
    setReactionPickerMessageId(null);
    setEditingId(null);
    setEditError("");
    setReplyingTo(message);
  }, [setReplyingTo]);

  const handleReaction = useCallback((messageId, reaction) => {
    if (!connected || !socketRef.current?.sendReaction(messageId, reaction)) return;
    setReactionPickerMessageId(null);
  }, [connected, socketRef]);

  const toggleReactionPicker = useCallback((event, messageId) => {
    event.preventDefault();
    event.stopPropagation();
    setContextMenu(null);
    setReactionPickerMessageId((current) => (current === messageId ? null : messageId));
  }, []);

  const openContextMenu = useCallback((event, message) => {
    event.preventDefault();
    event.stopPropagation();
    setReactionPickerMessageId(null);
    const isMine =
      message.userId != null
        ? String(message.userId) === String(user?.id)
        : String(message.username || "") === String(user?.username || "");

    setContextMenu({
      x: Math.max(8, Math.min(event.clientX, window.innerWidth - 190)),
      y: Math.max(8, Math.min(event.clientY, window.innerHeight - 210)),
      message,
      isMine,
    });
  }, [user?.id, user?.username]);

  const startLongPress = useCallback((event, message) => {
    if (event.touches.length !== 1) return;
    clearTimeout(longPressRef.current);
    longPressRef.current = setTimeout(() => {
      const touch = event.touches[0];
      openContextMenu(
        {
          preventDefault() {},
          stopPropagation() {},
          clientX: touch.clientX,
          clientY: touch.clientY,
        },
        message,
      );
      navigator.vibrate?.(20);
    }, 550);
  }, [openContextMenu]);

  const endLongPress = useCallback(() => {
    clearTimeout(longPressRef.current);
  }, []);

  const copyMessage = useCallback(async (message) => {
    if (message.deleted) return;
    try {
      await copyText(message.message);
      setContextMenu(null);
    } catch (error) {
      console.error("Não foi possível copiar:", error);
    }
  }, []);

  const flushQueue = useCallback(() => {
    const socket = socketRef.current;
    if (!socket || offlineQueue.length === 0) return;

    for (const item of offlineQueue) {
      setMessages((current) =>
        current.map((message) =>
          message.messageId === item.id
            ? { ...message, offline: false, deliveryStatus: "sending" }
            : message,
        ),
      );
      socket.sendMessage(item.message, item.id);
    }
  }, [offlineQueue, setMessages, socketRef]);

  useEffect(() => {
    if (connected) flushQueue();
  }, [connected, flushQueue]);

  useEffect(() => () => clearTimeout(longPressRef.current), []);

  useEffect(() => {
    function closeOverlays() {
      setContextMenu(null);
      setReactionPickerMessageId(null);
    }

    window.addEventListener("click", closeOverlays);
    return () => window.removeEventListener("click", closeOverlays);
  }, []);

  return {
    contextMenu,
    setContextMenu,
    editingId,
    editingText,
    setEditingText,
    editSaving,
    editError,
    replyingTo,
    setReplyingTo,
    reactionPickerMessageId,
    sendMessage,
    beginEdit,
    cancelEdit,
    saveEdit,
    confirmDelete,
    beginReply,
    handleReaction,
    toggleReactionPicker,
    openContextMenu,
    startLongPress,
    endLongPress,
    copyMessage,
  };
}
