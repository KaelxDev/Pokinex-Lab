import { useEffect, useRef, useState } from "react";
import { createWebSocket } from "./services/websocket";
import "./App.css";

const STORAGE_KEY = "poknex_messages";
const USERNAME_KEY = "poknex_username";
const SESSION_KEY = "poknex_session";
const PROFILE_KEY = "poknex_profile";

function formatTime(timestamp) {
  if (!timestamp) return "";
  return new Date(timestamp).toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" });
}
function loadMessages() { try { return JSON.parse(localStorage.getItem(STORAGE_KEY) || "[]"); } catch { return []; } }
function loadUsername() { try { return localStorage.getItem(USERNAME_KEY) || ""; } catch { return ""; } }
function loadSession() { try { return localStorage.getItem(SESSION_KEY) === "true"; } catch { return false; } }
function loadProfile() { try { return JSON.parse(localStorage.getItem(PROFILE_KEY) || "null"); } catch { return null; } }
function makeProfile(username) { return { username, displayName: username, avatar: "", status: "" }; }

function App() {
  const initialUsername = loadUsername();
  const initialSession = loadSession() && !!initialUsername;
  const initialProfile = loadProfile() || (initialUsername ? makeProfile(initialUsername) : null);

  const [username, setUsername] = useState(initialUsername);
  const [profile, setProfile] = useState(initialProfile);
  const [profileOpen, setProfileOpen] = useState(false);
  const [connected, setConnected] = useState(false);
  const [hasSession, setHasSession] = useState(initialSession);
  const [connectionStatus, setConnectionStatus] = useState(initialSession ? "connecting" : "disconnected");
  const [reconnectAttempt, setReconnectAttempt] = useState(0);
  const [reconnectSeconds, setReconnectSeconds] = useState(0);
  const [messages, setMessages] = useState(loadMessages);
  const [users, setUsers] = useState([]);
  const [messageInput, setMessageInput] = useState("");

  const socketRef = useRef(null);
  const sessionRef = useRef(initialSession);
  const connectGenerationRef = useRef(0);

  useEffect(() => { try { localStorage.setItem(STORAGE_KEY, JSON.stringify(messages)); } catch {} }, [messages]);
  useEffect(() => { try { if (username.trim()) localStorage.setItem(USERNAME_KEY, username.trim()); } catch {} }, [username]);
  useEffect(() => { if (!profile) return; try { localStorage.setItem(PROFILE_KEY, JSON.stringify(profile)); } catch {} }, [profile]);

  useEffect(() => {
    if (connectionStatus !== "reconnecting") return;
    const timer = setInterval(() => setReconnectSeconds((current) => current > 1 ? current - 1 : 10), 1000);
    return () => clearInterval(timer);
  }, [connectionStatus]);

  function connect(nameOverride = username, profileOverride = profile) {
    const name = nameOverride.trim();
    if (!name) return;

    const generation = ++connectGenerationRef.current;
    const nextProfile = profileOverride ? { ...profileOverride, username: name } : makeProfile(name);

    socketRef.current?.close();
    sessionRef.current = true;
    setHasSession(true);
    setConnected(false);
    setConnectionStatus("connecting");
    setReconnectAttempt(0);
    setReconnectSeconds(0);
    setUsername(name);
    setProfile(nextProfile);

    try {
      localStorage.setItem(USERNAME_KEY, name);
      localStorage.setItem(SESSION_KEY, "true");
      localStorage.setItem(PROFILE_KEY, JSON.stringify(nextProfile));
    } catch {}

    const socket = createWebSocket(name, {
      onOpen() {
        if (generation !== connectGenerationRef.current) return;
        setConnected(true);
        setHasSession(true);
        setConnectionStatus("connected");
        setReconnectAttempt(0);
        setReconnectSeconds(0);
      },
      onMessage(data) {
        if (generation !== connectGenerationRef.current) return;
        if (data?.type === "users") {
          setUsers(Array.isArray(data.users) ? data.users : []);
          return;
        }
        if (data?.type === "message" || data?.type === "system") {
          setMessages((current) => [...current, { ...data, timestamp: data.timestamp || Date.now() }]);
        }
      },
      onClose() {
        if (generation !== connectGenerationRef.current) return;
        setConnected(false);
        setConnectionStatus(sessionRef.current ? "reconnecting" : "disconnected");
        if (sessionRef.current) setReconnectSeconds(10);
      },
      onReconnecting(_delay, attempt) {
        if (generation !== connectGenerationRef.current || !sessionRef.current) return;
        setConnected(false);
        setHasSession(true);
        setConnectionStatus("reconnecting");
        setReconnectAttempt(attempt);
        setReconnectSeconds(10);
      },
      onError(error) {
        if (generation === connectGenerationRef.current) console.error("Erro no WebSocket:", error);
      },
    });

    socketRef.current = socket;
  }

  useEffect(() => {
    if (!initialSession || !initialUsername) return;
    connect(initialUsername, initialProfile);
    return () => {
      connectGenerationRef.current += 1;
      socketRef.current?.close();
      socketRef.current = null;
    };
  }, []);

  function sendMessage(event) {
    event.preventDefault();
    const message = messageInput.trim();
    if (!message || !connected) return;
    if (socketRef.current?.sendMessage(message)) setMessageInput("");
  }

  function handleMessageKeyDown(event) {
    if (event.key === "Enter" && !event.shiftKey) {
      event.preventDefault();
      sendMessage(event);
    }
  }

  function disconnect() {
    sessionRef.current = false;
    ++connectGenerationRef.current;
    socketRef.current?.close();
    socketRef.current = null;
    setConnected(false);
    setHasSession(false);
    setConnectionStatus("disconnected");
    setReconnectAttempt(0);
    setReconnectSeconds(0);
    setUsers([]);
    setMessageInput("");
    try { localStorage.removeItem(SESSION_KEY); } catch {}
  }

  function clearLocalHistory() {
    setMessages([]);
    try { localStorage.removeItem(STORAGE_KEY); } catch {}
  }

  function saveProfile(event) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const next = {
      username,
      displayName: String(form.get("displayName") || username).trim() || username,
      avatar: String(form.get("avatar") || "").trim(),
      status: String(form.get("status") || "").trim()
    };
    setProfile(next);
    setProfileOpen(false);
  }

  function chooseAvatar(event) {
    const file = event.target.files?.[0];
    if (!file) return;
    if (!file.type.startsWith("image/")) { event.target.value = ""; return; }
    if (file.size > 2 * 1024 * 1024) {
      alert("Escolha uma imagem de até 2 MB.");
      event.target.value = "";
      return;
    }
    const reader = new FileReader();
    reader.onload = () => setProfile((current) => ({ ...(current || makeProfile(username)), avatar: String(reader.result) }));
    reader.readAsDataURL(file);
    event.target.value = "";
  }

  const displayName = profile?.displayName || username;
  const avatar = profile?.avatar || "";

  if (!hasSession) return <main className="app"><section className="login"><h1>💬 Poknex</h1><p>Entre no chat para conversar em tempo real.</p>{connectionStatus === "connecting" && <div className="status connecting">🟡 Conectando...</div>}{connectionStatus === "disconnected" && <div className="status disconnected">🔴 Desconectado</div>}<form className="login-form" onSubmit={(event) => { event.preventDefault(); connect(); }}><input type="text" placeholder="Seu username" value={username} onChange={(event) => setUsername(event.target.value)} maxLength={20} autoFocus /><button type="submit" disabled={connectionStatus === "connecting"}>{connectionStatus === "connecting" ? "Conectando..." : "Entrar"}</button></form></section></main>;

  return <main className="app"><section className="chat">
    <aside className="sidebar">
      <div className="sidebar-header"><div className="profile-summary" onClick={() => setProfileOpen(true)}><div className="avatar">{avatar ? <img src={avatar} alt="Avatar" /> : displayName.slice(0, 1).toUpperCase()}</div><div><h2>{displayName}</h2><p>@{username}</p><small>{profile?.status || "Sem status"}</small></div></div></div>
      <div className="users-title">Usuários online — {users.length}</div><ul className="users">{users.map((user, index) => <li className="user" key={`${user}-${index}`}><span className="online-dot" />{user}</li>)}</ul>
      <button className="logout" onClick={clearLocalHistory}>Limpar histórico local</button>
    </aside>
    <div className="chat-content">
      <header className="chat-header"><div><h1># geral</h1>{connectionStatus === "reconnecting" ? <div className="connection connecting">🟡 Reconectando... tentativa #{reconnectAttempt || 1} • próxima tentativa em {reconnectSeconds || 10}s</div> : connectionStatus === "connecting" ? <div className="connection connecting">🟡 Conectando...</div> : <div className="connection"><span className="online-dot" />Online</div>}</div><button className="logout" onClick={disconnect}>Sair</button></header>
      <div className="messages">{messages.map((message, index) => { if (message.type === "system") return <div className="system-message" key={index}>{message.message}<span> • {formatTime(message.timestamp)}</span></div>; if (message.type !== "message") return null; const isMine = message.username === username; return <div className={`message ${isMine ? "mine" : "other"}`} key={index}>{!isMine && <div className="message-avatar">{String(message.username || "?").slice(0, 1).toUpperCase()}</div>}<div className="message-main">{!isMine && <span className="message-user">{message.username}</span>}<div className="message-row"><div className="message-bubble">{message.message}</div><span className="message-time">{formatTime(message.timestamp)}</span>{isMine && <div className="message-avatar">{avatar ? <img src={avatar} alt="Avatar" /> : displayName.slice(0, 1).toUpperCase()}</div>}</div></div></div>; })}</div>
      <form className="message-form" onSubmit={sendMessage}><textarea placeholder={connected ? "Digite uma mensagem..." : "Aguardando conexão..."} value={messageInput} onChange={(event) => setMessageInput(event.target.value)} onKeyDown={handleMessageKeyDown} rows={1} maxLength={1000} disabled={!connected} /><button type="submit" disabled={!connected || !messageInput.trim()}>Enviar</button></form><div className="input-hint">Enter para enviar • Histórico salvo neste navegador</div>
    </div>
    {profileOpen && <div className="profile-overlay" onMouseDown={(event) => { if (event.target === event.currentTarget) setProfileOpen(false); }}><form className="profile-modal" onSubmit={saveProfile}><h2>👤 Meu perfil</h2><div className="profile-preview"><div className="avatar large">{avatar ? <img src={avatar} alt="Avatar" /> : displayName.slice(0, 1).toUpperCase()}</div><div><strong>@{username}</strong><p>O username não pode ser alterado.</p></div></div><div className="avatar-picker"><label className="avatar-button" htmlFor="avatar-file">🖼️ Escolher imagem</label><input id="avatar-file" type="file" accept="image/*" onChange={chooseAvatar} hidden /><span>PNG, JPG, GIF ou WebP • até 2 MB</span></div><label>Nome de exibição<input name="displayName" defaultValue={displayName} maxLength={30} /></label><label>Status personalizado<input name="status" placeholder="Ex.: Jogando 🎮" maxLength={60} defaultValue={profile?.status || ""} /></label><div className="profile-actions"><button type="button" onClick={() => setProfileOpen(false)}>Cancelar</button><button type="submit">Salvar perfil</button></div></form></div>}
  </section></main>;
}
export default App;
