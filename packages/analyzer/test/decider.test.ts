import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { DECIDER_VERSION, LexicalDecider, localizerFacts, LOCALIZER_SYSTEM_PROMPT, NemotronDecider, validateLocalizerReply } from "../src/agent/decider.ts";
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
/** A reply citing, per component, the given fact numbers (e.g. ["orders", "handleOrder", [1, 3]]). */
const entry = (componentId: string, issuePhrase: string, facts: number[], note?: string) => ({ componentId, issuePhrase, factIds: facts.map((n) => `${componentId}#f${n}`), ...(note && { note }) });
const reply = (...entries: ReturnType<typeof entry>[]) => JSON.stringify({ ranking: entries });
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

describe("localizer facts", () => {
  it("gives every deterministic fact a stable id <componentId>#f<n>", () => {
    const { components, index } = localizerFacts(snapshot);
    const orders = components.find((c) => c.id === "orders")!;
    expect(orders.facts.slice(0, 2)).toEqual([
      { id: "orders#f1", kind: "file", text: "api/src/orders.ts" },
      { id: "orders#f2", kind: "symbol", text: "exports handleOrder" },
    ]);
    expect(index.get("orders#f2")).toMatchObject({ componentId: "orders" });
    expect(localizerFacts(snapshot).components).toEqual(components); // stable across calls
  });
});

describe("validateLocalizerReply (deterministic checks)", () => {
  const v = (content: string, k = 3) => validateLocalizerReply(content, snapshot, issue, k);
  it("accepts cited facts and a verbatim phrase; display text comes from the snapshot, prose is labelled", () => {
    const r = v(reply(entry("orders", "handleOrder times out", [2], "the order handler")));
    expect(r).toEqual({
      ok: true,
      ranking: [
        {
          componentId: "orders",
          issuePhrase: "handleOrder times out",
          facts: [{ id: "orders#f2", text: "exports handleOrder" }],
          modelNote: "the order handler",
          reason: '"handleOrder times out" ↔ exports handleOrder · model-written note: the order handler',
        },
      ],
    });
  });
  it("accepts an empty ranking (abstention) and fewer than k entries", () => {
    expect(v('{"ranking":[]}')).toEqual({ ok: true, ranking: [] });
    expect(v(reply(entry("orders", "handleOrder", [2])))).toMatchObject({ ok: true });
  });
  it("rejects a phrase that is not a verbatim substring of the issue", () => {
    expect(v(reply(entry("orders", "handle order", [2])))).toEqual({ ok: false, why: 'issuePhrase "handle order" is not a verbatim substring of the issue' });
    expect(v(reply(entry("orders", "   ", [2])))).toMatchObject({ ok: false });
  });
  it("rejects unknown fact ids and facts that belong to another component", () => {
    expect(v(reply(entry("orders", "handleOrder", [99])))).toEqual({ ok: false, why: 'unknown fact id "orders#f99"' });
    expect(v(JSON.stringify({ ranking: [{ componentId: "orders", issuePhrase: "handleOrder", factIds: ["queue-client#f1"] }] }))).toEqual({
      ok: false,
      why: 'fact "queue-client#f1" belongs to "queue-client", not "orders"',
    });
    expect(v(JSON.stringify({ ranking: [{ componentId: "orders", issuePhrase: "handleOrder", factIds: [] }] }))).toEqual({ ok: false, why: 'no factIds for "orders"' });
  });
  it("rejects unknown and duplicate component ids, too many entries, and a multi-line note", () => {
    expect(v(reply(entry("payments", "order", [1])))).toEqual({ ok: false, why: 'unknown component id "payments"' });
    expect(v(reply(entry("orders", "order", [1]), entry("orders", "order", [2])))).toEqual({ ok: false, why: 'duplicate component id "orders"' });
    expect(v(reply(entry("orders", "order", [1]), entry("queue-client", "order", [1])), 1)).toEqual({ ok: false, why: "more than k=1 entries (2)" });
    expect(v(reply(entry("orders", "order", [1], "line one\nline two")))).toEqual({ ok: false, why: "note must be one short line" });
  });
  it("rejects non-JSON and the old {componentId, reason} shape", () => {
    expect(v("```json\n{}\n```")).toMatchObject({ ok: false, why: expect.stringMatching(/^invalid JSON/) });
    expect(v(JSON.stringify({ ranking: [{ componentId: "orders", reason: "x" }] }))).toMatchObject({ ok: false, why: expect.stringMatching(/^JSON does not match/) });
  });
});

