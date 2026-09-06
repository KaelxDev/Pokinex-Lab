import { useCallback, useEffect, useRef, useState } from "react";
import type { Dispatch, SetStateAction } from "react";
import { getPublicProfile } from "../services/auth.ts";
import type { ChatMessage, UserRecord } from "../types/chat";

export interface UserDirectoryOptions {
  messages: ChatMessage[];
  setMessages: Dispatch<SetStateAction<ChatMessage[]>>;
  syncUser: (nextUser: UserRecord | null | undefined) => void;
}

export interface UserDirectoryState {
  users: UserRecord[];
  setUsers: Dispatch<SetStateAction<UserRecord[]>>;
  profilesById: Record<string, UserRecord>;
  mergeUser: (incoming: UserRecord | null | undefined) => void;
  syncProfile: (nextUser: UserRecord) => void;
}

export function useUserDirectory({
  messages,
  setMessages,
  syncUser,
}: UserDirectoryOptions): UserDirectoryState {
  const [users, setUsers] = useState<UserRecord[]>([]);
  const [profilesById, setProfilesById] = useState<Record<string, UserRecord>>({});
  const fetchesRef = useRef(new Set<string>());

  const mergeUser = useCallback((incoming: UserRecord | null | undefined) => {
    if (incoming?.id == null) return;
    const key = String(incoming.id);

    setProfilesById((current) => ({
      ...current,
      [key]: { ...current[key], ...incoming },
    }));

    setUsers((current) => {
      const index = current.findIndex((item) => String(item.id) === key);
      if (index < 0) return [...current, incoming];

      const next = [...current];
      next[index] = { ...next[index], ...incoming };
      return next;
    });
  }, []);

  const syncProfile = useCallback((nextUser: UserRecord) => {
    syncUser(nextUser);
    if (nextUser.id == null) return;

    const key = String(nextUser.id);

    setProfilesById((current) => ({
      ...current,
      [key]: {
        ...current[key],
        ...nextUser,
      },
    }));

    setUsers((current) =>
      current.map((item) =>
        String(item.id) === key ? { ...item, ...nextUser } : item,
      ),
    );

    setMessages((current) =>
      current.map((item) =>
        String(item.userId) === key ? { ...item, ...nextUser } : item,
      ),
    );
  }, [setMessages, syncUser]);

  useEffect(() => {
    const ids = new Set<string>();

    for (const item of messages) {
      if (
        item?.userId != null &&
        !profilesById[String(item.userId)] &&
        !fetchesRef.current.has(String(item.userId))
      ) {
        ids.add(String(item.userId));
      }
    }

    for (const item of users) {
      if (
        item?.id != null &&
        item.avatar === "" &&
        !profilesById[String(item.id)] &&
        !fetchesRef.current.has(String(item.id))
      ) {
        ids.add(String(item.id));
      }
    }

    for (const id of ids) {
      fetchesRef.current.add(id);

      getPublicProfile(id)
        .then((remote) => {
          if (!remote?.id) return;
          const key = String(remote.id);

          setProfilesById((current) => {
            const existing = current[key] || {};
            return {
              ...current,
              [key]: {
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
              String(item.id) === key
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
              String(item.userId) === key
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
  }, [messages, profilesById, setMessages, users]);

  return {
    users,
    setUsers,
    profilesById,
    mergeUser,
    syncProfile,
  };
}
