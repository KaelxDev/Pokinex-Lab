import { useEffect, useMemo, useState } from "react";
import { normalizeAvatarUrl, userInitial } from "../utils/chat";
import { onDirectMessage, onDirectMessageRead, markDirectMessageRead } from "../notifications";

export default function ChatSidebar({ user, profile, users, onOpenProfile, onClearHistory }) {
  const displayName = profile?.displayName || user?.displayName || user?.username || "Usuário";
  const avatar = normalizeAvatarUrl(profile?.avatar || user?.avatar, user?.id);
  const [mobileOpen, setMobileOpen] = useState(false);
  const [unreadByUser, setUnreadByUser] = useState({});

  const isModerator = useMemo(
    () => users.some((item) => String(item.id) === String(user?.id) && item.role === "moderator"),
    [users, user?.id],
  );

  useEffect(() => {
    const toggle = () => setMobileOpen((current) => !current);
    const close = () => setMobileOpen(false);

    window.addEventListener("pokinex:mobile-sidebar-toggle", toggle);
    window.addEventListener("pokinex:mobile-sidebar-close", close);
    window.addEventListener("resize", close);

    return () => {
      window.removeEventListener("pokinex:mobile-sidebar-toggle", toggle);
      window.removeEventListener("pokinex:mobile-sidebar-close", close);
      window.removeEventListener("resize", close);
    };
  }, []);

  useEffect(() => {
    const offIncoming = onDirectMessage((message) => {
      const senderId = Number(message?.senderId ?? message?.userId);
      if (!Number.isFinite(senderId) || senderId === Number(user?.id)) return;
      setUnreadByUser((current) => ({
        ...current,
        [senderId]: (current[senderId] || 0) + 1,
      }));
    });

    const offRead = onDirectMessageRead(({ userId }) => {
      if (userId == null) return;
      setUnreadByUser((current) => {
        const next = { ...current };
        delete next[userId];
        return next;
      });
    });

    return () => {
      offIncoming();
      offRead();
    };
  }, [user?.id]);

  const unreadTotal = useMemo(
    () => Object.values(unreadByUser).reduce((sum, count) => sum + Number(count || 0), 0),
    [unreadByUser],
  );

  function closeMobileSidebar() {
    window.dispatchEvent(new CustomEvent("pokinex:mobile-sidebar-close"));
  }

  function handleOpenProfile() {
    closeMobileSidebar();
    onOpenProfile();
  }

  function handleDMClick(event) {
    const userId = Number(event.currentTarget.dataset.dmUserId);
    if (Number.isFinite(userId)) markDirectMessageRead(userId);
    closeMobileSidebar();
  }

  return (
    <>
      {mobileOpen && (
        <button
          className="mobile-sidebar-backdrop"
          type="button"
          aria-label="Fechar navegação"
          onClick={closeMobileSidebar}
        />
      )}

      <aside className={`sidebar${mobileOpen ? " mobile-open" : ""}`}>
        <div className="sidebar-rail" aria-hidden="true">
          <div className="rail-brand">
            <img src="/icone.png?v=2" alt="" />
          </div>
          <span className="rail-divider" />
          <div className="rail-room active">
            <span className="rail-room-mark">#</span>
          </div>
          <div className="rail-spacer" />
          <div className="rail-status-dot" />
        </div>

        <div className="sidebar-main">
          <div className="sidebar-topbar">
            <div>
              <span className="sidebar-eyebrow">Workspace</span>
              <strong>Pokinex</strong>
            </div>
            <span className="workspace-dot" />
          </div>

          <div className="mobile-sidebar-header">
            <span>Navegação</span>
            <button type="button" onClick={closeMobileSidebar} aria-label="Fechar navegação">✕</button>
          </div>

          <div className="sidebar-heading">
            <span>Conversas</span>
            <span className="sidebar-heading-count">{1 + unreadTotal}</span>
          </div>

          <button className="channel-entry active" type="button" onClick={closeMobileSidebar}>
            <span className="channel-entry-icon">#</span>
            <span className="channel-entry-copy">
              <strong>geral</strong>
              <small>Sala principal</small>
            </span>
            <span className="channel-entry-live" />
          </button>

          <div className="sidebar-heading users-heading">
            <span>Pessoas online</span>
            <span className="sidebar-heading-count">{users.length}</span>
          </div>

          <ul className="users">
            {users.map((onlineUser) => {
              const onlineAvatar = normalizeAvatarUrl(onlineUser.avatar, onlineUser.id);
              const name = onlineUser.displayName || onlineUser.username || "Usuário";
              const isSelf = String(onlineUser.id) === String(user?.id);
              const isBot = onlineUser.role === "bot" || String(onlineUser.id) === "moderation-bot";
              const isOnlineModerator = onlineUser.role === "moderator";
              const canDM = !isSelf && !isBot && Number.isFinite(Number(onlineUser.id));
              const unread = Number(unreadByUser[onlineUser.id] || 0);

              return (
                <li className={`user${unread ? " has-dm-unread" : ""}`} key={onlineUser.id}>
                  <button
                    className={`user-dm-trigger${isSelf ? " self" : ""}${!canDM ? " disabled" : ""}`}
                    type="button"
                    data-dm-user-id={onlineUser.id}
                    data-dm-username={onlineUser.username}
                    data-dm-display-name={name}
                    data-dm-avatar={onlineAvatar || ""}
                    data-dm-online={String(Boolean(onlineUser.online ?? true))}
                    data-dm-self={String(isSelf)}
                    disabled={!canDM}
                    title={
                      isSelf
                        ? "Você"
                        : isBot
                          ? "PokiBot • moderador automático"
                          : canDM
                            ? `Enviar mensagem privada para ${name}`
                            : "Mensagem privada indisponível"
                    }
                    onClick={handleDMClick}
                  >
                    <div className={`avatar user-avatar${isBot ? " bot-avatar" : ""}`}>
                      {onlineAvatar ? <img src={onlineAvatar} alt="" /> : userInitial(onlineUser)}
                      <span className="user-online-indicator" aria-hidden="true" />
                    </div>
                    <div className="user-info">
                      <strong>{name}</strong>
                      <span>{isBot ? "Moderação automática" : onlineUser.username ? `@${onlineUser.username}` : "Sistema"}</span>
                    </div>
                    {isBot && <span className="user-role-badge bot">BOT</span>}
                    {!isBot && isOnlineModerator && <span className="user-role-badge moderator">MOD</span>}
                    {canDM && (
                      <span className="user-dm-meta" aria-hidden="true">
                        {unread > 0 ? <b className="dm-unread-badge">{unread > 99 ? "99+" : unread}</b> : <span className="user-dm-hint">✉</span>}
                      </span>
                    )}
                  </button>
                </li>
              );
            })}
          </ul>

          <div className="sidebar-footer">
            <button className="profile-summary" type="button" onClick={handleOpenProfile}>
              <div className="avatar profile-avatar">
                {avatar ? <img src={avatar} alt="" /> : displayName.slice(0, 1).toUpperCase()}
                <span className="profile-online-indicator" aria-hidden="true" />
              </div>
              <div className="profile-summary-copy">
                <strong>{displayName}</strong>
                <span>@{user.username}</span>
              </div>
              {isModerator && <span className="profile-role-badge">MOD</span>}
              <span className="profile-arrow" aria-hidden="true">↗</span>
            </button>

            <button className="history-button" type="button" onClick={onClearHistory}>
              <span className="history-button-icon" aria-hidden="true">⌫</span>
              <span>
                <strong>Limpar histórico</strong>
                <small>Somente neste dispositivo</small>
              </span>
            </button>
          </div>
        </div>
      </aside>
    </>
  );
}
