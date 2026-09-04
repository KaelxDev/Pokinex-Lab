import { useCallback, useEffect, useRef, useState } from "react";
import { logout as logoutRequest, updateProfile, uploadAvatar } from "./services/auth";
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
import { useUserProfiles } from "./hooks/useUserProfiles";

export default function AppEdit() {
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

  const [users, setUsers] = useState([]);
  const [profilesById, setProfilesById] = useState({});
  const [messageInput, setMessageInput] = useState("");
  const [profileOpen, setProfileOpen] = useState(false);
  const [profile, setProfile] = useState(null);
  const [profileError, setProfileError] = useState("");
  const [profileSaving, setProfileSaving] = useState(false);
  const [selectedAvatarFile, setSelectedAvatarFile] = useState(null);
  const [avatarPreviewUrl, setAvatarPreviewUrl] = useState("");
  const [replyingTo, setReplyingTo] = useState(null);
  const connectionRef = useRef({ connected: false, socket: null });

  const isConnected = useCallback(() => connectionRef.current.connected, []);
  const getSocket = useCallback(() => connectionRef.current.socket, []);

  useEffect(() => {
    return () => {
      if (avatarPreviewUrl) URL.revokeObjectURL(avatarPreviewUrl);
    };
  }, [avatarPreviewUrl]);

  const mergeUser = useCallback((incoming) => {
    if (!incoming?.id) return;
    setProfilesById((current) => ({
      ...current,
      [incoming.id]: { ...current[incoming.id], ...incoming },
    }));
    setUsers((current) => {
      const index = current.findIndex((item) => String(item.id) === String(incoming.id));
      if (index < 0) return [...current, incoming];
      const next = [...current];
      next[index] = { ...next[index], ...incoming };
      return next;
    });
  }, []);

  const syncProfile = useCallback((nextUser) => {
    syncUser(nextUser);
    setProfile(nextUser);
    if (nextUser?.id) {
      setProfilesById((current) => ({ ...current, [nextUser.id]: nextUser }));
      setUsers((current) =>
        current.map((item) =>
          String(item.id) === String(nextUser.id) ? { ...item, ...nextUser } : item,
        ),
      );
      setMessages((current) =>
        current.map((item) =>
          String(item.userId) === String(nextUser.id)
            ? { ...item, ...nextUser }
            : item,
        ),
      );
    }
  }, [setMessages, syncUser]);

  useUserProfiles(
    messages,
    users,
    profilesById,
    setProfilesById,
    setUsers,
    setMessages,
  );

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
    onMessage: handleWebSocketMessage,
    onOpen: handleConnectionOpen,
    onAuthenticationRequired: logout,
  });

  connectionRef.current = { connected, socket: socketRef.current };

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
      setProfilesById({});
      setMessages([]);
      setOfflineQueue([]);
      setProfile(null);
      setProfileOpen(false);
      setSelectedAvatarFile(null);
      setAvatarPreviewUrl("");
      setContextMenu(null);
      setReactionPickerMessageId(null);
      setReplyingTo(null);
      setEditingId(null);
      setEditingText("");
      setEditError("");
    }
  }

  function openProfile() {
    setProfileError("");
    setProfileOpen(true);
  }

  async function saveProfile(event) {
    event.preventDefault();
    setProfileError("");
    setProfileSaving(true);
    const form = new FormData(event.currentTarget);
    const oldUsername = user.username;

    try {
      let nextAvatar = profile?.avatar || user?.avatar || "";
      if (selectedAvatarFile) {
        nextAvatar = await uploadAvatar(selectedAvatarFile);
      }

      const updated = await updateProfile({
        username: String(form.get("username") || oldUsername).trim(),
        displayName: String(form.get("displayName") || oldUsername).trim() || oldUsername,
        avatar: nextAvatar,
        status: String(form.get("status") || "").trim(),
      });

      setSelectedAvatarFile(null);
      setAvatarPreviewUrl("");
      syncProfile(updated);
      setProfileOpen(false);
    } catch (error) {
      setProfileError(error.message || "Não foi possível atualizar o perfil.");
    } finally {
      setProfileSaving(false);
    }
  }

  function chooseAvatar(event) {
    const file = event.target.files?.[0];
    if (!file) return;
    if (!file.type.startsWith("image/")) {
      setProfileError("Escolha um arquivo de imagem válido.");
      event.target.value = "";
      return;
    }
    if (file.size > 2 * 1024 * 1024) {
      setProfileError("Escolha uma imagem de até 2 MB.");
      event.target.value = "";
      return;
    }

    setProfileError("");
    setSelectedAvatarFile(file);
    setAvatarPreviewUrl(URL.createObjectURL(file));
    event.target.value = "";
  }

  function closeProfile() {
    setSelectedAvatarFile(null);
    setAvatarPreviewUrl("");
    setProfileError("");
    setProfileOpen(false);
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
