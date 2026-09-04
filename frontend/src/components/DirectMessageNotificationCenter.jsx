import { useEffect, useMemo, useState } from "react";
import { onDirectMessage, onDirectMessageRead, markDirectMessageRead } from "../notifications";
import { normalizeAvatarUrl, userInitial } from "../utils/chat";

export default function DirectMessageNotificationCenter() {
  const [messages, setMessages] = useState([]);
  const [open, setOpen] = useState(false);

  useEffect(() => {
    const offIncoming = onDirectMessage((message) => {
      const senderId = Number(message?.senderId ?? message?.userId);
      if (!Number.isFinite(senderId)) return;

      const enriched = {
        ...message,
        senderId,
        avatar: normalizeAvatarUrl(message?.avatar, senderId),
      };

      setMessages((current) => {
        const next = [enriched, ...current.filter((item) => item.messageId !== message.messageId)];
        return next.slice(0, 30);
      });
    });

    const offRead = onDirectMessageRead(({ userId }) => {
      const id = Number(userId);
      if (!Number.isFinite(id)) return;
      setMessages((current) => current.filter((message) => Number(message.senderId) !== id));
    });

    return () => {
      offIncoming();
      offRead();
    };
  }, []);

  useEffect(() => {
    if (!open) return undefined;

    function handleOutside(event) {
      if (!event.target.closest?.(".dm-notification-center")) {
        setOpen(false);
      }
    }

    function handleEscape(event) {
      if (event.key === "Escape") setOpen(false);
    }

    document.addEventListener("pointerdown", handleOutside);
    window.addEventListener("keydown", handleEscape);
    return () => {
      document.removeEventListener("pointerdown", handleOutside);
      window.removeEventListener("keydown", handleEscape);
    };
  }, [open]);

  const unreadCount = messages.length;
  const label = useMemo(
    () => (unreadCount > 99 ? "99+" : String(unreadCount)),
    [unreadCount],
  );

  function openMessage(message) {
    markDirectMessageRead(message.senderId);
    window.dispatchEvent(new CustomEvent("pokinex:open-dm", { detail: message }));
    setMessages((current) => current.filter((item) => item.messageId !== message.messageId));
    setOpen(false);
  }

  return (
    <div className="dm-notification-center">
      <button
        className={`dm-notification-bell${unreadCount ? " has-unread" : ""}`}
        type="button"
        onClick={() => setOpen((value) => !value)}
        aria-label={unreadCount ? `${unreadCount} mensagens privadas não lidas` : "Notificações"}
        aria-expanded={open}
        title="Notificações de mensagens privadas"
      >
        <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false">
          <path d="M18 9a6 6 0 0 0-12 0c0 7-3 7-3 9h18c0-2-3-2-3-9" />
          <path d="M10 21h4" />
        </svg>
        {unreadCount > 0 && <b>{label}</b>}
      </button>

      {open && (
        <div className="dm-notification-panel" role="dialog" aria-label="Mensagens privadas não lidas">
          <div className="dm-notification-panel-head">
            <div>
              <strong>Mensagens privadas</strong>
              <span>{unreadCount ? `${unreadCount} não lida(s)` : "Tudo lido"}</span>
            </div>
            <button
              className="dm-notification-close"
              type="button"
              onClick={() => setOpen(false)}
              aria-label="Fechar notificações"
            >
              ×
            </button>
          </div>

          {messages.length === 0 ? (
            <div className="dm-notification-empty">
              <span className="dm-notification-empty-icon" aria-hidden="true">✓</span>
              <strong>Nenhuma nova mensagem</strong>
              <span>Suas mensagens privadas aparecerão aqui.</span>
            </div>
          ) : (
            <div className="dm-notification-list">
              {messages.map((message) => (
                <button
                  className="dm-notification-item"
                  type="button"
                  key={message.messageId}
                  onClick={() => openMessage(message)}
                >
                  <span className="dm-notification-item-avatar">
                    {message.avatar ? (
                      <img
                        src={message.avatar}
                        alt=""
                        onError={(event) => {
                          event.currentTarget.style.display = "none";
                        }}
                      />
                    ) : (
                      userInitial(message)
                    )}
                  </span>
                  <span className="dm-notification-item-copy">
                    <strong>{message.displayName || message.username || "Usuário"}</strong>
                    <span>{message.message || "Nova mensagem privada"}</span>
                  </span>
                  <i aria-hidden="true" />
                </button>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
