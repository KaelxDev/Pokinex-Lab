import { useCallback, useEffect, useRef, useState } from "react";
import { clearToken, me } from "../services/auth";

export function useAuthSession() {
  const [authChecked, setAuthChecked] = useState(false);
  const [user, setUser] = useState(null);
  const userRef = useRef(null);

  const syncUser = useCallback((nextUser) => {
    setUser(nextUser);
    userRef.current = nextUser;
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
          clearToken();
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
    clearToken();
    syncUser(null);
  }

  return { authChecked, user, userRef, syncUser, logout };
}
