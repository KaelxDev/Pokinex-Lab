import { useEffect, useRef, useState } from "react";
import { createWebSocket } from "../services/websocket";
import { getDirectMessageHistory } from "../services/directMessages";
import MessageContextMenu from "./MessageContextMenu";
import EmojiPicker from "./EmojiPickerExtra";
import { copyText, normalizeAvatarUrl, userInitial } from "../utils/chat";

const HISTORY_LIMIT = 50;
const CACHE_LIMIT = 100;
const REACTIONS = ["❤️", "😂", "😮", "😢", "😡", "👍"];

function conversationKey(a, b) {
  return `poknex:dm:${Math.min(Number(a), Number(b))}:${Math.max(Number(a), Number(b))}`;
}

function readCache(key) {
  try {
    const value = JSON.parse(localStorage.getItem(key) || "[]");
    return Array.isArray(value) ? value : [];
  } catch {
    return [];
  }
}

function writeCache(key, messages) {
  try {
    localStorage.setItem(key, JSON.stringify(messages.slice(-CACHE_LIMIT)));
  } catch (error) {
    console.debug("Cache DM indisponível:", error);
  }
}

function formatTime(value) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  return new Intl.DateTimeFormat("pt-BR", {
    hour: "2-digit",
    minute: "2-digit",
  }).format(date);
}

function messageIsMine(message, userId) {
  return String(message?.senderId ?? message?.userId) === String(userId);
}

