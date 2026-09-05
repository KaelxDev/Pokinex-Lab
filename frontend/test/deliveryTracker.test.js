import test from "node:test";
import assert from "node:assert/strict";
import { DeliveryTracker } from "../src/services/websocket/deliveryTracker.ts";

function createLocalStorage(seed = {}) {
  const values = new Map(Object.entries(seed));
  return {
    get length() {
      return values.size;
    },
    key(index) {
      return [...values.keys()][index] ?? null;
    },
    getItem(key) {
      return values.has(key) ? values.get(key) : null;
    },
    setItem(key, value) {
      values.set(key, String(value));
    },
    removeItem(key) {
      values.delete(key);
    },
  };
}

test("remember tracks pending message IDs and forget removes them", () => {
  const tracker = new DeliveryTracker({ timeoutMs: 1000 });
  tracker.remember({ messageId: "m1", message: "hello" });
  tracker.remember({ messageId: "m2", message: "world" });

  assert.deepEqual(tracker.ids, ["m1", "m2"]);

  tracker.forget("m1");
  assert.deepEqual(tracker.ids, ["m2"]);
  tracker.clear();
});

test("duplicate remember replaces the previous pending position", () => {
  const tracker = new DeliveryTracker({ timeoutMs: 1000 });
  tracker.remember({ messageId: "m1", message: "first" });
  tracker.remember({ messageId: "m2", message: "second" });
  tracker.remember({ messageId: "m1", message: "updated" });

  assert.deepEqual(tracker.ids, ["m2", "m1"]);
  tracker.clear();
});

test("delivery timeout reports the original message and reply target", async () => {
  const failures = [];
  const tracker = new DeliveryTracker({
    timeoutMs: 5,
    onFailed: (event) => failures.push(event),
  });
  const replyTo = "original-1";

  tracker.remember({ messageId: "m1", message: "reply", replyTo });
  await new Promise((resolve) => setTimeout(resolve, 20));

  assert.deepEqual(failures, [{
    type: "delivery_failed",
    messageId: "m1",
    message: "reply",
    replyTo,
  }]);
  assert.deepEqual(tracker.ids, []);
});

test("rejectOldest returns and removes the oldest message", () => {
  const tracker = new DeliveryTracker({ timeoutMs: 1000 });
  tracker.remember({ messageId: "m1" });
  tracker.remember({ messageId: "m2" });

  assert.equal(tracker.rejectOldest(), "m1");
  assert.deepEqual(tracker.ids, ["m2"]);
  tracker.clear();
});

test("cached message IDs are merged with pending IDs", () => {
  const previousStorage = globalThis.localStorage;
  globalThis.localStorage = createLocalStorage({
    "poknex_messages": JSON.stringify([{ messageId: "cached-1" }, { messageId: "cached-2" }]),
    "other_key": JSON.stringify([{ messageId: "ignored" }]),
  });

  try {
    const tracker = new DeliveryTracker({ timeoutMs: 1000 });
    tracker.remember({ messageId: "pending-1" });
    assert.deepEqual(
      new Set(tracker.readCachedMessageIds()),
      new Set(["cached-1", "cached-2", "pending-1"]),
    );
    tracker.clear();
  } finally {
    globalThis.localStorage = previousStorage;
  }
});

test("clear cancels delivery tracking", async () => {
  const failures = [];
  const tracker = new DeliveryTracker({
    timeoutMs: 5,
    onFailed: (event) => failures.push(event),
  });

  tracker.remember({ messageId: "m1", message: "hello" });
  tracker.clear();
  await new Promise((resolve) => setTimeout(resolve, 20));

  assert.deepEqual(failures, []);
  assert.deepEqual(tracker.ids, []);
});
