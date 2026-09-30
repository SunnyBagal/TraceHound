#!/usr/bin/env node
// tracehound <command> [...args]
//   analyze  build a snapshot (see src/cli.ts)
//   impact   components affected by a git diff, from the base commit's snapshot
const [command, ...rest] = process.argv.slice(2);

if (command === "impact") {
  const { main } = await import("./impact/cli.ts");
  main(rest);
} else if (command === "analyze") {
  process.argv.splice(2, 1); // src/cli.ts parses process.argv itself
  await import("./cli.ts");
} else {
  console.error("usage: tracehound <analyze|impact> [...args]\n  tracehound impact --repo <path> --diff <base>..<head> [--depth 2] [--json]");
  process.exit(command ? 1 : 0);
}
