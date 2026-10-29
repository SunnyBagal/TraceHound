import { BENCHMARK_TABLES as SOURCE_TABLES } from "./benchmark";
import { BLUR_THIRD_PARTY_MARKS } from "./marks";

/*
 * What the /benchmark page shows. lib/benchmark.ts stays an exact copy of docs/bench/results.md
 * (test/benchmark.test.tsx); this layer only relabels it. While lib/marks.ts BLUR_THIRD_PARTY_MARKS
 * is true, the five recorded reviewers' names are replaced by neutral labels (for the submission
 * video: Devpost's rules bar third-party trademarks without permission). Every number is unchanged,
 * and results.md keeps the real names. Set the flag to false and the names come back everywhere.
 */
export const HIDE_REVIEWER_NAMES = BLUR_THIRD_PARTY_MARKS;

/** Lettered in their order on the blind test (bench-judge-v1 F, highest first). */
export const REVIEWER_ALIASES = {
  augment: "Reviewer A",
  cursor: "Reviewer B",
  greptile: "Reviewer C",
  copilot: "Reviewer D",
  coderabbit: "Reviewer E",
} as const;
type Tool = keyof typeof REVIEWER_ALIASES;

const NAMES = /\b(augment|cursor|greptile|copilot|coderabbit)\b/gi;
export const anonymize = (text: string) => text.replace(NAMES, (m) => REVIEWER_ALIASES[m.toLowerCase() as Tool]);

/** The tool an alias stands for ("Reviewer C" → "greptile"), so its (blurred) mark still shows. */
export function aliasOf(label: string): Tool | undefined {
  const entry = Object.entries(REVIEWER_ALIASES).find(([, alias]) => alias.toLowerCase() === label.toLowerCase());
  return entry?.[0] as Tool | undefined;
}

const relabel = (value: unknown): unknown =>
  typeof value === "string" ? anonymize(value)
    : Array.isArray(value) ? value.map(relabel)
    : value && typeof value === "object" ? Object.fromEntries(Object.entries(value).map(([k, v]) => [k, relabel(v)]))
    : value;

export const BENCHMARK_TABLES = (HIDE_REVIEWER_NAMES ? relabel(SOURCE_TABLES) : SOURCE_TABLES) as typeof SOURCE_TABLES;
