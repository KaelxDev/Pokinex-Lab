import test from "node:test";
import assert from "node:assert/strict";
import {
  WebSocketEventType,
  messagePayload,
  directMessagePayload,
  directMessageEditPayload,
  directMessageDeletePayload,
  directMessageReactionPayload,
  editMessagePayload,
  deleteMessagePayload,
  reactionPayload,
} from "../src/services/websocket/protocol.js";

test("protocol exposes the expected websocket event types", () => {
  assert.deepEqual(WebSocketEventType, {
    MESSAGE: "message",
    DIRECT_MESSAGE: "direct_message",
    DIRECT_MESSAGE_EDIT: "direct_message_edit",
    DIRECT_MESSAGE_DELETE: "direct_message_delete",
    DIRECT_MESSAGE_REACTION: "direct_message_reaction",
    EDIT_MESSAGE: "edit_message",
    DELETE_MESSAGE: "delete_message",
    REACTION: "reaction",
  });
});

test("messagePayload omits replyTo when absent", () => {
  assert.deepEqual(messagePayload("hello", "m1"), {
    type: "message",
    message: "hello",
    messageId: "m1",
  });
});

test("messagePayload preserves replyTo metadata", () => {
  const replyTo = { messageId: "original-1", username: "kael" };
  assert.deepEqual(messagePayload("reply", "m2", replyTo), {
    type: "message",
    message: "reply",
    messageId: "m2",
    replyTo,
  });
});

test("direct message payload builders preserve their contracts", () => {
  assert.deepEqual(directMessagePayload("hi", "dm1", 42, { messageId: "m1" }), {
    type: "direct_message",
    message: "hi",
    messageId: "dm1",
    recipientId: 42,
    replyTo: { messageId: "m1" },
  });
  assert.deepEqual(directMessageEditPayload("dm1", "updated"), {
    type: "direct_message_edit",
    messageId: "dm1",
    message: "updated",
  });
  assert.deepEqual(directMessageDeletePayload("dm1"), {
    type: "direct_message_delete",
    messageId: "dm1",
  });
  assert.deepEqual(directMessageReactionPayload("dm1", "❤️"), {
    type: "direct_message_reaction",
    messageId: "dm1",
    reaction: "❤️",
  });
});

test("public message mutation payload builders preserve their contracts", () => {
  assert.deepEqual(editMessagePayload("m1", "updated"), {
    type: "edit_message",
    messageId: "m1",
    message: "updated",
  });
  assert.deepEqual(deleteMessagePayload("m1"), {
    type: "delete_message",
    messageId: "m1",
  });
  assert.deepEqual(reactionPayload("m1", "👍"), {
    type: "reaction",
    messageId: "m1",
    reaction: "👍",
  });
});