export default function PrivateDMFeature() {
  const [target, setTarget] = useState(null);
  const [currentUser, setCurrentUser] = useState(null);
  const [messages, setMessages] = useState([]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [connected, setConnected] = useState(false);
  const [error, setError] = useState("");
  const [contextMenu, setContextMenu] = useState(null);
  const [reactionPickerId, setReactionPickerId] = useState(null);
  const [editingId, setEditingId] = useState(null);
  const [editingText, setEditingText] = useState("");
  const [editSaving, setEditSaving] = useState(false);
  const [replyingTo, setReplyingTo] = useState(null);
  const [emojiOpen, setEmojiOpen] = useState(false);
  const longPressRef = useRef(null);
  const longPressPointRef = useRef(null);
  const socketRef = useRef(null);
  const messagesRef = useRef(null);
  const targetRef = useRef(null);
  const currentUserRef = useRef(null);
  const inputRef = useRef(null);

  useEffect(() => {
    targetRef.current = target;
  }, [target]);

  useEffect(() => {
    currentUserRef.current = currentUser;
  }, [currentUser]);

  useEffect(() => {
    let active = true;
    const apiUrl = import.meta.env.VITE_API_URL || "https://nexchat-backend-2cyf.onrender.com/api/auth";

    fetch(`${apiUrl}/me`, { credentials: "include" })
      .then(async (response) => ({ response, data: await response.json().catch(() => null) }))
      .then(({ response, data }) => {
        if (active && response.ok && data?.user) setCurrentUser(data.user);
      })
      .catch((requestError) => console.debug("Sessão DM:", requestError));

    return () => {
      active = false;
    };
  }, []);

  useEffect(() => {
    function openFromSidebar(event) {
      const trigger = event.target.closest?.("[data-dm-user-id]");
      if (!trigger || trigger.dataset.dmSelf === "true") return;

      event.preventDefault();
      event.stopPropagation();

      const id = Number(trigger.dataset.dmUserId);
      if (!Number.isFinite(id)) return;

      setTarget({
        id,
        username: trigger.dataset.dmUsername || "usuario",
        displayName: trigger.dataset.dmDisplayName || trigger.dataset.dmUsername || "Usuário",
        avatar: trigger.dataset.dmAvatar || "",
        online: trigger.dataset.dmOnline === "true",
      });
      setError("");
    }

    function openFromNotification(event) {
      const data = event.detail || {};
      const id = Number(data.senderId ?? data.userId);
      if (!Number.isFinite(id)) return;

      setTarget({
        id,
        username: data.username || "usuario",
        displayName: data.displayName || data.username || "Usuário",
        avatar: data.avatar || "",
        online: true,
      });
    }

    document.addEventListener("click", openFromSidebar, true);
    window.addEventListener("pokinex:open-dm", openFromNotification);

    return () => {
      document.removeEventListener("click", openFromSidebar, true);
      window.removeEventListener("pokinex:open-dm", openFromNotification);
    };
  }, []);

  useEffect(() => {
    function closeOverlays(event) {
      if (event.key !== "Escape") return;
      setContextMenu(null);
      setReactionPickerId(null);
      setEmojiOpen(false);
      setEditingId(null);
      setEditingText("");
      setEditSaving(false);
      setReplyingTo(null);
      setTarget(null);
    }

    window.addEventListener("keydown", closeOverlays);
    return () => window.removeEventListener("keydown", closeOverlays);
  }, []);

  useEffect(() => {
    function handleOutsideClick(event) {
      if (!event.target.closest?.(".private-dm-input-shell")) setEmojiOpen(false);
      if (!event.target.closest?.(".message-context-menu, .private-dm-action-trigger")) {
        setContextMenu(null);
      }
    }

    document.addEventListener("pointerdown", handleOutsideClick);
    return () => document.removeEventListener("pointerdown", handleOutsideClick);
  }, []);

  useEffect(() => {
    if (!target || !currentUser?.id) {
      socketRef.current?.close();
      socketRef.current = null;
      setConnected(false);
      setMessages([]);
      setContextMenu(null);
      setReactionPickerId(null);
      return undefined;
    }

    const key = conversationKey(currentUser.id, target.id);
    setMessages(readCache(key));
    setInput("");
    setError("");
    setContextMenu(null);
    setReactionPickerId(null);
    setEditingId(null);
    setEditingText("");
    setEditSaving(false);
    setReplyingTo(null);
    setEmojiOpen(false);
    setLoading(true);

    getDirectMessageHistory(target.id, HISTORY_LIMIT)
      .then((data) => {
        const incoming = Array.isArray(data?.messages) ? data.messages : [];
        setMessages(incoming);
        writeCache(key, incoming);
      })
      .catch((requestError) => {
        setError(requestError.message || "Não foi possível carregar esta conversa.");
      })
      .finally(() => setLoading(false));

    socketRef.current?.close();

    const socket = createWebSocket("", {
      onOpen: () => setConnected(true),
      onClose: () => setConnected(false),
      onReconnecting: () => setConnected(false),
      onMessage(data) {
        const liveTarget = targetRef.current;
        const liveUser = currentUserRef.current;
        if (!liveTarget || !liveUser || !data?.type) return;

        const senderId = Number(data.senderId ?? data.userId);
        const recipientId = Number(data.recipientId);
        const pairMatch =
          (senderId === Number(liveUser.id) && recipientId === Number(liveTarget.id)) ||
          (senderId === Number(liveTarget.id) && recipientId === Number(liveUser.id));

        if (!pairMatch) return;

        if (data.type === "direct_message") {
          setMessages((current) => {
            if (current.some((item) => String(item.messageId) === String(data.messageId))) return current;
            const next = [...current, data];
            writeCache(conversationKey(liveUser.id, liveTarget.id), next);
            return next;
          });
          return;
        }

        if (data.type === "direct_message_edited") {
          setMessages((current) => {
            const next = current.map((item) =>
              item.messageId === data.messageId
                ? { ...item, ...data, edited: true }
                : item,
            );
            writeCache(conversationKey(liveUser.id, liveTarget.id), next);
            return next;
          });
          setEditingId(null);
          setEditingText("");
          setEditSaving(false);
          return;
        }

        if (data.type === "direct_message_deleted") {
          setMessages((current) => {
            const next = current.map((item) =>
              item.messageId === data.messageId
                ? { ...item, ...data, deleted: true, message: "Esta mensagem foi excluída" }
                : item,
            );
            writeCache(conversationKey(liveUser.id, liveTarget.id), next);
            return next;
          });
          setEditingId(null);
          setEditingText("");
          setEditSaving(false);
          return;
        }

        if (data.type === "direct_message_reaction") {
          setMessages((current) => {
            const next = current.map((item) =>
              item.messageId === data.messageId
                ? { ...item, reactions: data.reactions || {} }
                : item,
            );
            writeCache(conversationKey(liveUser.id, liveTarget.id), next);
            return next;
          });
          setReactionPickerId(null);
          return;
        }

        if (data.type === "error" && String(data.action || "").startsWith("direct_message")) {
          setError(data.message || "Não foi possível concluir a ação.");
          setEditSaving(false);
        }
      },
      onError: (socketError) => console.debug("DM websocket:", socketError),
    });

    socketRef.current = socket;

    return () => {
      socket.close();
      if (socketRef.current === socket) socketRef.current = null;
    };
  }, [target, currentUser?.id]);

  useEffect(() => {
    const node = messagesRef.current;
    if (node) node.scrollTop = node.scrollHeight;
  }, [messages]);

  useEffect(() => {
    const textarea = inputRef.current;
    if (!textarea) return;

    textarea.style.height = "46px";
    textarea.style.height = `${Math.min(150, Math.max(46, textarea.scrollHeight))}px`;
    textarea.scrollTop = textarea.scrollHeight;
  }, [input, replyingTo]);

  function insertEmoji(emoji) {
    const textarea = inputRef.current;
    if (!textarea) {
      setInput((value) => `${value}${emoji}`);
      return;
    }

    const start = textarea.selectionStart ?? input.length;
    const end = textarea.selectionEnd ?? input.length;
    const next = `${input.slice(0, start)}${emoji}${input.slice(end)}`;
    setInput(next);

    requestAnimationFrame(() => {
      textarea.focus();
      const cursor = start + emoji.length;
      textarea.setSelectionRange(cursor, cursor);
    });
  }

  function sendMessage(event) {
    event.preventDefault();
    const text = input.trim();
    if (!text || !target || !connected) return;

    const id = `${Date.now()}-${Math.random().toString(36).slice(2)}`;
    if (!socketRef.current?.sendDirectMessage(text, id, target.id, replyingTo?.messageId || null)) return;

    setInput("");
    setReplyingTo(null);
    setEmojiOpen(false);
  }

  function openContextMenu(event, message) {
    event.preventDefault();
    event.stopPropagation();
    setReactionPickerId(null);

    const menuWidth = 190;
    const menuHeight = 240;
    setContextMenu({
      x: Math.max(8, Math.min(event.clientX, window.innerWidth - menuWidth - 8)),
      y: Math.max(8, Math.min(event.clientY, window.innerHeight - menuHeight - 8)),
      message,
      isMine: messageIsMine(message, currentUser?.id),
    });
  }

  function openActionButton(event, message) {
    event.preventDefault();
    event.stopPropagation();
    openContextMenu(event, message);
  }

  function startLongPress(event, message) {
    if (event.touches?.length !== 1) return;

    const touch = event.touches[0];
    longPressPointRef.current = {
      x: touch.clientX,
      y: touch.clientY,
    };

    clearTimeout(longPressRef.current);
    longPressRef.current = window.setTimeout(() => {
      const point = longPressPointRef.current;
      if (!point) return;

      openContextMenu(
        {
          preventDefault() {},
          stopPropagation() {},
          clientX: point.x,
          clientY: point.y,
        },
        message,
      );
      navigator.vibrate?.(20);
    }, 550);
  }

  function endLongPress() {
    clearTimeout(longPressRef.current);
    longPressPointRef.current = null;
  }

  function beginEdit(message) {
    if (!messageIsMine(message, currentUser?.id) || message.deleted) return;

    setContextMenu(null);
    setEditingId(message.messageId);
    setEditingText(message.message || "");
    setReplyingTo(null);
    setReactionPickerId(null);

    requestAnimationFrame(() => {
      document.querySelector(".private-dm-edit-input")?.focus();
    });
  }

  function saveEdit(event) {
    event.preventDefault();
    const text = editingText.trim();
    if (!editingId || !text || !connected) return;
    if (!socketRef.current?.sendDirectEditMessage(editingId, text)) return;
    setEditSaving(true);
  }

  function deleteMessage(message) {
    setContextMenu(null);
    if (!messageIsMine(message, currentUser?.id) || message.deleted || !connected) return;
    if (!window.confirm("Excluir esta mensagem privada?")) return;
    socketRef.current?.sendDirectDeleteMessage(message.messageId);
  }

  function beginReply(message) {
    if (message.deleted) return;

    setContextMenu(null);
    setReactionPickerId(null);
    setEditingId(null);
    setEditingText("");
    setReplyingTo(message);

    requestAnimationFrame(() => inputRef.current?.focus());
  }

  async function copyMessage(message) {
    if (message.deleted) return;

    try {
      await copyText(message.message || "");
    } catch (copyError) {
      console.debug("Não foi possível copiar a mensagem DM:", copyError);
    }

    setContextMenu(null);
  }

  function react(messageId, reaction) {
    if (!connected || !socketRef.current) return;
    if (!REACTIONS.includes(reaction)) return;

    if (socketRef.current.sendDirectReaction(messageId, reaction)) {
      setReactionPickerId(null);
      setContextMenu(null);
    }
  }

  if (!target) return null;

  const targetAvatar = normalizeAvatarUrl(target.avatar, target.id);

  return (
    <section
      className="private-dm-overlay"
      aria-label={`Conversa privada com ${target.displayName}`}
    >
      <header className="private-dm-header">
        <div className="private-dm-person">
          <button
            className="private-dm-back"
            type="button"
            onClick={() => setTarget(null)}
            aria-label="Voltar"
          >
            ←
          </button>

          <div className="private-dm-avatar">
            {targetAvatar ? <img src={targetAvatar} alt="" /> : userInitial(target)}
            <span className={target.online ? "online" : "offline"} />
          </div>

          <div>
            <strong>{target.displayName}</strong>
            <span>@{target.username}</span>
          </div>
        </div>

        <div className="private-dm-status">
          <span className={connected ? "connected" : "disconnected"} />
          {connected ? "Privado" : "Reconectando"}
        </div>
      </header>

      <div className="private-dm-messages" ref={messagesRef}>
        {loading && messages.length === 0 && (
          <div className="private-dm-loading">Carregando conversa...</div>
        )}

        {!loading && messages.length === 0 && (
          <div className="private-dm-empty">
            <div className="private-dm-lock">⌁</div>
            <span>MENSAGEM DIRETA</span>
            <h2>Conversa privada</h2>
            <p>
              Somente você e <strong>@{target.username}</strong> recebem estas mensagens.
            </p>
          </div>
        )}

        {messages.map((message) => {
          const mine = messageIsMine(message, currentUser?.id);
          const avatar = normalizeAvatarUrl(message.avatar, message.senderId);
          const reactions = Object.entries(message.reactions || {});

          return (
            <article
              className={`private-dm-message ${mine ? "mine" : "other"}`}
              id={`dm-${message.messageId}`}
              key={message.messageId}
              onContextMenu={(event) => openContextMenu(event, message)}
              onTouchStart={(event) => startLongPress(event, message)}
              onTouchEnd={endLongPress}
              onTouchCancel={endLongPress}
              onTouchMove={endLongPress}
            >
              <div className="private-dm-message-row">
                {!mine && (
                  <div className="private-dm-message-avatar">
                    {avatar ? <img src={avatar} alt="" /> : userInitial(message)}
                  </div>
                )}

                <div className="private-dm-message-content">
                  <div className="private-dm-meta">
                    <strong>{message.displayName || message.username || target.displayName}</strong>
                    <time>
                      {formatTime(message.timestamp)}
                      {message.edited ? " · editada" : ""}
                    </time>
                  </div>

                  {message.replyTo && (
                    <button
                      className="private-dm-reply-preview"
                      type="button"
                      onClick={() =>
                        document
                          .getElementById(`dm-${message.replyTo.messageId}`)
                          ?.scrollIntoView({ behavior: "smooth", block: "center" })
                      }
                    >
                      <span>↩ {message.replyTo.displayName || message.replyTo.username}</span>
                      <small>{message.replyTo.message || "Esta mensagem foi excluída"}</small>
                    </button>
                  )}

                  {editingId === message.messageId && mine && !message.deleted ? (
                    <form className="private-dm-edit-form" onSubmit={saveEdit}>
                      <textarea
                        className="private-dm-edit-input"
                        value={editingText}
                        onChange={(event) => setEditingText(event.target.value)}
                        rows={2}
                        maxLength={1000}
                        autoFocus
                      />
                      <div>
                        <button
                          type="button"
                          onClick={() => {
                            setEditingId(null);
                            setEditingText("");
                            setEditSaving(false);
                          }}
                          disabled={editSaving}
                        >
                          Cancelar
                        </button>
                        <button type="submit" disabled={!editingText.trim() || editSaving}>
                          {editSaving ? "Salvando..." : "Salvar"}
                        </button>
                      </div>
                    </form>
                  ) : (
                    <div className={`private-dm-bubble${message.deleted ? " deleted" : ""}`}>
                      {message.deleted ? "Esta mensagem foi excluída" : message.message}
                    </div>
                  )}

                  {reactions.length > 0 && (
                    <div className="private-dm-reactions" aria-label="Reações">
                      {reactions.map(([reaction, count]) => (
                        <button
                          key={reaction}
                          type="button"
                          onClick={(event) => {
                            event.stopPropagation();
                            react(message.messageId, reaction);
                          }}
                        >
                          <span>{reaction}</span>
                          <b>{count}</b>
                        </button>
                      ))}
                    </div>
                  )}

                  {!message.deleted && !editingId && (
                    <div className="private-dm-message-tools">
                      <button
                        className="private-dm-react-hint"
                        type="button"
                        onClick={(event) => {
                          event.stopPropagation();
                          setContextMenu(null);
                          setReactionPickerId((id) =>
                            id === message.messageId ? null : message.messageId,
                          );
                        }}
                      >
                        ＋ Reagir
                      </button>

                      <button
                        className="private-dm-action-trigger"
                        type="button"
                        aria-label="Abrir ações da mensagem"
                        title="Ações da mensagem"
                        onClick={(event) => openActionButton(event, message)}
                      >
                        ⋯
                      </button>
                    </div>
                  )}

                  {reactionPickerId === message.messageId && !message.deleted && (
                    <div
                      className="private-dm-reaction-picker"
                      onClick={(event) => event.stopPropagation()}
                    >
                      {REACTIONS.map((reaction) => (
                        <button
                          key={reaction}
                          type="button"
                          aria-label={`Reagir com ${reaction}`}
                          onClick={() => react(message.messageId, reaction)}
                        >
                          {reaction}
                        </button>
                      ))}
                    </div>
                  )}
                </div>

                {mine && (
                  <div className="private-dm-message-avatar">
                    {avatar ? <img src={avatar} alt="" /> : userInitial(currentUser)}
                  </div>
                )}
              </div>
            </article>
          );
        })}
      </div>

      {error && <div className="private-dm-error">{error}</div>}

      {replyingTo && (
        <div className="private-dm-reply-composer">
          <div>
            <span>Respondendo a {replyingTo.displayName || replyingTo.username}</span>
            <strong>
              {replyingTo.deleted ? "Esta mensagem foi excluída" : replyingTo.message}
            </strong>
          </div>
          <button
            type="button"
            onClick={() => setReplyingTo(null)}
            aria-label="Cancelar resposta"
          >
            ✕
          </button>
        </div>
      )}

      <form className="private-dm-composer" onSubmit={sendMessage}>
        <div className="private-dm-input-shell">
          {emojiOpen && (
            <div className="private-dm-emoji-popover">
              <EmojiPicker onSelect={insertEmoji} />
            </div>
          )}

          <textarea
            ref={inputRef}
            value={input}
            onChange={(event) => setInput(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === "Enter" && !event.shiftKey) {
                event.preventDefault();
                sendMessage(event);
              }
            }}
            placeholder={`Mensagem para @${target.username}`}
            rows={1}
            maxLength={1000}
            disabled={!connected}
            aria-label="Digite sua mensagem privada"
          />

          <button
            className={`private-dm-emoji-toggle${emojiOpen ? " active" : ""}`}
            type="button"
            onClick={(event) => {
              event.preventDefault();
              event.stopPropagation();
              setEmojiOpen((value) => !value);
            }}
            aria-label={emojiOpen ? "Fechar seletor de emojis" : "Abrir seletor de emojis"}
            aria-expanded={emojiOpen}
          >
            ☺️
          </button>
        </div>

        <button
          className="private-dm-send"
          type="submit"
          disabled={!connected || !input.trim()}
          aria-label="Enviar mensagem privada"
        >
          ↑
        </button>
      </form>

      <div className="private-dm-hint">
        <span>Enter envia · Shift + Enter quebra a linha</span>
        <span>{connected ? "Privado" : "Reconectando"}</span>
      </div>

      <MessageContextMenu
        contextMenu={contextMenu}
        onReact={() => {
          const message = contextMenu?.message;
          setContextMenu(null);
          if (message && !message.deleted) setReactionPickerId(message.messageId);
        }}
        onReply={() => contextMenu && beginReply(contextMenu.message)}
        onCopy={() => contextMenu && copyMessage(contextMenu.message)}
        onEdit={() => contextMenu?.isMine && beginEdit(contextMenu.message)}
        onDelete={() => contextMenu?.isMine && deleteMessage(contextMenu.message)}
      />
    </section>
  );
}
