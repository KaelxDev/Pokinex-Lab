import type { ChatMessage, UserRecord } from "../types/chat";
import { API_URL, LEGACY_AUTH_TOKEN_KEY, messagesHistoryUrl } from "../config/runtime";

interface ValidationErrorItem {
  msg?: string;
  message?: string;
  loc?: Array<string | number>;
}

interface ApiErrorDetail {
  message?: string;
  msg?: string;
}

interface AuthResponse {
  user?: UserRecord;
}

export interface MessageHistoryResponse {
  messages?: ChatMessage[];
  nextBefore?: string | null;
  hasMore?: boolean;
}

export interface ProfilePayload {
  username?: string;
  displayName?: string;
  avatar?: string;
  status?: string;
}

function translateValidationMessage(item: unknown): string {
  const value = typeof item === "string" ? item : (item as ValidationErrorItem | null)?.msg || (item as ValidationErrorItem | null)?.message || "";
  const field = Array.isArray((item as ValidationErrorItem | null)?.loc)
    ? (item as ValidationErrorItem).loc?.[item as ValidationErrorItem].length - 1
    : "";

  if (/String should have at least 8 characters/i.test(value) && field === "password") {
    return "A senha deve conter no mínimo 8 caracteres.";
  }
  if (/String should have at most 128 characters/i.test(value) && field === "password") {
    return "A senha deve conter no máximo 128 caracteres.";
  }
  if (/String should have at least 3 characters/i.test(value) && field === "username") {
    return "O nome de usuário deve conter no mínimo 3 caracteres.";
  }
  if (/String should have at most 20 characters/i.test(value) && field === "username") {
    return "O nome de usuário deve conter no máximo 20 caracteres.";
  }

  return value;
}

function formatApiError(detail: unknown, fallback = "Erro na autenticação."): string {
  if (typeof detail === "string" && detail.trim()) return detail;

  if (Array.isArray(detail)) {
    const messages = detail.map(translateValidationMessage).filter(Boolean);
    if (messages.length) return messages.join(" ");
  }

  if (detail && typeof detail === "object") {
    const value = detail as ApiErrorDetail;
    return value.message || value.msg || fallback;
  }

  return fallback;
}

async function readResponseData(response: Response): Promise<unknown> {
  try {
    return await response.json();
  } catch {
    return null;
  }
}

async function request<T>(path: string, options: RequestInit = {}): Promise<T> {
  const headers = new Headers(options.headers);
  headers.set("Content-Type", "application/json");

  let response: Response;
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
  if (!response.ok) throw new Error(formatApiError((data as { detail?: unknown } | null)?.detail));
  return data as T;
}

function requireUser(response: AuthResponse): UserRecord {
  if (!response.user) {
    throw new Error("O backend não retornou os dados do usuário.");
  }
  return response.user;
}

export function clearLegacyToken(): void {
  try {
    localStorage.removeItem(LEGACY_AUTH_TOKEN_KEY);
  } catch {
    // Ignore storage failures from old versions of the client.
  }
}

export async function register(username: string, password: string): Promise<UserRecord> {
  const data = await request<AuthResponse>("/register", {
    method: "POST",
    body: JSON.stringify({ username, password }),
  });
  clearLegacyToken();
  return requireUser(data);
}

export async function login(username: string, password: string): Promise<UserRecord> {
  const data = await request<AuthResponse>("/login", {
    method: "POST",
    body: JSON.stringify({ username, password }),
  });
  clearLegacyToken();
  return requireUser(data);
}

export async function me(): Promise<UserRecord> {
  const data = await request<AuthResponse>("/me");
  clearLegacyToken();
  return requireUser(data);
}

export async function getPublicProfile(userId: string | number): Promise<UserRecord> {
  const data = await request<AuthResponse>(`/users/${encodeURIComponent(userId)}`);
  return requireUser(data);
}

export async function getMessageHistory(
  limit = 50,
  before: string | null = null,
): Promise<MessageHistoryResponse> {
  const params = new URLSearchParams({ limit: String(limit) });
  if (before) params.set("before", before);

  let response: Response;
  try {
    response = await fetch(`${messagesHistoryUrl()}?${params.toString()}`, {
      credentials: "include",
    });
  } catch (error) {
    console.error("Falha ao carregar histórico:", error);
    throw new Error("Não foi possível carregar o histórico.");
  }

  const data = await readResponseData(response);
  if (!response.ok) {
    throw new Error(
      formatApiError((data as { detail?: unknown } | null)?.detail, "Não foi possível carregar o histórico."),
    );
  }

  return (data || {}) as MessageHistoryResponse;
}

export async function uploadAvatar(file: File): Promise<string> {
  if (!(file instanceof File)) {
    throw new Error("Selecione uma imagem válida.");
  }

  const formData = new FormData();
  formData.append("file", file, file.name || "avatar");

  let response: Response;
  try {
    response = await fetch(`${API_URL}/avatar`, {
      method: "POST",
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
      (data as { detail?: unknown } | null)?.detail,
      `Não foi possível enviar a imagem (HTTP ${response.status}).`,
    );
    throw new Error(message);
  }

  const avatar = (data as { avatar?: unknown } | null)?.avatar;
  if (typeof avatar !== "string" || !avatar) {
    throw new Error("O backend não retornou o endereço do avatar.");
  }

  return avatar;
}

export async function updateProfile(profile: ProfilePayload): Promise<UserRecord> {
  const data = await request<AuthResponse>("/profile", {
    method: "PATCH",
    body: JSON.stringify({
      username: profile.username,
      displayName: profile.displayName,
      avatar: profile.avatar || "",
      status: profile.status || "",
    }),
  });

  return requireUser(data);
}

export async function logout(): Promise<void> {
  try {
    await request<{ ok?: boolean }>("/logout", { method: "POST" });
  } finally {
    clearLegacyToken();
  }
}
