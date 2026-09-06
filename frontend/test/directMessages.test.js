import test from "node:test";
import assert from "node:assert/strict";

globalThis.window = {
  location: {
    hostname: "localhost",
  },
};

globalThis.localStorage = {
  removeItem() {},
};

function createResponse(body, { ok = true, status = 200 } = {}) {
  return {
    ok,
    status,
    async json() {
      return body;
    },
  };
}

test("direct message service returns typed history and preserves cursor", async () => {
  const calls = [];
  globalThis.fetch = async (input, init) => {
    calls.push({ input: String(input), init });
    return createResponse({
      messages: [
        {
          type: "direct_message",
          messageId: "dm-1",
          senderId: "10",
          recipientId: "20",
          message: "hello",
        },
      ],
      nextBefore: "cursor-2",
      hasMore: true,
    });
  };

  const service = await import("../src/services/directMessages.ts");
  const history = await service.getDirectMessageHistory(20, 25, "cursor-1");

  assert.equal(history.messages?.[0]?.messageId, "dm-1");
  assert.equal(history.messages?.[0]?.senderId, "10");
  assert.equal(history.nextBefore, "cursor-2");
  assert.equal(history.hasMore, true);
  assert.match(calls[0].input, /\/api\/messages\/direct\/20\?/);
  assert.match(calls[0].input, /limit=25/);
  assert.match(calls[0].input, /before=cursor-1/);
  assert.equal(calls[0].init.credentials, "include");
});

test("direct message service normalizes an empty history response", async () => {
  globalThis.fetch = async () => createResponse({});
  const service = await import("../src/services/directMessages.ts?empty");

  const history = await service.getDirectMessageHistory("20");

  assert.deepEqual(history.messages, []);
  assert.equal(history.nextBefore, null);
  assert.equal(history.hasMore, false);
});

test("direct message service surfaces API errors", async () => {
  globalThis.fetch = async () =>
    createResponse(
      {
        detail: [{ msg: "Conversa não encontrada" }],
      },
      { ok: false, status: 404 },
    );

  const service = await import("../src/services/directMessages.ts?api-error");

  await assert.rejects(
    () => service.getDirectMessageHistory(20),
    /Conversa não encontrada/,
  );
});

test("direct message service reports connection failures", async () => {
  globalThis.fetch = async () => {
    throw new Error("network down");
  };

  const service = await import("../src/services/directMessages.ts?network-error");

  await assert.rejects(
    () => service.getDirectMessageHistory(20),
    /Não foi possível conectar ao backend\./,
  );
});
