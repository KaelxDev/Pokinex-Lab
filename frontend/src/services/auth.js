const DEFAULT_API_URL = "https://nexchat-backend-2cyf.onrender.com/api/auth";
const LOCAL_API_URL = `http://${window.location.hostname}:8000/api/auth`;
const API_URL = import.meta.env.VITE_API_URL || (window.location.hostname === "localhost" || window.location.hostname === "127.0.0.1" ? LOCAL_API_URL : DEFAULT_API_URL);
const TOKEN_KEY = "poknex_auth_token";

function translateValidationMessage(item) {
  const message = typeof item === "string" ? item : item?.msg || item?.message || "";
  const field = Array.isArray(item?.loc) ? item.loc[item.loc.length - 1] : "";

  if (/String should have at least 8 characters/i.test(message) && field === "password") {
    return "A senha deve conter no mínimo 8 caracteres.";
  }

  if (/String should have at most 128 characters/i.test(message) && field === "password") {
    return "A senha deve conter no máximo 128 caracteres.";
  }

  if (/String should have at least 3 characters/i.test(message) && field === "username") {
    return "O nome de usuário deve conter no mínimo 3 caracteres.";
  }

  if (/String should have at most 20 characters/i.test(message) && field === "username") {
    return "O nome de usuário deve conter no máximo 20 caracteres.";
  }

  return message;
}

function formatApiError(detail, fallback = "Erro na autenticação.") {
  if (typeof detail === "string" && detail.trim()) return detail;
  if (Array.isArray(detail)) {
    const messages = detail
      .map(translateValidationMessage)
      .filter(Boolean);
    if (messages.length) return messages.join(" ");
  }
  if (detail && typeof detail === "object") return detail.message || detail.msg || fallback;
  return fallback;
}

function enrichProfileRole(user) {
  if (!user) return user;

  const id = String(user.id ?? "").trim();
  const username = String(user.username ?? "").trim().toLowerCase();

  if (id === "1" || username === "kael1nk") {
    return { ...user, role: "owner" };
  }

  return user;
}

async function readResponseData(response) {
  try {
    return await response.json();
  } catch {
    return null;
  }
}

async function request(path, options = {}) {
  const headers = { "Content-Type": "application/json", ...(options.headers || {}) };
  const token = getToken();
  if (token) headers.Authorization = `Bearer ${token}`;

  let response;
  try {
    response = await fetch(`${API_URL}${path}`, {
      ...options,
      headers,
      credentials: "include",
    });
  } catch (error) {
    console.error("Falha de conexão com a API:", error);
    throw new Error("Não foi possível conectar ao backend.");
  }

  const data = await readResponseData(response);
  if (!response.ok) throw new Error(formatApiError(data?.detail));
  return data;
}

export function getToken() { try { return localStorage.getItem(TOKEN_KEY) || ""; } catch { return ""; } }
export function saveToken(token) { try { localStorage.setItem(TOKEN_KEY, token); } catch {} }
export function clearToken() { try { localStorage.removeItem(TOKEN_KEY); } catch {} }
export function hasToken() { return !!getToken(); }

export async function register(username, password) {
  const data = await request("/register", { method: "POST", body: JSON.stringify({ username, password }) });
  clearToken();
  return enrichProfileRole(data.user);
}

export async function login(username, password) {
  const data = await request("/login", { method: "POST", body: JSON.stringify({ username, password }) });
  clearToken();
  return enrichProfileRole(data.user);
}

export async function me() {
  const hasLegacyToken = !!getToken();
  const user = enrichProfileRole((await request("/me")).user);
  if (hasLegacyToken) clearToken();
  return user;
}

export async function getPublicProfile(userId) {
  return enrichProfileRole((await request(`/users/${encodeURIComponent(userId)}`)).user);
}

export async function getMessageHistory(limit = 50, before = null) {
  const params = new URLSearchParams({ limit: String(limit) });
  if (before) params.set("before", before);
  const historyUrl = API_URL.replace(/\/api\/auth\/?$/, "/api/messages");
  const token = getToken();
  const headers = token ? { Authorization: `Bearer ${token}` } : {};
  let response;
  try {
    response = await fetch(`${historyUrl}?${params.toString()}`, {
      headers,
      credentials: "include",
    });
  } catch (error) {
    console.error("Falha ao carregar histórico:", error);
    throw new Error("Não foi possível carregar o histórico.");
  }

  const data = await readResponseData(response);
  if (!response.ok) throw new Error(formatApiError(data?.detail, "Não foi possível carregar o histórico."));
  return data;
}

export async function uploadAvatar(file) {
  if (!(file instanceof File)) {
    throw new Error("Selecione uma imagem válida.");
  }

  const formData = new FormData();
  formData.append("file", file, file.name || "avatar");
  const token = getToken();
  const headers = token ? { Authorization: `Bearer ${token}` } : {};

  let response;
  try {
    response = await fetch(`${API_URL}/avatar`, {
      method: "POST",
      headers,
      body: formData,
      credentials: "include",
    });
  } catch (error) {
    console.error("Falha ao enviar avatar:", error);
    throw new Error("Não foi possível conectar ao backend para enviar a imagem.");
  }

  const data = await readResponseData(response);
  if (!response.ok) {
    const message = formatApiError(
      data?.detail,
      `Não foi possível enviar a imagem (HTTP ${response.status}).`,
    );
    throw new Error(message);
  }

  if (!data?.avatar) {
    throw new Error("O backend não retornou o endereço do avatar.");
  }

  return data.avatar;
}

export async function updateProfile(profile) {
  return enrichProfileRole((await request("/profile", {
    method: "PATCH",
    body: JSON.stringify({
      username: profile.username,
      displayName: profile.displayName,
      avatar: profile.avatar || "",
      status: profile.status || "",
    }),
  })).user);
}

export async function logout() {
  try {
    await request("/logout", { method: "POST" });
  } finally {
    clearToken();
  }
}
