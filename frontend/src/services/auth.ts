import * as auth from "./auth.js";

export interface MessageHistoryResponse {
  messages?: unknown;
  nextBefore?: string | null;
  hasMore?: boolean;
}

export async function getMessageHistory(
  limit = 50,
  before: string | null = null,
): Promise<MessageHistoryResponse> {
  return (await auth.getMessageHistory(limit, before)) as MessageHistoryResponse;
}
