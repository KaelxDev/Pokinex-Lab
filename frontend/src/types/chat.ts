import type { MessageId } from "./websocket";

export interface UserRecord {
  id?: string | number;
  username?: string;
  displayName?: string;
  avatar?: string;
  status?: string;
  online?: boolean;
  role?: string;
  [key: string]: unknown;
}

export interface ReplyTarget {
  messageId: MessageId;
  userId?: string | number;
  username?: string;
  displayName?: string;
  message?: string;
  deleted?: boolean;
}

export interface ChatMessage {
  type?: string;
  messageId?: MessageId;
  userId?: string | number;
  username?: string;
  displayName?: string;
  message?: string;
  timestamp?: number | string;
  avatar?: string;
  status?: string;
  role?: string;
  ephemeral?: boolean;
  offline?: boolean;
  deliveryStatus?: string;
  replyTo?: ReplyTarget | MessageId | null;
  [key: string]: unknown;
}

export interface OfflineQueueItem extends ChatMessage {
  id: string;
  type: "message";
  message: string;
  createdAt: number;
}

export interface ContextMenuState {
  x?: number;
  y?: number;
  message?: ChatMessage;
  isMine?: boolean;
  [key: string]: unknown;
}
