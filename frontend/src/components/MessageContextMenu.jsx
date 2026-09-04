export default function MessageContextMenu({ contextMenu, onReact, onReply, onCopy, onEdit, onDelete }) {
  if (!contextMenu) return null;

  const { message, isMine, x, y } = contextMenu;
  const locked = message.deleted || message.offline || message.deliveryStatus === "pending";

  return (
    <div
      className="message-context-menu"
      style={{ left: x, top: y }}
      onClick={(event) => event.stopPropagation()}
      role="menu"
    >
      <button type="button" role="menuitem" onClick={onReact} disabled={message.deleted}>
        ❤️ Reagir
      </button>
      <button type="button" role="menuitem" onClick={onReply} disabled={message.deleted}>
        ↩️ Responder
      </button>
      <button type="button" role="menuitem" onClick={onCopy} disabled={message.deleted}>
        📋 Copiar
      </button>
      {isMine && !locked && (
        <>
          <button type="button" role="menuitem" onClick={onEdit}>
            ✏️ Editar
          </button>
          <button type="button" role="menuitem" onClick={onDelete}>
            🗑️ Excluir
          </button>
        </>
      )}
    </div>
  );
}
