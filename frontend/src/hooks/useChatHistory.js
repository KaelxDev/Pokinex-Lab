import { useEffect, useRef, useState } from "react";
import { getMessageHistory } from "../services/auth";
import {
  HISTORY_PAGE_SIZE,
  LOCAL_CACHE_LIMIT,
  QUEUE_KEY,
  STORAGE_KEY,
  loadJson,
  mergeServerHistory,
} from "../utils/chat";

function scopedStorageKey(baseKey, userKey) {
  return userKey == null ? null : baseKey + ":user:" + userKey;
}

export function useChatHistory(userId) {
  const userKey = userId == null ? null : String(userId);
  const [messages, setMessages] = useState([]);
  const [offlineQueue, setOfflineQueue] = useState([]);
  const [historyBefore, setHistoryBefore] = useState(null);
  const [hasMoreHistory, setHasMoreHistory] = useState(false);
  const [historyLoading, setHistoryLoading] = useState(false);
  const messagesRef = useRef(null);
  const historyLoadingRef = useRef(false);
  const refreshPendingRef = useRef(false);
  const cacheWriteTimerRef = useRef(null);
  const previousUserIdRef = useRef(null);
  const messagesOwnerRef = useRef(null);
  const queueOwnerRef = useRef(null);

  useEffect(() => {
    try {
      localStorage.removeItem(STORAGE_KEY);
      localStorage.removeItem(QUEUE_KEY);
    } catch (error) {
      console.error("Não foi possível remover o cache legado:", error);
    }
  }, []);

  useEffect(() => {
    clearTimeout(cacheWriteTimerRef.current);
    if (userKey == null || messagesOwnerRef.current !== userKey) return undefined;

    const cacheKey = scopedStorageKey(STORAGE_KEY, userKey);
    cacheWriteTimerRef.current = window.setTimeout(() => {
      try {
        const cacheable = messages
          .filter((item) => item?.type === "message")
          .slice(-LOCAL_CACHE_LIMIT);
        localStorage.setItem(cacheKey, JSON.stringify(cacheable));
      } catch (error) {
        console.error("Não foi possível atualizar o cache local:", error);
      }
    }, 200);

    return () => window.clearTimeout(cacheWriteTimerRef.current);
  }, [messages, userKey]);

  useEffect(() => {
    if (userKey == null || queueOwnerRef.current !== userKey) return;

    const queueKey = scopedStorageKey(QUEUE_KEY, userKey);
    try {
      localStorage.setItem(queueKey, JSON.stringify(offlineQueue));
    } catch (error) {
      console.error("Não foi possível atualizar a fila offline:", error);
    }
  }, [offlineQueue, userKey]);
  async function loadMessageHistory(before = null, preserveScroll = false) {
    if (historyLoadingRef.current) {
      if (before == null) refreshPendingRef.current = true;
      return;
    }
    if (before && !hasMoreHistory) return;

    historyLoadingRef.current = true;
    setHistoryLoading(true);

    const container = messagesRef.current;
    const previousScrollHeight = container?.scrollHeight || 0;
    const previousScrollTop = container?.scrollTop || 0;

    try {
      const data = await getMessageHistory(HISTORY_PAGE_SIZE, before);
      const incoming = Array.isArray(data?.messages) ? data.messages : [];
      setMessages((current) => mergeServerHistory(current, incoming));
      setHistoryBefore(data?.nextBefore || null);
      setHasMoreHistory(Boolean(data?.hasMore && data?.nextBefore));

      requestAnimationFrame(() => {
        if (!container || !preserveScroll) return;
        container.scrollTop =
          container.scrollHeight - previousScrollHeight + previousScrollTop;
      });
    } catch (error) {
      console.error("Não foi possível carregar o histórico:", error);
    } finally {
      historyLoadingRef.current = false;
      setHistoryLoading(false);
      if (refreshPendingRef.current) {
        refreshPendingRef.current = false;
        void loadMessageHistory();
      }
    }
  }

  useEffect(() => {
    if (previousUserIdRef.current === userKey) return;
    previousUserIdRef.current = userKey;
    setHistoryBefore(null);
    setHasMoreHistory(false);

    messagesOwnerRef.current = userKey;
    queueOwnerRef.current = userKey;

    if (userKey == null) {
      setMessages([]);
      setOfflineQueue([]);
      return;
    }

    setMessages(loadJson(scopedStorageKey(STORAGE_KEY, userKey)));
    setOfflineQueue(loadJson(scopedStorageKey(QUEUE_KEY, userKey)));
    void loadMessageHistory();
  }, [userKey]);
  function handleMessagesScroll(event) {
    if (event.currentTarget.scrollTop > 80) return;
    if (!hasMoreHistory || historyLoadingRef.current || !historyBefore) return;
    void loadMessageHistory(historyBefore, true);
  }

  function clearLocalHistory() {
    setMessages([]);
    setHistoryBefore(null);
    setHasMoreHistory(false);
    const cacheKey = scopedStorageKey(STORAGE_KEY, userKey);
    if (!cacheKey) return;
    try {
      localStorage.removeItem(cacheKey);
    } catch (error) {
      console.error("Não foi possível limpar o cache local:", error);
    }
  }

  return {
    messages,
    setMessages,
    offlineQueue,
    setOfflineQueue,
    historyLoading,
    loadMessageHistory,
    messagesRef,
    handleMessagesScroll,
    clearLocalHistory,
  };
}
