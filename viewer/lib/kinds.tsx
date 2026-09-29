import { Cog, Database, Globe, Layers, Package, Workflow, Zap, type LucideIcon } from "lucide-react";
import type { ComponentKind } from "./types";

export const KIND_META: Record<ComponentKind, { icon: LucideIcon; label: string }> = {
  api: { icon: Globe, label: "API" },
  worker: { icon: Cog, label: "Worker" },
  service: { icon: Workflow, label: "Service" },
  library: { icon: Package, label: "Library" },
  db: { icon: Database, label: "Database" },
  cache: { icon: Zap, label: "Cache" },
  queue: { icon: Layers, label: "Queue" },
};
