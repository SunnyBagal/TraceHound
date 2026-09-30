#!/usr/bin/env node
// tracehound <command> [...args]
//   analyze  build a snapshot (see src/cli.ts)
//   impact   components affected by a git diff, from the base commit's snapshot
//   context  ranked context packet for an issue (snapshot only, no model)
//   query    search_components | get_neighbors | get_edge_evidence | get_related_tests
//   mcp      the query tools as a stdio MCP server
const [command, ...rest] = process.argv.slice(2);

if (command === "impact") {
  const { main } = await import("./impact/cli.ts");
  main(rest);
} else if (command === "context") {
  const { main, runContext } = await import("./agent/cli.ts");
  main(runContext, rest);
} else if (command === "query") {
  const { main, runQuery } = await import("./agent/cli.ts");
  main(runQuery, rest);
} else if (command === "mcp") {
  const { runMcp } = await import("./agent/mcp.ts");
  await runMcp(rest);
} else if (command === "analyze") {
  process.argv.splice(2, 1); // src/cli.ts parses process.argv itself
  await import("./cli.ts");
} else {
  console.error(
    "usage: tracehound <analyze|impact|context|query|mcp> [...args]\n" +
      "  tracehound impact --repo <path> --diff <base>..<head> [--depth 2] [--json] [--out <file>]\n" +
      '  tracehound context --issue "<text>" [--snapshot <path>] [--budget <tokens>] [--json]\n' +
      "  tracehound query <search_components|get_neighbors|get_edge_evidence|get_related_tests> ... [--json]\n" +
      "  tracehound mcp [--snapshot <path>]",
  );
  process.exit(command ? 1 : 0);
}
