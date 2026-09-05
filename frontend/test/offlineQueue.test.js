import test from "node:test";
import assert from "node:assert/strict";
import { sendQueuedMessage } from "../src/hooks/chat/useOfflineQueue.js";

function createSocketSpy() {
  return {
    replies: [],
    messages: [],
    sendReplyMessage(...args) {
      this.replies.push(args);
      return true;
    },
    sendMessage(...args) {
      this.messages.push(args);
      return true;
    },
  };
}

test("sendQueuedMessage preserves reply target when flushing a reply", () => {
  const socket = createSocketSpy();
  const item = {
    id: "queued-1",
    type: "message",
    message: "offline reply",
    replyTo: { messageId: "original-1" },
  };

  assert.equal(sendQueuedMessage(socket, item), true);
  assert.deepEqual(socket.replies, [["offline reply", "queued-1", "original-1"]]);
  assert.deepEqual(socket.messages, []);
});

test("sendQueuedMessage sends normal messages through sendMessage", () => {
  const socket = createSocketSpy();
  const item = {
    id: "queued-2",
    type: "message",
    message: "offline message",
  };

  assert.equal(sendQueuedMessage(socket, item), true);
  assert.deepEqual(socket.messages, [["offline message", "queued-2"]]);
  assert.deepEqual(socket.replies, []);
});

test("sendQueuedMessage fails safely without a socket or item", () => {
  assert.equal(sendQueuedMessage(null, { id: "x", message: "hello" }), false);
  assert.equal(sendQueuedMessage(createSocketSpy(), null), false);
});
