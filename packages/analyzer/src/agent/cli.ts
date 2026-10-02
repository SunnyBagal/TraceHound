// tracehound context --issue "<text>" [--snapshot <path>] [--budget <tokens>] [--json]
// tracehound query <search_components|get_neighbors|get_edge_evidence|get_related_tests> [...] [--snapshot <path>] [--json]
import { parseArgs } from "node:util";
import { createTokenFactoryClient } from "../llm/setup.ts";
import { buildContext, formatContext } from "./context.ts";
import { LexicalDecider, NemotronDecider, type Decider } from "./decider.ts";
import { getEdgeEvidence, getNeighbors, getRelatedTests, loadSnapshot, QueryError, searchComponents, type Direction } from "./query.ts";

export const QUERY_USAGE = [
  "usage: tracehound query <tool> [args] [--snapshot <path> | --repo-id <id>] [--json]",
  "  search_components --query <text>",
  "  get_neighbors --component <id> [--direction in|out|both] [--kinds imports,produces,...]",
  "  get_edge_evidence --edge <edgeId>",
  "  get_related_tests --component <id>",
].join("\n");
export const CONTEXT_USAGE = 'usage: tracehound context --issue "<text>" [--decider lexical|nemotron] [--k 3] [--snapshot <path> | --repo-id <id>] [--budget <tokens>] [--json]';

export async function runContext(argv: string[]): Promise<string> {
  const { values } = parseArgs({
    args: argv,
    options: {
      issue: { type: "string" },
      snapshot: { type: "string" },
      "repo-id": { type: "string" },
      budget: { type: "string", default: "2000" },
      json: { type: "boolean", default: false },
      decider: { type: "string", default: "lexical" }, // the evaluation decides whether nemotron becomes the default
      k: { type: "string", default: "3" },
    },
  });
  if (!["lexical", "nemotron"].includes(values.decider!)) throw new QueryError(`--decider must be lexical or nemotron\n${CONTEXT_USAGE}`);
  const k = Number(values.k);
  if (!Number.isInteger(k) || k <= 0) throw new QueryError(`--k must be a positive integer\n${CONTEXT_USAGE}`);
  if (!values.issue?.trim()) throw new QueryError(CONTEXT_USAGE);
  const budget = Number(values.budget);
  if (!Number.isInteger(budget) || budget <= 0) throw new QueryError(`--budget must be a positive integer (estimated tokens)\n${CONTEXT_USAGE}`);
  const { snapshot } = loadSnapshot(values.snapshot, values["repo-id"]);
  const decider: Decider = values.decider === "nemotron" ? new NemotronDecider(createTokenFactoryClient().client) : new LexicalDecider();
  const decided = await decider.decide({ issue: values.issue, snapshot, k });
  const packet = buildContext(snapshot, values.issue, { budget, decided });
  return values.json ? JSON.stringify(packet, null, 2) : formatContext(packet);
}

export function runQuery(argv: string[]): string {
  const [tool, ...rest] = argv;
  const { values } = parseArgs({
    args: rest,
    options: {
      query: { type: "string" },
      component: { type: "string" },
      direction: { type: "string", default: "both" },
      kinds: { type: "string" },
      edge: { type: "string" },
      snapshot: { type: "string" },
      "repo-id": { type: "string" },
      json: { type: "boolean", default: false },
    },
  });
  const { snapshot } = loadSnapshot(values.snapshot, values["repo-id"]);
  const need = (v: string | undefined, flag: string) => {
    if (!v) throw new QueryError(`${tool} needs --${flag}\n${QUERY_USAGE}`);
    return v;
  };
  let result: unknown;
  if (tool === "search_components") result = searchComponents(snapshot, need(values.query, "query"));
  else if (tool === "get_neighbors") {
    if (!["in", "out", "both"].includes(values.direction!)) throw new QueryError(`--direction must be in, out or both\n${QUERY_USAGE}`);
    result = getNeighbors(snapshot, need(values.component, "component"), values.direction as Direction, values.kinds?.split(",").filter(Boolean));
  } else if (tool === "get_edge_evidence") result = getEdgeEvidence(snapshot, need(values.edge, "edge"));
  else if (tool === "get_related_tests") result = getRelatedTests(snapshot, need(values.component, "component"));
  else throw new QueryError(QUERY_USAGE);
  return values.json ? JSON.stringify(result) : JSON.stringify(result, null, 2);
}

/** Print the result, or a one-line error (bad args, unknown ids) with exit code 1. */
export async function main(run: (argv: string[]) => string | Promise<string>, argv: string[]): Promise<void> {
  try {
    console.log(await run(argv));
  } catch (error) {
    const code = (error as { code?: unknown }).code;
    const badArgs = typeof code === "string" && code.startsWith("ERR_PARSE_ARGS");
    if (!(error instanceof QueryError) && !badArgs && (error as Error).name !== "ZodError") throw error;
    console.error(`✖ ${(error as Error).message}`);
    process.exit(1);
  }
}
