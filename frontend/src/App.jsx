import { useEffect, useRef, useState } from "react";
import { createWebSocket } from "./services/websocket";
import "./App.css";

const STORAGE_KEY = "poknex_messages";
const USERNAME_KEY = "poknex_username";
const SESSION_KEY = "poknex_session";
const PROFILE_KEY = "poknex_profile";

function formatTime(timestamp) { if (!timestamp) return ""; return new Date(timestamp).toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" }); }
function loadMessages() { try { return JSON.parse(localStorage.getItem(STORAGE_KEY) || "[]"); } catch { return []; } }
function loadUsername() { try { return localStorage.getItem(USERNAME_KEY) || ""; } catch { return ""; } }
function loadSession() { try { return localStorage.getItem(SESSION_KEY) === "true"; } catch { return false; } }
function loadProfile() { try { return JSON.parse(localStorage.getItem(PROFILE_KEY) || "null"); } catch { return null; } }
function makeProfile(username) { return { username, displayName: username, avatar: "", status: "" }; }

const avatarStyle = { width: 42, height: 42, minWidth: 42, borderRadius: "50%", overflow: "hidden", display: "flex", alignItems: "center", justifyContent: "center", background: "#303644", color: "#fff", fontWeight: 700 };
function Avatar({ src, name, large = false, message = false }) {
  const size = large ? 96 : message ? 34 : 42;
  const style = { ...avatarStyle, width: size, height: size, minWidth: size, fontSize: large ? 28 : message ? 12 : undefined };
  return <div style={style}>{src ? <img src={src} alt={`Avatar de ${name}`} style={{ width: "100%", height: "100%", objectFit: "cover", display: "block" }} /> : name.slice(0, 1).toUpperCase()}</div>;
}

function App() {
  const savedUsername = loadUsername(); const savedSession = loadSession();
  const [username, setUsername] = useState(savedUsername);
  const [profile, setProfile] = useState(() => loadProfile() || (savedUsername ? makeProfile(savedUsername) : null));
  const [profileOpen, setProfileOpen] = useState(false);
  const [connected, setConnected] = useState(false);
  const [hasSession, setHasSession] = useState(savedSession && !!savedUsername);
  const [connectionStatus, setConnectionStatus] = useState(savedSession && savedUsername ? "connecting" : "disconnected");
  const [reconnectAttempt, setReconnectAttempt] = useState(0); const [reconnectSeconds, setReconnectSeconds] = useState(0);
  const [messages, setMessages] = useState(loadMessages); const [users, setUsers] = useState([]); const [messageInput, setMessageInput] = useState("");
  const socketRef = useRef(null); const sessionRef = useRef(savedSession && !!savedUsername); const initializedRef = useRef(false);

  useEffect(() => { try { localStorage.setItem(STORAGE_KEY, JSON.stringify(messages)); } catch {} }, [messages]);
  useEffect(() => { try { if (username.trim()) localStorage.setItem(USERNAME_KEY, username.trim()); } catch {} }, [username]);
  useEffect(() => { if (!profile) return; try { localStorage.setItem(PROFILE_KEY, JSON.stringify(profile)); } catch {} }, [profile]);
  useEffect(() => { if (connectionStatus !== "reconnecting") return; const timer = setInterval(() => setReconnectSeconds((current) => current > 1 ? current - 1 : 10), 1000); return () => clearInterval(timer); }, [connectionStatus]);

  function connect(nameOverride = username, isRestore = false) {
    const name = nameOverride.trim(); if (!name) return;
    socketRef.current?.close(); sessionRef.current = true; setHasSession(true); setConnected(false); setConnectionStatus("connecting");
    if (!isRestore) { setReconnectAttempt(0); setReconnectSeconds(0); }
    const nextProfile = profile ? { ...profile, username: name } : makeProfile(name); setProfile(nextProfile);
    try { localStorage.setItem(USERNAME_KEY, name); localStorage.setItem(SESSION_KEY, "true"); localStorage.setItem(PROFILE_KEY, JSON.stringify(nextProfile)); } catch {}
    socketRef.current = createWebSocket(name, {
      onOpen() { setConnected(true); setHasSession(true); setConnectionStatus("connected"); setReconnectAttempt(0); setReconnectSeconds(0); },
      onMessage(data) { if (data.type === "users") { setUsers(Array.isArray(data.users) ? data.users : []); return; } setMessages((current) => [...current, { ...data, timestamp: Date.now() }]); },
      onClose() { setConnected(false); setConnectionStatus(sessionRef.current ? "reconnecting" : "disconnected"); },
      onReconnecting(_delay, attempt) { if (!sessionRef.current) return; setConnected(false); setHasSession(true); setConnectionStatus("reconnecting"); setReconnectAttempt(attempt); setReconnectSeconds(10); },
      onError: (error) => console.error("Erro no WebSocket:", error),
    });
  }
  useEffect(() => { if (initializedRef.current) return; initializedRef.current = true; if (savedSession && savedUsername) connect(savedUsername, true); }, []);
  function sendMessage(event) { event.preventDefault(); const message = messageInput.trim(); if (!message || !connected) return; if (socketRef.current?.sendMessage(message)) setMessageInput(""); }
  function handleMessageKeyDown(event) { if (event.key === "Enter" && !event.shiftKey) { event.preventDefault(); sendMessage(event); } }
  function disconnect() { sessionRef.current = false; socketRef.current?.close(); socketRef.current = null; setConnected(false); setHasSession(false); setConnectionStatus("disconnected"); setReconnectAttempt(0); setReconnectSeconds(0); setUsers([]); setMessageInput(""); try { localStorage.removeItem(SESSION_KEY); } catch {} }
  function clearLocalHistory() { setMessages([]); try { localStorage.removeItem(STORAGE_KEY); } catch {} }
  function saveProfile(event) { event.preventDefault(); const form = new FormData(event.currentTarget); const next = { username, displayName: String(form.get("displayName") || username).trim() || username, avatar: profile?.avatar || "", status: String(form.get("status") || "").trim() }; setProfile(next); setProfileOpen(false); }
  function chooseAvatar(event) { const file = event.target.files?.[0]; if (!file) return; if (!file.type.startsWith("image/")) return; if (file.size > 2 * 1024 * 1024) { alert("Escolha uma imagem de até 2 MB."); event.target.value = ""; return; } const reader = new FileReader(); reader.onload = () => setProfile((current) => ({ ...(current || makeProfile(username)), avatar: String(reader.result) })); reader.readAsDataURL(file); event.target.value = ""; }
  useEffect(() => () => { socketRef.current?.close(); }, []);

  if (!hasSession) return <main className="app"><section className="login"><h1>💬 Poknex</h1><p>Entre no chat para conversar em tempo real.</p>{connectionStatus === "disconnected" && <div className="status disconnected">🔴 Desconectado</div>}<form className="login-form" onSubmit={(event) => { event.preventDefault(); connect(); }}><input type="text" placeholder="Seu username" value={username} onChange={(event) => setUsername(event.target.value)} maxLength={20} autoFocus /><button type="submit" disabled={connectionStatus === "connecting"}>{connectionStatus === "connecting" ? "Conectando..." : "Entrar"}</button></form></section></main>;

  const displayName = profile?.displayName || username; const avatar = profile?.avatar || "";
  return <main className="app"><section className="chat">
    <aside className="sidebar">
      <div className="sidebar-header"><div className="profile-summary" onClick={() => setProfileOpen(true)} style={{ display: "flex", alignItems: "center", gap: 11, cursor: "pointer" }}><Avatar src={avatar} name={displayName} /><div style={{ minWidth: 0 }}><h2>{displayName}</h2><p>@{username}</p><small>{profile?.status || "Sem status"}</small></div></div></div>
      <div className="users-title">Usuários online — {users.length}</div><ul className="users">{users.map((user, index) => <li className="user" key={`${user}-${index}`}><span className="online-dot" />{user}</li>)}</ul>
      <button className="logout" onClick={clearLocalHistory}>Limpar histórico local</button>
    </aside>
    <div className="chat-content"><header className="chat-header"><div><h1># geral</h1>{connectionStatus === "reconnecting" ? <div className="connection connecting">🟡 Reconectando... tentativa #{reconnectAttempt} • próxima tentativa em {reconnectSeconds}s</div> : connectionStatus === "connecting" ? <div className="connection connecting">🟡 Conectando...</div> : <div className="connection"><span className="online-dot" />Online</div>}</div><button className="logout" onClick={disconnect}>Sair</button></header>
      <div className="messages">{messages.map((message, index) => { if (message.type === "system") return <div className="system-message" key={index}>{message.message}<span> • {formatTime(message.timestamp)}</span></div>; const isMine = message.username === username; const messageName = message.username || "Usuário"; const messageAvatar = isMine ? avatar : ""; return <div className={`message ${isMine ? "mine" : "other"}`} key={index} style={{ display: "flex", flexDirection: "column", alignItems: isMine ? "flex-end" : "flex-start" }}>{!isMine && <span className="message-user">{messageName}</span>}<div className="message-row" style={{ display: "flex", alignItems: "flex-end", gap: 8 }}>{!isMine && <Avatar src={messageAvatar} name={messageName} message />}<div className="message-bubble">{message.message}</div><span className="message-time">{formatTime(message.timestamp)}</span>{isMine && <Avatar src={messageAvatar} name={messageName} message />}</div></div>; })}</div>
      <form className="message-form" onSubmit={sendMessage}><textarea placeholder={connected ? "Digite uma mensagem..." : "Aguardando conexão..."} value={messageInput} onChange={(event) => setMessageInput(event.target.value)} onKeyDown={handleMessageKeyDown} rows={1} maxLength={1000} disabled={!connected} /><button type="submit" disabled={!connected || !messageInput.trim()}>Enviar</button></form><div className="input-hint">Enter para enviar • Histórico salvo neste navegador</div>
    </div>
    {profileOpen && <div className="profile-overlay" onMouseDown={(event) => { if (event.target === event.currentTarget) setProfileOpen(false); }}><form className="profile-modal" onSubmit={saveProfile}><h2>👤 Meu perfil</h2><div className="profile-preview" style={{ display: "flex", alignItems: "center", gap: 16 }}><Avatar src={avatar} name={displayName} large /><div><strong>@{username}</strong><p>O username não pode ser alterado.</p></div></div><div className="avatar-picker"><label className="avatar-button" htmlFor="avatar-file">🖼️ Escolher imagem</label><input id="avatar-file" type="file" accept="image/*" onChange={chooseAvatar} hidden /><span>Imagem • recorte quadrado automático • PNG, JPG, GIF ou WebP • até 2 MB</span></div><label>Nome de exibição<input name="displayName" defaultValue={displayName} maxLength={30} /></label><label>Status personalizado<input name="status" placeholder="Ex.: Jogando 🎮" maxLength={60} defaultValue={profile?.status || ""} /></label><div className="profile-actions"><button type="button" onClick={() => setProfileOpen(false)}>Cancelar</button><button type="submit">Salvar perfil</button></div></form></div>}
  </section></main>;
}
export default App;
