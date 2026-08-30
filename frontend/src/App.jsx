import { useEffect, useRef, useState } from "react";
import { createWebSocket } from "./services/websocket";
import "./App.css";

const STORAGE_KEY = "poknex_messages";
const USERNAME_KEY = "poknex_username";
const SESSION_KEY = "poknex_session";

function formatTime(timestamp) { if (!timestamp) return ""; return new Date(timestamp).toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" }); }
function loadMessages() { try { return JSON.parse(localStorage.getItem(STORAGE_KEY) || "[]"); } catch { return []; } }
function loadUsername() { try { return localStorage.getItem(USERNAME_KEY) || ""; } catch { return ""; } }
function loadSession() { try { return localStorage.getItem(SESSION_KEY) === "true"; } catch { return false; } }

function App() {
  const [username, setUsername] = useState(loadUsername);
  const [connected, setConnected] = useState(false);
  const [hasConnected, setHasConnected] = useState(loadSession);
  const [connectionStatus, setConnectionStatus] = useState(loadSession ? "reconnecting" : "disconnected");
  const [reconnectAttempt, setReconnectAttempt] = useState(0);
  const [reconnectSeconds, setReconnectSeconds] = useState(loadSession ? 10 : 0);
  const [messages, setMessages] = useState(loadMessages);
  const [users, setUsers] = useState([]);
  const [messageInput, setMessageInput] = useState("");
  const socketRef = useRef(null);
  const sessionRef = useRef(loadSession());
  const initializingRef = useRef(false);

  useEffect(() => { try { localStorage.setItem(STORAGE_KEY, JSON.stringify(messages)); } catch {} }, [messages]);
  useEffect(() => { try { if (username.trim()) localStorage.setItem(USERNAME_KEY, username.trim()); } catch {} }, [username]);

  useEffect(() => {
    if (connectionStatus !== "reconnecting") return;
    const timer = setInterval(() => setReconnectSeconds((current) => current > 1 ? current - 1 : 10), 1000);
    return () => clearInterval(timer);
  }, [connectionStatus]);

  function connect(nameOverride = username) {
    const name = nameOverride.trim();
    if (!name || initializingRef.current) return;
    initializingRef.current = true;

    socketRef.current?.close();
    sessionRef.current = true;
    setHasConnected(true); setConnected(false); setConnectionStatus("connecting"); setReconnectAttempt(0); setReconnectSeconds(0);
    try { localStorage.setItem(USERNAME_KEY, name); localStorage.setItem(SESSION_KEY, "true"); } catch {}

    const socket = createWebSocket(name, {
      onOpen() {
        initializingRef.current = false;
        setConnected(true); setHasConnected(true); setConnectionStatus("connected"); setReconnectAttempt(0); setReconnectSeconds(0);
      },
      onMessage(data) {
        if (data?.type === "users") { setUsers(Array.isArray(data.users) ? data.users : []); return; }
        if (data?.type === "message" || data?.type === "system") setMessages((current) => [...current, { ...data, timestamp: data.timestamp || Date.now() }]);
      },
      onClose() {
        initializingRef.current = false;
        setConnected(false);
        if (sessionRef.current) { setConnectionStatus("reconnecting"); setReconnectSeconds(10); } else setConnectionStatus("disconnected");
      },
      onReconnecting(_delay, attempt) {
        if (!sessionRef.current) return;
        initializingRef.current = false;
        setConnected(false); setHasConnected(true); setConnectionStatus("reconnecting"); setReconnectAttempt(attempt); setReconnectSeconds(10);
      },
      onError: (error) => console.error("Erro no WebSocket:", error),
    });
    socketRef.current = socket;
  }

  useEffect(() => {
    const savedUsername = loadUsername();
    if (!loadSession() || !savedUsername) return;
    sessionRef.current = true;
    setHasConnected(true);
    setConnectionStatus("connecting");
    connect(savedUsername);
    return () => { socketRef.current?.close(); socketRef.current = null; };
  }, []);

  function sendMessage(event) { event.preventDefault(); const message = messageInput.trim(); if (!message || !connected) return; if (socketRef.current?.sendMessage(message)) setMessageInput(""); }
  function handleMessageKeyDown(event) { if (event.key === "Enter" && !event.shiftKey) { event.preventDefault(); sendMessage(event); } }
  function disconnect() { sessionRef.current = false; initializingRef.current = false; socketRef.current?.close(); socketRef.current = null; setConnected(false); setHasConnected(false); setConnectionStatus("disconnected"); setReconnectAttempt(0); setReconnectSeconds(0); setUsers([]); setMessageInput(""); try { localStorage.removeItem(SESSION_KEY); } catch {} }
  function clearLocalHistory() { setMessages([]); try { localStorage.removeItem(STORAGE_KEY); } catch {} }

  const showChat = hasConnected || connected;
  if (!showChat) return (
    <main className="app"><section className="login"><h1>💬 Poknex</h1><p>Entre no chat para conversar em tempo real.</p>{connectionStatus === "connecting" && <div className="status connecting">🟡 Conectando...</div>}{connectionStatus === "disconnected" && <div className="status disconnected">🔴 Desconectado</div>}<form className="login-form" onSubmit={(event) => { event.preventDefault(); connect(); }}><input type="text" placeholder="Seu username" value={username} onChange={(event) => setUsername(event.target.value)} maxLength={20} autoFocus /><button type="submit" disabled={connectionStatus === "connecting"}>{connectionStatus === "connecting" ? "Conectando..." : "Entrar"}</button></form></section></main>
  );

  return (
    <main className="app"><section className="chat"><aside className="sidebar"><div className="sidebar-header"><h2>💬 Poknex</h2><p>Conectado como <strong>{username}</strong></p></div><div className="users-title">Usuários online — {users.length}</div><ul className="users">{users.map((user, index) => <li className="user" key={`${user}-${index}`}><span className="online-dot" />{user}</li>)}</ul><button className="logout" onClick={clearLocalHistory}>Limpar histórico local</button></aside><div className="chat-content"><header className="chat-header"><div><h1># geral</h1>{connectionStatus === "reconnecting" ? <div className="connection connecting">🟡 Reconectando... tentativa #{reconnectAttempt} • próxima tentativa em {reconnectSeconds}s</div> : connectionStatus === "connecting" ? <div className="connection connecting">🟡 Conectando...</div> : <div className="connection"><span className="online-dot" />Online</div>}</div><button className="logout" onClick={disconnect}>Sair</button></header><div className="messages">{messages.map((message, index) => { if (message.type === "system") return <div className="system-message" key={index}>{message.message}<span> • {formatTime(message.timestamp)}</span></div>; if (message.type !== "message") return null; const isMine = message.username === username; return <div className={`message ${isMine ? "mine" : "other"}`} key={index}>{!isMine && <span className="message-user">{message.username}</span>}<div className="message-row"><div className="message-bubble">{message.message}</div><span className="message-time">{formatTime(message.timestamp)}</span></div></div>; })}</div><form className="message-form" onSubmit={sendMessage}><textarea placeholder={connected ? "Digite uma mensagem..." : "Aguardando conexão..."} value={messageInput} onChange={(event) => setMessageInput(event.target.value)} onKeyDown={handleMessageKeyDown} rows={1} maxLength={1000} disabled={!connected} /><button type="submit" disabled={!connected || !messageInput.trim()}>Enviar</button></form><div className="input-hint">Enter para enviar • Histórico salvo neste navegador</div></div></section></main>
  );
}
export default App;
