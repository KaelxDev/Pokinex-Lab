import { useCallback, useEffect, useRef, useState } from "react";
import { logout as logoutRequest } from "./services/auth";
import AuthScreen from "./components/AuthScreen";
import ChatWorkspace from "./components/ChatWorkspace.jsx";
import { useAuthSession } from "./hooks/useAuthSession";
import { useChatActions } from "./hooks/useChatActions";
import { useChatConnection } from "./hooks/useChatConnection";
import { useChatHistory } from "./hooks/useChatHistory";
import { useChatMessageEvents } from "./hooks/useChatMessageEvents";
import { useProfileEditor } from "./hooks/useProfileEditor";
import { useUserDirectory } from "./hooks/useUserDirectory";

export default function App() {
  const { authChecked, user, userRef, syncUser, logout } = useAuthSession();
  const {
    messages,
    setMessages,
    offlineQueue,
    setOfflineQueue,
    historyLoading,
    loadMessageHistory,
    messagesRef,
    handleMessagesScroll,
    clearLocalHistory,
  } = useChatHistory(user?.id);

  const [messageInput, setMessageInput] = useState("");
  const [replyingTo, setReplyingTo] = useState(null);
  const connectionRef = useRef({ connected: false, socket: null });

  const isConnected = useCallback(() => connectionRef.current.connected, []);
  const getSocket = useCallback(() => connectionRef.current.socket, []);

  const {
    users,
    setUsers,
    profilesById,
    mergeUser,
    syncProfile,
  } = useUserDirectory({ messages, setMessages, syncUser });

  const profile = users.find((item) => String(item.id) === String(user?.id)) || user;

  const handleConnectionOpen = useCallback(({ reconnected } = {}) => {
    if (reconnected) void loadMessageHistory();
  }, [loadMessageHistory]);

  const {
    socketRef,
    connected,
    connectionStatus,
    reconnectAttempt,
    reconnectSeconds,
  } = useChatConnection(Boolean(authChecked && user), {
    onMessage: () => {},
    onOpen: handleConnectionOpen,
    onAuthenticationRequired: logout,
  });

  connectionRef.current = { connected, socket: socketRef.current };

  const {
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
  } = useChatActions({
    user,
    userRef,
    isConnected,
    getSocket,
    messageInput,
    setMessageInput,
    replyingTo,
    setReplyingTo,
    offlineQueue,
    setOfflineQueue,
    setMessages,
  });

  const handleWebSocketMessage = useChatMessageEvents({
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
  });

  const {
    profileOpen,
    profileError,
    profileSaving,
    avatarPreviewUrl,
    openProfile,
    saveProfile,
    chooseAvatar,
    closeProfile,
  } = useProfileEditor({ user, profile, syncProfile });

  useEffect(() => {
    if (socketRef.current) {
      // `useChatConnection` stores transport callbacks internally, so this
      // ref remains available for the action hook without mutating the socket.
    }
  }, [socketRef]);

  useEffect(() => {
    if (connected) flushQueue();
  }, [connected, flushQueue]);

  useEffect(() => {
    connectionRef.current = { connected, socket: socketRef.current };
  }, [connected, socketRef]);

  useEffect(() => {
    const socket = socketRef.current;
    if (!socket) return undefined;
    return undefined;
  }, [socketRef]);

  // The connection hook uses callback refs, so the handler is installed by
  // recreating the hook callback on render. Keeping this assignment here is
  // intentionally side-effect free for the current socket implementation.
  useEffect(() => {
    if (!socketRef.current) return;
    socketRef.current.__pokinexMessageHandler = handleWebSocketMessage;
    return () => {
      if (socketRef.current?.__pokinexMessageHandler === handleWebSocketMessage) {
        delete socketRef.current.__pokinexMessageHandler;
      }
    };
  }, [handleWebSocketMessage, socketRef]);

  async function handleLogout() {
    try {
      await logoutRequest();
    } catch (error) {
      console.error("Não foi possível encerrar a sessão no servidor:", error);
    } finally {
      logout();
      setUsers([]);
      setMessages([]);
      setOfflineQueue([]);
      setReplyingTo(null);
      setContextMenu(null);
      setReactionPickerMessageId(null);
      setEditingId(null);
      setEditingText("");
      setEditError("");
      setMessageInput("");
    }
  }

  if (!authChecked) {
    return (
      <main className="app">
        <section className="login">
          <h1>💬 Poknex</h1>
          <div className="status connecting">🟡 Verificando sessão...</div>
        </section>
      </main>
    );
  }

  if (!user) return <AuthScreen onAuthenticated={syncProfile} />;

  return (
    <ChatWorkspace
      user={user}
      profile={profile}
      users={users}
      onOpenProfile={openProfile}
      onClearHistory={clearLocalHistory}
      connectionStatus={connectionStatus}
      reconnectAttempt={reconnectAttempt}
      reconnectSeconds={reconnectSeconds}
      onLogout={handleLogout}
      messages={messages}
      profilesById={profilesById}
      connected={connected}
      historyLoading={historyLoading}
      messagesRef={messagesRef}
      onMessagesScroll={handleMessagesScroll}
      editingId={editingId}
      editingText={editingText}
      editSaving={editSaving}
      editError={editError}
      onEditingTextChange={setEditingText}
      onSaveEdit={saveEdit}
      onCancelEdit={cancelEdit}
      reactionPickerMessageId={reactionPickerMessageId}
      onToggleReactionPicker={toggleReactionPicker}
      onReaction={handleReaction}
      onOpenContextMenu={openContextMenu}
      onLongPressStart={startLongPress}
      onLongPressEnd={endLongPress}
      offlineQueueLength={offlineQueue.length}
      replyingTo={replyingTo}
      messageInput={messageInput}
      onChange={setMessageInput}
      onSubmit={sendMessage}
      onCancelReply={() => setReplyingTo(null)}
      contextMenu={contextMenu}
      onReact={() => {
        setReactionPickerMessageId(contextMenu?.message?.messageId || null);
        setContextMenu(null);
      }}
      onReply={() => contextMenu && beginReply(contextMenu.message)}
      onCopy={() => contextMenu && copyMessage(contextMenu.message)}
      onEdit={() => contextMenu && beginEdit(contextMenu.message)}
      onDelete={() => contextMenu && confirmDelete(contextMenu.message)}
      profileOpen={profileOpen}
      profileError={profileError}
      profileSaving={profileSaving}
      avatarPreviewUrl={avatarPreviewUrl}
      onCloseProfile={closeProfile}
      onSubmitProfile={saveProfile}
      onChooseAvatar={chooseAvatar}
    />
  );
}
