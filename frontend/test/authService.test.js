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

async function loadAuthService() {
  globalThis.localStorage = {
    removeItem() {},
  };
  globalThis.fetch = async () => createResponse({ user: { id: "1", username: "kael" } });
  return import("../src/services/auth.ts");
}

test("auth service exposes typed authentication operations", async () => {
  const auth = await loadAuthService();
  const user = await auth.login("kael", "password123");

  assert.equal(user.id, "1");
  assert.equal(user.username, "kael");
});

test("auth service rejects successful responses without a user payload", async () => {
  globalThis.localStorage = { removeItem() {} };
  globalThis.fetch = async () => createResponse({});
  const auth = await import("../src/services/auth.ts?missing-user");

  await assert.rejects(
    () => auth.me(),
    /O backend não retornou os dados do usuário\./,
  );
});

test("auth service formats API validation errors", async () => {
  globalThis.localStorage = { removeItem() {} };
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

  const auth = await import("../src/services/auth.ts?validation-error");

  await assert.rejects(
    () => auth.login("kael", "short"),
    /A senha deve conter no mínimo 8 caracteres\./,
  );
});
