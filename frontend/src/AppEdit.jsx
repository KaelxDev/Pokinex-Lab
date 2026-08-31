import { useEffect, useRef, useState } from "react";
import { clearToken, getPublicProfile, getToken, login, me, register, updateProfile, uploadAvatar } from "./services/auth";
import { createWebSocket } from "./services/websocket";
import "./App.css";
import "./Profile.css";
import "./Avatar.css";
import "./MessageEdit.css";
import "./MessageReactions.css";

const STORAGE_KEY = "poknex_messages";
const QUEUE_KEY = "poknex_offline_queue";
const GROUP_WINDOW_MS = 5 * 60 * 1000;
const REACTION_OPTIONS = ["❤️", "😂", "😮", "😢", "😡", "👍"];

function formatTime(timestamp) {
  if (!timestamp) return "";
  return new Date(timestamp).toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" });
}

function loadJson(key) {
  try {
    const value = JSON.parse(localStorage.getItem(key) || "[]");
    return Array.isArray(value) ? value : [];
  } catch {
    return [];
  }
}

function makeId() {
  return `${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

function userInitial(user) {
  return String(user?.displayName || user?.username || "?").slice(0, 1).toUpperCase();
}

function sameAuthor(a, b) {
  if (!a || !b || a.type !== "message" || b.type !== "message") return false;
  if (a.userId != null && b.userId != null) return String(a.userId) === String(b.userId);
  return String(a.username || "") === String(b.username || "");
}

function canGroup(previous, current) {
  if (!sameAuthor(previous, current)) return false;
  const a = new Date(previous.timestamp || 0).getTime();
  const b = new Date(current.timestamp || 0).getTime();
  return a > 0 && b >= a && b - a <= GROUP_WINDOW_MS;
}

function copyText(text) {
  if (navigator.clipboard?.writeText) return navigator.clipboard.writeText(text);
  const textarea = document.createElement("textarea");
  textarea.value = text;
  textarea.style.position = "fixed";
  textarea.style.opacity = "0";
  document.body.appendChild(textarea);
  textarea.select();
  document.execCommand("copy");
  textarea.remove();
  return Promise.resolve();
}

function AuthScreen({ mode, setMode, onAuthenticated }) {
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  async function submit(event) {
    event.preventDefault();
    setError("");
    setLoading(true);
    try {
      const currentUser = mode === "login" ? await login(username, password) : await register(username, password);
      onAuthenticated(currentUser);
    } catch (error) {
      setError(error.message);
    } finally {
      setLoading(false);
    }
  }

  return (
    <main className="app">
      <section className="login">
        <h1>💬 Poknex</h1>
        <p>{mode === "login" ? "Entre na sua conta para conversar em tempo real." : "Crie sua conta para começar a usar o Poknex."}</p>
        {error && <div className="status disconnected">🔴 {error}</div>}
        <form className="login-form" onSubmit={submit}>
          <input value={username} onChange={(event) => setUsername(event.target.value)} placeholder="Username" minLength={3} maxLength={20} autoFocus />
          <input value={password} onChange={(event) => setPassword(event.target.value)} type="password" placeholder="Senha" minLength={8} maxLength={128} />
          <button type="submit" disabled={loading}>{loading ? "Aguarde..." : mode === "login" ? "Entrar" : "Criar conta"}</button>
        </form>
        <button className="auth-switch" type="button" onClick={() => { setMode(mode === "login" ? "register" : "login"); setError(""); }}>
          {mode === "login" ? "Ainda não tenho uma conta" : "Já tenho uma conta"}
        </button>
      </section>
    </main>
  );
}

export default function AppEdit() {
  const [authChecked, setAuthChecked] = useState(false);
  const [user, setUser] = useState(null);
  const [authMode, setAuthMode] = useState("login");
  const [connected, setConnected] = useState(false);
  const [connectionStatus, setConnectionStatus] = useState("connecting");
  const [reconnectAttempt, setReconnectAttempt] = useState(0);
  const [reconnectSeconds, setReconnectSeconds] = useState(0);
  const [messages, setMessages] = useState(() => loadJson(STORAGE_KEY));
  const [offlineQueue, setOfflineQueue] = useState(() => loadJson(QUEUE_KEY));
  const [users, setUsers] = useState([]);
  const [profilesById, setProfilesById] = useState({});
  const [messageInput, setMessageInput] = useState("");
  const [profileOpen, setProfileOpen] = useState(false);
  const [profile, setProfile] = useState(null);
  const [profileError, setProfileError] = useState("");
  const [profileSaving, setProfileSaving] = useState(false);
  const [contextMenu, setContextMenu] = useState(null);
  const [editingId, setEditingId] = useState(null);
  const [editingText, setEditingText] = useState("");
  const [editSaving, setEditSaving] = useState(false);
  const [editError, setEditError] = useState("");
  const [replyingTo, setReplyingTo] = useState(null);
  const [reactionPickerMessageId, setReactionPickerMessageId] = useState(null);

  const socketRef = useRef(null);
  const sessionRef = useRef(false);
  const generationRef = useRef(0);
  const queueRef = useRef(offlineQueue);
  const userRef = useRef(null);
  const avatarFileRef = useRef(null);
  const longPressRef = useRef(null);
  const profileFetchesRef = useRef(new Set());

  useEffect(() => {
    queueRef.current = offlineQueue;
    localStorage.setItem(QUEUE_KEY, JSON.stringify(offlineQueue));
  }, [offlineQueue]);

  useEffect(() => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(messages));
  }, [messages]);

  useEffect(() => {
    userRef.current = user;
  }, [user]);

  useEffect(() => {
    if (connectionStatus !== "reconnecting") return;
    const id = setInterval(() => setReconnectSeconds((value) => value > 1 ? value - 1 : 10), 1000);
    return () => clearInterval(id);
  }, [connectionStatus]);

  useEffect(() => {
    function closeOverlays() {
      setContextMenu(null);
      setReactionPickerMessageId(null);
    }
    window.addEventListener("click", closeOverlays);
    return () => window.removeEventListener("click", closeOverlays);
  }, []);

  useEffect(() => {
    const ids = new Set();
    for (const item of messages) {
      if (item?.userId && !profilesById[item.userId] && !profileFetchesRef.current.has(item.userId)) ids.add(item.userId);
    }
    for (const item of users) {
      if (item?.id && item.avatar === "" && !profilesById[item.id] && !profileFetchesRef.current.has(item.id)) ids.add(item.id);
    }
    for (const id of ids) {
      profileFetchesRef.current.add(id);
      getPublicProfile(id)
        .then((remote) => {
          setProfilesById((current) => ({ ...current, [remote.id]: remote }));
          setUsers((current) => current.map((item) => String(item.id) === String(remote.id) ? { ...item, ...remote } : item));
          setMessages((current) => current.map((item) => String(item.userId) === String(remote.id) ? { ...item, ...remote } : item));
        })
        .catch(() => {})
        .finally(() => profileFetchesRef.current.delete(id));
    }
  }, [messages, users, profilesById]);

  function syncProfile(nextUser) {
    setUser(nextUser);
    setProfile(nextUser);
    userRef.current = nextUser;
    if (nextUser?.id) setProfilesById((current) => ({ ...current, [nextUser.id]: nextUser }));
  }

  function mergeUser(incoming) {
    if (!incoming?.id) return;
    setProfilesById((current) => ({ ...current, [incoming.id]: { ...current[incoming.id], ...incoming } }));
    setUsers((current) => {
      const index = current.findIndex((item) => String(item.id) === String(incoming.id));
      if (index < 0) return [...current, incoming];
      const next = [...current];
      next[index] = { ...next[index], ...incoming };
      return next;
    });
  }

  function flushQueue() {
    const socket = socketRef.current;
    if (!socket || queueRef.current.length === 0) return;
    for (const item of queueRef.current) {
      setMessages((current) => current.map((m) => m.messageId === item.id ? { ...m, offline: false, deliveryStatus: "sending" } : m));
      socket.sendMessage(item.message, item.id);
    }
  }

  function connect(token) {
    const generation = ++generationRef.current;
    socketRef.current?.close();
    sessionRef.current = true;
    setConnected(false);
    setConnectionStatus("connecting");

    const socket = createWebSocket(token, {
      onOpen() {
        if (generation !== generationRef.current) return;
        setConnected(true);
        setConnectionStatus("connected");
        setReconnectAttempt(0);
        setReconnectSeconds(0);
        setTimeout(flushQueue, 0);
      },
      onMessage(data) {
        if (generation !== generationRef.current) return;
        if (data?.type === "users") {
          const list = Array.isArray(data.users) ? data.users : [];
          setUsers(list);
          list.forEach(mergeUser);
          return;
        }
        if (data?.type === "profile_updated" && data.user) {
          mergeUser(data.user);
          if (String(userRef.current?.id) === String(data.user.id)) syncProfile({ ...userRef.current, ...data.user });
          setMessages((current) => current.map((m) => String(m.userId) === String(data.user.id) ? { ...m, ...data.user } : m));
          return;
        }
        if (data?.type === "ack") {
          setOfflineQueue((current) => current.filter((item) => item.id !== data.messageId));
          setMessages((current) => current.map((m) => m.messageId === data.messageId ? { ...m, offline: false, deliveryStatus: "sent" } : m));
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
          setMessages((current) => current.map((m) => m.messageId === data.messageId ? { ...m, ...data, deliveryStatus: "sent", offline: false, editPending: false, edited: true } : m));
          return;
        }
        if (data?.type === "message_deleted") {
          setMessages((current) => current.map((m) => m.messageId === data.messageId ? { ...m, ...data, message: "Esta mensagem foi excluída", deleted: true, deliveryStatus: "sent", offline: false, editPending: false } : m));
          return;
        }
        if (data?.type === "message_reaction") {
          setMessages((current) => current.map((m) => m.messageId === data.messageId ? { ...m, reactions: data.reactions || {} } : m));
          return;
        }
        if (data?.type === "message" && data.messageId) {
          mergeUser({ id: data.userId, username: data.username, displayName: data.displayName, avatar: data.avatar || "", status: data.status || "", online: true });
          setMessages((current) => {
            const index = current.findIndex((m) => m.messageId === data.messageId);
            const incoming = { ...data, deliveryStatus: "sent", offline: false, reactions: data.reactions || {} };
            if (index >= 0) {
              const next = [...current];
              next[index] = { ...next[index], ...incoming };
              return next;
            }
            return [...current, incoming];
          });
          return;
        }
        if (data?.type === "system") setMessages((current) => [...current, { ...data, timestamp: data.timestamp || Date.now() }]);
      },
      onClose() {
        if (generation !== generationRef.current) return;
        setConnected(false);
        setConnectionStatus(sessionRef.current ? "reconnecting" : "disconnected");
        if (sessionRef.current) setReconnectSeconds(10);
      },
      onReconnecting(_delay, attempt) {
        if (generation !== generationRef.current || !sessionRef.current) return;
        setConnected(false);
        setConnectionStatus("reconnecting");
        setReconnectAttempt(attempt);
        setReconnectSeconds(10);
      },
      onError: (error) => console.error("Erro no WebSocket:", error),
    });
    socketRef.current = socket;
  }

  useEffect(() => {
    let cancelled = false;
    async function restore() {
      const token = getToken();
      if (!token) {
        setConnectionStatus("disconnected");
        setAuthChecked(true);
        return;
      }
      try {
        const currentUser = await me();
        if (cancelled) return;
        syncProfile(currentUser);
        sessionRef.current = true;
        setAuthChecked(true);
        connect(token);
      } catch {
        if (!cancelled) {
          clearToken();
          sessionRef.current = false;
          setAuthChecked(true);
          setConnectionStatus("disconnected");
        }
      }
    }
    restore();
    return () => {
      cancelled = true;
      sessionRef.current = false;
      ++generationRef.current;
      socketRef.current?.close();
    };
  }, []);

  function handleAuthenticated(currentUser) {
    syncProfile(currentUser);
    sessionRef.current = true;
    setAuthChecked(true);
    connect(getToken());
  }

  function sendMessage(event) {
    event.preventDefault();
    const text = messageInput.trim();
    if (!text) return;
    const id = makeId();
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
      ...(replyingTo ? { replyTo: { messageId: replyingTo.messageId, userId: replyingTo.userId, username: replyingTo.username, displayName: replyingTo.displayName, message: replyingTo.message, deleted: replyingTo.deleted } } : {}),
    };
    const sent = connected && (replyingTo
      ? socketRef.current?.sendReplyMessage(text, id, replyingTo.messageId)
      : socketRef.current?.sendMessage(text, id));
    setMessages((current) => [...current, optimistic]);
    if (!sent) {
      setOfflineQueue((current) => [...current, {
        id,
        message: text,
        createdAt: Date.now(),
        userId: sender?.id,
        username: sender?.username,
        displayName: sender?.displayName,
        avatar: sender?.avatar || "",
        ...(replyingTo ? { replyTo: { messageId: replyingTo.messageId } } : {}),
      }]);
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
    if (!editSaving) {
      setEditingId(null);
      setEditingText("");
      setEditError("");
    }
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
    setMessages((current) => current.map((m) => m.messageId === editingId ? { ...m, message: text, edited: true, editPending: true } : m));
    setEditingId(null);
    setEditingText("");
  }

  function deleteMessage(message) {
    setContextMenu(null);
    setReactionPickerMessageId(null);
    if (!connected || !socketRef.current?.sendDeleteMessage(message.messageId)) return;
    setMessages((current) => current.map((m) => m.messageId === message.messageId ? { ...m, message: "Esta mensagem foi excluída", deleted: true, deletePending: true } : m));
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
    setReactionPickerMessageId((current) => current === messageId ? null : messageId);
  }

  function openContextMenu(event, message) {
    event.preventDefault();
    setReactionPickerMessageId(null);
    const isMine = message.userId != null
      ? String(message.userId) === String(user?.id)
      : String(message.username || "") === String(user?.username || "");
    setContextMenu({
      x: Math.min(event.clientX, window.innerWidth - 190),
      y: Math.min(event.clientY, window.innerHeight - 210),
      message,
      isMine,
    });
  }

  function startLongPress(event, message) {
    if (event.touches.length !== 1) return;
    clearTimeout(longPressRef.current);
    longPressRef.current = setTimeout(() => {
      openContextMenu({
        preventDefault() {},
        clientX: event.touches[0].clientX,
        clientY: event.touches[0].clientY,
      }, message);
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

  function handleLogout() {
    sessionRef.current = false;
    ++generationRef.current;
    socketRef.current?.close();
    socketRef.current = null;
    clearToken();
    setUser(null);
    setProfile(null);
    setUsers([]);
    setProfilesById({});
    setConnected(false);
    setContextMenu(null);
    setReactionPickerMessageId(null);
    setReplyingTo(null);
  }

  function clearLocalHistory() {
    setMessages([]);
    localStorage.removeItem(STORAGE_KEY);
  }

  async function saveProfile(event) {
    event.preventDefault();
    setProfileError("");
    setProfileSaving(true);
    const form = new FormData(event.currentTarget);
    const oldUsername = user.username;
    try {
      let nextAvatar = profile?.avatar || "";
      if (avatarFileRef.current) nextAvatar = await uploadAvatar(avatarFileRef.current);
      const updated = await updateProfile({
        username: String(form.get("username") || oldUsername).trim(),
        displayName: String(form.get("displayName") || oldUsername).trim() || oldUsername,
        avatar: nextAvatar,
        status: String(form.get("status") || "").trim(),
      });
      avatarFileRef.current = null;
      syncProfile(updated);
      setProfileOpen(false);
      if (updated.username !== oldUsername) connect(getToken());
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
      event.target.value = "";
      return;
    }
    if (file.size > 2 * 1024 * 1024) {
      alert("Escolha uma imagem de até 2 MB.");
      event.target.value = "";
      return;
    }
    avatarFileRef.current = file;
    const reader = new FileReader();
    reader.onload = () => setProfile((current) => ({ ...(current || userRef.current), avatar: String(reader.result) }));
    reader.readAsDataURL(file);
    event.target.value = "";
  }

  useEffect(() => () => clearTimeout(longPressRef.current), []);

  if (!authChecked) return <main className="app"><section className="login"><h1>💬 Poknex</h1><div className="status connecting">🟡 Verificando sessão...</div></section></main>;
  if (!user) return <AuthScreen mode={authMode} setMode={setAuthMode} onAuthenticated={handleAuthenticated} />;

  const displayName = profile?.displayName || user.displayName || user.username;
  const avatar = profile?.avatar || "";

  return (
    <main className="app">
      <section className="chat">
        <aside className="sidebar">
          <div className="sidebar-header">
            <div className="profile-summary" onClick={() => { setProfileError(""); setProfileOpen(true); }}>
              <div className="avatar profile-avatar">{avatar ? <img src={avatar} alt="" /> : displayName.slice(0, 1).toUpperCase()}</div>
              <div><h2>{displayName}</h2><p>@{user.username}</p><small>{profile?.status || "Sem status"}</small></div>
            </div>
          </div>
          <div className="users-title">Usuários online — {users.length}</div>
          <ul className="users">
            {users.map((onlineUser) => <li className="user" key={onlineUser.id}>
              <div className="avatar user-avatar">{onlineUser.avatar ? <img src={onlineUser.avatar} alt="" /> : userInitial(onlineUser)}</div>
              <div className="user-info"><strong>{onlineUser.displayName || onlineUser.username}</strong><span><span className="online-dot" />@{onlineUser.username}</span></div>
            </li>)}
          </ul>
          <button className="logout" onClick={clearLocalHistory}>Limpar histórico local</button>
        </aside>

        <div className="chat-content">
          <header className="chat-header">
            <div>
              <h1># geral</h1>
              {connectionStatus === "reconnecting" ? <div className="connection connecting">🟡 Reconectando... tentativa #{reconnectAttempt || 1} • próxima tentativa em {reconnectSeconds || 10}s</div> : connectionStatus === "connecting" ? <div className="connection connecting">🟡 Conectando...</div> : <div className="connection"><span className="online-dot" />Online</div>}
            </div>
            <button className="logout" onClick={handleLogout}>Sair</button>
          </header>

          <div className="messages">
            {messages.map((message, index) => {
              if (message.type === "system") return <div className="system-message" key={`system-${index}`}>{message.message}<span> • {formatTime(message.timestamp)}</span></div>;
              if (message.type !== "message") return null;

              const previous = messages[index - 1];
              const next = messages[index + 1];
              const grouped = canGroup(previous, message);
              const groupEnd = !canGroup(message, next);
              const isMine = message.userId != null ? String(message.userId) === String(user.id) : String(message.username || "") === String(user.username || "");
              const messageProfile = isMine ? profile : profilesById[message.userId] || message;
              const isEditing = editingId === message.messageId;
              const reactionCounts = message.reactions || {};
              const visibleReactions = REACTION_OPTIONS.filter((reaction) => Number(reactionCounts[reaction] || 0) > 0);

              return (
                <div className={`message ${isMine ? "mine" : "other"} ${grouped ? "grouped" : "group-start"} ${groupEnd ? "group-end" : "group-middle"} ${message.deleted ? "deleted" : ""}`} key={message.messageId || index}>
                  {!grouped ? <div className="message-avatar">{messageProfile?.avatar ? <img src={messageProfile.avatar} alt="" /> : userInitial(messageProfile)}</div> : <div className="message-avatar-spacer" aria-hidden="true" />}
                  <div className="message-main">
                    {!grouped && <span className="message-user">{messageProfile?.displayName || message.displayName || message.username}</span>}
                    {isEditing ? (
                      <form className="message-edit-form" onSubmit={saveEdit}>
                        <textarea value={editingText} onChange={(event) => setEditingText(event.target.value)} autoFocus maxLength={1000} rows={2} />
                        <div><button type="button" onClick={cancelEdit} disabled={editSaving}>Cancelar</button><button type="submit" disabled={editSaving || !editingText.trim()}>{editSaving ? "Salvando..." : "Salvar"}</button></div>
                        {editError && <small>{editError}</small>}
                      </form>
                    ) : (
                      <>
                        <div className="message-row" onContextMenu={(event) => openContextMenu(event, message)} onTouchStart={(event) => startLongPress(event, message)} onTouchEnd={endLongPress} onTouchMove={endLongPress}>
                          {message.replyTo && <div className="reply-preview"><strong>↩️ {message.replyTo.displayName || message.replyTo.username || "Mensagem"}</strong><span>{message.replyTo.deleted ? "Esta mensagem foi excluída" : message.replyTo.message}</span></div>}
                          <div className={`message-bubble-wrap ${message.deleted ? "message-deleted" : ""}`}>
                            <div className="message-bubble">{message.deleted ? "🗑️ Esta mensagem foi excluída" : message.message}</div>
                          </div>
                        </div>

                        {!message.deleted && <div className="message-reaction-area" onClick={(event) => event.stopPropagation()}>
                          <div className="message-reactions">
                            {visibleReactions.map((reaction) => <button key={reaction} className="message-reaction" type="button" onClick={() => handleReaction(message.messageId, reaction)} title="Alternar reação">{reaction} {reactionCounts[reaction]}</button>)}
                            {connected && <button className="add-reaction" type="button" onClick={(event) => toggleReactionPicker(event, message.messageId)}>＋ Reagir</button>}
                          </div>
                          {reactionPickerMessageId === message.messageId && <div className="message-reaction-picker" onClick={(event) => event.stopPropagation()}>{REACTION_OPTIONS.map((reaction) => <button key={reaction} type="button" onClick={() => handleReaction(message.messageId, reaction)} aria-label={`Reagir com ${reaction}`} title={`Reagir com ${reaction}`}>{reaction}</button>)}</div>}
                        </div>}

                        {groupEnd && <div className="message-meta"><span className={message.deliveryStatus === "pending" || message.offline ? "message-pending" : ""}>{formatTime(message.timestamp)} • {message.deletePending ? "◌ Excluindo" : message.editPending ? "◌ Salvando edição" : message.deliveryStatus === "pending" || message.offline ? "⏳ Pendente" : message.deliveryStatus === "sending" ? "◌ Enviando" : "✓ Enviada"}{message.edited && !message.editPending && !message.deleted ? " • editada" : ""}</span></div>}
                      </>
                    )}
                  </div>
                </div>
              );
            })}
          </div>

          {replyingTo && <div className="reply-composer"><div><strong>↩️ Respondendo a {replyingTo.displayName || replyingTo.username}</strong><span>{replyingTo.deleted ? "Esta mensagem foi excluída" : replyingTo.message}</span></div><button type="button" onClick={() => setReplyingTo(null)}>✕</button></div>}

          <form className="message-form" onSubmit={sendMessage}>
            <textarea placeholder={connected ? (replyingTo ? "Digite sua resposta..." : "Digite uma mensagem...") : "Digite uma mensagem offline..."} value={messageInput} onChange={(event) => setMessageInput(event.target.value)} rows={1} maxLength={1000} onKeyDown={(event) => { if (event.key === "Enter" && !event.shiftKey) { event.preventDefault(); sendMessage(event); } }} />
            <button type="submit" disabled={!messageInput.trim()}>Enviar</button>
          </form>
          <div className="input-hint">Enter para enviar • {offlineQueue.length ? `📦 ${offlineQueue.length} pendente(s)` : "Conta autenticada"}</div>
        </div>

        {contextMenu && <div className="message-context-menu" style={{ left: contextMenu.x, top: contextMenu.y }} onClick={(event) => event.stopPropagation()}>
          <button type="button" onClick={(event) => toggleReactionPicker(event, contextMenu.message.messageId)} disabled={contextMenu.message.deleted}>❤️ Reagir</button>
          <button type="button" onClick={() => beginReply(contextMenu.message)} disabled={contextMenu.message.deleted}>↩️ Responder</button>
          <button type="button" onClick={() => copyMessage(contextMenu.message)} disabled={contextMenu.message.deleted}>📋 Copiar</button>
          {contextMenu.isMine && !contextMenu.message.deleted && !contextMenu.message.offline && contextMenu.message.deliveryStatus !== "pending" && <button type="button" onClick={() => beginEdit(contextMenu.message)}>✏️ Editar</button>}
          {contextMenu.isMine && !contextMenu.message.deleted && !contextMenu.message.offline && contextMenu.message.deliveryStatus !== "pending" && <button type="button" onClick={() => confirmDelete(contextMenu.message)}>🗑️ Excluir</button>}
        </div>}

        {profileOpen && <div className="profile-overlay" onMouseDown={(event) => { if (event.target === event.currentTarget) setProfileOpen(false); }}>
          <form className="profile-modal" onSubmit={saveProfile}>
            <h2>👤 Meu perfil</h2>
            <div className="profile-preview"><div className="avatar profile-avatar profile-preview-avatar">{avatar ? <img src={avatar} alt="" /> : displayName.slice(0, 1).toUpperCase()}</div><div><strong>@{user.username}</strong><p>ID da conta: {user.id}</p></div></div>
            {profileError && <div className="status disconnected">{profileError}</div>}
            <div className="avatar-picker"><label className="avatar-button" htmlFor="avatar-file">🖼️ Escolher imagem</label><input id="avatar-file" type="file" accept="image/jpeg,image/png,image/gif,image/webp" onChange={chooseAvatar} hidden /><span>PNG, JPG, GIF ou WebP • até 2 MB</span></div>
            <label>Username<input name="username" defaultValue={user.username} minLength={3} maxLength={20} /></label>
            <label>Nome de exibição<input name="displayName" defaultValue={displayName} maxLength={30} /></label>
            <label>Status personalizado<input name="status" placeholder="Ex.: Jogando 🎮" maxLength={60} defaultValue={profile?.status || ""} /></label>
            <div className="profile-actions"><button type="button" onClick={() => { avatarFileRef.current = null; setProfileOpen(false); }} disabled={profileSaving}>Cancelar</button><button type="submit" disabled={profileSaving}>{profileSaving ? "Salvando..." : "Salvar perfil"}</button></div>
          </form>
        </div>}
      </section>
    </main>
  );
}
