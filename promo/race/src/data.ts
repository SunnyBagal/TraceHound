// Every number on screen comes from this file, and every number here is on the published page
// docs/bench/ts-heldout.md (TraceHound main 890943e). No per-PR data is used (Sunny's ruling, 22 Nov): each line runs
// straight from 0 to the tool's total, and the footer says so, so the video implies no order of pull requests.

/** §1 and §2: 29 fresh pull requests, 20 of which introduced a labelled bug. */
export const PRS = 29;
export const BUGS = 20;

/** §1 and §2, "bugs caught of 20, hand-checked". `tag` is the highlight: most and fewest caught. */
export const TOOLS = [
  { id: "greptile", name: "Greptile", caught: 12, tag: "Most caught" },
  { id: "coderabbit", name: "CodeRabbit", caught: 10, tag: null },
  { id: "tracehound", name: "TraceHound", caught: 4, tag: "Fewest caught · mine" },
] as const;

/** §1: the registered pairs' exact sign tests (p = 0.0078125 and 0.109375), rounded. Greptile vs CodeRabbit was not tested. */
export const P_GREPTILE = "0.008";
export const P_CODERABBIT = "0.11";

/** §1: the four repositories. */
export const REPOS = ["medusa", "payload", "twenty", "bullmq"] as const;

export const TITLE = `Bugs caught, of ${BUGS}`;
export const SUBTITLE = `${PRS} fresh TypeScript PRs · held-out · pre-registered · hand-checked blind · one run`;
export const FOOTER = [
  `PRs from ${REPOS.join(", ")} · straight lines show totals only, not PR order`,
  `TraceHound vs Greptile: p = ${P_GREPTILE} · vs CodeRabbit: p = ${P_CODERABBIT}, not significant`,
] as const;
