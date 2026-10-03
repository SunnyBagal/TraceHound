// Reproduction for the SEEDED bug of the recall-dev-short-summary dev task. Copied into
// recall-backend/test/ only while the harness reproduces and verifies; the agent never sees it.
// A short page is saved through the API, its queued job is processed, and the API's list must
// show the summary and tags.
import { afterAll, afterEach, beforeAll, expect, test } from "bun:test";
import { processContent } from "../worker";
import { createTestApp, fakeSummarizer, type TestApp } from "./helpers/app";
import { htmlResponse, restoreFetch, stubFetch } from "./helpers/network";

const SHORT_PAGE = `<!doctype html><html><head>
  <meta property="og:title" content="Postgres tips">
  <meta property="og:description" content="Three habits that keep a Postgres database fast.">
</head><body><p>Vacuum often.</p></body></html>`;

let t: TestApp;

beforeAll(async () => {
  t = await createTestApp();
});

afterEach(() => {
  restoreFetch();
});

afterAll(async () => {
  await t.close();
});

test("a short saved page gets a summary and tags once its job is processed", async () => {
  const { token } = await t.createUser("ada");
  stubFetch(() => htmlResponse(SHORT_PAGE));
  const created = await t.request("POST", "/api/v1/content", { token, body: { link: "https://notes.example/postgres-tips" } });
  expect(created.status).toBe(201);
  expect(t.queue.calls).toHaveLength(1);

  const summarizer = fakeSummarizer({ summary: "Keep Postgres fast.", tags: ["database"] });
  await processContent(
    { data: t.queue.calls[0]!.data, attemptsMade: 0 },
    { db: t.db, generateSummaryAndTags: summarizer.generateSummaryAndTags, generateEmbedding: t.embedding.generateEmbedding },
  );

  const list = await t.request("GET", "/api/v1/content", { token });
  expect(list.body.content).toHaveLength(1);
  expect(list.body.content[0]).toMatchObject({ processingStatus: "done", summary: "Keep Postgres fast.", tags: ["database"] });
});
