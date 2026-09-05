import type {
  DirectMessagePayload,
  MessageId,
  MessagePayload,
  ReplyTo,
} from "../../types/websocket";

export const WebSocketEventType = Object.freeze({
  MESSAGE: "message",
  DIRECT_MESSAGE: "direct_message",
  DIRECT_MESSAGE_EDIT: "direct_message_edit",
  DIRECT_MESSAGE_DELETE: "direct_message_delete",
  DIRECT_MESSAGE_REACTION: "direct_message_reaction",
  EDIT_MESSAGE: "edit_message",
  DELETE_MESSAGE: "delete_message",
  REACTION: "reaction",
} as const);

export function messagePayload(
  message: string,
  messageId: MessageId | null = null,
  replyTo: ReplyTo | null = null,
): MessagePayload {
  return {
    type: WebSocketEventType.MESSAGE,
    message,
    messageId,
    ...(replyTo ? { replyTo } : {}),
  };
}

export function directMessagePayload(
  message: string,
  messageId: MessageId | null = null,
  recipientId: number,
  replyTo: ReplyTo | null = null,
): DirectMessagePayload {
  return {
    type: WebSocketEventType.DIRECT_MESSAGE,
    message,
    messageId,
    recipientId,
    replyTo,
  };
}

export function directMessageEditPayload(messageId: MessageId, message: string) {
  return {
    type: WebSocketEventType.DIRECT_MESSAGE_EDIT,
    messageId,
    message,
  };
}

export function directMessageDeletePayload(messageId: MessageId) {
  return {
    type: WebSocketEventType.DIRECT_MESSAGE_DELETE,
    messageId,
  };
}

export function directMessageReactionPayload(messageId: MessageId, reaction: string) {
  return {
    type: WebSocketEventType.DIRECT_MESSAGE_REACTION,
    messageId,
    reaction,
  };
}

export function editMessagePayload(messageId: MessageId, message: string) {
  return {
    type: WebSocketEventType.EDIT_MESSAGE,
    messageId,
    message,
  };
}

export function deleteMessagePayload(messageId: MessageId) {
  return {
    type: WebSocketEventType.DELETE_MESSAGE,
    messageId,
  };
}

export function reactionPayload(messageId: MessageId, reaction: string) {
  return {
    type: WebSocketEventType.REACTION,
    messageId,
    reaction,
  };
}
