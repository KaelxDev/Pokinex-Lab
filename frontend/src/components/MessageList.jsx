import { canGroup, formatTime, normalizeAvatarUrl, REACTION_OPTIONS, userInitial } from "../utils/chat";

export default function MessageList({
  messages,
  user,
  profile,
  profilesById,
  connected,
  historyLoading,
  messagesRef,
  onScroll,
  editingId,
  editingText,
  editSaving,
  editError,
  onEditingTextChange,
  onSaveEdit,
  onCancelEdit,
  reactionPickerMessageId,
  onToggleReactionPicker,
  onReaction,
  onBeginReply,
  onCopy,
  onBeginEdit,
  onDelete,
  onOpenContextMenu,
  onLongPressStart,
  onLongPressEnd,
}) {
  const showEmptyState = !historyLoading && messages.length === 0;

  return (
    <div
      className={`messages${showEmptyState ? " messages-empty" : ""}`}
      ref={messagesRef}
      onScroll={onScroll}
    >
      {historyLoading && (
        <div className="history-loading" role="status">
          <span className="empty-chat-spinner" aria-hidden="true" />
          <span>Carregando mensagens...</span>
        </div>
      )}

      {showEmptyState && (
        <section className="chat-empty-state" aria-label="Conversa vazia">
          <div className="chat-empty-icon">
            <img src="/icone.png?v=3" alt="" />
            <span className="chat-empty-icon-ring" aria-hidden="true" />
          </div>
          <div className="chat-empty-kicker">CANAL PÚBLICO</div>
          <h2>Comece a conversa</h2>
          <p>
            Este é o início do canal <strong>#geral</strong>.<br />
            Envie a primeira mensagem para começar a conversar em tempo real.
          </p>
        </section>
      )}

      {messages.map((message, index) => {
        if (message.type === "system") {
          return (
            <div className="system-message" key={`system-${index}`}>
              {message.message}
              <span> • {formatTime(message.timestamp)}</span>
            </div>
          );
        }

        if (message.type !== "message") return null;

        const previous = messages[index - 1];
        const next = messages[index + 1];
        const grouped = canGroup(previous, message);
        const groupEnd = !canGroup(message, next);
        const isMine =
          message.userId != null
            ? String(message.userId) === String(user.id)
            : String(message.username || "") === String(user.username || "");
        const isBot = String(message.userId) === "moderation-bot" || message.role === "bot";
        const messageProfile = isMine ? profile || user : profilesById[message.userId] || message;
        const messageAvatar = normalizeAvatarUrl(
          messageProfile?.avatar || message.avatar,
          messageProfile?.id || message.userId,
        );
        const isEditing = editingId === message.messageId;
        const reactionCounts = message.reactions || {};
        const visibleReactions = REACTION_OPTIONS.filter(
          (reaction) => Number(reactionCounts[reaction] || 0) > 0,
        );

        return (
          <div
            className={`message ${isMine ? "mine" : "other"} ${grouped ? "grouped" : "group-start"} ${groupEnd ? "group-end" : "group-middle"} ${isBot ? "bot-message" : ""} ${message.deleted ? "deleted" : ""}`}
            key={message.messageId || index}
          >
            {!grouped ? (
              <div className="message-avatar">
                {messageAvatar ? <img src={messageAvatar} alt="" /> : userInitial(messageProfile)}
              </div>
            ) : (
              <div className="message-avatar-spacer" aria-hidden="true" />
            )}

            <div className="message-main">
              {!grouped && (
                <span className="message-user">
                  {messageProfile?.displayName || message.displayName || message.username}
                  {isBot && <small className="message-role-badge bot">BOT</small>}
                </span>
              )}

              {isEditing ? (
                <form className="message-edit-form" onSubmit={onSaveEdit}>
                  <textarea
                    value={editingText}
                    onChange={(event) => onEditingTextChange(event.target.value)}
                    autoFocus
                    maxLength={1000}
                    rows={2}
                  />
                  <div>
                    <button type="button" onClick={onCancelEdit} disabled={editSaving}>
                      Cancelar
                    </button>
                    <button type="submit" disabled={editSaving || !editingText.trim()}>
                      {editSaving ? "Salvando..." : "Salvar"}
                    </button>
                  </div>
                  {editError && <small>{editError}</small>}
                </form>
              ) : (
                <>
                  <div
                    className="message-row"
                    onContextMenu={(event) => onOpenContextMenu(event, message)}
                    onTouchStart={(event) => onLongPressStart(event, message)}
                    onTouchEnd={onLongPressEnd}
                    onTouchMove={onLongPressEnd}
                  >
                    {message.replyTo && (
                      <div className="reply-preview">
                        <strong>
                          ↩️ {message.replyTo.displayName || message.replyTo.username || "Mensagem"}
                        </strong>
                        <span>
                          {message.replyTo.deleted ? "Esta mensagem foi excluída" : message.replyTo.message}
                        </span>
                      </div>
                    )}
                    <div className={`message-bubble-wrap ${message.deleted ? "message-deleted" : ""}`}>
                      <div className="message-bubble">
                        {message.deleted ? "🗑️ Esta mensagem foi excluída" : message.message}
                      </div>
                    </div>
                  </div>

                  {!message.deleted && (
                    <div className="message-reaction-area" onClick={(event) => event.stopPropagation()}>
                      <div className="message-reactions">
                        {visibleReactions.map((reaction) => (
                          <button
                            key={reaction}
                            className="message-reaction"
                            type="button"
                            onClick={() => onReaction(message.messageId, reaction)}
                            title="Alternar reação"
                          >
                            {reaction} {reactionCounts[reaction]}
                          </button>
                        ))}
                        {connected && (
                          <button
                            className="add-reaction"
                            type="button"
                            onClick={(event) => onToggleReactionPicker(event, message.messageId)}
                          >
                            ＋ Reagir
                          </button>
                        )}
                      </div>

                      {reactionPickerMessageId === message.messageId && (
                        <div className="message-reaction-picker" onClick={(event) => event.stopPropagation()}>
                          {REACTION_OPTIONS.map((reaction) => (
                            <button
                              key={reaction}
                              type="button"
                              onClick={() => onReaction(message.messageId, reaction)}
                              aria-label={`Reagir com ${reaction}`}
                              title={`Reagir com ${reaction}`}
                            >
                              {reaction}
                            </button>
                          ))}
                        </div>
                      )}
                    </div>
                  )}

                  {groupEnd && (
                    <div className="message-meta">
                      <span
                        className={
                          message.deliveryStatus === "pending" || message.offline
                            ? "message-pending"
                            : ""
                        }
                      >
                        {formatTime(message.timestamp)} • {message.deletePending
                          ? "◌ Excluindo"
                          : message.editPending
                            ? "◌ Salvando edição"
                            : message.deliveryStatus === "pending" || message.offline
                              ? "⏳ Pendente"
                              : message.deliveryStatus === "sending"
                                ? "◌ Enviando"
                                : "✓ Enviada"}
                        {message.edited && !message.editPending && !message.deleted ? " • editada" : ""}
                      </span>
                    </div>
                  )}
                </>
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
}
