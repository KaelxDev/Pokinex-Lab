import { useRef, useState } from "react";
import type {
  Dispatch,
  MutableRefObject,
  SetStateAction,
} from "react";
import type { MessageId } from "../types/websocket";
import type {
  ChatMessage,
  ContextMenuState,
  OfflineQueueItem,
  ReplyTarget,
  UserRecord,
} from "../types/chat";
import type { WebSocketClient } from "../services/websocket/client.ts";
import { useMessageInteractions } from "./chat/useMessageInteractions";
import { useMessageMutations } from "./chat/useMessageMutations";
import { useOfflineQueue } from "./chat/useOfflineQueue";

export interface ChatActionsOptions {
  user: UserRecord | null;
  userRef?: MutableRefObject<UserRecord | null> | null;
  isConnected: () => boolean;
  getSocket: () => WebSocketClient | null;
  offlineQueue: OfflineQueueItem[];
  setOfflineQueue: Dispatch<SetStateAction<OfflineQueueItem[]>>;
  setMessages: Dispatch<SetStateAction<ChatMessage[]>>;
}

export interface ChatActionsState {
  messageInput: string;
  setMessageInput: Dispatch<SetStateAction<string>>;
  replyingTo: ReplyTarget | null;
  setReplyingTo: Dispatch<SetStateAction<ReplyTarget | null>>;
  contextMenu: ContextMenuState | null;
  setContextMenu: Dispatch<SetStateAction<ContextMenuState | null>>;
  editingId: MessageId | null;
  setEditingId: Dispatch<SetStateAction<MessageId | null>>;
  editingText: string;
  setEditingText: Dispatch<SetStateAction<string>>;
  editSaving: boolean;
  setEditSaving: Dispatch<SetStateAction<boolean>>;
  editError: string;
  setEditError: Dispatch<SetStateAction<string>>;
  reactionPickerMessageId: MessageId | null;
  setReactionPickerMessageId: Dispatch<SetStateAction<MessageId | null>>;
  sendMessage: ReturnType<typeof useMessageMutations>["sendMessage"];
  beginEdit: ReturnType<typeof useMessageMutations>["beginEdit"];
  cancelEdit: ReturnType<typeof useMessageMutations>["cancelEdit"];
  saveEdit: ReturnType<typeof useMessageMutations>["saveEdit"];
  confirmDelete: ReturnType<typeof useMessageMutations>["confirmDelete"];
  beginReply: ReturnType<typeof useMessageMutations>["beginReply"];
  handleReaction: ReturnType<typeof useMessageMutations>["handleReaction"];
  toggleReactionPicker: ReturnType<typeof useMessageInteractions>["toggleReactionPicker"];
  openContextMenu: ReturnType<typeof useMessageInteractions>["openContextMenu"];
  startLongPress: ReturnType<typeof useMessageInteractions>["startLongPress"];
  endLongPress: ReturnType<typeof useMessageInteractions>["endLongPress"];
  copyMessage: ReturnType<typeof useMessageInteractions>["copyMessage"];
  flushQueue: ReturnType<typeof useOfflineQueue>["flushQueue"];
}

export function useChatActions({
  user,
  userRef,
  isConnected,
  getSocket,
  offlineQueue,
  setOfflineQueue,
  setMessages,
}: ChatActionsOptions): ChatActionsState {
  const [messageInput, setMessageInput] = useState("");
  const [replyingTo, setReplyingTo] = useState<ReplyTarget | null>(null);
  const [editingId, setEditingId] = useState<MessageId | null>(null);
  const [editingText, setEditingText] = useState("");
  const [editSaving, setEditSaving] = useState(false);
  const [editError, setEditError] = useState("");

  const stableUserRef = userRef || useRef<UserRecord | null>(user);

  const interactions = useMessageInteractions({
    user,
    userRef: stableUserRef,
  });

  const mutations = useMessageMutations({
    userRef: stableUserRef,
    messageInput,
    setMessageInput,
    replyingTo,
    setReplyingTo,
    isConnected,
    getSocket,
    setOfflineQueue,
    setMessages,
    setContextMenu: interactions.setContextMenu,
    setReactionPickerMessageId: interactions.setReactionPickerMessageId,
    editingId,
    setEditingId,
    editingText,
    setEditingText,
    editSaving,
    setEditSaving,
    setEditError,
  });

  const { flushQueue } = useOfflineQueue({
    getSocket,
    offlineQueue,
    setMessages,
  });

  return {
    messageInput,
    setMessageInput,
    replyingTo,
    setReplyingTo,
    contextMenu: interactions.contextMenu,
    setContextMenu: interactions.setContextMenu,
    editingId,
    setEditingId,
    editingText,
    setEditingText,
    editSaving,
    setEditSaving,
    editError,
    setEditError,
    reactionPickerMessageId: interactions.reactionPickerMessageId,
    setReactionPickerMessageId: interactions.setReactionPickerMessageId,
    sendMessage: mutations.sendMessage,
    beginEdit: mutations.beginEdit,
    cancelEdit: mutations.cancelEdit,
    saveEdit: mutations.saveEdit,
    confirmDelete: mutations.confirmDelete,
    beginReply: mutations.beginReply,
    handleReaction: mutations.handleReaction,
    toggleReactionPicker: interactions.toggleReactionPicker,
    openContextMenu: interactions.openContextMenu,
    startLongPress: interactions.startLongPress,
    endLongPress: interactions.endLongPress,
    copyMessage: interactions.copyMessage,
    flushQueue,
  };
}
