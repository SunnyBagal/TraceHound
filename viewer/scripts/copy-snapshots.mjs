// Copy the repo's static snapshots (index.json + <sha>/<version>.json) into public/ for export.
import { cpSync, existsSync, rmSync } from "node:fs";
import path from "node:path";

const from = path.resolve(import.meta.dirname, "../../snapshots");
const to = path.resolve(import.meta.dirname, "../public/snapshots");
if (!existsSync(path.join(from, "index.json"))) {
  console.error(`no snapshots at ${from}; run \`pnpm demo\` at the repo root first`);
  process.exit(1);
}
rmSync(to, { recursive: true, force: true });
cpSync(from, to, { recursive: true });
console.log(`copied snapshots → ${path.relative(process.cwd(), to)}`);
