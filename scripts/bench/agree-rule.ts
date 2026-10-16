// The agreement rule of decision 058, moved unchanged out of agree-diff-ctx.ts so pool-verify.ts
// (decision 059) uses the same rule: same path after normalising, both lines non-null, lines within
// 3 of each other.
export const AGREE_LINES = 3;

export const norm = (p: string) => p.trim().replace(/^\.?\//, "").replace(/^[ab]\//, "");
export const agrees = (a: { path: string; line: number | null }, b: { path: string; line: number | null }) =>
  norm(a.path) === norm(b.path) && a.line !== null && b.line !== null && Math.abs(a.line - b.line) <= AGREE_LINES;
