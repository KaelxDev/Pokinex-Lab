import { useEffect, useState } from "react";
import type { ChangeEvent, FormEvent } from "react";
import { updateProfile, uploadAvatar } from "../services/auth.ts";
import type { UserRecord } from "../types/chat";

export interface ProfileEditorOptions {
  user: UserRecord | null;
  profile: UserRecord | null;
  syncProfile: (nextUser: UserRecord) => void;
}

export interface ProfileEditorState {
  profileOpen: boolean;
  profileError: string;
  profileSaving: boolean;
  avatarPreviewUrl: string;
  openProfile: () => void;
  saveProfile: (event: FormEvent<HTMLFormElement>) => Promise<void>;
  chooseAvatar: (event: ChangeEvent<HTMLInputElement>) => void;
  closeProfile: () => void;
}

export function useProfileEditor({
  user,
  profile,
  syncProfile,
}: ProfileEditorOptions): ProfileEditorState {
  const [profileOpen, setProfileOpen] = useState(false);
  const [profileError, setProfileError] = useState("");
  const [profileSaving, setProfileSaving] = useState(false);
  const [selectedAvatarFile, setSelectedAvatarFile] = useState<File | null>(null);
  const [avatarPreviewUrl, setAvatarPreviewUrl] = useState("");

  useEffect(() => {
    return () => {
      if (avatarPreviewUrl) URL.revokeObjectURL(avatarPreviewUrl);
    };
  }, [avatarPreviewUrl]);

  function openProfile(): void {
    setProfileError("");
    setProfileOpen(true);
  }

  async function saveProfile(event: FormEvent<HTMLFormElement>): Promise<void> {
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
        displayName: String(form.get("displayName") || oldUsername).trim() || oldUsername,
        avatar: nextAvatar,
        status: String(form.get("status") || "").trim(),
      });

      setSelectedAvatarFile(null);
      setAvatarPreviewUrl("");
      syncProfile(updated);
      setProfileOpen(false);
    } catch (error: unknown) {
      setProfileError(
        error instanceof Error ? error.message : "Não foi possível atualizar o perfil.",
      );
    } finally {
      setProfileSaving(false);
    }
  }

  function chooseAvatar(event: ChangeEvent<HTMLInputElement>): void {
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

  function closeProfile(): void {
    if (avatarPreviewUrl) URL.revokeObjectURL(avatarPreviewUrl);
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
