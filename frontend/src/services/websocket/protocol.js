export const WebSocketEventType = Object.freeze({
  MESSAGE: "message",
  DIRECT_MESSAGE: "direct_message",
  DIRECT_MESSAGE_EDIT: "direct_message_edit",
  DIRECT_MESSAGE_DELETE: "direct_message_delete",
  DIRECT_MESSAGE_REACTION: "direct_message_reaction",
  EDIT_MESSAGE: "edit_message",
  DELETE_MESSAGE: "delete_message",
  REACTION: "reaction",
});

export function messagePayload(message, messageId = null, replyTo = null) {
  return {
    type: WebSocketEventType.MESSAGE,
    message,
    messageId,
    ...(replyTo ? { replyTo } : {}),
  };
}

export function directMessagePayload(message, messageId = null, recipientId, replyTo = null) {
  return {
    type: WebSocketEventType.DIRECT_MESSAGE,
    message,
    messageId,
    recipientId,
    replyTo,
  };
}

export function directMessageEditPayload(messageId, message) {
  return {
    type: WebSocketEventType.DIRECT_MESSAGE_EDIT,
    messageId,
    message,
  };
}

export function directMessageDeletePayload(messageId) {
  return {
    type: WebSocketEventType.DIRECT_MESSAGE_DELETE,
    messageId,
  };
}

export function directMessageReactionPayload(messageId, reaction) {
  return {
    type: WebSocketEventType.DIRECT_MESSAGE_REACTION,
    messageId,
    reaction,
  };
}

export function editMessagePayload(messageId, message) {
  return {
    type: WebSocketEventType.EDIT_MESSAGE,
    messageId,
    message,
  };
}

export function deleteMessagePayload(messageId) {
  return {
    type: WebSocketEventType.DELETE_MESSAGE,
    messageId,
  };
}

export function reactionPayload(messageId, reaction) {
  return {
    type: WebSocketEventType.REACTION,
    messageId,
    reaction,
  };
}
