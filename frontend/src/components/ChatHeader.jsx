export default function ChatHeader({ connectionStatus, reconnectAttempt, reconnectSeconds, onLogout }) {
  const connectionState =
    connectionStatus === "reconnecting"
      ? "reconnecting"
      : connectionStatus === "connecting"
        ? "connecting"
        : "online";

  function toggleMobileSidebar() {
    window.dispatchEvent(new CustomEvent("pokinex:mobile-sidebar-toggle"));
  }

  return (
    <header className="chat-header">
      <div className="chat-header-main">
        <button
          className="chat-menu-toggle"
          type="button"
          onClick={toggleMobileSidebar}
          aria-label="Abrir navegação"
          title="Abrir navegação"
        >
          <span aria-hidden="true">☰</span>
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
