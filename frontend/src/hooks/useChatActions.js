import { useCallback, useEffect, useRef, useState } from "react";
import { copyText } from "../utils/chat";

export function useChatActions({
  user,
  userRef,
  isConnected,
  getSocket,
  offlineQueue,
  setOfflineQueue,
  setMessages,
}) {
  const [messageInput, setMessageInput] = useState("");
  const [replyingTo, setReplyingTo] = useState(null);
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

    const connected = isConnected();
    const socket = getSocket();
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
        ? socket?.sendReplyMessage(text, id, replyingTo.messageId)
        : socket?.sendMessage(text, id));

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
  }, [getSocket, isConnected, messageInput, replyingTo, setMessages, setOfflineQueue, userRef]);

  const beginEdit = useCallback((message) => {
    setContextMenu(null);
    setReactionPickerMessageId(null);
    setEditError("");
    setEditingId(message.messageId);
    setEditingText(message.message);
    setReplyingTo(null);
  }, []);

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
  }, [editingId, editingText, getSocket, isConnected, setMessages]);

  const deleteMessage = useCallback((message) => {
    setContextMenu(null);
    setReactionPickerMessageId(null);
    const socket = getSocket();
    if (!isConnected() || !socket?.sendDeleteMessage(message.messageId)) return;

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
  }, [getSocket, isConnected, setMessages]);

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
  }, []);

  const handleReaction = useCallback((messageId, reaction) => {
    const socket = getSocket();
    if (!isConnected() || !socket?.sendReaction(messageId, reaction)) return;
    setReactionPickerMessageId(null);
  }, [getSocket, isConnected]);

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
    const currentUser = userRef.current || user;
    const isMine =
      message.userId != null
        ? String(message.userId) === String(currentUser?.id)
        : String(message.username || "") === String(currentUser?.username || "");

    setContextMenu({
      x: Math.max(8, Math.min(event.clientX, window.innerWidth - 190)),
      y: Math.max(8, Math.min(event.clientY, window.innerHeight - 210)),
      message,
      isMine,
    });
  }, [user, userRef]);

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
      socket.sendMessage(item.message, item.id);
    }
  }, [getSocket, offlineQueue, setMessages]);

  useEffect(() => () => clearTimeout(longPressRef.current), []);

  return {
    messageInput,
    setMessageInput,
    replyingTo,
    setReplyingTo,
    contextMenu,
    setContextMenu,
    editingId,
    setEditingId,
    editingText,
    setEditingText,
    editSaving,
    setEditSaving,
    editError,
    setEditError,
    reactionPickerMessageId,
    setReactionPickerMessageId,
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
    flushQueue,
  };
}
