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
import { useChatConnection } from "./hooks/useChatConnection";
import { useChatHistory } from "./hooks/useChatHistory";
import { useUserProfiles } from "./hooks/useUserProfiles";
import { copyText } from "./utils/chat";

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
  const [contextMenu, setContextMenu] = useState(null);
  const [editingId, setEditingId] = useState(null);
  const [editingText, setEditingText] = useState("");
  const [editSaving, setEditSaving] = useState(false);
  const [editError, setEditError] = useState("");
  const [replyingTo, setReplyingTo] = useState(null);
  const [reactionPickerMessageId, setReactionPickerMessageId] = useState(null);
  const longPressRef = useRef(null);
  const mergeUserRef = useRef(null);

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

  const handleWebSocketMessage = useCallback((data) => {
    if (data?.type === "users") {
      const list = Array.isArray(data.users) ? data.users : [];
      setUsers(list);
      list.forEach(mergeUser);
      return;
    }

    if (data?.type === "profile_updated" && data.user) {
      mergeUser(data.user);
      if (String(userRef.current?.id) === String(data.user.id)) {
        syncProfile({ ...userRef.current, ...data.user });
      }
      setMessages((current) =>
        current.map((item) =>
          String(item.userId) === String(data.user.id)
            ? { ...item, ...data.user }
            : item,
        ),
      );
      return;
    }

    if (data?.type === "ack") {
      setOfflineQueue((current) =>
        current.filter((item) => item.id !== data.messageId),
      );
      setMessages((current) =>
        current.map((item) =>
          item.messageId === data.messageId
            ? { ...item, offline: false, deliveryStatus: "sent" }
            : item,
        ),
      );
      return;
    }

    if (data?.type === "edit_ack") {
      setEditSaving(false);
      return;
    }

    if (data?.type === "delete_ack") return;

    if (data?.type === "error" && data.action === "edit_message") {
      setEditError(data.message || "Não foi possível editar a mensagem.");
      setEditSaving(false);
      return;
    }

    if (data?.type === "error" && data.action === "delete_message") {
      console.error("Não foi possível excluir:", data.message);
      return;
    }

    if (data?.type === "error" && data.action === "reaction") {
      console.error("Não foi possível reagir:", data.message);
      return;
    }

    if (data?.type === "message_edited") {
      setMessages((current) =>
        current.map((item) =>
          item.messageId === data.messageId
            ? {
                ...item,
                ...data,
                deliveryStatus: "sent",
                offline: false,
                editPending: false,
                edited: true,
              }
            : item,
        ),
      );
      return;
    }

    if (data?.type === "message_deleted") {
      setMessages((current) =>
        current.map((item) =>
          item.messageId === data.messageId
            ? {
                ...item,
                ...data,
                message: "Esta mensagem foi excluída",
                deleted: true,
                deliveryStatus: "sent",
                offline: false,
                editPending: false,
              }
            : item,
        ),
      );
      return;
    }

    if (data?.type === "message_reaction") {
      setMessages((current) =>
        current.map((item) =>
          item.messageId === data.messageId
            ? { ...item, reactions: data.reactions || {} }
            : item,
        ),
      );
      return;
    }

    if (data?.type === "message" && data.messageId) {
      mergeUser({
        id: data.userId,
        username: data.username,
        displayName: data.displayName,
        avatar: data.avatar || "",
        status: data.status || "",
        online: true,
      });
      setMessages((current) => {
        const index = current.findIndex((item) => item.messageId === data.messageId);
        const incoming = {
          ...data,
          deliveryStatus: "sent",
          offline: false,
          reactions: data.reactions || {},
        };
        if (index >= 0) {
          const next = [...current];
          next[index] = { ...next[index], ...incoming };
          return next;
        }
        return [...current, incoming];
      });
      return;
    }

    if (data?.type === "system") {
      setMessages((current) => [
        ...current,
        { ...data, timestamp: data.timestamp || Date.now() },
      ]);
    }
  }, [mergeUser, setMessages, setOfflineQueue, syncProfile, userRef]);

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

  useEffect(() => {
    mergeUserRef.current = mergeUser;
  }, [mergeUser]);

  function flushQueue() {
    const socket = socketRef.current;
    if (!socket || offlineQueue.length === 0) return;

    for (const item of offlineQueue) {
      setMessages((current) =>
        current.map((message) =>
          message.messageId === item.id
            ? { ...message, offline: false, deliveryStatus: "sending" }
            : message,
        ),
      );
      socket.sendMessage(item.message, item.id);
    }
  }

  useEffect(() => {
    if (connected) flushQueue();
  }, [connected]);

  useEffect(() => {
    function closeOverlays() {
      setContextMenu(null);
      setReactionPickerMessageId(null);
    }

    window.addEventListener("click", closeOverlays);
    return () => window.removeEventListener("click", closeOverlays);
  }, []);

  useEffect(() => () => clearTimeout(longPressRef.current), []);

  function sendMessage(event) {
    event.preventDefault();
    const text = messageInput.trim();
    if (!text) return;

    const id = `${Date.now()}-${Math.random().toString(36).slice(2)}`;
    const sender = userRef.current;
    const optimistic = {
      type: "message",
      messageId: id,
      userId: sender?.id,
      username: sender?.username,
      displayName: sender?.displayName,
      avatar: sender?.avatar || "",
      status: sender?.status || "",
      message: text,
      timestamp: Date.now(),
      offline: !connected,
      deliveryStatus: connected ? "sending" : "pending",
      reactions: {},
      ...(replyingTo
        ? {
            replyTo: {
              messageId: replyingTo.messageId,
              userId: replyingTo.userId,
              username: replyingTo.username,
              displayName: replyingTo.displayName,
              message: replyingTo.message,
              deleted: replyingTo.deleted,
            },
          }
        : {}),
    };

    const sent = connected &&
      (replyingTo
        ? socketRef.current?.sendReplyMessage(text, id, replyingTo.messageId)
        : socketRef.current?.sendMessage(text, id));

    setMessages((current) => [...current, optimistic]);

    if (!sent) {
      setOfflineQueue((current) => [
        ...current,
        {
          id,
          message: text,
          createdAt: Date.now(),
          userId: sender?.id,
          username: sender?.username,
          displayName: sender?.displayName,
          avatar: sender?.avatar || "",
          ...(replyingTo ? { replyTo: { messageId: replyingTo.messageId } } : {}),
        },
      ]);
    }

    setMessageInput("");
    setReplyingTo(null);
  }

  function beginEdit(message) {
    setContextMenu(null);
    setReactionPickerMessageId(null);
    setEditError("");
    setEditingId(message.messageId);
    setEditingText(message.message);
    setReplyingTo(null);
  }

  function cancelEdit() {
    if (editSaving) return;
    setEditingId(null);
    setEditingText("");
    setEditError("");
  }

  function saveEdit(event) {
    event.preventDefault();
    const text = editingText.trim();
    if (!editingId || !text) {
      setEditError("A mensagem não pode ficar vazia.");
      return;
    }
    if (!connected || !socketRef.current?.sendEditMessage(editingId, text)) {
      setEditError("Aguardando conexão para editar.");
      return;
    }

    setEditSaving(true);
    setMessages((current) =>
      current.map((message) =>
        message.messageId === editingId
          ? { ...message, message: text, edited: true, editPending: true }
          : message,
      ),
    );
    setEditingId(null);
    setEditingText("");
  }

  function deleteMessage(message) {
    setContextMenu(null);
    setReactionPickerMessageId(null);
    if (!connected || !socketRef.current?.sendDeleteMessage(message.messageId)) return;

    setMessages((current) =>
      current.map((item) =>
        item.messageId === message.messageId
          ? {
              ...item,
              message: "Esta mensagem foi excluída",
              deleted: true,
              deletePending: true,
            }
          : item,
      ),
    );
  }

  function confirmDelete(message) {
    if (window.confirm("Excluir esta mensagem?")) deleteMessage(message);
    else setContextMenu(null);
  }

  function beginReply(message) {
    setContextMenu(null);
    setReactionPickerMessageId(null);
    setEditingId(null);
    setEditError("");
    setReplyingTo(message);
  }

  function handleReaction(messageId, reaction) {
    if (!connected || !socketRef.current?.sendReaction(messageId, reaction)) return;
    setReactionPickerMessageId(null);
  }

  function toggleReactionPicker(event, messageId) {
    event.preventDefault();
    event.stopPropagation();
    setContextMenu(null);
    setReactionPickerMessageId((current) => (current === messageId ? null : messageId));
  }

  function openContextMenu(event, message) {
    event.preventDefault();
    event.stopPropagation();
    setReactionPickerMessageId(null);
    const isMine =
      message.userId != null
        ? String(message.userId) === String(user?.id)
        : String(message.username || "") === String(user?.username || "");

    setContextMenu({
      x: Math.max(8, Math.min(event.clientX, window.innerWidth - 190)),
      y: Math.max(8, Math.min(event.clientY, window.innerHeight - 210)),
      message,
      isMine,
    });
  }

  function startLongPress(event, message) {
    if (event.touches.length !== 1) return;
    clearTimeout(longPressRef.current);
    longPressRef.current = setTimeout(() => {
      const touch = event.touches[0];
      openContextMenu(
        {
          preventDefault() {},
          stopPropagation() {},
          clientX: touch.clientX,
          clientY: touch.clientY,
        },
        message,
      );
      navigator.vibrate?.(20);
    }, 550);
  }

  function endLongPress() {
    clearTimeout(longPressRef.current);
  }

  async function copyMessage(message) {
    if (message.deleted) return;
    try {
      await copyText(message.message);
      setContextMenu(null);
    } catch (error) {
      console.error("Não foi possível copiar:", error);
    }
  }

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
