import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { LexicalDecider, LOCALIZER_SYSTEM_PROMPT, NemotronDecider } from "../src/agent/decider.ts";
import { buildContext } from "../src/agent/context.ts";
import type { Snapshot } from "../src/schema.ts";
import { makeFixtureRepo } from "./fixture-repo.ts";
import { fakeClient } from "./helpers.ts";

// Fixture: api:api-app, orders, queue-client, notifier, redis:redis-url, worker:worker-worker
let snapshot: Snapshot;
let cleanup: () => void;
beforeAll(() => {
  const made = makeFixtureRepo();
  cleanup = made.cleanup;
  // pretend a naming pass ran: this text must never reach the localizer prompt
  snapshot = {
    ...made.snapshot,
    components: made.snapshot.components.map((c) =>
      c.id === "worker:worker-worker" ? { ...c, name: "Zebra Quantum Dispatcher", summary: "Magically handles every order forever.", naming: { ...c.naming, source: "llm" as const, model: "m" } } : c,
    ),
  };
});
afterAll(() => cleanup());

/** Fake Token Factory: returns the scripted `content`s in order and records every request body. */
function scripted(contents: string[]) {
  const bodies: { messages: { role: string; content: string }[]; temperature: number; model: string; chat_template_kwargs?: unknown }[] = [];
  const impl = (async (_url: string, init: { body: string }) => {
    bodies.push(JSON.parse(init.body));
    const content = contents.shift() ?? "";
    return new Response(JSON.stringify({ choices: [{ message: { content } }], usage: { prompt_tokens: 1000, completion_tokens: 40, total_tokens: 1040 } }));
  }) as unknown as typeof fetch;
  const { client, ledger } = fakeClient(impl);
  const logs: string[] = [];
  return { decider: new NemotronDecider(client, { log: (l) => logs.push(l) }), bodies, ledger, logs };
}
const reply = (...ids: string[]) => JSON.stringify({ ranking: ids.map((id) => ({ componentId: id, reason: `facts point at ${id}` })) });
const issue = "handleOrder times out after placing an order";

describe("LexicalDecider", () => {
  it("is ranking v1 unchanged: top k with score > 0, no model usage", async () => {
    const r = await new LexicalDecider().decide({ issue, snapshot, k: 3 });
    expect(r.decider).toBe("lexical");
    expect(r.ranking[0]).toMatchObject({ componentId: "orders" });
    expect(r.ranking[0]!.reason).toMatch(/^score 3\.71: matched "handle" in symbol handleOrder/);
    expect(r.usage.calls).toBe(0);
  });
});

describe("NemotronDecider (fake client)", () => {
  it("valid output: validated ranking, Nano, temperature 0, reasoning off, usage from the API, ledgered", async () => {
    const { decider, bodies, ledger } = scripted([reply("orders", "queue-client", "worker:worker-worker")]);
    const r = await decider.decide({ issue, snapshot, k: 3 });
    expect(r).toMatchObject({ decider: "nemotron", model: "nvidia/NVIDIA-Nemotron-3-Nano-30B-A3B" });
    expect(r.ranking.map((x) => x.componentId)).toEqual(["orders", "queue-client", "worker:worker-worker"]);
    expect(r.fallback).toBeUndefined();
    expect(bodies[0]).toMatchObject({ model: "nvidia/NVIDIA-Nemotron-3-Nano-30B-A3B", temperature: 0, chat_template_kwargs: { enable_thinking: false } });
    expect(r.usage).toMatchObject({ calls: 1, inputTokens: 1000, outputTokens: 40 });
    expect(ledger.entries().map((e) => e.purpose)).toEqual(["localizer"]);
  });

  it("invalid JSON → one retry (with the error) → still invalid → lexical fallback, logged", async () => {
    const { decider, bodies, logs } = scripted(["Sure! The answer is orders.", "```json\n" + reply("orders") + "\n```"]);
    const r = await decider.decide({ issue, snapshot, k: 3 });
    expect(bodies).toHaveLength(2);
    expect(bodies[1]!.messages.at(-1)!.content).toMatch(/^Your reply was invalid: invalid JSON/);
    expect(r.decider).toBe("lexical (nemotron fallback)");
    expect(r.fallback).toMatch(/^nemotron fallback: invalid JSON/);
    expect(r.ranking).toEqual((await new LexicalDecider().decide({ issue, snapshot, k: 3 })).ranking); // entirely lexical, not mixed
    expect(logs.at(-1)).toMatch(/nemotron fallback: invalid JSON:.*using the lexical ranking/);
    expect(r.usage.calls).toBe(2);
  });

  it("unknown id → retry → unknown again → lexical fallback", async () => {
    const { decider } = scripted([reply("orders", "payments", "worker:worker-worker"), reply("orders", "payments", "queue-client")]);
    const r = await decider.decide({ issue, snapshot, k: 3 });
    expect(r.fallback).toBe('nemotron fallback: unknown component id "payments"');
    expect(r.decider).toBe("lexical (nemotron fallback)");
  });

  it("a bad first reply fixed by the retry is used (not a fallback)", async () => {
    const { decider } = scripted([reply("orders"), reply("orders", "queue-client", "redis:redis-url")]);
    const r = await decider.decide({ issue, snapshot, k: 3 });
    expect(r).toMatchObject({ decider: "nemotron", usage: { calls: 2 } });
    expect(r.ranking.map((x) => x.componentId)).toEqual(["orders", "queue-client", "redis:redis-url"]);
  });

  it("the prompt contains deterministic facts only - no model-written names or summaries", async () => {
    const { decider, bodies } = scripted([reply("orders", "queue-client", "worker:worker-worker")]);
    await decider.decide({ issue, snapshot, k: 3 });
    const prompt = JSON.stringify(bodies[0]!.messages);
    expect(prompt).not.toContain("Zebra Quantum Dispatcher");
    expect(prompt).not.toContain("Magically handles");
    const user = JSON.parse(bodies[0]!.messages[1]!.content) as { components: Record<string, unknown>[] };
    expect(Object.keys(user.components[0]!).sort()).toEqual(["edges", "errorMessages", "exportedSymbols", "files", "id", "kind", "redisKeys", "routes"]);
    expect(user.components.find((c) => c.id === "worker:worker-worker")).toMatchObject({ kind: "worker", redisKeys: ["jobs"] });
    expect(bodies[0]!.messages[0]!.content).toBe(LOCALIZER_SYSTEM_PROMPT);
  });

  it("a nemotron ranking drives the context packet's matches; a fallback keeps the lexical packet", async () => {
    const { decider } = scripted([reply("worker:worker-worker", "notifier", "orders")]);
    const decided = await decider.decide({ issue, snapshot, k: 3 });
    const p = buildContext(snapshot, issue, { decided });
    expect(p.ranking.decider).toBe("nemotron");
    expect(p.components.filter((c) => c.role === "match").map((c) => c.id)).toEqual(["worker:worker-worker", "notifier", "orders"]);
    const lexical = buildContext(snapshot, issue);
    const fell = buildContext(snapshot, issue, { decided: { ...(await new LexicalDecider().decide({ issue, snapshot })), decider: "lexical (nemotron fallback)", fallback: "nemotron fallback: x" } });
    expect(fell.components).toEqual(lexical.components);
    expect(fell.ranking.fallback).toBe("nemotron fallback: x");
  });
});
