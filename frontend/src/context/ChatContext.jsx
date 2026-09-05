import { createContext, useCallback, useContext, useEffect, useMemo, useRef } from "react";
import { useChatActions } from "../hooks/useChatActions";
import { useChatConnection } from "../hooks/useChatConnection";
import { useChatHistory } from "../hooks/useChatHistory";
import { useChatMessageEvents } from "../hooks/useChatMessageEvents";
import { useProfileEditor } from "../hooks/useProfileEditor";
import { useUserDirectory } from "../hooks/useUserDirectory";

const ChatContext = createContext(null);

export function ChatProvider({ user, syncUser, onAuthenticationRequired, children }) {
  const history = useChatHistory(user?.id);
  const { messages, setMessages, offlineQueue, setOfflineQueue } = history;
  const directory = useUserDirectory({ messages, setMessages, syncUser });
  const { users, setUsers, profilesById, mergeUser, syncProfile } = directory;
  const profile = users.find((item) => String(item.id) === String(user?.id)) || user;

  const userRef = useRef(user);
  useEffect(() => {
    userRef.current = user;
  }, [user]);

  const messageHandlerRef = useRef(() => {});
  const handleWebSocketMessageProxy = useCallback((data) => {
    messageHandlerRef.current(data);
  }, []);

  const handleConnectionOpen = useCallback(({ reconnected } = {}) => {
    if (reconnected) void history.loadMessageHistory();
  }, [history.loadMessageHistory]);

  const connection = useChatConnection(Boolean(user), {
    onMessage: handleWebSocketMessageProxy,
    onOpen: handleConnectionOpen,
    onAuthenticationRequired,
  });

  const actions = useChatActions({
    user,
    userRef,
    isConnected: connection.isConnected,
    getSocket: connection.getSocket,
    offlineQueue,
    setOfflineQueue,
    setMessages,
  });

  const handleWebSocketMessage = useChatMessageEvents({
    clearLocalHistory: history.clearLocalHistory,
    contextMenu: actions.contextMenu,
    editingId: actions.editingId,
    mergeUser,
    reactionPickerMessageId: actions.reactionPickerMessageId,
    replyingTo: actions.replyingTo,
    setContextMenu: actions.setContextMenu,
    setEditError: actions.setEditError,
    setEditSaving: actions.setEditSaving,
    setEditingId: actions.setEditingId,
    setEditingText: actions.setEditingText,
    setMessages,
    setOfflineQueue,
    setReactionPickerMessageId: actions.setReactionPickerMessageId,
    setReplyingTo: actions.setReplyingTo,
    setUsers,
    syncProfile,
    userRef,
  });

  const profileEditor = useProfileEditor({ user, profile, syncProfile });

  useEffect(() => {
    messageHandlerRef.current = handleWebSocketMessage;
    return () => {
      messageHandlerRef.current = () => {};
    };
  }, [handleWebSocketMessage]);

  useEffect(() => {
    if (connection.connected) actions.flushQueue();
  }, [connection.connected, actions.flushQueue]);

  const value = useMemo(() => ({
    user,
    profile,
    users,
    profilesById,
    messages: history.messages,
    offlineQueue: history.offlineQueue,
    historyLoading: history.historyLoading,
    loadMessageHistory: history.loadMessageHistory,
    messagesRef: history.messagesRef,
    handleMessagesScroll: history.handleMessagesScroll,
    clearLocalHistory: history.clearLocalHistory,
    ...connection,
    ...actions,
    ...profileEditor,
  }), [
    user,
    profile,
    users,
    profilesById,
    history.messages,
    history.offlineQueue,
    history.historyLoading,
    history.loadMessageHistory,
    history.messagesRef,
    history.handleMessagesScroll,
    history.clearLocalHistory,
    connection,
    actions,
    profileEditor,
  ]);

  return <ChatContext.Provider value={value}>{children}</ChatContext.Provider>;
}

export function useChatContext() {
  const context = useContext(ChatContext);
  if (!context) {
    throw new Error("useChatContext deve ser usado dentro de ChatProvider");
  }
  return context;
}
