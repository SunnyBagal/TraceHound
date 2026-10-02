// tracehound mcp [--snapshot <path> | --repo-id <id>] — stdio MCP server exposing the query tools.
// Read-only: no network, no model calls. Without --snapshot, every tool takes an optional `repo`
// (an id from snapshots/index.json); each repo's latest snapshot is loaded once, on first use.
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { parseArgs } from "node:util";
import { z } from "zod";
import { EdgeKind, type Snapshot } from "../schema.ts";
import { ANALYZER_VERSION } from "../version.ts";
import { getEdgeEvidence, getNeighbors, getRelatedTests, loadSnapshot, searchComponents } from "./query.ts";

const json = (value: unknown) => ({ content: [{ type: "text" as const, text: JSON.stringify(value) }] });
const failure = (error: unknown) => ({ isError: true, content: [{ type: "text" as const, text: (error as Error).message }] });

/** One fixed snapshot, or a loader by repo id (undefined = the default repo). */
export function createServer(source: Snapshot | ((repo?: string) => Snapshot)): McpServer {
  const server = new McpServer({ name: "tracehound", version: ANALYZER_VERSION });
  const cache = new Map<string, Snapshot>();
  const pick = (repo?: string): Snapshot => {
    if (typeof source !== "function") {
      if (repo) throw new Error(`this server was started with one snapshot (${source.repo.name}); repo "${repo}" isn't available`);
      return source;
    }
    const key = repo ?? "";
    if (!cache.has(key)) cache.set(key, source(repo));
    return cache.get(key)!;
  };
  const snapshot = pick();
  const where = `${snapshot.repo.name}@${snapshot.repo.commitSha.slice(0, 7)}`;
  const repoArg = { repo: z.string().optional().describe(`Repo id from the snapshot index; default: ${where.split("@")[0]}`) };

  server.registerTool(
    "search_components",
    {
      title: "Search components",
      description:
        `Find the architecture components of ${where} that match a free-text query (an issue, a feature, an identifier). ` +
        "Returns up to 8 components as {id, name, kind, score, reason, files}, best first. The score is lexical: query terms matched against component ids, " +
        "routes, exported symbols, file paths, Redis keys and env vars. `reason` says which facts matched. Use this first to get component ids for the other tools. " +
        "An empty result means nothing in the extracted facts matches: fall back to code search. Names marked '(model-written name)' are unverified prose; ids are deterministic.",
      inputSchema: { query: z.string().min(1).describe("Free text, e.g. an issue title or an identifier like sendToEngine"), ...repoArg },
    },
    async ({ query, repo }) => {
      try {
        return json(searchComponents(pick(repo), query));
      } catch (error) {
        return failure(error);
      }
    },
  );

  server.registerTool(
    "get_neighbors",
    {
      title: "Get neighbors",
      description:
        "List the components directly connected to one component, with the edge between them: {edgeId, direction, kind, neighbor, confidenceLabel, label, evidenceCount}. " +
        "direction 'out' = edges from this component (what it imports, queries or produces to); 'in' = edges into it (who imports it, what it consumes from). " +
        "Queue traffic goes through a Redis component: producer -produces-> queue -consumes-> consumer, so call this on the queue to see both sides. " +
        "confidenceLabel 'dynamic' means the operand (e.g. a Redis key) is only known at runtime. Pass an edgeId to get_edge_evidence to see the code.",
      inputSchema: {
        componentId: z.string().describe("Component id from search_components, e.g. backend:exchange-api"),
        direction: z.enum(["in", "out", "both"]).optional().describe("Default both"),
        kinds: z.array(EdgeKind).optional().describe("Only these edge kinds: imports, produces, consumes, reads, writes, queries"),
        ...repoArg,
      },
    },
    async ({ componentId, direction, kinds, repo }) => {
      try {
        return json(getNeighbors(pick(repo), componentId, direction ?? "both", kinds));
      } catch (error) {
        return failure(error);
      }
    },
  );

  server.registerTool(
    "get_edge_evidence",
    {
      title: "Get edge evidence",
      description:
        "Show the code behind one edge: for each piece of evidence, {at: file:line, symbol, extractor, resolution, detail, snippet} (snippet is at most 6 numbered lines). " +
        "Every edge in the graph has at least one. Use it to check an edge before trusting it, or to find the exact line to read or change. Lines refer to the snapshot's commit (commitSha in the result).",
      inputSchema: { edgeId: z.string().describe("Edge id from get_neighbors, e.g. redis-rpc-bridge->redis:redis-url:produces"), ...repoArg },
    },
    async ({ edgeId, repo }) => {
      try {
        return json(getEdgeEvidence(pick(repo), edgeId));
      } catch (error) {
        return failure(error);
      }
    },
  );

  server.registerTool(
    "get_related_tests",
    {
      title: "Get related tests",
      description:
        "List test files (*.test.ts, *.spec.ts, __tests__/**) that import a component's files: {tests: [{file, importAt}], summary}. " +
        "Use it to pick which tests to run after changing a component. '0 linked tests' is a real answer, not an error: say so rather than inventing tests.",
      inputSchema: { componentId: z.string().describe("Component id from search_components"), ...repoArg },
    },
    async ({ componentId, repo }) => {
      try {
        return json(getRelatedTests(pick(repo), componentId));
      } catch (error) {
        return failure(error);
      }
    },
  );
  return server;
}

export async function runMcp(argv: string[]): Promise<void> {
  const { values } = parseArgs({ args: argv, options: { snapshot: { type: "string" }, "repo-id": { type: "string" } } });
  // --snapshot pins one file; otherwise tools may pick any indexed repo (default: --repo-id, else the index's default)
  const fixed = values.snapshot ? loadSnapshot(values.snapshot).snapshot : undefined;
  const server = createServer(fixed ?? ((repo?: string) => loadSnapshot(undefined, repo ?? values["repo-id"]).snapshot));
  await server.connect(new StdioServerTransport());
  const first = fixed ?? loadSnapshot(undefined, values["repo-id"]).snapshot;
  console.error(`[tracehound mcp] serving ${first.repo.name}@${first.repo.commitSha.slice(0, 7)}${fixed ? ` from ${values.snapshot}` : " (and any repo in snapshots/index.json via `repo`)"} (stdio, read-only)`); // stderr: stdout is the protocol
}
