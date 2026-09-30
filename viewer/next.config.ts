import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { PHASE_DEVELOPMENT_SERVER, PHASE_PRODUCTION_BUILD } from "next/constants";
import type { NextConfig } from "next";

// Fully static: `next build` writes out/ (HTML + JS + public/snapshots). No server, API or DB.
const config: NextConfig = {
  output: "export",
  basePath: process.env.NEXT_PUBLIC_BASE_PATH || undefined,
  images: { unoptimized: true },
  transpilePackages: ["@tracehound/analyzer"],
  reactStrictMode: true,
};

/**
 * Guard for builds that bypass the package "build" script (e.g. a bare `next build`): refuse to
 * build without snapshot data instead of shipping a viewer that 404s on index.json.
 */
function assertSnapshotData() {
  const dir = path.join(process.cwd(), "public/snapshots");
  const index = path.join(dir, "index.json");
  const latest = existsSync(index) ? (JSON.parse(readFileSync(index, "utf8")) as { latest?: { path?: string } }).latest?.path : undefined;
  if (!latest || !existsSync(path.join(dir, latest))) {
    throw new Error(
      `public/snapshots is missing index.json or its latest snapshot. Run "pnpm build" (it copies ../snapshots first), not "next build".`,
    );
  }
}

export default function nextConfig(phase: string): NextConfig {
  if (phase === PHASE_PRODUCTION_BUILD || phase === PHASE_DEVELOPMENT_SERVER) assertSnapshotData();
  return config;
}
