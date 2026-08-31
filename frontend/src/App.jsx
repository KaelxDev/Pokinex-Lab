import { useEffect, useRef, useState } from "react";
import { clearToken, getToken, login, me, register, updateProfile } from "./services/auth";
import { createWebSocket } from "./services/websocket";
import "./App.css";
import "./Profile.css";

const STORAGE_KEY = "poknex_messages";
const QUEUE_KEY = "poknex_offline_queue";

function formatTime(timestamp) {
  if (!timestamp) return "";
  return new Date(timestamp).toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" });
}
function loadMessages() {
  try {
    const value = JSON.parse(localStorage.getItem(STORAGE_KEY) || "[]");
    return Array.isArray(value) ? value : [];
  } catch {
    return [];
  }
}
function loadQueue() {
  try {
    const value = JSON.parse(localStorage.getItem(QUEUE_KEY) || "[]");
    return Array.isArray(value) ? value : [];
  } catch {
    return [];
  }
}
function makeId() { return `${Date.now()}-${Math.random().toString(36).slice(2)}`; }
function userInitial(user) { return String(user?.displayName || user?.username || "?").slice(0, 1).toUpperCase(); }

function AuthScreen({ mode, setMode, onAuthenticated }) {
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  async function submit(event) {
    event.preventDefault(); setError(""); setLoading(true);
    try {
      const currentUser = mode === "login" ? await login(username, password) : await register(username, password);
      onAuthenticated(currentUser);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }

  return <main className="app"><section className="login"><h1>💬 Poknex</h1><p>{mode === "login" ? "Entre na sua conta para conversar em tempo real." : "Crie sua conta para começar a usar o Poknex."}</p>{error && <div className="status disconnected">🔴 {error}</div>}<form className="login-form" onSubmit={submit}><input value={username} onChange={(event) => setUsername(event.target.value)} placeholder="Username" minLength={3} maxLength={20} autoFocus /><input value={password} onChange={(event) => setPassword(event.target.value)} type="password" placeholder="Senha" minLength={8} maxLength={128} /><button type="submit" disabled={loading}>{loading ? "Aguarde..." : mode === "login" ? "Entrar" : "Criar conta"}</button></form><button className="auth-switch" type="button" onClick={() => { setMode(mode === "login" ? "register" : "login"); setError(""); }}>{mode === "login" ? "Ainda não tenho uma conta" : "Já tenho uma conta"}</button></section></main>;
}

function App() {
  const [authChecked, setAuthChecked] = useState(false);
  const [user, setUser] = useState(null);
  const [authMode, setAuthMode] = useState("login");
  const [connected, setConnected] = useState(false);
  const [connectionStatus, setConnectionStatus] = useState("connecting");
  const [reconnectAttempt, setReconnectAttempt] = useState(0);
  const [reconnectSeconds, setReconnectSeconds] = useState(0);
  const [messages, setMessages] = useState(loadMessages);
  const [offlineQueue, setOfflineQueue] = useState(loadQueue);
  const [users, setUsers] = useState([]);
  const [messageInput, setMessageInput] = useState("");
  const [profileOpen, setProfileOpen] = useState(false);
  const [profile, setProfile] = useState(null);
  const [profileError, setProfileError] = useState("");
  const [profileSaving, setProfileSaving] = useState(false);

  const socketRef = useRef(null);
  const sessionRef = useRef(false);
  const generationRef = useRef(0);
  const queueRef = useRef(offlineQueue);
  const userRef = useRef(null);

  useEffect(() => {
    queueRef.current = offlineQueue;
    try { localStorage.setItem(QUEUE_KEY, JSON.stringify(offlineQueue)); } catch {}
  }, [offlineQueue]);
  useEffect(() => { try { localStorage.setItem(STORAGE_KEY, JSON.stringify(messages)); } catch {} }, [messages]);
  useEffect(() => { userRef.current = user; }, [user]);
  useEffect(() => {
    if (connectionStatus !== "reconnecting") return;
    const timer = setInterval(() => setReconnectSeconds((value) => value > 1 ? value - 1 : 10), 1000);
    return () => clearInterval(timer);
  }, [connectionStatus]);

  function syncProfile(nextUser) {
    setUser(nextUser);
    setProfile(nextUser);
    userRef.current = nextUser;
  }

  function flushQueue() {
    const socket = socketRef.current;
    if (!socket || queueRef.current.length === 0) return;
    for (const item of queueRef.current) socket.sendMessage(item.message, item.id);
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
        setConnected(true); setConnectionStatus("connected"); setReconnectAttempt(0); setReconnectSeconds(0);
        setTimeout(flushQueue, 0);
      },
      onMessage(data) {
        if (generation !== generationRef.current) return;
        if (data?.type === "users") {
          setUsers(Array.isArray(data.users) ? data.users : []);
          return;
        }
        if (data?.type === "profile_updated" && data.user) {
          setUsers((current) => current.map((item) => item.id === data.user.id ? data.user : item));
          if (userRef.current?.id === data.user.id) {
            syncProfile({ ...userRef.current, ...data.user });
          }
          setMessages((current) => current.map((item) => item.userId === data.user.id ? { ...item, username: data.user.username, displayName: data.user.displayName, avatar: data.user.avatar, status: data.user.status } : item));
          return;
        }
        if (data?.type === "ack") {
          setOfflineQueue((current) => current.filter((item) => item.id !== data.messageId));
          setMessages((current) => current.map((item) => item.messageId === data.messageId ? { ...item, offline: false } : item));
          return;
        }
        if (data?.type === "message" || data?.type === "system") {
          if (data.type === "message" && data.messageId) {
            setMessages((current) => {
              const existing = current.findIndex((item) => item.messageId === data.messageId);
              const incoming = { ...data, timestamp: data.timestamp || Date.now(), offline: false };
              if (existing >= 0) { const next = [...current]; next[existing] = incoming; return next; }
              return [...current, incoming];
            });
          } else {
            setMessages((current) => [...current, { ...data, timestamp: data.timestamp || Date.now() }]);
          }
        }
      },
      onClose() {
        if (generation !== generationRef.current) return;
        setConnected(false); setConnectionStatus(sessionRef.current ? "reconnecting" : "disconnected");
        if (sessionRef.current) setReconnectSeconds(10);
      },
      onReconnecting(_delay, attempt) {
        if (generation !== generationRef.current || !sessionRef.current) return;
        setConnected(false); setConnectionStatus("reconnecting"); setReconnectAttempt(attempt); setReconnectSeconds(10);
      },
      onError: (error) => console.error("Erro no WebSocket:", error),
    });
    socketRef.current = socket;
  }

  useEffect(() => {
    let cancelled = false;
    async function restore() {
      const token = getToken();
      if (!token) { setConnectionStatus("disconnected"); setAuthChecked(true); return; }
      try {
        const currentUser = await me();
        if (cancelled) return;
        syncProfile(currentUser); sessionRef.current = true; setAuthChecked(true); connect(token);
      } catch {
        if (!cancelled) { clearToken(); sessionRef.current = false; setAuthChecked(true); setConnectionStatus("disconnected"); }
      }
    }
    restore();
    return () => { cancelled = true; sessionRef.current = false; ++generationRef.current; socketRef.current?.close(); };
  }, []);

  function handleAuthenticated(currentUser) {
    syncProfile(currentUser); sessionRef.current = true; setAuthChecked(true); connect(getToken());
  }

  function sendMessage(event) {
    event.preventDefault();
    const message = messageInput.trim();
    if (!message) return;
    const id = makeId();
    const sender = userRef.current;
    if (connected && socketRef.current?.sendMessage(message, id)) {
      setMessageInput("");
      return;
    }
    setOfflineQueue((current) => [...current, { id, message, createdAt: Date.now(), userId: sender?.id, username: sender?.username, displayName: sender?.displayName, avatar: sender?.avatar || "" }]);
    setMessages((current) => [...current, { type: "message", messageId: id, userId: sender?.id, username: sender?.username, displayName: sender?.displayName, avatar: sender?.avatar || "", message, timestamp: Date.now(), offline: true }]);
    setMessageInput("");
  }

  function handleMessageKeyDown(event) {
    if (event.key === "Enter" && !event.shiftKey) { event.preventDefault(); sendMessage(event); }
  }

  async function handleLogout() {
    sessionRef.current = false; ++generationRef.current; socketRef.current?.close(); socketRef.current = null; clearToken(); setConnected(false); setUser(null); setProfile(null); setUsers([]); setConnectionStatus("disconnected");
  }

  function clearLocalHistory() { setMessages([]); try { localStorage.removeItem(STORAGE_KEY); } catch {} }

  async function saveProfile(event) {
    event.preventDefault(); setProfileError(""); setProfileSaving(true);
    const form = new FormData(event.currentTarget);
    const oldUsername = user.username;
    const next = { username: String(form.get("username") || oldUsername).trim(), displayName: String(form.get("displayName") || oldUsername).trim() || oldUsername, avatar: profile?.avatar || "", status: String(form.get("status") || "").trim() };
    try {
      const updated = await updateProfile(next);
      syncProfile(updated); setProfileOpen(false);
      if (updated.username !== oldUsername) connect(getToken());
    } catch (error) {
      setProfileError(error.message || "Não foi possível atualizar o perfil.");
    } finally { setProfileSaving(false); }
  }

  function chooseAvatar(event) {
    const file = event.target.files?.[0]; if (!file) return;
    if (!file.type.startsWith("image/")) { event.target.value = ""; return; }
    if (file.size > 2 * 1024 * 1024) { alert("Escolha uma imagem de até 2 MB."); event.target.value = ""; return; }
    const reader = new FileReader();
    reader.onload = () => setProfile((current) => ({ ...(current || userRef.current), avatar: String(reader.result) }));
    reader.readAsDataURL(file); event.target.value = "";
  }

  useEffect(() => () => { sessionRef.current = false; socketRef.current?.close(); }, []);

  if (!authChecked) return <main className="app"><section className="login"><h1>💬 Poknex</h1><div className="status connecting">🟡 Verificando sessão...</div></section></main>;
  if (!user) return <AuthScreen mode={authMode} setMode={setAuthMode} onAuthenticated={handleAuthenticated} />;

  const displayName = profile?.displayName || user.displayName || user.username;
  const avatar = profile?.avatar || "";

  return <main className="app"><section className="chat">
    <aside className="sidebar"><div className="sidebar-header"><div className="profile-summary" onClick={() => { setProfileError(""); setProfileOpen(true); }}><div className="avatar profile-avatar">{avatar ? <img src={avatar} alt="Avatar" /> : displayName.slice(0, 1).toUpperCase()}</div><div><h2>{displayName}</h2><p>@{user.username}</p><small>{profile?.status || "Sem status"}</small></div></div></div>
      <div className="users-title">Usuários online — {users.length}</div>
      <ul className="users">{users.map((onlineUser) => <li className="user" key={onlineUser.id}><div className="avatar user-avatar">{onlineUser.avatar ? <img src={onlineUser.avatar} alt="Avatar" /> : userInitial(onlineUser)}</div><div className="user-info"><strong>{onlineUser.displayName || onlineUser.username}</strong><span><span className="online-dot" />@{onlineUser.username}</span></div></li>)}</ul>
      <button className="logout" onClick={clearLocalHistory}>Limpar histórico local</button>
    </aside>

    <div className="chat-content"><header className="chat-header"><div><h1># geral</h1>{connectionStatus === "reconnecting" ? <div className="connection connecting">🟡 Reconectando... tentativa #{reconnectAttempt || 1} • próxima tentativa em {reconnectSeconds || 10}s</div> : connectionStatus === "connecting" ? <div className="connection connecting">🟡 Conectando...</div> : <div className="connection"><span className="online-dot" />Online</div>}</div><button className="logout" onClick={handleLogout}>Sair</button></header>
      <div className="messages">{messages.map((message, index) => {
        if (message.type === "system") return <div className="system-message" key={`system-${index}`}>{message.message}<span> • {formatTime(message.timestamp)}</span></div>;
        if (message.type !== "message") return null;
        const isMine = message.userId ? message.userId === user.id : message.username === user.username;
        const messageProfile = isMine ? profile : users.find((item) => item.id === message.userId) || message;
        return <div className={`message ${isMine ? "mine" : "other"}`} key={message.messageId || index}><div className="message-avatar">{messageProfile?.avatar ? <img src={messageProfile.avatar} alt="Avatar" /> : userInitial(messageProfile)}</div><div className="message-main"><span className="message-user">{message.displayName || message.username}</span><div className="message-row"><div className="message-bubble">{message.message}</div><span className="message-time">{formatTime(message.timestamp)}{message.offline ? " • pendente" : ""}</span></div></div></div>;
      })}</div>
      <form className="message-form" onSubmit={sendMessage}><textarea placeholder={connected ? "Digite uma mensagem..." : "Digite uma mensagem offline..."} value={messageInput} onChange={(event) => setMessageInput(event.target.value)} onKeyDown={handleMessageKeyDown} rows={1} maxLength={1000} /><button type="submit" disabled={!messageInput.trim()}>Enviar</button></form><div className="input-hint">Enter para enviar • {offlineQueue.length ? `📦 ${offlineQueue.length} pendente(s)` : "Conta autenticada"}</div>
    </div>

    {profileOpen && <div className="profile-overlay" onMouseDown={(event) => { if (event.target === event.currentTarget) setProfileOpen(false); }}><form className="profile-modal" onSubmit={saveProfile}><h2>👤 Meu perfil</h2><div className="profile-preview"><div className="avatar profile-avatar profile-preview-avatar">{avatar ? <img src={avatar} alt="Avatar" /> : displayName.slice(0, 1).toUpperCase()}</div><div><strong>@{user.username}</strong><p>ID da conta: {user.id}</p></div></div>{profileError && <div className="status disconnected">{profileError}</div>}<div className="avatar-picker"><label className="avatar-button" htmlFor="avatar-file">🖼️ Escolher imagem</label><input id="avatar-file" type="file" accept="image/*" onChange={chooseAvatar} hidden /><span>PNG, JPG, GIF ou WebP • até 2 MB</span></div><label>Username<input name="username" defaultValue={user.username} minLength={3} maxLength={20} autoComplete="username" /></label><label>Nome de exibição<input name="displayName" defaultValue={displayName} maxLength={30} /></label><label>Status personalizado<input name="status" placeholder="Ex.: Jogando 🎮" maxLength={60} defaultValue={profile?.status || ""} /></label><div className="profile-actions"><button type="button" onClick={() => setProfileOpen(false)} disabled={profileSaving}>Cancelar</button><button type="submit" disabled={profileSaving}>{profileSaving ? "Salvando..." : "Salvar perfil"}</button></div></form></div>}
  </section></main>;
}

export default App;
