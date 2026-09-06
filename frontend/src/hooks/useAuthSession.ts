import { useCallback, useEffect, useRef, useState } from "react";
import { clearLegacyToken, me } from "../services/auth.ts";
import type { UserRecord } from "../types/chat";

function normalizeUser(currentUser: UserRecord | null | undefined): UserRecord | null {
  if (!currentUser) return null;
  return {
    ...currentUser,
    role: currentUser.role || "member",
  };
}

function emitAuthSession(user: UserRecord | null): void {
  if (typeof window === "undefined") return;
  window.dispatchEvent(new CustomEvent("pokinex:auth-user", { detail: user }));
}

export interface AuthSessionState {
  authChecked: boolean;
  user: UserRecord | null;
  userRef: ReturnType<typeof useRef<UserRecord | null>>;
  syncUser: (nextUser: UserRecord | null | undefined) => void;
  logout: () => void;
}

export function useAuthSession(): AuthSessionState {
  const [authChecked, setAuthChecked] = useState(false);
  const [user, setUser] = useState<UserRecord | null>(null);
  const userRef = useRef<UserRecord | null>(null);

  const syncUser = useCallback((nextUser: UserRecord | null | undefined) => {
    const normalizedUser = normalizeUser(nextUser);
    setUser(normalizedUser);
    userRef.current = normalizedUser;
    emitAuthSession(normalizedUser);
  }, []);

  useEffect(() => {
    let cancelled = false;

    async function restore(): Promise<void> {
      try {
        const currentUser = await me();
        if (cancelled) return;
        syncUser(currentUser);
      } catch {
        if (!cancelled) {
          clearLegacyToken();
          syncUser(null);
        }
      } finally {
        if (!cancelled) setAuthChecked(true);
      }
    }

    void restore();
    return () => {
      cancelled = true;
    };
  }, [syncUser]);

  const logout = useCallback(() => {
    clearLegacyToken();
    syncUser(null);
  }, [syncUser]);

  return { authChecked, user, userRef, syncUser, logout };
}
