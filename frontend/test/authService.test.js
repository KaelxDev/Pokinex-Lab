import test from "node:test";
import assert from "node:assert/strict";

function createResponse(body, { ok = true, status = 200 } = {}) {
  return {
    ok,
    status,
    async json() {
      return body;
    },
  };
}

globalThis.localStorage = { removeItem() {} };

test("auth service exposes typed authentication operations", async () => {
  globalThis.fetch = async () => createResponse({ user: { id: "1", username: "kael" } });
  const auth = await import("../src/services/auth.ts");
  const user = await auth.login("kael", "password123");

  assert.equal(user.id, "1");
  assert.equal(user.username, "kael");
});

test("auth service rejects successful responses without a user payload", async () => {
  globalThis.fetch = async () => createResponse({});
  const auth = await import("../src/services/auth.ts");

  await assert.rejects(
    () => auth.me(),
    /O backend não retornou os dados do usuário\./,
  );
});

test("auth service formats API validation errors", async () => {
  globalThis.fetch = async () =>
    createResponse(
      {
        detail: [
          {
            loc: ["body", "password"],
            msg: "String should have at least 8 characters",
          },
        ],
      },
      { ok: false, status: 422 },
    );

  const auth = await import("../src/services/auth.ts");

  await assert.rejects(
    () => auth.login("kael", "short"),
    /A senha deve conter no mínimo 8 caracteres\./,
  );
});

test("auth service preserves the opaque history cursor contract", async () => {
  const calls = [];
  globalThis.fetch = async (input, init) => {
    calls.push({ input: String(input), init });
    return createResponse({
      messages: [{ messageId: "m1", message: "hello" }],
      nextBefore: "opaque-cursor",
      hasMore: true,
    });
  };

  const auth = await import("../src/services/auth.ts");
  const history = await auth.getMessageHistory(25, "previous-cursor");

  assert.equal(history.nextBefore, "opaque-cursor");
  assert.equal(history.hasMore, true);
  assert.equal(history.messages?.[0]?.messageId, "m1");
  assert.match(calls[0].input, /limit=25/);
  assert.match(calls[0].input, /before=previous-cursor/);
});
