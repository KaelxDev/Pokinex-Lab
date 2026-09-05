export interface HistoryParams {
  limit?: number;
  before?: string | null;
}

const isLocalhost =
  window.location.hostname === "localhost" ||
  window.location.hostname === "127.0.0.1";

const DEFAULT_API_URL = "https://nexchat-backend-2cyf.onrender.com/api/auth";
const DEFAULT_WS_URL = "wss://nexchat-backend-2cyf.onrender.com/ws";
const LOCAL_API_URL = `http://${window.location.hostname}:8000/api/auth`;
const LOCAL_WS_URL = `ws://${window.location.hostname}:8000/ws`;

const env = (import.meta as ImportMeta & { env?: Record<string, string | undefined> }).env;

export const API_URL = env?.VITE_API_URL || (isLocalhost ? LOCAL_API_URL : DEFAULT_API_URL);
export const WS_URL = env?.VITE_WS_URL || (isLocalhost ? LOCAL_WS_URL : DEFAULT_WS_URL);

export const LEGACY_AUTH_TOKEN_KEY = "poknex_auth_token";

export function messagesHistoryUrl(): string {
  return API_URL.replace(/\/api\/auth\/?$/, "/api/messages");
}

export function directMessagesHistoryUrl(userId: string | number, params: HistoryParams = {}): string {
  const base = API_URL.replace(/\/api\/auth\/?$/, "/api/messages/direct");
  const search = new URLSearchParams();
  if (params.limit != null) search.set("limit", String(params.limit));
  if (params.before) search.set("before", params.before);
  return `${base}/${encodeURIComponent(userId)}?${search.toString()}`;
}
