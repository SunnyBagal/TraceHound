export type {
  Component,
  ComponentEdge,
  ComponentKind,
  Evidence,
  Resolution,
  SnapshotManifest,
  Warning,
} from "@tracehound/analyzer/schema";

import { Snapshot as AnalyzerSnapshot, SnapshotManifest as AnalyzerManifest } from "@tracehound/analyzer/schema";
import { z } from "zod";

/** Publication metadata belongs to the viewer; the frozen analyzer contract stays intact. */
export const Snapshot = AnalyzerSnapshot.safeExtend({
  repo: AnalyzerSnapshot.shape.repo.extend({ branch: z.string().optional(), commitDate: z.string().optional() }),
});
export type Snapshot = z.infer<typeof Snapshot>;
export const ViewerManifest = AnalyzerManifest.extend({
  repos: z.array(AnalyzerManifest.shape.repos.unwrap().element.extend({ displayName: z.string().optional() })).optional(),
});
