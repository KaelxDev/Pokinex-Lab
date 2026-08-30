import { useEffect, useRef, useState } from "react";
import { createWebSocket } from "./services/websocket";
import "./App.css";

const STORAGE_KEY = "poknex_messages";
const USERNAME_KEY = "poknex_username";

function formatTime(timestamp) {
  if (!timestamp) return "";
  return new Date(timestamp).toLocaleTimeString("pt-BR", {
    hour: "2-digit",
    minute: "2-digit"
  });
}

function loadMessages() {
  try {
    const saved = localStorage.getItem(STORAGE_KEY);
    return saved ? JSON.parse(saved) : [];
  } catch (error) {
    console.error("Erro ao carregar mensagens locais:", error);
    return [];
  }
}

function loadUsername() {
  try {
    return localStorage.getItem(USERNAME_KEY) || "";
  } catch (error) {
    console.error("Erro ao carregar username local:", error);
    return "";
  }
}

function App() {
  const [username, setUsername] = useState(loadUsername);
  const [connected, setConnected] = useState(false);
  const [connectionStatus, setConnectionStatus] = useState("disconnected");
  const [reconnectAttempt, setReconnectAttempt] = useState(0);
  const [reconnectSeconds, setReconnectSeconds] = useState(0);
  const [messages, setMessages] = useState(loadMessages);
  const [users, setUsers] = useState([]);
  const [messageInput, setMessageInput] = useState("");

  const socketRef = useRef(null);
  const messagesEndRef = useRef(null);

  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(messages));
    } catch (error) {
      console.error("Erro ao salvar mensagens localmente:", error);
    }
  }, [messages]);

  useEffect(() => {
    try {
      if (username.trim()) localStorage.setItem(USERNAME_KEY, username.trim());
    } catch (error) {
      console.error("Erro ao salvar username local:", error);
    }
  }, [username]);

  useEffect(() => {
    if (connectionStatus !== "reconnecting" || reconnectSeconds <= 0) return;

    const timer = setInterval(() => {
      setReconnectSeconds((current) => Math.max(current - 1, 0));
    }, 1000);

    return () => clearInterval(timer);
  }, [connectionStatus, reconnectSeconds]);

  function connect() {
    const name = username.trim();
    if (!name) return;

    socketRef.current?.close();
    setConnectionStatus("connecting");
    setReconnectAttempt(0);
    setReconnectSeconds(0);

    const socket = createWebSocket(name, {
      onOpen() {
        setConnected(true);
        setConnectionStatus("connected");
        setReconnectAttempt(0);
        setReconnectSeconds(0);
      },
      onMessage(data) {
        setMessages((current) => [
          ...current,
          { ...data, timestamp: Date.now() }
        ]);
        if (data.users) setUsers(data.users);
      },
      onClose() {
        setConnected(false);
      },
      onReconnecting(_delay, attempt) {
        setConnected(false);
        setConnectionStatus("reconnecting");
        setReconnectAttempt(attempt);
        setReconnectSeconds(10);
      },
      onError(error) {
        console.error("WebSocket error:", error);
      }
    });

    socketRef.current = socket;
  }

  function sendMessage(event) {
    event.preventDefault();
    const message = messageInput.trim();
    if (!message) return;

    const sent = socketRef.current?.sendMessage(message);
    if (sent) setMessageInput("");
  }

  function handleMessageKeyDown(event) {
    if (event.key === "Enter" && !event.shiftKey) {
      event.preventDefault();
      sendMessage(event);
    }
  }

  function disconnect() {
    socketRef.current?.close();
    socketRef.current = null;
    setConnected(false);
    setConnectionStatus("disconnected");
    setReconnectAttempt(0);
    setReconnectSeconds(0);
    setUsers([]);
    setMessageInput("");
  }

  function clearLocalHistory() {
    setMessages([]);
    try {
      localStorage.removeItem(STORAGE_KEY);
    } catch (error) {
      console.error("Erro ao limpar histórico local:", error);
    }
  }

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  useEffect(() => () => socketRef.current?.close(), []);

  if (!connected) {
    const isReconnecting = connectionStatus === "reconnecting";

    return (
      <main className="app">
        <section className="login">
          <h1>💬 Poknex</h1>
          <p>Entre no chat para conversar em tempo real.</p>

          {isReconnecting && (
            <div className="status connecting">
              🟡 Reconectando... tentativa #{reconnectAttempt}
              <br />
              ⏱️ Próxima tentativa em {reconnectSeconds}s
            </div>
          )}

          {connectionStatus === "connecting" && (
            <div className="status connecting">🟡 Conectando...</div>
          )}

          {connectionStatus === "disconnected" && (
            <div className="status disconnected">🔴 Desconectado</div>
          )}

          <form
            className="login-form"
            onSubmit={(event) => {
              event.preventDefault();
              connect();
            }}
          >
            <input
              type="text"
              placeholder="Seu username"
              value={username}
              onChange={(event) => setUsername(event.target.value)}
              maxLength={20}
              autoFocus
            />
            <button type="submit" disabled={connectionStatus === "connecting"}>
              {connectionStatus === "connecting" ? "Conectando..." : "Entrar"}
            </button>
          </form>
        </section>
      </main>
    );
  }

  return (
    <main className="app">
      <section className="chat">
        <aside className="sidebar">
          <div className="sidebar-header">
            <h2>💬 Poknex</h2>
            <p>Conectado como <strong>{username}</strong></p>
          </div>

          <div className="users-title">Usuários online — {users.length}</div>
          <ul className="users">
            {users.map((user, index) => (
              <li className="user" key={`${user}-${index}`}>
                <span className="online-dot" />
                {user}
              </li>
            ))}
          </ul>

          <button className="logout" onClick={clearLocalHistory}>
            Limpar histórico local
          </button>
        </aside>

        <div className="chat-content">
          <header className="chat-header">
            <div>
              <h1># geral</h1>
              <div className="connection">
                <span className="online-dot" />
                Online
              </div>
            </div>
            <button className="logout" onClick={disconnect}>Sair</button>
          </header>

          <div className="messages">
            {messages.map((message, index) => {
              if (message.type === "system") {
                return (
                  <div className="system-message" key={index}>
                    {message.message}
                    <span> • {formatTime(message.timestamp)}</span>
                  </div>
                );
              }

              const isMine = message.username === username;

              return (
                <div className={`message ${isMine ? "mine" : "other"}`} key={index}>
                  {!isMine && <span className="message-user">{message.username}</span>}
                  <div className="message-row">
                    <div className="message-bubble">{message.message}</div>
                    <span className="message-time">{formatTime(message.timestamp)}</span>
                  </div>
                </div>
              );
            })}
            <div ref={messagesEndRef} />
          </div>

          <form className="message-form" onSubmit={sendMessage}>
            <textarea
              placeholder="Digite uma mensagem..."
              value={messageInput}
              onChange={(event) => setMessageInput(event.target.value)}
              onKeyDown={handleMessageKeyDown}
              rows={1}
              maxLength={1000}
            />
            <button type="submit" disabled={!messageInput.trim()}>Enviar</button>
          </form>

          <div className="input-hint">Enter para enviar • Histórico salvo neste navegador</div>
        </div>
      </section>
    </main>
  );
}

export default App;
