import { useCallback } from "react";
import type { Dispatch, FormEvent, MutableRefObject, SetStateAction } from "react";
import type { MessageId } from "../../types/websocket";
import type { WebSocketClient } from "../../services/websocket/client.ts";
import type { ChatMessage, OfflineQueueItem, UserRecord, ReplyTarget, ContextMenuState } from "../../types/chat";

export interface MessageMutationsOptions {
  userRef: MutableRefObject<UserRecord | null>;
  messageInput: string;
  setMessageInput: Dispatch<SetStateAction<string>>;
  replyingTo: ReplyTarget | null;
  setReplyingTo: Dispatch<SetStateAction<ReplyTarget | null>>;
  isConnected: () => boolean;
  getSocket: () => WebSocketClient | null;
  setOfflineQueue: Dispatch<SetStateAction<OfflineQueueItem[]>>;
  setMessages: Dispatch<SetStateAction<ChatMessage[]>>;
  setContextMenu: Dispatch<SetStateAction<ContextMenuState | null>>;
  setReactionPickerMessageId: Dispatch<SetStateAction<MessageId | null>>;
  editingId: MessageId | null;
  setEditingId: Dispatch<SetStateAction<MessageId | null>>;
  editingText: string;
  setEditingText: Dispatch<SetStateAction<string>>;
  editSaving: boolean;
  setEditSaving: Dispatch<SetStateAction<boolean>>;
  setEditError: Dispatch<SetStateAction<string>>;
}

export interface MessageMutationsState {
  sendMessage: (event: FormEvent<HTMLFormElement>) => void;
  beginEdit: (message: ChatMessage) => void;
  cancelEdit: () => void;
  saveEdit: (event: FormEvent<HTMLFormElement>) => void;
  confirmDelete: (message: ChatMessage) => void;
  beginReply: (message: ChatMessage) => void;
  handleReaction: (messageId: MessageId, reaction: string) => void;
}

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
}: MessageMutationsOptions): MessageMutationsState {
  const sendMessage = useCallback((event: FormEvent<HTMLFormElement>) => {
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

    const optimistic: ChatMessage = {
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

    const sent = Boolean(
      connected && (
        replyTo
          ? socket?.sendReplyMessage(text, id, replyTo.messageId)
          : socket?.sendMessage(text, id)
      ),
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
  }, [
    getSocket,
    isConnected,
    messageInput,
    replyingTo,
    setMessageInput,
    setOfflineQueue,
    setMessages,
    setReplyingTo,
    userRef,
  ]);

  const beginEdit = useCallback((message: ChatMessage) => {
    setContextMenu(null);
    setReactionPickerMessageId(null);
    setEditError("");
    setEditingId(message.messageId ?? null);
    setEditingText(message.message ?? "");
    setReplyingTo(null);
  }, [setContextMenu, setEditError, setEditingId, setEditingText, setReactionPickerMessageId, setReplyingTo]);

  const cancelEdit = useCallback(() => {
    if (editSaving) return;
    setEditingId(null);
    setEditingText("");
    setEditError("");
  }, [editSaving, setEditError, setEditingId, setEditingText]);

  const saveEdit = useCallback((event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const text = editingText.trim();
    if (editingId == null || !text) {
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
        String(message.messageId) === String(editingId)
          ? { ...message, message: text, edited: true, editPending: true }
          : message,
      ),
    );
    setEditingId(null);
    setEditingText("");
  }, [editingId, editingText, getSocket, isConnected, setEditError, setEditSaving, setEditingId, setEditingText, setMessages]);

  const deleteMessage = useCallback((message: ChatMessage) => {
    setContextMenu(null);
    setReactionPickerMessageId(null);
    if (message.messageId == null) return;
    const socket = getSocket();
    if (!isConnected() || !socket?.sendDeleteMessage(message.messageId)) return;

    setMessages((current) =>
      current.map((item) =>
        String(item.messageId) === String(message.messageId)
          ? { ...item, message: "Esta mensagem foi excluída", deleted: true, deletePending: true }
          : item,
      ),
    );
  }, [getSocket, isConnected, setContextMenu, setMessages, setReactionPickerMessageId]);

  const confirmDelete = useCallback((message: ChatMessage) => {
    if (window.confirm("Excluir esta mensagem?")) deleteMessage(message);
    else setContextMenu(null);
  }, [deleteMessage, setContextMenu]);

  const beginReply = useCallback((message: ChatMessage) => {
    if (message.messageId == null) return;
    setContextMenu(null);
    setReactionPickerMessageId(null);
    setEditingId(null);
    setEditError("");
    setReplyingTo({
      messageId: message.messageId,
      userId: message.userId,
      username: message.username,
      displayName: message.displayName,
      message: message.message,
      deleted: Boolean(message.deleted),
    });
  }, [setContextMenu, setEditError, setEditingId, setReactionPickerMessageId, setReplyingTo]);

  const handleReaction = useCallback((messageId: MessageId, reaction: string) => {
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
