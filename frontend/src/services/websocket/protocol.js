/** @typedef {import("../../types/websocket").MessageId} MessageId */
/** @typedef {import("../../types/websocket").ReplyTo} ReplyTo */
/** @typedef {import("../../types/websocket").MessagePayload} MessagePayload */
/** @typedef {import("../../types/websocket").DirectMessagePayload} DirectMessagePayload */

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

/**
 * @param {string} message
 * @param {MessageId | null} [messageId]
 * @param {ReplyTo | null} [replyTo]
 * @returns {MessagePayload}
 */
export function messagePayload(message, messageId = null, replyTo = null) {
  return {
    type: WebSocketEventType.MESSAGE,
    message,
    messageId,
    ...(replyTo ? { replyTo } : {}),
  };
}

/**
 * @param {string} message
 * @param {MessageId | null} messageId
 * @param {number} recipientId
 * @param {ReplyTo | null} [replyTo]
 * @returns {DirectMessagePayload}
 */
export function directMessagePayload(message, messageId = null, recipientId, replyTo = null) {
  return {
    type: WebSocketEventType.DIRECT_MESSAGE,
    message,
    messageId,
    recipientId,
    replyTo,
  };
}

/**
 * @param {MessageId} messageId
 * @param {string} message
 */
export function directMessageEditPayload(messageId, message) {
  return {
    type: WebSocketEventType.DIRECT_MESSAGE_EDIT,
    messageId,
    message,
  };
}

/** @param {MessageId} messageId */
export function directMessageDeletePayload(messageId) {
  return {
    type: WebSocketEventType.DIRECT_MESSAGE_DELETE,
    messageId,
  };
}

/**
 * @param {MessageId} messageId
 * @param {string} reaction
 */
export function directMessageReactionPayload(messageId, reaction) {
  return {
    type: WebSocketEventType.DIRECT_MESSAGE_REACTION,
    messageId,
    reaction,
  };
}

/**
 * @param {MessageId} messageId
 * @param {string} message
 */
export function editMessagePayload(messageId, message) {
  return {
    type: WebSocketEventType.EDIT_MESSAGE,
    messageId,
    message,
  };
}

/** @param {MessageId} messageId */
export function deleteMessagePayload(messageId) {
  return {
    type: WebSocketEventType.DELETE_MESSAGE,
    messageId,
  };
}

/**
 * @param {MessageId} messageId
 * @param {string} reaction
 */
export function reactionPayload(messageId, reaction) {
  return {
    type: WebSocketEventType.REACTION,
    messageId,
    reaction,
  };
}
