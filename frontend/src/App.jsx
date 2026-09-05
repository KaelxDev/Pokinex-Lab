import { useCallback, useEffect, useRef, useState } from "react";
import { logout as logoutRequest } from "./services/auth";
import AuthScreen from "./components/AuthScreen";
import AutoMessageScroll from "./components/AutoMessageScroll.jsx";
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
    connected,
    connectionStatus,
    reconnectAttempt,
    reconnectSeconds,
    isConnected: connectionIsConnected,
    getSocket: connectionGetSocket,
  } = useChatConnection(Boolean(authChecked && user), {
    onMessage: () => {},
    onOpen: handleConnectionOpen,
    onAuthenticationRequired: logout,
  });

  connectionRef.current = { connected, socket: null };

  const effectiveIsConnected = connectionIsConnected || isConnected;
  const effectiveGetSocket = connectionGetSocket || getSocket;

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
    isConnected: effectiveIsConnected,
    getSocket: effectiveGetSocket,
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

  useEffect(() => {
    if (connected) flushQueue();
  }, [connected, flushQueue]);

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

  useEffect(() => {
    const socket = effectiveGetSocket();
    if (!socket) return undefined;
    const previous = socket.onMessage;
    socket.onMessage = handleWebSocketMessage;
    return () => {
      socket.onMessage = previous;
    };
  }, [effectiveGetSocket, handleWebSocketMessage]);

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
    <AutoMessageScroll>
      <main className="app">
        <ChatWorkspace
          user={user}
          profile={profile}
          users={users}
          onOpenProfile={() => {}}
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
          profileOpen={false}
          profileError=""
          profileSaving={false}
          avatarPreviewUrl=""
          onCloseProfile={() => {}}
          onSubmitProfile={() => {}}
          onChooseAvatar={() => {}}
        />
      </main>
    </AutoMessageScroll>
  );
}
