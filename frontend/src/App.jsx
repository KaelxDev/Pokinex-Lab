import { useCallback, useEffect, useRef, useState } from "react";
import { logout as logoutRequest } from "./services/auth";
import AuthScreen from "./components/AuthScreen";
import ChatHeader from "./components/ChatHeader";
import ChatSidebar from "./components/ChatSidebar";
import MessageComposer from "./components/MessageComposer";
import MessageContextMenu from "./components/MessageContextMenu";
import MessageList from "./components/MessageList";
import ProfileModal from "./components/ProfileModal";
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
  const messageHandlerRef = useRef(() => {});

  const {
    users,
    setUsers,
    profilesById,
    mergeUser,
    syncProfile,
  } = useUserDirectory({ messages, setMessages, syncUser });

  const profile = users.find((item) => String(item.id) === String(user?.id)) || user;

  const handleWebSocketMessageProxy = useCallback((data) => {
    messageHandlerRef.current(data);
  }, []);

  const handleConnectionOpen = useCallback(({ reconnected } = {}) => {
    if (reconnected) void loadMessageHistory();
  }, [loadMessageHistory]);

  const {
    connected,
    connectionStatus,
    reconnectAttempt,
    reconnectSeconds,
    isConnected,
    getSocket,
  } = useChatConnection(Boolean(authChecked && user), {
    onMessage: handleWebSocketMessageProxy,
    onOpen: handleConnectionOpen,
    onAuthenticationRequired: logout,
  });

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
    messageHandlerRef.current = handleWebSocketMessage;
  }, [handleWebSocketMessage]);

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
    <main className="app">
      <section className="chat">
        <ChatSidebar
          user={user}
          profile={profile}
          users={users}
          onOpenProfile={openProfile}
          onClearHistory={clearLocalHistory}
        />

        <div className="chat-content">
          <ChatHeader
            connectionStatus={connectionStatus}
            reconnectAttempt={reconnectAttempt}
            reconnectSeconds={reconnectSeconds}
            onLogout={handleLogout}
          />

          <MessageList
            messages={messages}
            user={user}
            profile={profile}
            profilesById={profilesById}
            connected={connected}
            historyLoading={historyLoading}
            messagesRef={messagesRef}
            onScroll={handleMessagesScroll}
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
          />

          <MessageComposer
            connected={connected}
            offlineQueueLength={offlineQueue.length}
            replyingTo={replyingTo}
            messageInput={messageInput}
            onChange={setMessageInput}
            onSubmit={sendMessage}
            onCancelReply={() => setReplyingTo(null)}
          />
        </div>

        <MessageContextMenu
          contextMenu={contextMenu}
          onReact={() => {
            setReactionPickerMessageId(contextMenu?.message?.messageId || null);
            setContextMenu(null);
          }}
          onReply={() => contextMenu && beginReply(contextMenu.message)}
          onCopy={() => contextMenu && copyMessage(contextMenu.message)}
          onEdit={() => contextMenu && beginEdit(contextMenu.message)}
          onDelete={() => contextMenu && confirmDelete(contextMenu.message)}
        />

        <ProfileModal
          open={profileOpen}
          user={user}
          profile={profile}
          avatarPreview={avatarPreviewUrl}
          profileError={profileError}
          profileSaving={profileSaving}
          onClose={closeProfile}
          onSubmit={saveProfile}
          onChooseAvatar={chooseAvatar}
        />
      </section>
    </main>
  );
}
