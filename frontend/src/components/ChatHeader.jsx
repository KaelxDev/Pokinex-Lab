import { useEffect, useState } from "react";

function getInitialSidebarState() {
  if (typeof window === "undefined") return false;
  return window.matchMedia("(min-width: 701px)").matches;
}

export default function ChatHeader({ connectionStatus, reconnectAttempt, reconnectSeconds, onLogout }) {
  const connectionState =
    connectionStatus === "reconnecting"
      ? "reconnecting"
      : connectionStatus === "connecting"
        ? "connecting"
        : "online";
  const [sidebarOpen, setSidebarOpen] = useState(getInitialSidebarState);

  useEffect(() => {
    const handleSidebarState = (event) => {
      if (typeof event.detail?.open === "boolean") {
        setSidebarOpen(event.detail.open);
      }
    };
    const handleSidebarClosed = () => setSidebarOpen(false);
    const handleResize = () => {
      setSidebarOpen(window.matchMedia("(min-width: 701px)").matches);
    };

    window.addEventListener("pokinex:sidebar-state", handleSidebarState);
    window.addEventListener("pokinex:sidebar-close", handleSidebarClosed);
    window.addEventListener("resize", handleResize);

    return () => {
      window.removeEventListener("pokinex:sidebar-state", handleSidebarState);
      window.removeEventListener("pokinex:sidebar-close", handleSidebarClosed);
      window.removeEventListener("resize", handleResize);
    };
  }, []);

  function toggleSidebar() {
    const nextOpen = !sidebarOpen;
    setSidebarOpen(nextOpen);
    window.dispatchEvent(
      new CustomEvent("pokinex:sidebar-toggle", { detail: { open: nextOpen } }),
    );
  }

  return (
    <header className="chat-header">
      <div className="chat-header-main">
        <button
          className={`chat-menu-toggle${sidebarOpen ? " is-open" : ""}`}
          type="button"
          onClick={toggleSidebar}
          aria-label={sidebarOpen ? "Fechar navegação" : "Abrir navegação"}
          aria-expanded={sidebarOpen}
          aria-controls="pokinex-sidebar"
          title={sidebarOpen ? "Fechar navegação" : "Abrir navegação"}
        >
          <span className="chat-menu-icon" aria-hidden="true">
            <span />
            <span />
            <span />
          </span>
        </button>

        <div className="channel-copy">
          <div className="channel-title-row">
            <h1>
              <span className="channel-hash" aria-hidden="true">#</span>
              <span className="channel-name">geral</span>
            </h1>
            <span className="channel-pill">PUBLICO</span>
          </div>
          <p className="channel-topic">Conversa principal do Pokinex</p>
        </div>
      </div>

      <div className="chat-header-status">
        <div className={`connection connection-${connectionState}`}>
          <span className="connection-dot" />
          {connectionState === "reconnecting" ? (
            <span>Reconectando · tentativa #{reconnectAttempt || 1} · {reconnectSeconds || 10}s</span>
          ) : connectionState === "connecting" ? (
            <span>Conectando...</span>
          ) : (
            <span>Online</span>
          )}
        </div>
        <button className="logout" type="button" onClick={onLogout}>
          <span className="logout-icon" aria-hidden="true">↪</span>
          <span>Sair</span>
        </button>
      </div>
    </header>
  );
}
