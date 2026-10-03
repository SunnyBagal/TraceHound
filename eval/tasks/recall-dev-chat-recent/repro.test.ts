// Reproduction for the SEEDED bug of the recall-dev-chat-recent dev task. Copied into
// recall-backend/test/ only while the harness reproduces and verifies; the agent never sees it.
// With no embedding available, Ask AI must cite the five most recently saved items, newest first.
import { afterAll, beforeAll, expect, test } from "bun:test";
import { contents } from "../db/schema";
import { createTestApp, fakeAnthropic, type TestApp } from "./helpers/app";

let t: TestApp;

beforeAll(async () => {
  t = await createTestApp({ anthropic: fakeAnthropic({ streamText: ["ok"] }) });
});

afterAll(async () => {
  await t.close();
});

test("without an embedding, chat cites the five most recently saved items", async () => {
  const { userId, token } = await t.createUser("ada");
  const day = 24 * 3600 * 1000;
  await t.db.insert(contents).values(
    [1, 2, 3, 4, 5, 6, 7].map((n) => ({ userId, link: `https://n${n}.example`, title: `Note ${n}`, type: "article", createdAt: new Date(Date.UTC(2026, 0, n) + day) })),
  );

  const res = await t.request("POST", "/api/v1/chat", { token, body: { message: "what did I save lately?" } });

  expect(res.status).toBe(200);
  const first = JSON.parse(res.text.split("\n\n")[0]!.replace(/^data: /, ""));
  expect(first.type).toBe("citations");
  expect(first.citations.map((c: { title: string }) => c.title)).toEqual(["Note 7", "Note 6", "Note 5", "Note 4", "Note 3"]);
});
