import { useCallback, useEffect, useRef, useState } from "react";
import { clearToken, me } from "../services/auth";

function withRole(currentUser) {
  if (!currentUser) return currentUser;

  const id = String(currentUser.id ?? "").trim();
  const username = String(currentUser.username ?? "").trim().toLowerCase();

  if (id === "1" || username === "kael1nk") {
    return { ...currentUser, role: "owner" };
  }

  return currentUser.role
    ? currentUser
    : { ...currentUser, role: "member" };
}

export function useAuthSession() {
  const [authChecked, setAuthChecked] = useState(false);
  const [user, setUser] = useState(null);
  const userRef = useRef(null);

  const syncUser = useCallback((nextUser) => {
    const enrichedUser = withRole(nextUser);
    setUser(enrichedUser);
    userRef.current = enrichedUser;
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
