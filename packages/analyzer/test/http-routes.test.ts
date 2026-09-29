import { describe, expect, it } from "vitest";
import { extractHttp } from "../src/extract/http-routes.ts";
import { memoryProject } from "./helpers.ts";

describe("extractHttp (express)", () => {
  const { ctx, evidence, sf } = memoryProject({
    "/src/routes/orders.ts": [
      `import { Router } from "express";`,
      `import { createOrder, getOrder } from "../controllers.js";`,
      `export const orderRouter = Router();`,
      `orderRouter.post("/order", requireAuth, asyncHandler(createOrder));`,
      `orderRouter.get("/order/:id", getOrder);`,
      `orderRouter.route("/depth").get((req, res) => res.json({}));`,
      `const notARouter = { get: (p: string, h: unknown) => {} };`,
      `notARouter.get("/fake", () => {});`,
    ].join("\n"),
    "/src/server.ts": [
      `import express from "express";`,
      `import { orderRouter } from "./routes/orders.js";`,
      `const app = express();`,
      `app.get("/health", (_req, res) => res.json({ ok: true }));`,
      `app.use("/v1", orderRouter);`,
      `app.use(express.json());`,
      `app.listen(3000);`,
    ].join("\n"),
    "/src/controllers.ts": `export const createOrder = () => {}; export const getOrder = () => {};`,
  });

  const orders = extractHttp(sf("/src/routes/orders.ts"), ctx);
  const server = extractHttp(sf("/src/server.ts"), ctx);

  it("finds routes on routers created by express factories", () => {
    expect(orders.routes.map((r) => [r.method, r.path, r.router])).toEqual([
      ["POST", "/order", "src/routes/orders.ts#orderRouter"],
      ["GET", "/order/:id", "src/routes/orders.ts#orderRouter"],
      ["GET", "/depth", "src/routes/orders.ts#orderRouter"],
    ]);
  });

  it("ignores lookalike objects that are not express routers", () => {
    expect(orders.routes.some((r) => r.path === "/fake")).toBe(false);
  });

  it("records handler chains and evidence", () => {
    const post = orders.routes[0]!;
    expect(post.handlers).toEqual(["requireAuth", "asyncHandler(createOrder)"]);
    expect(evidence.get(post.evidenceId)).toMatchObject({ extractor: "http-routes", range: { startLine: 4 }, confidence: 1 });
  });

  it("follows imported routers across files for mounts", () => {
    expect(server.mounts).toEqual([
      expect.objectContaining({ parent: "src/server.ts#app", router: "src/routes/orders.ts#orderRouter", prefix: "/v1" }),
    ]);
  });

  it("detects app routes and listen()", () => {
    expect(server.routes.map((r) => `${r.method} ${r.path}`)).toEqual(["GET /health"]);
    expect(server.listens).toHaveLength(1);
  });
});

describe("extractHttp (fastify)", () => {
  it("handles shorthand, route() and listen()", () => {
    const { ctx, sf } = memoryProject({
      "/api.ts": [
        `import Fastify from "fastify";`,
        `const app = Fastify();`,
        `app.get("/snapshot/:sha", async () => ({}));`,
        `app.route({ method: "DELETE", url: "/x", handler: async () => ({}) });`,
        `await app.listen({ port: 4000 });`,
      ].join("\n"),
    });
    const facts = extractHttp(sf("/api.ts"), ctx);
    expect(facts.routes.map((r) => `${r.method} ${r.path}`)).toEqual(["GET /snapshot/:sha", "DELETE /x"]);
    expect(facts.listens).toHaveLength(1);
  });
});
