// tracehound mcp [--snapshot <path>] — stdio MCP server exposing the query tools over one snapshot.
// Read-only: no network, no model calls. The snapshot is loaded once at startup.
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { parseArgs } from "node:util";
import { z } from "zod";
import { EdgeKind, type Snapshot } from "../schema.ts";
import { ANALYZER_VERSION } from "../version.ts";
import { getEdgeEvidence, getNeighbors, getRelatedTests, loadSnapshot, searchComponents } from "./query.ts";

const json = (value: unknown) => ({ content: [{ type: "text" as const, text: JSON.stringify(value) }] });
const failure = (error: unknown) => ({ isError: true, content: [{ type: "text" as const, text: (error as Error).message }] });

export function createServer(snapshot: Snapshot): McpServer {
  const server = new McpServer({ name: "tracehound", version: ANALYZER_VERSION });
  const where = `${snapshot.repo.name}@${snapshot.repo.commitSha.slice(0, 7)}`;

  server.registerTool(
    "search_components",
    {
      title: "Search components",
      description:
        `Find the architecture components of ${where} that match a free-text query (an issue, a feature, an identifier). ` +
        "Returns up to 8 components as {id, name, kind, score, reason, files}, best first. The score is lexical: query terms matched against component ids, " +
        "routes, exported symbols, file paths, Redis keys and env vars. `reason` says which facts matched. Use this first to get component ids for the other tools. " +
        "An empty result means nothing in the extracted facts matches: fall back to code search. Names marked '(model-written name)' are unverified prose; ids are deterministic.",
      inputSchema: { query: z.string().min(1).describe("Free text, e.g. an issue title or an identifier like sendToEngine") },
    },
    async ({ query }) => {
      try {
        return json(searchComponents(snapshot, query));
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
      },
    },
    async ({ componentId, direction, kinds }) => {
      try {
        return json(getNeighbors(snapshot, componentId, direction ?? "both", kinds));
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
      inputSchema: { edgeId: z.string().describe("Edge id from get_neighbors, e.g. redis-rpc-bridge->redis:redis-url:produces") },
    },
    async ({ edgeId }) => {
      try {
        return json(getEdgeEvidence(snapshot, edgeId));
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
      inputSchema: { componentId: z.string().describe("Component id from search_components") },
    },
    async ({ componentId }) => {
      try {
        return json(getRelatedTests(snapshot, componentId));
      } catch (error) {
        return failure(error);
      }
    },
  );
  return server;
}

export async function runMcp(argv: string[]): Promise<void> {
  const { values } = parseArgs({ args: argv, options: { snapshot: { type: "string" } } });
  const { snapshot, path } = loadSnapshot(values.snapshot);
  const server = createServer(snapshot);
  await server.connect(new StdioServerTransport());
  console.error(`[tracehound mcp] serving ${snapshot.repo.name}@${snapshot.repo.commitSha.slice(0, 7)} from ${path} (stdio, read-only)`); // stderr: stdout is the protocol
}
