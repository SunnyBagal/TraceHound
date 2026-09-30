import { PHASE_DEVELOPMENT_SERVER, PHASE_PRODUCTION_BUILD } from "next/constants";
import type { NextConfig } from "next";
import { copyImpacts, copySnapshots } from "./scripts/snapshots.mjs";

// Fully static: `next build` writes out/ (HTML + JS + public/snapshots). No server, API or DB.
const config: NextConfig = {
  output: "export",
  basePath: process.env.NEXT_PUBLIC_BASE_PATH || undefined,
  images: { unoptimized: true },
  transpilePackages: ["@tracehound/analyzer"],
  reactStrictMode: true,
};

/**
 * Copy (and verify) snapshot data on every build/dev start, even a bare `next build` that skips the
 * package "build" script: a build without data must fail, never ship a viewer that 404s.
 */
export default function nextConfig(phase: string): NextConfig {
  if (phase === PHASE_PRODUCTION_BUILD || phase === PHASE_DEVELOPMENT_SERVER) {
    const files = copySnapshots();
    const impacts = copyImpacts();
    console.log(`[snapshots] next.config: index.json + ${files.length} snapshot file(s) in public/snapshots; ${impacts.length} impact report(s) in public/impacts`);
  }
  return config;
}
