import * as auth from "./auth.js";
import type { ChatMessage, UserRecord } from "../types/chat";

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

export function clearLegacyToken(): void {
  auth.clearLegacyToken();
}

export async function register(username: string, password: string): Promise<UserRecord | undefined> {
  return auth.register(username, password) as Promise<UserRecord | undefined>;
}

export async function login(username: string, password: string): Promise<UserRecord | undefined> {
  return auth.login(username, password) as Promise<UserRecord | undefined>;
}

export async function me(): Promise<UserRecord> {
  return auth.me() as Promise<UserRecord>;
}

export async function getPublicProfile(userId: string | number): Promise<UserRecord> {
  return auth.getPublicProfile(userId) as Promise<UserRecord>;
}

export async function getMessageHistory(
  limit = 50,
  before: string | null = null,
): Promise<MessageHistoryResponse> {
  return (await auth.getMessageHistory(limit, before)) as MessageHistoryResponse;
}

export async function uploadAvatar(file: File): Promise<string> {
  return auth.uploadAvatar(file);
}

export async function updateProfile(profile: ProfilePayload): Promise<UserRecord> {
  return auth.updateProfile(profile) as Promise<UserRecord>;
}

export async function logout(): Promise<void> {
  await auth.logout();
}
