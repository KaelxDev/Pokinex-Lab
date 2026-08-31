const API_HOST = window.location.hostname || "localhost";
const API_URL = `http://${API_HOST}:8000/api/auth`;
const TOKEN_KEY = "poknex_auth_token";

function formatApiError(detail, fallback = "Erro na autenticação.") {
  if (typeof detail === "string" && detail.trim()) return detail;
  if (Array.isArray(detail)) {
    const messages = detail.map((item) => {
      if (typeof item === "string") return item;
      if (item && typeof item === "object") return item.msg || item.message || null;
      return null;
    }).filter(Boolean);
    if (messages.length) return messages.join(" ");
  }
  if (detail && typeof detail === "object") return detail.message || detail.msg || fallback;
  return fallback;
}

async function request(path, options = {}) {
  const headers = { "Content-Type": "application/json", ...(options.headers || {}) };
  const token = getToken();
  if (token) headers.Authorization = `Bearer ${token}`;
  let response;
  try {
    response = await fetch(`${API_URL}${path}`, { ...options, headers });
  } catch (error) {
    console.error("Falha de conexão com a API:", error);
    throw new Error("Não foi possível conectar ao backend. Verifique se o servidor está rodando na porta 8000.");
  }
  let data = null;
  try { data = await response.json(); } catch {}
  if (!response.ok) throw new Error(formatApiError(data?.detail));
  return data;
}

export function getToken() { try { return localStorage.getItem(TOKEN_KEY) || ""; } catch { return ""; } }
export function saveToken(token) { try { localStorage.setItem(TOKEN_KEY, token); } catch {} }
export function clearToken() { try { localStorage.removeItem(TOKEN_KEY); } catch {} }
export function hasToken() { return !!getToken(); }

export async function register(username, password) {
  const data = await request("/register", { method: "POST", body: JSON.stringify({ username, password }) });
  saveToken(data.token); return data.user;
}
export async function login(username, password) {
  const data = await request("/login", { method: "POST", body: JSON.stringify({ username, password }) });
  saveToken(data.token); return data.user;
}
export async function me() { return (await request("/me")).user; }
export async function getPublicProfile(userId) { return (await request(`/users/${encodeURIComponent(userId)}`)).user; }

export async function uploadAvatar(file) {
  const formData = new FormData();
  formData.append("file", file);
  const token = getToken();
  const headers = token ? { Authorization: `Bearer ${token}` } : {};
  let response;
  try {
    response = await fetch(`${API_URL}/avatar`, { method: "POST", headers, body: formData });
  } catch (error) {
    console.error("Falha ao enviar avatar:", error);
    throw new Error("Não foi possível enviar a imagem ao backend.");
  }
  let data = null;
  try { data = await response.json(); } catch {}
  if (!response.ok) throw new Error(formatApiError(data?.detail, "Não foi possível enviar a imagem."));
  return data.avatar;
}

export async function updateProfile(profile) {
  return (await request("/profile", { method: "PATCH", body: JSON.stringify({ username: profile.username, displayName: profile.displayName, avatar: profile.avatar || "", status: profile.status || "" }) })).user;
}
export async function logout() { try { await request("/logout", { method: "POST" }); } finally { clearToken(); } }
