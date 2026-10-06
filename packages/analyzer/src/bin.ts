#!/usr/bin/env node
// tracehound <command> [...args]
//   analyze  build a snapshot (see src/cli.ts)
//   impact   components affected by a git diff, from the base commit's snapshot
//   context  ranked context packet for an issue (snapshot only, no model)
//   query    search_components | get_neighbors | get_edge_evidence | get_related_tests
//   mcp      the query tools as a stdio MCP server
//   repair   run a repair task in a sandbox with a (scripted) agent and verify the result
//   changes  declaration-level change set of a diff or a run's patch (decision 038)
//   find     hypotheses from graph rules, no model (decision 051)
const [command, ...rest] = process.argv.slice(2);

if (command === "changes") {
  const { main } = await import("./changes/cli.ts");
  main(rest);
} else if (command === "find") {
  const { main } = await import("./finder/cli.ts");
  process.exitCode = main(rest);
} else if (command === "impact") {
  const { main } = await import("./impact/cli.ts");
  main(rest);
} else if (command === "context") {
  // --decider nemotron needs NEBIUS_API_KEY: load the workspace .env for this command only
  const { existsSync } = await import("node:fs");
  const envFile = new URL("../../../.env", import.meta.url).pathname;
  if (existsSync(envFile) && !process.env.NEBIUS_API_KEY) process.loadEnvFile(envFile);
  const { main, runContext } = await import("./agent/cli.ts");
  await main(runContext, rest);
} else if (command === "query") {
  const { main, runQuery } = await import("./agent/cli.ts");
  await main(runQuery, rest);
} else if (command === "mcp") {
  const { runMcp } = await import("./agent/mcp.ts");
  await runMcp(rest);
} else if (command === "repair") {
  // --agent nemotron needs NEBIUS_API_KEY: load the workspace .env for this command only
  const { existsSync } = await import("node:fs");
  const envFile = new URL("../../../.env", import.meta.url).pathname;
  if (existsSync(envFile) && !process.env.NEBIUS_API_KEY) process.loadEnvFile(envFile);
  const { main } = await import("./harness/cli.ts");
  process.exitCode = await main(rest);
} else if (command === "analyze") {
  process.argv.splice(2, 1); // src/cli.ts parses process.argv itself
  await import("./cli.ts");
} else {
  console.error(
    "usage: tracehound <analyze|impact|changes|find|context|query|mcp|repair> [...args]\n" +
      "  tracehound find --repo <path> [--config <tracehound.json>] [--out <file.json>] [--json]\n" +
      "  tracehound impact --repo <path> --diff <base>..<head> [--depth 2] [--json] [--out <file>]\n" +
      '  tracehound context --issue "<text>" [--decider lexical|nemotron] [--k 3] [--snapshot <path>] [--budget <tokens>] [--json]\n' +
      "  tracehound query <search_components|get_neighbors|get_edge_evidence|get_related_tests> ... [--json]\n" +
      "  tracehound mcp [--snapshot <path>]\n" +
      "  tracehound repair --task <task.json> --agent oracle|noop [--patch <file>] --provider docker",
  );
  process.exit(command ? 1 : 0);
}
