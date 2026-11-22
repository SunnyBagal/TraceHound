// Every number on screen comes from this file, and every number here is on the published page
// docs/bench/ts-heldout.md (TraceHound main 890943e). No per-PR data is used: the racers move in
// even one-bug ticks, so the video implies no order of pull requests (Sunny's choice, 22 Nov).

/** §1 and §2: 29 fresh pull requests, 20 of which introduced a labelled bug, 9 clean. */
export const PRS = 29;
export const BUGS = 20;

/** §1 and §2, "bugs caught of 20, hand-checked": Greptile 12, CodeRabbit 10, TraceHound 4. */
export const RACERS = [
  { id: "greptile", name: "Greptile", caught: 12 },
  { id: "coderabbit", name: "CodeRabbit", caught: 10 },
  { id: "tracehound", name: "TraceHound", caught: 4 },
] as const;

/** §1: the four repositories the pull requests came from. */
export const REPOS = ["medusa", "payload", "twenty", "bullmq"] as const;

export const TITLE = `${PRS} fresh TypeScript PRs. ${BUGS} real bugs. ${RACERS.length} AI reviewers.`;
export const NOBODY = "Nobody finished.";
export const SCORE_HEADING = `Bugs caught, of ${BUGS}`;
/** Footer, two lines. "One run": §1 ("One run, 20 bugs, …"). */
export const FOOTER = ["Pre-registered · hand-graded blind · one run", `PRs from ${REPOS.join(", ")}`] as const;
