import { useEffect, useRef, useState } from "react";
import EmojiPicker from "./EmojiPickerExtra";

export default function MessageComposer({ connected, offlineQueueLength, replyingTo, messageInput, onChange, onSubmit, onCancelReply }) {
  const textareaRef = useRef(null);
  const [emojiPickerOpen, setEmojiPickerOpen] = useState(false);

  useEffect(() => {
    const textarea = textareaRef.current;
    if (!textarea) return;

    textarea.style.height = "44px";
    const nextHeight = Math.min(textarea.scrollHeight, 150);
    textarea.style.height = `${Math.max(44, nextHeight)}px`;
    textarea.scrollTop = textarea.scrollHeight;
  }, [messageInput]);

  function insertEmoji(emoji) {
    const textarea = textareaRef.current;
    if (!textarea) {
      onChange(`${messageInput}${emoji}`);
      return;
    }

    const start = textarea.selectionStart ?? messageInput.length;
    const end = textarea.selectionEnd ?? messageInput.length;
    const nextValue = `${messageInput.slice(0, start)}${emoji}${messageInput.slice(end)}`;
    onChange(nextValue);

    requestAnimationFrame(() => {
      textarea.focus();
      const cursor = start + emoji.length;
      textarea.setSelectionRange(cursor, cursor);
    });
  }

  return (
    <div className="composer-zone">
      {replyingTo && (
        <div className="reply-composer">
          <div className="reply-composer-accent" aria-hidden="true" />
          <div className="reply-composer-content">
            <span className="reply-composer-label">Respondendo a {replyingTo.displayName || replyingTo.username}</span>
            <strong>{replyingTo.deleted ? "Esta mensagem foi excluída" : replyingTo.message}</strong>
          </div>
          <button type="button" onClick={onCancelReply} aria-label="Cancelar resposta">✕</button>
        </div>
      )}

      <form className="message-form" onSubmit={onSubmit}>
        <div className="composer-input-shell">
          {emojiPickerOpen && <EmojiPicker onSelect={insertEmoji} />}

          <textarea
            ref={textareaRef}
            aria-label={replyingTo ? "Digite sua resposta" : "Digite sua mensagem"}
            placeholder={connected ? (replyingTo ? "Escreva sua resposta..." : "Envie uma mensagem para #geral") : "Você está offline. A mensagem ficará na fila."}
            value={messageInput}
            onChange={(event) => onChange(event.target.value)}
            rows={1}
            maxLength={1000}
            onKeyDown={(event) => {
              if (event.key === "Enter" && !event.shiftKey) {
                event.preventDefault();
                onSubmit(event);
              }
            }}
          />

          <button
            type="button"
            className={`composer-emoji-toggle${emojiPickerOpen ? " active" : ""}`}
            onClick={(event) => {
              event.preventDefault();
              event.stopPropagation();
              setEmojiPickerOpen((current) => !current);
            }}
            aria-label={emojiPickerOpen ? "Fechar seletor de emojis" : "Abrir seletor de emojis"}
            aria-expanded={emojiPickerOpen}
          >
            <span aria-hidden="true">☺️</span>
          </button>
        </div>
        <button className="composer-send" type="submit" disabled={!messageInput.trim()} aria-label="Enviar mensagem">
          <span className="composer-send-label">Enviar</span>
          <span className="composer-send-icon" aria-hidden="true">↑</span>
        </button>
      </form>

      <div className="input-hint">
        <span>Enter envia · Shift + Enter quebra a linha</span>
        <span className={offlineQueueLength ? "queue-active" : ""}>
          {offlineQueueLength ? `${offlineQueueLength} pendente(s)` : connected ? "Conectado" : "Offline"}
        </span>
      </div>
    </div>
  );
}
