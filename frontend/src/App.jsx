import { useEffect, useRef, useState } from "react";
import { createWebSocket } from "./services/websocket";
import "./App.css";


function formatTime(timestamp) {
  if (!timestamp) {
    return "";
  }

  return new Date(timestamp).toLocaleTimeString(
    "pt-BR",
    {
      hour: "2-digit",
      minute: "2-digit"
    }
  );
}


function App() {
  const [username, setUsername] = useState("");

  const [connected, setConnected] = useState(false);
  const [connectionStatus, setConnectionStatus] =
    useState("disconnected");

  const [messages, setMessages] = useState([]);
  const [users, setUsers] = useState([]);

  const [messageInput, setMessageInput] = useState("");

  const socketRef = useRef(null);
  const messagesEndRef = useRef(null);
  const messageInputRef = useRef(null);


  function connect() {
    const name = username.trim();

    if (!name) {
      return;
    }

    setConnectionStatus("connecting");

    const socket = createWebSocket(name, {

      onOpen() {
        setConnected(true);
        setConnectionStatus("connected");
      },


      onMessage(data) {
        setMessages((current) => [
          ...current,
          {
            ...data,
            timestamp: Date.now()
          }
        ]);

        if (data.users) {
          setUsers(data.users);
        }
      },


      onClose() {
        setConnected(false);
        setConnectionStatus("disconnected");
      },


      onError(error) {
        console.error(
          "WebSocket error:",
          error
        );
      }

    });

    socketRef.current = socket;
  }


  function sendMessage(event) {
    event.preventDefault();

    const message = messageInput.trim();

    if (!message) {
      return;
    }

    const sent =
      socketRef.current?.sendMessage(message);

    if (sent) {
      setMessageInput("");
    }
  }


  function handleMessageKeyDown(event) {

    if (
      event.key === "Enter" &&
      !event.shiftKey
    ) {
      event.preventDefault();

      sendMessage(event);
    }

  }


  function disconnect() {
    socketRef.current?.close();

    socketRef.current = null;

    setConnected(false);
    setConnectionStatus("disconnected");

    setMessages([]);
    setUsers([]);
    setMessageInput("");
  }


  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({
      behavior: "smooth"
    });
  }, [messages]);


  useEffect(() => {
    if (connected) {
      messageInputRef.current?.focus();
    }
  }, [connected]);


  useEffect(() => {
    return () => {
      socketRef.current?.close();
    };
  }, []);


  /*
   * LOGIN
   */

  if (!connected) {
    return (
      <main className="app">

        <section className="login">

          <h1>💬 Pokinex</h1>

          <p>
            Entre no chat para conversar
            em tempo real.
          </p>


          {connectionStatus === "connecting" && (
            <div className="status connecting">
              🟡 Conectando...
            </div>
          )}


          {connectionStatus === "disconnected" && (
            <div className="status disconnected">
              🔴 Desconectado
            </div>
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
              onChange={(event) =>
                setUsername(event.target.value)
              }
              maxLength={20}
              autoFocus
            />

            <button
              type="submit"
              disabled={
                connectionStatus === "connecting"
              }
            >
              {connectionStatus === "connecting"
                ? "Conectando..."
                : "Entrar"}
            </button>

          </form>

        </section>

      </main>
    );
  }


  /*
   * CHAT
   */

  return (
    <main className="app">

      <section className="chat">

        {/* SIDEBAR */}

        <aside className="sidebar">

          <div className="sidebar-header">

            <h2>
              💬 Pokinex
            </h2>

            <p>
              Conectado como{" "}
              <strong>{username}</strong>
            </p>

          </div>


          <div className="users-title">
            Usuários online — {users.length}
          </div>


          <ul className="users">

            {users.map((user, index) => (

              <li
                className="user"
                key={`${user}-${index}`}
              >

                <span className="online-dot" />

                {user}

              </li>

            ))}

          </ul>

        </aside>


        {/* CHAT */}

        <div className="chat-content">

          <header className="chat-header">

            <div>

              <h1># geral</h1>

              <div className="connection">

                <span className="online-dot" />

                Online

              </div>

            </div>


            <button
              className="logout"
              onClick={disconnect}
            >
              Sair
            </button>

          </header>


          {/* MESSAGES */}

          <div className="messages">

            {messages.map((message, index) => {

              /*
               * SYSTEM MESSAGE
               */

              if (message.type === "system") {

                return (
                  <div
                    className="system-message"
                    key={index}
                  >
                    {message.message}
                    <span>
                      {" "}
                      • {formatTime(message.timestamp)}
                    </span>
                  </div>
                );

              }


              /*
               * NORMAL MESSAGE
               */

              const isMine =
                message.username === username;


              return (
                <div
                  className={`message ${
                    isMine
                      ? "mine"
                      : "other"
                  }`}
                  key={index}
                >

                  {!isMine && (
                    <span className="message-user">
                      {message.username}
                    </span>
                  )}


                  <div className="message-row">

                    <div className="message-bubble">
                      {message.message}
                    </div>

                    <span className="message-time">
                      {formatTime(
                        message.timestamp
                      )}
                    </span>

                  </div>

                </div>
              );

            })}


            <div ref={messagesEndRef} />

          </div>


          {/* MESSAGE INPUT */}

          <form
            className="message-form"
            onSubmit={sendMessage}
          >

            <textarea
              ref={messageInputRef}
              placeholder="Digite uma mensagem..."
              value={messageInput}
              onChange={(event) =>
                setMessageInput(
                  event.target.value
                )
              }
              onKeyDown={handleMessageKeyDown}
              rows={1}
              maxLength={1000}
            />


            <button
              type="submit"
              disabled={!messageInput.trim()}
            >
              Enviar
            </button>

          </form>


          <div className="input-hint">
            Enter para enviar
          </div>

        </div>

      </section>

    </main>
  );
}


export default App;
