import { useEffect, useState } from "react";
import { updateProfile, uploadAvatar } from "../services/auth";

export function useProfileEditor({ user, profile, syncProfile }) {
  const [profileOpen, setProfileOpen] = useState(false);
  const [profileError, setProfileError] = useState("");
  const [profileSaving, setProfileSaving] = useState(false);
  const [selectedAvatarFile, setSelectedAvatarFile] = useState(null);
  const [avatarPreviewUrl, setAvatarPreviewUrl] = useState("");

  useEffect(() => {
    return () => {
      if (avatarPreviewUrl) URL.revokeObjectURL(avatarPreviewUrl);
    };
  }, [avatarPreviewUrl]);

  function openProfile() {
    setProfileError("");
    setProfileOpen(true);
  }

  async function saveProfile(event) {
    event.preventDefault();
    setProfileError("");
    setProfileSaving(true);
    const form = new FormData(event.currentTarget);
    const oldUsername = user?.username || "";

    try {
      let nextAvatar = profile?.avatar || user?.avatar || "";
      if (selectedAvatarFile) {
        nextAvatar = await uploadAvatar(selectedAvatarFile);
      }

      const updated = await updateProfile({
        username: String(form.get("username") || oldUsername).trim(),
        displayName:
          String(form.get("displayName") || oldUsername).trim() || oldUsername,
        avatar: nextAvatar,
        status: String(form.get("status") || "").trim(),
      });

      setSelectedAvatarFile(null);
      setAvatarPreviewUrl("");
      syncProfile(updated);
      setProfileOpen(false);
    } catch (error) {
      setProfileError(error.message || "Não foi possível atualizar o perfil.");
    } finally {
      setProfileSaving(false);
    }
  }

  function chooseAvatar(event) {
    const file = event.target.files?.[0];
    if (!file) return;

    if (!file.type.startsWith("image/")) {
      setProfileError("Escolha um arquivo de imagem válido.");
      event.target.value = "";
      return;
    }

    if (file.size > 2 * 1024 * 1024) {
      setProfileError("Escolha uma imagem de até 2 MB.");
      event.target.value = "";
      return;
    }

    setProfileError("");
    setSelectedAvatarFile(file);
    setAvatarPreviewUrl(URL.createObjectURL(file));
    event.target.value = "";
  }

  function closeProfile() {
    setSelectedAvatarFile(null);
    setAvatarPreviewUrl("");
    setProfileError("");
    setProfileOpen(false);
  }

  return {
    profileOpen,
    profileError,
    profileSaving,
    avatarPreviewUrl,
    openProfile,
    saveProfile,
    chooseAvatar,
    closeProfile,
  };
}
