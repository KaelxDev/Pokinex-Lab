import { useCallback, useEffect, useState } from "react";
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

  const {
    users,
    setUsers,
    profilesById,
    mergeUser,
    syncProfile,
  } = useUserDirectory({ messages, setMessages, syncUser });

  const profile = users.find((item) => String(item.id) === String(user?.id)) || user;

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
    isConnected: () => false,
    getSocket: () => null,
    messageInput,
    setMessageInput,
    replyingTo,
    setReplyingTo,
    offlineQueue,
    setOfflineQueue,
    setMessages,
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

  const handleConnectionOpen = useCallback(({ reconnected } = {}) => {
    if (reconnected) void loadMessageHistory();
  }, [loadMessageHistory]);

  const {
    socketRef,
    connected,
    connectionStatus,
    reconnectAttempt,
    reconnectSeconds,
    isConnected,
    getSocket,
  } = useChatConnection(Boolean(authChecked && user), {
    onMessage: handleWebSocketMessage,
    onOpen: handleConnectionOpen,
    onAuthenticationRequired: logout,
  });

  const chatActions = useChatActions({
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

  useEffect(() => {
    if (connected) chatActions.flushQueue();
  }, [connected, chatActions.flushQueue]);

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
            editingId={chatActions.editingId}
            editingText={chatActions.editingText}
            editSaving={chatActions.editSaving}
            editError={chatActions.editError}
            onEditingTextChange={chatActions.setEditingText}
            onSaveEdit={chatActions.saveEdit}
            onCancelEdit={chatActions.cancelEdit}
            reactionPickerMessageId={chatActions.reactionPickerMessageId}
            onToggleReactionPicker={chatActions.toggleReactionPicker}
            onReaction={chatActions.handleReaction}
            onOpenContextMenu={chatActions.openContextMenu}
            onLongPressStart={chatActions.startLongPress}
            onLongPressEnd={chatActions.endLongPress}
          />

          <MessageComposer
            connected={connected}
            offlineQueueLength={offlineQueue.length}
            replyingTo={chatActions.replyingTo || replyingTo}
            messageInput={messageInput}
            onChange={setMessageInput}
            onSubmit={chatActions.sendMessage}
            onCancelReply={() => setReplyingTo(null)}
          />
        </div>

        <MessageContextMenu
          contextMenu={chatActions.contextMenu}
          onReact={() => {
            setReactionPickerMessageId(chatActions.contextMenu?.message?.messageId || null);
            setContextMenu(null);
          }}
          onReply={() => chatActions.contextMenu && chatActions.beginReply(chatActions.contextMenu.message)}
          onCopy={() => chatActions.contextMenu && chatActions.copyMessage(chatActions.contextMenu.message)}
          onEdit={() => chatActions.contextMenu && chatActions.beginEdit(chatActions.contextMenu.message)}
          onDelete={() => chatActions.contextMenu && chatActions.confirmDelete(chatActions.contextMenu.message)}
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
