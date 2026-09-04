const DEFAULT_API_URL = "https://nexchat-backend-2cyf.onrender.com/api/auth";
const LOCAL_API_URL = `http://${window.location.hostname}:8000/api/auth`;
const API_URL = import.meta.env.VITE_API_URL || (
  window.location.hostname === "localhost" || window.location.hostname === "127.0.0.1"
    ? LOCAL_API_URL
    : DEFAULT_API_URL
);

function readResponseData(response) {
  return response.json().catch(() => null);
}

function historyUrl(userId, limit, before) {
  const base = API_URL.replace(/\/api\/auth\/?$/, "/api/messages/direct");
  const params = new URLSearchParams({ limit: String(limit) });
  if (before) params.set("before", before);
  return `${base}/${encodeURIComponent(userId)}?${params.toString()}`;
}

function formatError(detail) {
  if (typeof detail === "string" && detail.trim()) return detail;
  if (Array.isArray(detail)) {
    const message = detail
      .map((item) => (typeof item === "string" ? item : item?.msg || item?.message || ""))
      .filter(Boolean)
      .join(" ");
    if (message) return message;
  }
  return detail?.message || detail?.msg || "Não foi possível carregar a conversa privada.";
}

export async function getDirectMessageHistory(userId, limit = 50, before = null) {
  const token = (() => {
    try {
      return localStorage.getItem("poknex_auth_token") || "";
    } catch {
      return "";
    }
  })();
  const headers = token ? { Authorization: `Bearer ${token}` } : {};

  let response;
  try {
    response = await fetch(historyUrl(userId, limit, before), {
      headers,
      credentials: "include",
    });
  } catch (error) {
    console.error("Falha ao carregar conversa privada:", error);
    throw new Error("Não foi possível conectar ao backend.");
  }

  const data = await readResponseData(response);
  if (!response.ok) throw new Error(formatError(data?.detail));
  return data;
}
