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
        <span aria-hidden="true">●</span>
        {unreadCount > 0 && <b>{label}</b>}
      </button>

      {open && (
        <div className="dm-notification-panel" role="dialog" aria-label="Mensagens privadas não lidas">
          <div className="dm-notification-panel-head">
            <strong>Mensagens privadas</strong>
            <span>{unreadCount ? `${unreadCount} não lida(s)` : "Tudo lido"}</span>
          </div>

          {messages.length === 0 ? (
            <div className="dm-notification-empty">Nenhuma nova mensagem.</div>
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