describe("NemotronDecider (fake client)", () => {
  it("valid output: validated ranking, Nano, temperature 0, reasoning off, usage from the API, ledgered", async () => {
    const { decider, bodies, ledger } = scripted([reply(entry("orders", "handleOrder", [2]), entry("queue-client", "an order", [1]))]);
    const r = await decider.decide({ issue, snapshot, k: 3 });
    expect(r).toMatchObject({ decider: "nemotron", model: "nvidia/NVIDIA-Nemotron-3-Nano-30B-A3B", k: 3 });
    expect(r.ranking.map((x) => x.componentId)).toEqual(["orders", "queue-client"]); // 2 of k=3 is allowed
    expect(r.fallback).toBeUndefined();
    expect(bodies[0]).toMatchObject({ model: "nvidia/NVIDIA-Nemotron-3-Nano-30B-A3B", temperature: 0, chat_template_kwargs: { enable_thinking: false } });
    expect(r.usage).toMatchObject({ calls: 1, inputTokens: 1000, outputTokens: 40 });
    expect(ledger.entries().map((e) => e.purpose)).toEqual(["localizer"]);
  });

  it("an empty ranking is a valid abstention; the packet says so and falls back to code search", async () => {
    const { decider } = scripted(['{"ranking":[]}']);
    const decided = await decider.decide({ issue: "The page feels slow", snapshot, k: 3 });
    expect(decided).toMatchObject({ decider: "nemotron", ranking: [] });
    const p = buildContext(snapshot, "The page feels slow", { decided });
    expect(p.confidence).toBeUndefined(); // no lexical confidence with the nemotron decider
    expect(p.ranking.signal).toBe("empty ranking: the model cited no fact related to the issue");
    expect(p.advice).toMatch(/fall back to normal code search/);
    expect(p.components).toEqual([]);
  });

  it("invalid JSON → one retry (with the error) → still invalid → lexical fallback, logged", async () => {
    const { decider, bodies, logs } = scripted(["Sure! The answer is orders.", "```json\n" + reply(entry("orders", "handleOrder", [2])) + "\n```"]);
    const r = await decider.decide({ issue, snapshot, k: 3 });
    expect(bodies).toHaveLength(2);
    expect(bodies[1]!.messages.at(-1)!.content).toMatch(/^Your reply was invalid: invalid JSON/);
    expect(r.decider).toBe("lexical (nemotron fallback)");
    expect(r.fallback).toMatch(/^nemotron fallback: invalid JSON/);
    expect(r.ranking).toEqual((await new LexicalDecider().decide({ issue, snapshot, k: 3 })).ranking); // entirely lexical, not mixed
    expect(logs.at(-1)).toMatch(/nemotron fallback: invalid JSON:.*using the lexical ranking/);
    expect(r.usage.calls).toBe(2);
  });

  it("each validation failure triggers the retry then the fallback: phrase, fact id, fact owner, component id", async () => {
    const cases: [string, RegExp][] = [
      [reply(entry("orders", "handle order", [2])), /not a verbatim substring/],
      [reply(entry("orders", "handleOrder", [42])), /unknown fact id "orders#f42"/],
      [JSON.stringify({ ranking: [{ componentId: "orders", issuePhrase: "handleOrder", factIds: ["notifier#f1"] }] }), /belongs to "notifier"/],
      [reply(entry("payments", "order", [1])), /unknown component id "payments"/],
    ];
    for (const [bad, why] of cases) {
      const { decider, bodies } = scripted([bad, bad]);
      const r = await decider.decide({ issue, snapshot, k: 3 });
      expect(bodies).toHaveLength(2);
      expect(r.decider).toBe("lexical (nemotron fallback)");
      expect(r.fallback).toMatch(why);
    }
  });

  it("decider-v1: issuePhrase is at most 6 words (still verbatim); the whole issue copied back is invalid → retry → lexical", async () => {
    expect(DECIDER_VERSION).toBe("decider-v1");
    expect(LOCALIZER_SYSTEM_PROMPT).toContain("at most 6 words");
    const six = "handleOrder times out after placing an"; // verbatim, 6 words
    expect(validateLocalizerReply(reply(entry("orders", six, [2])), snapshot, issue, 3)).toMatchObject({ ok: true });
    expect(validateLocalizerReply(reply(entry("orders", issue, [2])), snapshot, issue, 3)).toEqual({ ok: false, why: `issuePhrase ${JSON.stringify(issue)} has 7 words; at most 6 allowed` });
    const { decider, bodies } = scripted([reply(entry("orders", issue, [2])), reply(entry("orders", issue, [2]))]);
    const r = await decider.decide({ issue, snapshot, k: 3 });
    expect(bodies).toHaveLength(2);
    expect(bodies[1]!.messages.at(-1)!.content).toMatch(/has 7 words; at most 6 allowed/);
    expect(r).toMatchObject({ decider: "lexical (nemotron fallback)", version: "decider-v1" });
    const ok = await scripted([reply(entry("orders", "handleOrder", [2]))]).decider.decide({ issue, snapshot, k: 3 });
    expect(ok).toMatchObject({ decider: "nemotron", version: "decider-v1" });
    expect((await new LexicalDecider().decide({ issue, snapshot })).version).toBe("decider-v1");
  });

  it("a bad first reply fixed by the retry is used (not a fallback)", async () => {
    const { decider } = scripted([reply(entry("orders", "handle order", [2])), reply(entry("orders", "handleOrder", [2]))]);
    const r = await decider.decide({ issue, snapshot, k: 3 });
    expect(r).toMatchObject({ decider: "nemotron", usage: { calls: 2 } });
  });

  it("the prompt contains deterministic facts only - no model-written names or summaries", async () => {
    const { decider, bodies } = scripted(['{"ranking":[]}']);
    await decider.decide({ issue, snapshot, k: 3 });
    const prompt = JSON.stringify(bodies[0]!.messages);
    expect(prompt).not.toContain("Zebra Quantum Dispatcher");
    expect(prompt).not.toContain("Magically handles");
    const user = JSON.parse(bodies[0]!.messages[1]!.content) as { components: { id: string; kind: string; facts: { id: string }[] }[] };
    expect(Object.keys(user.components[0]!).sort()).toEqual(["facts", "id", "kind"]);
    expect(user.components.find((c) => c.id === "worker:worker-worker")!.facts.map((f) => f.id)[0]).toBe("worker:worker-worker#f1");
    expect(bodies[0]!.messages[0]!.content).toBe(LOCALIZER_SYSTEM_PROMPT);
  });

  it("a nemotron ranking drives the packet's matches with snapshot fact text; a fallback keeps the lexical packet", async () => {
    const { decider } = scripted([reply(entry("worker:worker-worker", "order", [1]), entry("notifier", "times out", [1]))]);
    const decided = await decider.decide({ issue, snapshot, k: 3 });
    const p = buildContext(snapshot, issue, { decided });
    expect(p.ranking).toMatchObject({ decider: "nemotron", signal: "short ranking: 2 of k=3" });
    expect(p.components.filter((c) => c.role === "match").map((c) => [c.id, c.reason])).toEqual([
      ["worker:worker-worker", 'nemotron #1: "order" ↔ worker/src/index.ts'],
      ["notifier", 'nemotron #2: "times out" ↔ api/src/notifier.ts'],
    ]);
    const lexical = buildContext(snapshot, issue);
    const fell = buildContext(snapshot, issue, { decided: { ...(await new LexicalDecider().decide({ issue, snapshot })), decider: "lexical (nemotron fallback)", fallback: "nemotron fallback: x" } });
    expect(fell.components).toEqual(lexical.components);
    expect(fell.ranking.fallback).toBe("nemotron fallback: x");
    expect(fell.confidence).toBeDefined();
  });
});
