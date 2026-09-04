export const STORAGE_KEY = "poknex_messages";
export const QUEUE_KEY = "poknex_offline_queue";
export const GROUP_WINDOW_MS = 5 * 60 * 1000;
export const HISTORY_PAGE_SIZE = 50;
export const LOCAL_CACHE_LIMIT = 200;
export const REACTION_OPTIONS = ["❤️", "😂", "😮", "😢", "😡", "👍"];

const DEFAULT_API_URL = "https://nexchat-backend-2cyf.onrender.com/api/auth";

function getApiOrigin() {
  const configured = import.meta.env.VITE_API_URL?.trim();
  if (configured) {
    try {
      return new URL(configured).origin;
    } catch {
      // Fall back to the known API origin below.
    }
  }

  if (window.location.hostname === "localhost" || window.location.hostname === "127.0.0.1") {
    return `http://${window.location.hostname}:8000`;
  }

  return new URL(DEFAULT_API_URL).origin;
}

export function normalizeAvatarUrl(avatar, userId = null) {
  const value = String(avatar || "").trim();
  if (!value) return "";

  if (value === "/pokibot-icon.jpg" || value === "pokibot-icon.jpg") {
    return "/pokibot-icon.jpg";
  }

  if (value.startsWith("data:") || value.startsWith("blob:")) return value;

  try {
    const apiOrigin = getApiOrigin();
    const url = new URL(value, apiOrigin);

    if (userId != null && url.pathname.startsWith("/media/")) {
      return `${apiOrigin}/api/auth/avatar/${encodeURIComponent(userId)}`;
    }

    if (url.pathname.startsWith("/api/auth/avatar/")) {
      return `${apiOrigin}${url.pathname}${url.search}`;
    }

    return url.href;
  } catch {
    return "";
  }
}

export function formatTime(timestamp) {
  if (!timestamp) return "";
  return new Date(timestamp).toLocaleTimeString("pt-BR", {
    hour: "2-digit",
    minute: "2-digit",
  });
}

export function loadJson(key) {
  try {
    const value = JSON.parse(localStorage.getItem(key) || "[]");
    return Array.isArray(value) ? value : [];
  } catch {
    return [];
  }
}

export function makeId() {
  return `${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

export function userInitial(user) {
  return String(user?.displayName || user?.username || "?")
    .slice(0, 1)
    .toUpperCase();
}

export function sameAuthor(a, b) {
  if (!a || !b || a.type !== "message" || b.type !== "message") return false;
  if (a.userId != null && b.userId != null) {
    return String(a.userId) === String(b.userId);
  }
  return String(a.username || "") === String(b.username || "");
}

export function canGroup(previous, current) {
  if (!sameAuthor(previous, current)) return false;
  const a = new Date(previous.timestamp || 0).getTime();
  const b = new Date(current.timestamp || 0).getTime();
  return a > 0 && b >= a && b - a <= GROUP_WINDOW_MS;
}

export function mergeServerHistory(current, incoming) {
  const messageMap = new Map();
  const systemMessages = [];

  for (const item of current) {
    if (item?.type === "system") {
      systemMessages.push(item);
      continue;
    }
    if (item?.type === "message" && item.messageId) {
      messageMap.set(item.messageId, item);
    }
  }

  for (const item of incoming) {
    if (!item?.messageId) continue;
    const previous = messageMap.get(item.messageId);
    messageMap.set(item.messageId, {
      ...previous,
      ...item,
      offline: false,
      deliveryStatus: "sent",
      editPending: false,
      deletePending: false,
      avatar: normalizeAvatarUrl(item.avatar, item.userId),
      replyTo: item.replyTo
        ? {
            ...item.replyTo,
            avatar: normalizeAvatarUrl(item.replyTo.avatar, item.replyTo.userId),
          }
        : item.replyTo,
    });
  }

  return [...systemMessages, ...messageMap.values()].sort((a, b) => {
    const timeDiff =
      new Date(a.timestamp || 0).getTime() - new Date(b.timestamp || 0).getTime();
    if (timeDiff !== 0) return timeDiff;
    return String(a.messageId || "").localeCompare(String(b.messageId || ""));
  });
}

export function copyText(text) {
  if (navigator.clipboard?.writeText) return navigator.clipboard.writeText(text);

  const textarea = document.createElement("textarea");
  textarea.value = text;
  textarea.style.position = "fixed";
  textarea.style.opacity = "0";
  document.body.appendChild(textarea);
  textarea.select();
  document.execCommand("copy");
  textarea.remove();
  return Promise.resolve();
}
