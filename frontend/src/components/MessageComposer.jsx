import { useEffect, useRef, useState } from "react";
import EmojiPicker from "./EmojiPicker";
import "../ModerationLock.css";

function formatRemaining(totalSeconds) {
  const seconds = Math.max(0, Number(totalSeconds) || 0);
  const minutes = Math.floor(seconds / 60);
  const remainder = seconds % 60;
  return `${String(minutes).padStart(2, "0")}:${String(remainder).padStart(2, "0")}`;
}

export default function MessageComposer({ connected, offlineQueueLength, replyingTo, messageInput, onChange, onSubmit, onCancelReply }) {
  const textareaRef = useRef(null);
  const [emojiPickerOpen, setEmojiPickerOpen] = useState(false);
  const [moderationLock, setModerationLock] = useState(null);

  useEffect(() => {
    function handleModeration(event) {
      const data = event.detail || {};
      const remaining = Number(data.muteRemainingSeconds || 0);
      if (remaining <= 0) return;

      const until = Date.now() + (remaining * 1000);
      setModerationLock({
        until,
        reason: data.message || "Você foi temporariamente impedido de enviar mensagens.",
        category: data.category || "moderation",
      });
      setEmojiPickerOpen(false);
      onChange("");
      onCancelReply?.();
    }

    window.addEventListener("pokinex:moderation", handleModeration);
    return () => window.removeEventListener("pokinex:moderation", handleModeration);
  }, [onCancelReply, onChange]);

  useEffect(() => {
    if (!moderationLock) return undefined;

    function updateLock() {
      setModerationLock((current) => {
        if (!current) return null;
        if (current.until <= Date.now()) return null;
        return current;
      });
    }

    updateLock();
    const interval = window.setInterval(updateLock, 1000);
    return () => window.clearInterval(interval);
  }, [moderationLock?.until]);

  const lockSeconds = moderationLock
    ? Math.max(0, Math.ceil((moderationLock.until - Date.now()) / 1000))
    : 0;
  const locked = lockSeconds > 0;

  useEffect(() => {
    if (!locked && moderationLock) setModerationLock(null);
  }, [locked, moderationLock]);

  useEffect(() => {
    const textarea = textareaRef.current;
    if (!textarea) return;

    textarea.style.height = "44px";
    const nextHeight = Math.min(textarea.scrollHeight, 150);
    textarea.style.height = `${Math.max(44, nextHeight)}px`;
    textarea.scrollTop = textarea.scrollHeight;
  }, [messageInput]);

  function insertEmoji(emoji) {
    if (locked) return;
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

  function handleSubmit(event) {
    if (locked) {
      event.preventDefault();
      onChange("");
      return;
    }
    onSubmit(event);
  }

  return (
    <div className="composer-zone">
      {locked && (
        <div className="moderation-lock" role="alert" aria-live="assertive">
          <div className="moderation-lock-icon" aria-hidden="true">🛡️</div>
          <div className="moderation-lock-body">
            <strong>Envio temporariamente bloqueado</strong>
            <span>{moderationLock.reason}</span>
          </div>
          <div className="moderation-lock-timer" aria-label={`Tempo restante ${formatRemaining(lockSeconds)}`}>
            <small>TEMPO RESTANTE</small>
            <b>{formatRemaining(lockSeconds)}</b>
          </div>
        </div>
      )}

      {replyingTo && !locked && (
        <div className="reply-composer">
          <div className="reply-composer-accent" aria-hidden="true" />
          <div className="reply-composer-content">
            <span className="reply-composer-label">Respondendo a {replyingTo.displayName || replyingTo.username}</span>
            <strong>{replyingTo.deleted ? "Esta mensagem foi excluída" : replyingTo.message}</strong>
          </div>
          <button type="button" onClick={onCancelReply} aria-label="Cancelar resposta">✕</button>
        </div>
      )}

      <form className={`message-form${locked ? " moderation-locked" : ""}`} onSubmit={handleSubmit}>
        <div className="composer-input-shell">
          {emojiPickerOpen && !locked && <EmojiPicker onSelect={insertEmoji} />}

          <textarea
            ref={textareaRef}
            aria-label={replyingTo ? "Digite sua resposta" : "Digite sua mensagem"}
            placeholder={locked ? "Envio bloqueado temporariamente" : connected ? (replyingTo ? "Escreva sua resposta..." : "Envie uma mensagem para #geral") : "Você está offline. A mensagem ficará na fila."}
            value={locked ? "" : messageInput}
            onChange={(event) => {
              if (!locked) onChange(event.target.value);
            }}
            rows={1}
            maxLength={1000}
            disabled={locked}
            onKeyDown={(event) => {
              if (event.key === "Enter" && !event.shiftKey) {
                event.preventDefault();
                handleSubmit(event);
              }
            }}
          />

          <button
            type="button"
            className={`composer-emoji-toggle${emojiPickerOpen ? " active" : ""}`}
            onClick={(event) => {
              if (locked) return;
              event.preventDefault();
              event.stopPropagation();
              setEmojiPickerOpen((current) => !current);
            }}
            aria-label={emojiPickerOpen ? "Fechar seletor de emojis" : "Abrir seletor de emojis"}
            aria-expanded={emojiPickerOpen}
            disabled={locked}
          >
            <span aria-hidden="true">☺️</span>
          </button>
        </div>
        <button className="composer-send" type="submit" disabled={locked || !messageInput.trim()} aria-label="Enviar mensagem">
          <span className="composer-send-label">Enviar</span>
          <span className="composer-send-icon" aria-hidden="true">↑</span>
        </button>
      </form>

      <div className="input-hint">
        <span>{locked ? "PokiBot bloqueou o envio até o fim da punição" : "Enter envia · Shift + Enter quebra a linha"}</span>
        <span className={offlineQueueLength ? "queue-active" : ""}>
          {locked ? formatRemaining(lockSeconds) : offlineQueueLength ? `${offlineQueueLength} pendente(s)` : connected ? "Conectado" : "Offline"}
        </span>
      </div>
    </div>
  );
}
