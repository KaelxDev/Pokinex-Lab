import test from "node:test";
import assert from "node:assert/strict";

globalThis.window = {
  location: {
    hostname: "localhost",
  },
};

test("runtime selects local endpoints on localhost", async () => {
  const runtime = await import("../src/config/runtime.ts?local");

  assert.equal(runtime.API_URL, "http://localhost:8000/api/auth");
  assert.equal(runtime.WS_URL, "ws://localhost:8000/ws");
});

test("runtime builds the public history URL", async () => {
  const runtime = await import("../src/config/runtime.ts?history");

  assert.equal(
    runtime.messagesHistoryUrl(),
    "http://localhost:8000/api/messages",
  );
});

test("runtime encodes direct-message ids and preserves cursor parameters", async () => {
  const runtime = await import("../src/config/runtime.ts?direct");

  const url = runtime.directMessagesHistoryUrl("user/42", {
    limit: 25,
    before: "cursor-abc",
  });

  assert.equal(
    url,
    "http://localhost:8000/api/messages/direct/user%2F42?limit=25&before=cursor-abc",
  );
});
