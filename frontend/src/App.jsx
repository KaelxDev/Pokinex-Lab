import { useEffect, useRef, useState } from "react";
import { createWebSocket } from "./services/websocket";
import "./App.css";

const STORAGE_KEY = "poknex_messages";
const USERNAME_KEY = "poknex_username";
const SESSION_KEY = "poknex_session";
const QUEUE_KEY = "poknex_offline_queue";

function formatTime(timestamp) { if (!timestamp) return ""; return new Date(timestamp).toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" }); }
function loadMessages() { try { return JSON.parse(localStorage.getItem(STORAGE_KEY) || "[]"); } catch { return []; } }
function loadUsername() { try { return localStorage.getItem(USERNAME_KEY) || ""; } catch { return ""; } }
function loadSession() { try { return localStorage.getItem(SESSION_KEY) === "true"; } catch { return false; } }
function loadQueue() { try { const q = JSON.parse(localStorage.getItem(QUEUE_KEY) || "[]"); return Array.isArray(q) ? q : []; } catch { return []; } }

function App() {
  const initialUsername = loadUsername();
  const initialSession = loadSession() && !!initialUsername;
  const [username, setUsername] = useState(initialUsername);
  const [connected, setConnected] = useState(false);
  const [hasSession, setHasSession] = useState(initialSession);
  const [connectionStatus, setConnectionStatus] = useState(initialSession ? "connecting" : "disconnected");
  const [reconnectAttempt, setReconnectAttempt] = useState(0);
  const [reconnectSeconds, setReconnectSeconds] = useState(0);
  const [messages, setMessages] = useState(loadMessages);
  const [users, setUsers] = useState([]);
  const [messageInput, setMessageInput] = useState("");
  const [offlineQueue, setOfflineQueue] = useState(loadQueue);
  const socketRef = useRef(null);
  const sessionRef = useRef(initialSession);
  const connectGenerationRef = useRef(0);
  const queueRef = useRef(offlineQueue);

  useEffect(() => { queueRef.current = offlineQueue; try { localStorage.setItem(QUEUE_KEY, JSON.stringify(offlineQueue)); } catch {} }, [offlineQueue]);
  useEffect(() => { try { localStorage.setItem(STORAGE_KEY, JSON.stringify(messages)); } catch {} }, [messages]);
  useEffect(() => { try { if (username.trim()) localStorage.setItem(USERNAME_KEY, username.trim()); } catch {} }, [username]);
  useEffect(() => { if (connectionStatus !== "reconnecting") return; const timer = setInterval(() => setReconnectSeconds((v) => v > 1 ? v - 1 : 10), 1000); return () => clearInterval(timer); }, [connectionStatus]);

  function flushQueue(socket) {
    if (!socket || queueRef.current.length === 0) return;
    for (const item of queueRef.current) {
      if (!socket.sendMessage(item.message, item.id)) break;
    }
  }

  function markDelivered(messageId) {
    if (!messageId) return;
    setOfflineQueue((current) => current.filter((item) => item.id !== messageId));
    setMessages((current) => current.map((message) => message.messageId === messageId ? { ...message, offline: false } : message));
  }

  function connect(nameOverride = username) {
    const name = nameOverride.trim(); if (!name) return;
    const generation = ++connectGenerationRef.current;
    socketRef.current?.close();
    sessionRef.current = true; setHasSession(true); setConnected(false); setConnectionStatus("connecting"); setReconnectAttempt(0); setReconnectSeconds(0);
    try { localStorage.setItem(USERNAME_KEY, name); localStorage.setItem(SESSION_KEY, "true"); } catch {}
    socketRef.current = createWebSocket(name, {
      onOpen() { if (generation !== connectGenerationRef.current) return; setConnected(true); setConnectionStatus("connected"); setReconnectAttempt(0); setReconnectSeconds(0); setTimeout(() => flushQueue(socketRef.current), 0); },
      onMessage(data) {
        if (generation !== connectGenerationRef.current) return;
        if (data?.type === "users") { setUsers(Array.isArray(data.users) ? data.users : []); return; }
        if (data?.type === "ack") { markDelivered(data.messageId); return; }
        if (data?.type === "message") {
          setMessages((current) => {
            const existing = current.findIndex((message) => data.messageId && message.messageId === data.messageId);
            if (existing >= 0) return current.map((message, index) => index === existing ? { ...message, ...data, offline: false } : message);
            return [...current, { ...data, timestamp: data.timestamp || Date.now() }];
          });
          return;
        }
        if (data?.type === "system") setMessages((current) => [...current, { ...data, timestamp: data.timestamp || Date.now() }]);
      },
      onClose() { if (generation !== connectGenerationRef.current) return; setConnected(false); setConnectionStatus(sessionRef.current ? "reconnecting" : "disconnected"); if (sessionRef.current) setReconnectSeconds(10); },
      onReconnecting(_delay, attempt) { if (generation !== connectGenerationRef.current || !sessionRef.current) return; setConnected(false); setHasSession(true); setConnectionStatus("reconnecting"); setReconnectAttempt(attempt); setReconnectSeconds(10); },
      onError: (error) => console.error("Erro no WebSocket:", error),
    });
  }

  useEffect(() => { if (!initialSession) return; const timer = setTimeout(() => connect(initialUsername), 0); return () => clearTimeout(timer); }, []);

  function sendMessage(event) {
    event.preventDefault(); const message = messageInput.trim(); if (!message) return;
    const socket = socketRef.current;
    const messageId = `${Date.now()}-${Math.random().toString(36).slice(2)}`;
    if (connected && socket?.sendMessage(message, messageId)) { setMessageInput(""); return; }
    const item = { id: messageId, message, createdAt: Date.now() };
    setOfflineQueue((current) => [...current, item]);
    setMessageInput("");
    setMessages((current) => [...current, { type: "message", messageId, username, message, timestamp: item.createdAt, offline: true }]);
  }
  function handleMessageKeyDown(event) { if (event.key === "Enter" && !event.shiftKey) { event.preventDefault(); sendMessage(event); } }
  function disconnect() { sessionRef.current = false; ++connectGenerationRef.current; socketRef.current?.close(); socketRef.current = null; setConnected(false); setHasSession(false); setConnectionStatus("disconnected"); setReconnectAttempt(0); setReconnectSeconds(0); setUsers([]); setMessageInput(""); try { localStorage.removeItem(SESSION_KEY); } catch {} }
  function clearLocalHistory() { setMessages([]); try { localStorage.removeItem(STORAGE_KEY); } catch {} }

  if (!hasSession) return <main className="app"><section className="login"><h1>💬 Poknex</h1><p>Entre no chat para conversar em tempo real.</p>{connectionStatus === "connecting" && <div className="status connecting">🟡 Conectando...</div>}{connectionStatus === "disconnected" && <div className="status disconnected">🔴 Desconectado</div>}<form className="login-form" onSubmit={(event) => { event.preventDefault(); connect(); }}><input type="text" placeholder="Seu username" value={username} onChange={(event) => setUsername(event.target.value)} maxLength={20} autoFocus /><button type="submit" disabled={connectionStatus === "connecting"}>{connectionStatus === "connecting" ? "Conectando..." : "Entrar"}</button></form></section></main>;

  return <main className="app"><section className="chat"><aside className="sidebar"><div className="sidebar-header"><h2>💬 Poknex</h2><p>Conectado como <strong>{username}</strong></p></div><div className="users-title">Usuários online — {users.length}</div><ul className="users">{users.map((user, index) => <li className="user" key={`${user}-${index}`}><span className="online-dot" />{user}</li>)}</ul><div className="queue-status">{offlineQueue.length > 0 && <>📦 {offlineQueue.length} mensagem(ns) aguardando envio</>}</div><button className="logout" onClick={clearLocalHistory}>Limpar histórico local</button></aside><div className="chat-content"><header className="chat-header"><div><h1># geral</h1>{connectionStatus === "reconnecting" ? <div className="connection connecting">🟡 Reconectando... tentativa #{reconnectAttempt} • próxima tentativa em {reconnectSeconds}s</div> : connectionStatus === "connecting" ? <div className="connection connecting">🟡 Conectando...</div> : <div className="connection"><span className="online-dot" />Online</div>}</div><button className="logout" onClick={disconnect}>Sair</button></header><div className="messages">{messages.map((message, index) => { if (message.type === "system") return <div className="system-message" key={index}>{message.message}<span> • {formatTime(message.timestamp)}</span></div>; if (message.type !== "message") return null; const isMine = message.username === username; return <div className={`message ${isMine ? "mine" : "other"}`} key={message.messageId || index}>{!isMine && <span className="message-user">{message.username}</span>}<div className="message-row"><div className="message-bubble">{message.message}</div><span className="message-time">{formatTime(message.timestamp)}{message.offline ? " • pendente" : ""}</span></div></div>; })}</div><form className="message-form" onSubmit={sendMessage}><textarea placeholder={connected ? "Digite uma mensagem..." : "Digite uma mensagem offline..."} value={messageInput} onChange={(event) => setMessageInput(event.target.value)} onKeyDown={handleMessageKeyDown} rows={1} maxLength={1000} /><button type="submit" disabled={!messageInput.trim()}>Enviar</button></form><div className="input-hint">Enter para enviar • Histórico e fila offline salvos neste navegador</div></div></section></main>;
}
export default App;