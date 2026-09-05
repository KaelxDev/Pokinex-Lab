import { useCallback } from "react";
import type {
  Dispatch,
  MutableRefObject,
  SetStateAction,
} from "react";
import type { DeliveryFailedEvent, MessageId } from "../types/websocket";
import type { ServerEvent } from "../services/websocket/client.ts";
import type {
  ChatMessage,
  ContextMenuState,
  OfflineQueueItem,
  ReplyTarget,
  UserRecord,
} from "../types/chat";

export interface ChatMessageEvent extends Record<string, unknown> {
  type?: string;
  messageId?: MessageId | null;
  message?: string;
  userId?: string | number;
  username?: string;
  displayName?: string;
  avatar?: string;
  status?: string;
  role?: string;
  users?: unknown;
  user?: unknown;
  commandMessage?: unknown;
  messageIds?: unknown;
  action?: string;
  reactions?: unknown;
  timestamp?: number | string;
  replyTo?: MessageId | null;
  error?: string;
  clearAll?: boolean;
}

type WebSocketMessageEvent = ChatMessageEvent | ServerEvent | DeliveryFailedEvent;

export interface ChatMessageEventsOptions {
  clearLocalHistory: () => void;
  contextMenu: ContextMenuState | null;
  editingId: MessageId | null;
  mergeUser: (user: UserRecord) => void;
  reactionPickerMessageId: MessageId | null;
  replyingTo: ReplyTarget | null;
  setContextMenu: Dispatch<SetStateAction<ContextMenuState | null>>;
  setEditError: Dispatch<SetStateAction<string>>;
  setEditSaving: Dispatch<SetStateAction<boolean>>;
  setEditingId: Dispatch<SetStateAction<MessageId | null>>;
  setEditingText: Dispatch<SetStateAction<string>>;
  setMessages: Dispatch<SetStateAction<ChatMessage[]>>;
  setOfflineQueue: Dispatch<SetStateAction<OfflineQueueItem[]>>;
  setReactionPickerMessageId: Dispatch<SetStateAction<MessageId | null>>;
  setReplyingTo: Dispatch<SetStateAction<ReplyTarget | null>>;
  setUsers: Dispatch<SetStateAction<UserRecord[]>>;
  syncProfile: (profile: UserRecord) => void;
  userRef: MutableRefObject<UserRecord | null>;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function asUserRecord(value: unknown): UserRecord | null {
  return isRecord(value) ? (value as UserRecord) : null;
}

function asChatMessage(value: unknown): ChatMessage | null {
  return isRecord(value) ? (value as ChatMessage) : null;
}

function asMessageId(value: unknown): MessageId | null {
  return typeof value === "string" || typeof value === "number" ? value : null;
}

function eventType(data: unknown): string | null {
  if (!isRecord(data) || typeof data.type !== "string") return null;
  return data.type;
}

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
  setUsers,
  syncProfile,
  userRef,
}: ChatMessageEventsOptions): (data: WebSocketMessageEvent) => void {
  return useCallback((rawData) => {
    const data = isRecord(rawData) ? (rawData as ChatMessageEvent) : {};
    const type = eventType(data);

    if (type === "users") {
      const list = Array.isArray(data.users)
        ? data.users.map(asUserRecord).filter((user): user is UserRecord => user !== null)
        : [];
      setUsers(list);
      list.forEach(mergeUser);
      return;
    }

    if (type === "profile_updated") {
      const updatedUser = asUserRecord(data.user);
      if (!updatedUser) return;
      mergeUser(updatedUser);
      if (String(userRef.current?.id) === String(updatedUser.id)) {
        syncProfile({ ...userRef.current, ...updatedUser });
      }
      setMessages((current) =>
        current.map((item) =>
          String(item.userId) === String(updatedUser.id)
            ? { ...item, ...updatedUser }
            : item,
        ),
      );
      return;
    }

    if (type === "chat_reset") {
      const command = asChatMessage(data.commandMessage);
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

    if (type === "messages_cleared") {
      const messageIds = new Set(
        Array.isArray(data.messageIds) ? data.messageIds.map((id) => String(id)) : [],
      );
      if (messageIds.size === 0) return;
      setMessages((current) => current.filter((item) => !messageIds.has(String(item.messageId))));
      if (contextMenu?.message?.messageId && messageIds.has(String(contextMenu.message.messageId))) setContextMenu(null);
      if (editingId != null && messageIds.has(String(editingId))) {
        setEditingId(null);
        setEditingText("");
        setEditSaving(false);
        setEditError("");
      }
      if (replyingTo?.messageId != null && messageIds.has(String(replyingTo.messageId))) setReplyingTo(null);
      if (reactionPickerMessageId != null && messageIds.has(String(reactionPickerMessageId))) setReactionPickerMessageId(null);
      return;
    }

    if (type === "ack") {
      const ackId = asMessageId(data.messageId);
      if (ackId == null) return;
      setOfflineQueue((current) => current.filter((item) => String(item.id) !== String(ackId)));
      setMessages((current) => current.map((item) =>
        String(item.messageId) === String(ackId) ? { ...item, offline: false, deliveryStatus: "sent" } : item,
      ));
      return;
    }

    if (type === "delivery_failed") {
      const failedId = asMessageId(data.messageId);
      if (failedId == null || typeof data.message !== "string" || !data.message) return;

      setMessages((current) => {
        const existing = current.find((item) => String(item.messageId) === String(failedId));
        if (!existing || existing.deliveryStatus === "sent") return current;
        return current.map((item) =>
          String(item.messageId) === String(failedId)
            ? { ...item, offline: true, deliveryStatus: "failed" }
            : item,
        );
      });

      const replyTo = asMessageId(data.replyTo);
      setOfflineQueue((queue) => {
        if (queue.some((item) => String(item.id) === String(failedId))) return queue;
        return [...queue, {
          id: String(failedId),
          type: "message",
          message: data.message as string,
          createdAt: Date.now(),
          ...(replyTo != null ? { replyTo: { messageId: replyTo } } : {}),
        }];
      });
      return;
    }

    if (type === "edit_ack") {
      setEditSaving(false);
      return;
    }
    if (type === "delete_ack") return;

    if (type === "error" && data.action === "edit_message") {
      setEditError(data.message || "Não foi possível editar a mensagem.");
      setEditSaving(false);
      return;
    }
    if (type === "error" && data.action === "delete_message") {
      console.error("Não foi possível excluir:", data.message);
      return;
    }
    if (type === "error" && data.action === "reaction") {
      console.error("Não foi possível reagir:", data.message);
      return;
    }

    if (type === "message_edited") {
      const messageId = asMessageId(data.messageId);
      if (messageId == null) return;
      setMessages((current) => current.map((item) =>
        String(item.messageId) === String(messageId)
          ? { ...item, ...data, deliveryStatus: "sent", offline: false, editPending: false, edited: true }
          : item,
      ));
      return;
    }

    if (type === "message_deleted") {
      const messageId = asMessageId(data.messageId);
      if (messageId == null) return;
      setMessages((current) => current.map((item) =>
        String(item.messageId) === String(messageId)
          ? { ...item, ...data, message: "Esta mensagem foi excluída", deleted: true, deliveryStatus: "sent", offline: false, editPending: false }
          : item,
      ));
      return;
    }

    if (type === "message_reaction") {
      const messageId = asMessageId(data.messageId);
      if (messageId == null) return;
      setMessages((current) => current.map((item) =>
        String(item.messageId) === String(messageId) ? { ...item, reactions: data.reactions || {} } : item,
      ));
      return;
    }

    if (type === "message") {
      const messageId = asMessageId(data.messageId);
      if (messageId == null) return;
      mergeUser({
        id: data.userId,
        username: typeof data.username === "string" ? data.username : undefined,
        displayName: typeof data.displayName === "string" ? data.displayName : undefined,
        avatar: typeof data.avatar === "string" ? data.avatar : "",
        status: typeof data.status === "string" ? data.status : "",
        online: true,
        ...(typeof data.role === "string" ? { role: data.role } : {}),
      });
      setMessages((current) => {
        const index = current.findIndex((item) => String(item.messageId) === String(messageId));
        const incoming: ChatMessage = { ...data, messageId, deliveryStatus: "sent", offline: false, reactions: data.reactions || {} };
        if (index >= 0) {
          const next = [...current];
          next[index] = { ...next[index], ...incoming };
          return next;
        }
        return [...current, incoming];
      });
      return;
    }

    if (type === "system") {
      setMessages((current) => [...current, { ...data, timestamp: data.timestamp || Date.now() }]);
    }
  }, [
    clearLocalHistory,
    contextMenu?.message?.messageId,
    editingId,
    mergeUser,
    reactionPickerMessageId,
    replyingTo?.messageId,
    setContextMenu,
    setEditError,
    setEditSaving,
    setEditingId,
    setEditingText,
    setMessages,
    setOfflineQueue,
    setReactionPickerMessageId,
    setReplyingTo,
    setUsers,
    syncProfile,
    userRef,
  ]);
}
