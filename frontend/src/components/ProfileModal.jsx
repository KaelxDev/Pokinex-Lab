import { normalizeAvatarUrl } from "../utils/chat";

export default function ProfileModal({
  open,
  user,
  profile,
  avatarPreview = "",
  profileError,
  profileSaving,
  onClose,
  onSubmit,
  onChooseAvatar,
}) {
  if (!open) return null;

  const displayName = profile?.displayName || user?.displayName || user?.username || "Usuário";
  const avatar = avatarPreview || normalizeAvatarUrl(profile?.avatar || user?.avatar, user?.id);

  return (
    <div
      className="profile-overlay"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
    >
      <form className="profile-modal" onSubmit={onSubmit}>
        <h2>👤 Meu perfil</h2>
        <div className="profile-preview">
          <div className="avatar profile-avatar profile-preview-avatar">
            {avatar ? <img src={avatar} alt="Pré-visualização do avatar" /> : displayName.slice(0, 1).toUpperCase()}
          </div>
          <div>
            <strong>@{user.username}</strong>
            <p>ID da conta: {user.id}</p>
          </div>
        </div>

        {profileError && <div className="status disconnected">{profileError}</div>}

        <div className="avatar-picker">
          <label className="avatar-button" htmlFor="avatar-file">
            🖼️ Escolher imagem
          </label>
          <input
            id="avatar-file"
            type="file"
            accept="image/jpeg,image/png,image/gif,image/webp"
            onChange={onChooseAvatar}
            hidden
          />
          <span>PNG, JPG, GIF ou WebP • até 2 MB</span>
          {avatarPreview && <small>Nova foto selecionada. Clique em “Salvar perfil”.</small>}
        </div>

        <label>
          Username
          <input name="username" defaultValue={user.username} minLength={3} maxLength={20} />
        </label>
        <label>
          Nome de exibição
          <input name="displayName" defaultValue={displayName} maxLength={30} />
        </label>
        <label>
          Status personalizado
          <input
            name="status"
            placeholder="Ex.: Jogando 🎮"
            maxLength={60}
            defaultValue={profile?.status || user?.status || ""}
          />
        </label>

        <div className="profile-actions">
          <button type="button" onClick={onClose} disabled={profileSaving}>
            Cancelar
          </button>
          <button type="submit" disabled={profileSaving}>
            {profileSaving ? "Salvando..." : "Salvar perfil"}
          </button>
        </div>
      </form>
    </div>
  );
}
