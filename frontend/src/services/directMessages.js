import { directMessagesHistoryUrl } from "../config/runtime";

function readResponseData(response) {
  return response.json().catch(() => null);
}

function formatError(detail) {
  if (typeof detail === "string" && detail.trim()) return detail;
  if (Array.isArray(detail)) {
    const message = detail
      .map((item) =>
        typeof item === "string" ? item : item?.msg || item?.message || "",
      )
      .filter(Boolean)
      .join(" ");
    if (message) return message;
  }
  return detail?.message || detail?.msg || "Não foi possível carregar a conversa privada.";
}

export async function getDirectMessageHistory(userId, limit = 50, before = null) {
  let response;
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
  if (!response.ok) throw new Error(formatError(data?.detail));
  return data;
}
