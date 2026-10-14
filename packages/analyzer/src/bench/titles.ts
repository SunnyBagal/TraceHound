// Pull requests are mapped to golden entries by title, after trimming whitespace (decision 054).
// Unmatched ones on either side are left out of scoring and counted.

export interface TitleMapping<P> {
  /** golden index → the pull request mapped to it */
  matched: { golden: number; pr: P }[];
  /** pull requests whose title matches no golden entry */
  unmatchedPrs: P[];
  /** golden indexes no pull request matched */
  unmatchedGolden: number[];
  /** pull requests left out because an earlier one (in the given order) already took their golden entry */
  duplicatePrs: P[];
}

export function mapByTitle<P>(goldenTitles: string[], prs: P[], titleOf: (pr: P) => string): TitleMapping<P> {
  const byTitle = new Map<string, number[]>();
  goldenTitles.forEach((t, i) => {
    const key = t.trim();
    byTitle.set(key, [...(byTitle.get(key) ?? []), i]);
  });
  const taken = new Set<number>();
  const matched: TitleMapping<P>["matched"] = [];
  const unmatchedPrs: P[] = [];
  const duplicatePrs: P[] = [];
  for (const pr of prs) {
    const candidates = byTitle.get(titleOf(pr).trim());
    if (!candidates) {
      unmatchedPrs.push(pr);
      continue;
    }
    // Two golden entries with one title: each takes the next pull request with that title.
    const free = candidates.find((i) => !taken.has(i));
    if (free === undefined) {
      duplicatePrs.push(pr);
      continue;
    }
    taken.add(free);
    matched.push({ golden: free, pr });
  }
  matched.sort((a, b) => a.golden - b.golden);
  const unmatchedGolden = goldenTitles.map((_, i) => i).filter((i) => !taken.has(i));
  return { matched, unmatchedPrs, unmatchedGolden, duplicatePrs };
}
