import { expect, test } from "@playwright/test";

const BACKEND_URL = process.env.E2E_BACKEND_URL || "http://127.0.0.1:8000";
const API_URL = process.env.E2E_API_URL || `${BACKEND_URL}/api/auth`;
const TEST_PASSWORD = "Playwright#2026!";

function uniqueUsername(prefix) {
  const suffix = `${Date.now().toString(36).slice(-7)}${Math.floor(Math.random() * 36).toString(36)}`;
  return `${prefix}${suffix}`.slice(0, 20);
}

async function createTestUser(request, prefix) {
  const username = uniqueUsername(prefix);
  const response = await request.post(`${API_URL}/register`, {
    data: {
      username,
      password: TEST_PASSWORD,
    },
  });

  const body = await response.json().catch(() => null);
  expect(response.status(), JSON.stringify(body)).toBe(201);

  return {
    id: body.user.id,
    username,
  };
}

async function login(page, account) {
  await page.goto("/");
  await expect(page.getByRole("heading", { name: "Entrar no Pokinex" })).toBeVisible();
  await page.getByLabel("Username").fill(account.username);
  await page.getByLabel("Senha").fill(TEST_PASSWORD);
  await page.getByRole("button", { name: "Entrar" }).click();
  await expect(page.locator(".channel-name")).toHaveText("geral");
  await expect(page.locator(".connection-online")).toBeVisible();
}

test("login → chat → mensagem → editar/reagir → reconectar → DM", async ({ browser, page, request }) => {
  test.setTimeout(120_000);

  const sender = await createTestUser(request, "e2ea");
  const recipient = await createTestUser(request, "e2eb");
  const recipientPage = await browser.newPage();

  try {
    await login(page, sender);
    await login(recipientPage, recipient);

    const recipientTrigger = page.locator(
      `.user-dm-trigger[data-dm-user-id="${recipient.id}"]`,
    );
    await expect(recipientTrigger).toBeVisible({ timeout: 15_000 });

    const publicMessage = `E2E público ${Date.now()}`;
    const editedMessage = `${publicMessage} editada`;
    const composer = page.getByRole("textbox", { name: "Digite sua mensagem" });

    await composer.fill(publicMessage);
    await composer.press("Enter");

    const publicMessageNode = page.locator(".message.mine").filter({ hasText: publicMessage }).last();
    await expect(publicMessageNode).toBeVisible();
    await expect(publicMessageNode.locator(".message-meta")).toContainText("Enviada");

    await publicMessageNode.locator(".message-row").click({ button: "right" });
    await page.getByRole("menuitem", { name: /Editar/ }).click();
    await page.locator(".message-edit-form textarea").fill(editedMessage);
    await page.locator(".message-edit-form").getByRole("button", { name: "Salvar" }).click();

    const editedNode = page.locator(".message.mine").filter({ hasText: editedMessage }).last();
    await expect(editedNode).toBeVisible();
    await expect(editedNode.locator(".message-meta")).toContainText("editada");

    await editedNode.getByRole("button", { name: "＋ Reagir" }).click();
    await page.getByRole("button", { name: "Reagir com ❤️" }).click();
    await expect(editedNode.locator(".message-reaction").filter({ hasText: "❤️" })).toBeVisible();

    const disconnectResponse = await request.post(`${BACKEND_URL}/__e2e__/disconnect/${sender.id}`);
    const disconnectBody = await disconnectResponse.json().catch(() => null);
    expect(disconnectResponse.status(), JSON.stringify(disconnectBody)).toBe(200);
    expect(disconnectBody.closed).toBeGreaterThan(0);

    await expect(page.locator(".connection-reconnecting")).toBeVisible({ timeout: 15_000 });
    await expect(page.locator(".connection-online")).toBeVisible({ timeout: 30_000 });
    await expect(page.locator(".message.mine").filter({ hasText: editedMessage })).toBeVisible();

    await recipientTrigger.click();

    const dm = page.locator(".private-dm-overlay");
    await expect(dm).toBeVisible();
    await expect(dm.getByText(`@${recipient.username}`)).toBeVisible();
    const dmInput = page.getByRole("textbox", { name: "Digite sua mensagem privada" });
    await expect(dmInput).toBeEnabled();

    const directMessage = `E2E privado ${Date.now()}`;
    await dmInput.fill(directMessage);
    await dmInput.press("Enter");
    await expect(dm.locator(".private-dm-message.mine").filter({ hasText: directMessage })).toBeVisible();

    const senderTriggerOnRecipient = recipientPage.locator(
      `.user-dm-trigger[data-dm-user-id="${sender.id}"]`,
    );
    await expect(senderTriggerOnRecipient).toBeVisible({ timeout: 15_000 });
    await senderTriggerOnRecipient.click();

    const recipientDm = recipientPage.locator(".private-dm-overlay");
    await expect(recipientDm).toBeVisible();
    await expect(recipientDm.locator(".private-dm-message").filter({ hasText: directMessage })).toBeVisible();
  } finally {
    await recipientPage.close();
  }
});
