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

export interface ChatMessage {
  type?: string;
  messageId?: string | number;
  userId?: string | number;
  username?: string;
  displayName?: string;
  message?: string;
  timestamp?: number | string;
  avatar?: string;
  ephemeral?: boolean;
  deliveryStatus?: string;
  offline?: boolean;
  [key: string]: unknown;
}

export interface OfflineQueueItem extends ChatMessage {
  id: string;
  type: "message";
  message: string;
  createdAt: number;
}

interface HistoryResponse {
  messages?: unknown;
  nextBefore?: string | null;
  hasMore?: boolean;
}

function scopedStorageKey(baseKey: string, userKey: string | null): string | null {
  return userKey == null ? null : `${baseKey}:user:${userKey}`;
}

function asChatMessages(value: unknown): ChatMessage[] {
  return Array.isArray(value) ? (value as ChatMessage[]) : [];
}

function asQueue(value: unknown): OfflineQueueItem[] {
  return Array.isArray(value) ? (value as OfflineQueueItem[]) : [];
}

export interface ChatHistoryState {
  messages: ChatMessage[];
  setMessages: React.Dispatch<React.SetStateAction<ChatMessage[]>>;
  offlineQueue: OfflineQueueItem[];
  setOfflineQueue: React.Dispatch<React.SetStateAction<OfflineQueueItem[]>>;
  historyLoading: boolean;
  loadMessageHistory: (before?: string | null, preserveScroll?: boolean) => Promise<void>;
  messagesRef: React.RefObject<HTMLDivElement | null>;
  handleMessagesScroll: (event: React.UIEvent<HTMLDivElement>) => void;
  clearLocalHistory: () => void;
}

export function useChatHistory(userId: string | number | null | undefined): ChatHistoryState {
  const userKey = userId == null ? null : String(userId);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [offlineQueue, setOfflineQueue] = useState<OfflineQueueItem[]>([]);
  const [historyBefore, setHistoryBefore] = useState<string | null>(null);
  const [hasMoreHistory, setHasMoreHistory] = useState(false);
  const [historyLoading, setHistoryLoading] = useState(false);
  const messagesRef = useRef<HTMLDivElement | null>(null);
  const historyLoadingRef = useRef(false);
  const refreshPendingRef = useRef(false);
  const cacheWriteTimerRef = useRef<number | null>(null);
  const previousUserIdRef = useRef<string | null>(null);
  const messagesOwnerRef = useRef<string | null>(null);
  const queueOwnerRef = useRef<string | null>(null);

  useEffect(() => {
    try {
      localStorage.removeItem(STORAGE_KEY);
      localStorage.removeItem(QUEUE_KEY);
    } catch (error) {
      console.error("Não foi possível remover o cache legado:", error);
    }
  }, []);

  useEffect(() => {
    if (cacheWriteTimerRef.current != null) {
      window.clearTimeout(cacheWriteTimerRef.current);
    }
    if (userKey == null || messagesOwnerRef.current !== userKey) return undefined;

    const cacheKey = scopedStorageKey(STORAGE_KEY, userKey);
    if (!cacheKey) return undefined;

    cacheWriteTimerRef.current = window.setTimeout(() => {
      try {
        const cacheable = messages
          .filter((item) => item?.type === "message" && !item?.ephemeral)
          .slice(-LOCAL_CACHE_LIMIT);
        localStorage.setItem(cacheKey, JSON.stringify(cacheable));
      } catch (error) {
        console.error("Não foi possível atualizar o cache local:", error);
      }
    }, 200);

    return () => {
      if (cacheWriteTimerRef.current != null) {
        window.clearTimeout(cacheWriteTimerRef.current);
      }
    };
  }, [messages, userKey]);

  useEffect(() => {
    if (userKey == null || queueOwnerRef.current !== userKey) return;

    const queueKey = scopedStorageKey(QUEUE_KEY, userKey);
    if (!queueKey) return;

    try {
      localStorage.setItem(queueKey, JSON.stringify(offlineQueue));
    } catch (error) {
      console.error("Não foi possível atualizar a fila offline:", error);
    }
  }, [offlineQueue, userKey]);

  async function loadMessageHistory(before: string | null = null, preserveScroll = false): Promise<void> {
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
      const data = (await getMessageHistory(HISTORY_PAGE_SIZE, before)) as HistoryResponse;
      const incoming = asChatMessages(data?.messages);
      setMessages((current) => mergeServerHistory(current, incoming) as ChatMessage[]);
      setHistoryBefore(data?.nextBefore || null);
      setHasMoreHistory(Boolean(data?.hasMore && data?.nextBefore));

      window.requestAnimationFrame(() => {
        if (!container || !preserveScroll) return;
        container.scrollTop = container.scrollHeight - previousScrollHeight + previousScrollTop;
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

    setMessages(asChatMessages(loadJson(scopedStorageKey(STORAGE_KEY, userKey))));
    setOfflineQueue(asQueue(loadJson(scopedStorageKey(QUEUE_KEY, userKey))));
    void loadMessageHistory();
  }, [userKey]);

  function handleMessagesScroll(event: React.UIEvent<HTMLDivElement>): void {
    if (event.currentTarget.scrollTop > 80) return;
    if (!hasMoreHistory || historyLoadingRef.current || !historyBefore) return;
    void loadMessageHistory(historyBefore, true);
  }

  function clearLocalHistory(): void {
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
