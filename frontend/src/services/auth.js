const API_URL = "http://127.0.0.1:8000/api/auth";
const TOKEN_KEY = "poknex_auth_token";

async function request(path, options = {}) {
  const headers = { "Content-Type": "application/json", ...(options.headers || {}) };
  const token = getToken();
  if (token) headers.Authorization = `Bearer ${token}`;

  const response = await fetch(`${API_URL}${path}`, { ...options, headers });
  let data = null;
  try { data = await response.json(); } catch {}
  if (!response.ok) throw new Error(data?.detail || "Erro na autenticação.");
  return data;
}

export function getToken() {
  try { return localStorage.getItem(TOKEN_KEY) || ""; } catch { return ""; }
}
export function saveToken(token) { try { localStorage.setItem(TOKEN_KEY, token); } catch {} }
export function clearToken() { try { localStorage.removeItem(TOKEN_KEY); } catch {} }
export function hasToken() { return !!getToken(); }

export async function register(username, password) {
  const data = await request("/register", { method: "POST", body: JSON.stringify({ username, password }) });
  saveToken(data.token);
  return data.user;
}

export async function login(username, password) {
  const data = await request("/login", { method: "POST", body: JSON.stringify({ username, password }) });
  saveToken(data.token);
  return data.user;
}

export async function me() { return (await request("/me")).user; }

export async function updateProfile(profile) {
  return (await request("/profile", { method: "PATCH", body: JSON.stringify({ displayName: profile.displayName, avatar: profile.avatar || "", status: profile.status || "" }) })).user;
}

export async function logout() {
  try { await request("/logout", { method: "POST" }); } finally { clearToken(); }
}
