import type { ChatMessage } from "../types/chat";
import { directMessagesHistoryUrl } from "../config/runtime.ts";

interface ApiErrorItem {
  msg?: string;
  message?: string;
}

export interface DirectMessage extends ChatMessage {
  type?: "direct_message" | string;
  senderId?: string | number;
  recipientId?: string | number;
}

export interface DirectMessageHistoryResponse {
  messages?: DirectMessage[];
  nextBefore?: string | null;
  hasMore?: boolean;
}

function formatError(detail: unknown): string {
  if (typeof detail === "string" && detail.trim()) {
    return detail;
  }

  if (Array.isArray(detail)) {
    const message = detail
      .map((item: unknown) => {
        if (typeof item === "string") return item;
        if (item && typeof item === "object") {
          const value = item as ApiErrorItem;
          return value.msg || value.message || "";
        }
        return "";
      })
      .filter(Boolean)
      .join(" ");

    if (message) return message;
  }

  if (detail && typeof detail === "object") {
    const value = detail as ApiErrorItem;
    return value.message || value.msg || "Não foi possível carregar a conversa privada.";
  }

  return "Não foi possível carregar a conversa privada.";
}

async function readResponseData(response: Response): Promise<unknown> {
  try {
    return await response.json();
  } catch {
    return null;
  }
}

export async function getDirectMessageHistory(
  userId: string | number,
  limit = 50,
  before: string | null = null,
): Promise<DirectMessageHistoryResponse> {
  let response: Response;

  try {
    response = await fetch(
      directMessagesHistoryUrl(userId, { limit, before }),
      { credentials: "include" },
    );
  } catch (error) {
    console.error("Falha ao carregar conversa privada:", error);
    throw new Error("Não foi possível conectar ao backend.");
  }

  const data = await readResponseData(response);

  if (!response.ok) {
    throw new Error(formatError((data as { detail?: unknown } | null)?.detail));
  }

  const payload = (data || {}) as DirectMessageHistoryResponse;
  return {
    messages: Array.isArray(payload.messages) ? payload.messages : [],
    nextBefore: payload.nextBefore ?? null,
    hasMore: Boolean(payload.hasMore),
  };
}
