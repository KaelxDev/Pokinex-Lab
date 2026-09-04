import { useEffect, useRef } from "react";
import { getPublicProfile } from "../services/auth";

export function useUserProfiles(messages, users, profilesById, setProfilesById, setUsers, setMessages) {
  const fetchesRef = useRef(new Set());

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
          setProfilesById((current) => ({
            ...current,
            [remote.id]: remote,
          }));
          setUsers((current) =>
            current.map((item) =>
              String(item.id) === String(remote.id)
                ? { ...item, ...remote }
                : item,
            ),
          );
          setMessages((current) =>
            current.map((item) =>
              String(item.userId) === String(remote.id)
                ? { ...item, ...remote }
                : item,
            ),
          );
        })
        .catch(() => {})
        .finally(() => fetchesRef.current.delete(id));
    }
  }, [messages, users, profilesById, setProfilesById, setUsers, setMessages]);
}
