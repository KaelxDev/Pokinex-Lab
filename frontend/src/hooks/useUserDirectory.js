import { useCallback, useEffect, useRef, useState } from "react";
import { getPublicProfile } from "../services/auth";

export function useUserDirectory({ messages, setMessages, syncUser }) {
  const [users, setUsers] = useState([]);
  const [profilesById, setProfilesById] = useState({});
  const fetchesRef = useRef(new Set());

  const mergeUser = useCallback((incoming) => {
    if (!incoming?.id) return;

    setProfilesById((current) => ({
      ...current,
      [incoming.id]: { ...current[incoming.id], ...incoming },
    }));

    setUsers((current) => {
      const index = current.findIndex((item) => String(item.id) === String(incoming.id));
      if (index < 0) return [...current, incoming];

      const next = [...current];
      next[index] = { ...next[index], ...incoming };
      return next;
    });
  }, []);

  const syncProfile = useCallback((nextUser) => {
    syncUser(nextUser);

    if (!nextUser?.id) return;

    setProfilesById((current) => ({
      ...current,
      [nextUser.id]: {
        ...current[nextUser.id],
        ...nextUser,
      },
    }));

    setUsers((current) =>
      current.map((item) =>
        String(item.id) === String(nextUser.id)
          ? { ...item, ...nextUser }
          : item,
      ),
    );

    setMessages((current) =>
      current.map((item) =>
        String(item.userId) === String(nextUser.id)
          ? { ...item, ...nextUser }
          : item,
      ),
    );
  }, [setMessages, syncUser]);

  useEffect(() => {
    const ids = new Set();

    for (const item of messages) {
      if (
        item?.userId &&
        !profilesById[item.userId] &&
        !fetchesRef.current.has(item.userId)
      ) {
        ids.add(item.userId);
      }
    }

    for (const item of users) {
      if (
        item?.id &&
        item.avatar === "" &&
        !profilesById[item.id] &&
        !fetchesRef.current.has(item.id)
      ) {
        ids.add(item.id);
      }
    }

    for (const id of ids) {
      fetchesRef.current.add(id);

      getPublicProfile(id)
        .then((remote) => {
          setProfilesById((current) => {
            const existing = current[remote.id] || {};
            return {
              ...current,
              [remote.id]: {
                ...existing,
                ...remote,
                ...(remote?.role == null && existing?.role
                  ? { role: existing.role }
                  : {}),
              },
            };
          });

          setUsers((current) =>
            current.map((item) =>
              String(item.id) === String(remote.id)
                ? {
                    ...item,
                    ...remote,
                    ...(remote?.role == null && item?.role
                      ? { role: item.role }
                      : {}),
                  }
                : item,
            ),
          );

          setMessages((current) =>
            current.map((item) =>
              String(item.userId) === String(remote.id)
                ? {
                    ...item,
                    ...remote,
                    ...(remote?.role == null && item?.role
                      ? { role: item.role }
                      : {}),
                  }
                : item,
            ),
          );
        })
        .catch(() => {})
        .finally(() => fetchesRef.current.delete(id));
    }
  }, [messages, profilesById, users, setMessages]);

  return {
    users,
    setUsers,
    profilesById,
    mergeUser,
    syncProfile,
  };
}
