import { useRef, useState } from "react";
import { useMessageInteractions } from "./chat/useMessageInteractions";
import { useMessageMutations } from "./chat/useMessageMutations";
import { useOfflineQueue } from "./chat/useOfflineQueue";

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
  const [editingId, setEditingId] = useState(null);
  const [editingText, setEditingText] = useState("");
  const [editSaving, setEditSaving] = useState(false);
  const [editError, setEditError] = useState("");

  const stableUserRef = userRef || useRef(user);

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
