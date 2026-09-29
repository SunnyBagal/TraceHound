import type { NextConfig } from "next";

// Fully static: `next build` writes out/ (HTML + JS + public/snapshots). No server, API or DB.
const config: NextConfig = {
  output: "export",
  basePath: process.env.NEXT_PUBLIC_BASE_PATH || undefined,
  images: { unoptimized: true },
  transpilePackages: ["@tracehound/analyzer"],
  reactStrictMode: true,
};

export default config;
