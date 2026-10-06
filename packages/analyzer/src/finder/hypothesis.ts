// The finder's output (decision 051): one narrow question per hypothesis, the rule that fired,
// the graph evidence it stands on, code excerpts, and the input a reproduction test would send.
import { z } from "zod";

export const FINDER_VERSION = "finder-rules@1";

export const RuleFamily = z.enum(["route-without-auth", "payload-field-missing", "request-to-fetch"]);
export type RuleFamily = z.infer<typeof RuleFamily>;

export const Excerpt = z.object({
  file: z.string(),
  startLine: z.number().int().positive(),
  endLine: z.number().int().positive(),
  truncated: z.boolean(), // the span was longer than the excerpt cap
  why: z.string(), // what this excerpt shows
  lines: z.array(z.string()),
});
export type Excerpt = z.infer<typeof Excerpt>;

export const Hypothesis = z.object({
  id: z.string(), // "<family>:<anchor evidence id>[:<detail>]", stable for one snapshot
  family: RuleFamily,
  rule: z.object({ id: z.string(), text: z.string() }),
  question: z.string(), // one narrow yes/no question a single test can answer
  statedInput: z.string(), // the input that test would send
  graph: z.object({
    componentIds: z.array(z.string()),
    edgeIds: z.array(z.string()),
    evidenceIds: z.array(z.string()).min(1), // snapshot evidence the rule fired on
  }),
  excerpts: z.array(Excerpt).min(1),
});
export type Hypothesis = z.infer<typeof Hypothesis>;

export const FinderReport = z.object({
  finderVersion: z.literal(FINDER_VERSION),
  analyzerVersion: z.string(),
  repo: z.object({ name: z.string(), commitSha: z.string() }),
  config: z.string().optional(),
  generatedAt: z.string(),
  counts: z.record(RuleFamily, z.number().int().nonnegative()),
  /** why a rule stayed silent as a whole (e.g. no route in the repo has an auth signal) */
  notes: z.array(z.string()),
  hypotheses: z.array(Hypothesis),
});
export type FinderReport = z.infer<typeof FinderReport>;
