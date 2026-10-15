// Benchmark file formats (decision 054). Golden files are the dataset's
// code_review_benchmarks/<repo>.json; review files are the neutral format that the recorded tools
// (via convert.ts) and TraceHound's own reviewer write: one JSON file per pull request.
import { z } from "zod";

export const SEVERITIES = ["Low", "Medium", "High", "Critical"] as const;
export type Severity = (typeof SEVERITIES)[number];

export const GoldenEntry = z.object({
  pr_title: z.string(),
  comments: z.array(z.object({ comment: z.string(), severity: z.enum(SEVERITIES) })),
});
export type GoldenEntry = z.infer<typeof GoldenEntry>;
export const GoldenFile = z.array(GoldenEntry);

export const ReviewComment = z.object({ path: z.string(), line: z.number().int().nullable(), body: z.string() });
export type ReviewComment = z.infer<typeof ReviewComment>;

export const PullReview = z.object({
  pr_title: z.string(),
  comments: z.array(ReviewComment),
  /** Optional provenance (fork pull request number); the scorer ignores it. */
  pr_number: z.number().int().optional(),
});
export type PullReview = z.infer<typeof PullReview>;
