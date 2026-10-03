// Reproduction for the SEEDED bug of the recall-dev-session-expiry dev task. Copied into
// recall-backend/test/ only while the harness reproduces and verifies; the agent never sees it.
// A token whose expiry has passed must be refused; a current one still works.
import { afterAll, beforeAll, expect, test } from "bun:test";
import jwt from "jsonwebtoken";
import { createTestApp, type TestApp } from "./helpers/app";

let t: TestApp;

beforeAll(async () => {
  t = await createTestApp();
});

afterAll(async () => {
  await t.close();
});

test("an expired sign-in token is refused", async () => {
  const { userId, token } = await t.createUser("ada");
  const expired = jwt.sign({ userId, exp: Math.floor(Date.now() / 1000) - 2 * 24 * 3600 }, process.env.JWT_SECRET!);

  expect((await t.request("GET", "/api/v1/content", { token })).status).toBe(200);
  expect((await t.request("GET", "/api/v1/content", { token: expired })).status).toBe(401);
});
