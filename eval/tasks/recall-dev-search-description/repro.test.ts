// Reproduction for the SEEDED bug of the recall-dev-search-description dev task. Copied into
// recall-backend/test/ only while the harness reproduces and verifies; the agent never sees it.
// Keyword search (no embedding available) must find a word that only a saved link's description
// contains.
import { afterAll, beforeAll, expect, test } from "bun:test";
import { contents } from "../db/schema";
import { createTestApp, type TestApp } from "./helpers/app";

let t: TestApp;

beforeAll(async () => {
  t = await createTestApp();
});

afterAll(async () => {
  await t.close();
});

test("searching for a word that only appears in a saved link's description finds it", async () => {
  const { userId, token } = await t.createUser("ada");
  await t.db.insert(contents).values([
    { userId, link: "https://a.example", title: "Weekend reading", ogDescription: "Notes on running Kubernetes clusters cheaply." },
    { userId, link: "https://b.example", title: "React hooks" },
  ]);

  const res = await t.request("GET", "/api/v1/search?q=kubernetes", { token });

  expect(res.status).toBe(200);
  expect(res.body.results.map((r: { title: string }) => r.title)).toEqual(["Weekend reading"]);
});
