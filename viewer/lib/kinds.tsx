import { Cog, Database, Globe, Layers, Package, Workflow, Zap, Monitor, Cloud, type LucideIcon } from "lucide-react";
import type { ComponentKind } from "./types";

export type KindToken = ComponentKind | "web" | "external";
// All colours exceed 4.5:1 on the canvas and node surfaces. Use the snapshot's kind verbatim.
// web/external are ready for a future analyzer schema; current service nodes remain service.
export const KIND_META: Record<KindToken, { icon: LucideIcon; label: string; color: string }> = {
  api: { icon: Globe, label: "API", color: "#7cc4ff" },
  web: { icon: Monitor, label: "Web app", color: "#c4b5fd" },
  worker: { icon: Cog, label: "Worker", color: "#f2c15c" },
  service: { icon: Workflow, label: "Service", color: "#5ed6c3" },
  library: { icon: Package, label: "Library", color: "#a6b1c8" },
  db: { icon: Database, label: "Database", color: "#79df9c" },
  cache: { icon: Zap, label: "Cache", color: "#ff918b" },
  queue: { icon: Layers, label: "Queue", color: "#ffb077" },
  external: { icon: Cloud, label: "External service", color: "#f5a6d7" },
};
