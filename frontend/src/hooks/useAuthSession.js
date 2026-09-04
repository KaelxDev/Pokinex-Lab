import { useCallback, useEffect, useRef, useState } from "react";
import { clearLegacyToken, me } from "../services/auth";

function normalizeUser(currentUser) {
  if (!currentUser) return null;
  return {
    ...currentUser,
    role: currentUser.role || "member",
  };
}

export function useAuthSession() {
  const [authChecked, setAuthChecked] = useState(false);
  const [user, setUser] = useState(null);
  const userRef = useRef(null);

  const syncUser = useCallback((nextUser) => {
    const normalizedUser = normalizeUser(nextUser);
    setUser(normalizedUser);
    userRef.current = normalizedUser;
  }, []);

  useEffect(() => {
    let cancelled = false;

    async function restore() {
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

  function logout() {
    clearLegacyToken();
    syncUser(null);
  }

  return { authChecked, user, userRef, syncUser, logout };
}
