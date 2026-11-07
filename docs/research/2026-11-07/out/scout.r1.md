# Scout r1 — outside world (read 2026-11-07)

TL;DR: No Greptile, Cursor Bugbot, Augment, or Graphite page dated on or after 30 Oct 2026. New own-source items are CodeRabbit (5 Nov, security scans) and Qodo (2 Nov release notes, 5 Nov Software Map).
CodeRabbit's new number is a 33-case security scan (22/33 vs 19/33 known issues). They say the extra findings are not yet checked as real vulnerabilities.
Qodo's new mechanism is a cross-repo Software Map the reviewer consults. TraceHound reviews one repository, so this does not transfer as a benchmark lever.
Public boards still disagree with each other. Augment leads its own 50-PR table; Martian offline (F2, labeled 8 Sep) leads with Qodo Deep; Martian online (page read today) leads with Greptile; ReviewBench's listed board leads with OhMyBug. Matchers differ.
Of five plan claims: severity "nearly random" confirmed; Bugbot's launch vote confirmed and later left behind in the same post; "~10%" model inversion is the 9 Oct sentence only; Augment's 65/55/59 confirmed with no judge named; CodeRabbit "20+ linters" is wrong on the cited docs page today (50+, and 59 tools on 1 Nov).
None of that supplies a new reason to retry decisions 056, 064, 065, 070, or 071.
This lane's input to the shared conclusion: do not build from a last-week announcement. Name the matcher on any new held-out set. The published gaps that remain are symbol context and running the app, both already in the plan.
TraceHound is absent from those public boards. Its ReviewBench figure is a 25-PR test, grounded F1 12.2, and `docs/bench/results.md` §5 says it is not a submission.
Nearest Greptile item the plan does not name, two days before the window: TREX computer use, 28 Oct 2026.
Graphite Chat's page was retrieved and shows no publish date. No dated Graphite post in the window was found.

## 1. Own sources dated on or after 30 Oct 2026

Plan §2 is treated as already read. Items below are only what that section does not say.

**CodeRabbit, 2026-11-05.** https://www.coderabbit.ai/blog/gpt-6-cyber-security-evaluation
GPT-6 Cyber added to their security-scan ensemble, 33 cases (Python, JavaScript, TypeScript, Go, PHP, Rust, Ruby, C, C#). Known issues caught 22/33 (66.7%) vs 19/33 (57.6%). High- and medium-severity findings in the final reports 361 vs 218 (+65.6%); all severities 979 vs 592. Quote: "We still need to assess how many of the additional findings are real vulnerabilities." From 23 Oct to 3 Nov they report over 13,000 Deep Scans across more than 2,700 organizations. This is not a pull-request comment P/R/F.

**CodeRabbit docs, last updated 2026-11-01.** https://docs.coderabbit.ai/tools/reference
"CodeRabbit supports integration with 59 static analysis tools." The overview at https://docs.coderabbit.ai/tools says "50+" and that they run in a sandbox. See claim 5.

**Qodo 3.2, released 2026-11-02.** https://docs.qodo.ai/whats-new
GitHub Enterprise Server / GitLab repo-level access filtering; configurable rule-import paths; verbosity routing ("Custom" renamed Mixed). "The Qodo IDE plugin is no longer supported as of October 30, 2026." Local review moves to their Agentic Toolbox. No P/R/F.

**Qodo, 2026-11-05.** https://www.qodo.ai/blog/10-ways-qodos-software-map-changes-how-your-team-reviews-plans-and-ships/
Review agents use the Software Map as system context. Their example: a field rename in one repo is flagged because another repo still reads the old field. No measured P/R/F on the page.

**Nothing in the window from the plan's four.**
- Greptile blog index tops out at 2026-10-19 (Series B). Changelog's newest entry is 2026-10-28, "Computer use in TREX": starts the services the change touches and drives desktop, browser, and terminal together, with parallel edge cases. https://www.greptile.com/changelog and https://www.greptile.com/docs/trex/overview (page stamp 2026-10-28). A run costs 3 credits on top of review. The plan's "runs code in a sandbox" sentence does not name this.
- Cursor Bugbot release notes, fetched today: newest week is the week of 19 Oct 2026 (public-repo outside-contributor setting). https://cursor.com/docs/release-notes/bugbot No week of 26 Oct or 2 Nov is on that page.
- Augment blog index tops out at 2026-08-28. The code-review overview still describes Thorough vs Precise. https://docs.augmentcode.com/codereview/overview No post that the review model left GPT-5.2 was found.
- Graphite: Chat and Diamond docs retrieved; no date on or after 30 Oct on those pages. https://graphite.dev/blog/introducing-graphite-chat https://graphite.dev/docs/diamond

## 2. Public benchmarks and how they match

**golden_comments (this repo).** `ai-code-review-evaluations/golden_comments` @ `3f2c8ab` (decision 054): 5 repos × 10 PRs, 137 golden comments, 97 Medium or higher. Match is an LLM judge, `bench-judge-v1` (Nemotron Super, temperature 0, reasoning on): one request per PR maps each tool comment to a golden id or null. Low counts as nothing. A second match to the same golden is neither TP nor FP. Line match is not the rule. Decision 054 records that vendor write-ups of this set disagree, and that Augment's table does not name its judge.

**Augment's table on that set** (claim 4). Same five repos. Their page defines a true positive as a comment that "matches a golden comment" and does not name the judge model. https://www.augmentcode.com/blog/we-benchmarked-7-ai-code-review-tools-on-real-world-prs-here-are-the-results

**Martian Code Review Bench.** https://github.com/withmartian/code-review-benchmark (README) and https://codereview.withmartian.com/
Offline: golden comments, three judges (Claude Opus 4.5, GPT-5.2, Claude Sonnet 4.5), question is whether two comments are the same issue, category profiles, default weight F2. Page labeled "As of Sep 8, 2026", 1,050 scored PRs, ranked by F2: Qodo Deep 65.1 (P 67.1 / R 64.6), Cubic Dev 64.9 (61.5 / 65.8), Augment 64.0 (59.5 / 65.2). Greptile 51.2, CodeRabbit 51.1, Cursor Bugbot 48.6, Graphite 9.3 (P 100 / R 7.6).
Online, "Last month", read 2026-11-07, ranked by F1: Greptile 64.9 (P 82.2 / R 53.7), Cubic Dev AI 63.6 (69.2 / 58.9), CodeRabbit 62.2 (71.9 / 54.8), Devin 61.8, Qodo 61.5, Copilot 59.7, Cursor 56.6. The same page prints 17,802 scored PRs in the header, 1,501 on the Greptile card, and 137,474 in Greptile's Total PRs cell. The denominator is not one number. Online precision is "suggestions matched to real fixes", a different event from a golden-comment match.
IronBee, 2026-10-19, re-scored the same 50 PRs with a three-judge panel (Gemini 4 Argon, GPT-6.1 Sol, Claude Opus 5.5): best raw model Claude Sonnet 5.5 low, F2 64.4, P 46.0, R 71.5. https://ironbee.ai/blog/the-honest-raw-llm-code-review-benchmark Their panel stayed within about one F2 point of Martian's GPT-5.2 judge on three tools. Before the window; included because it is a published re-score of this dataset.

**ReviewBench (GitHub).** Post 2026-10-05: https://github.blog/ai-and-ml/github-copilot/reviewbench-an-open-benchmark-for-ai-code-review/ Leaderboard: https://review-bench.ai/
219 public PRs, 187 repos, 19 languages. Judge: Claude Sonnet 5, one rubric. A finding counts only if it is "true, relevant, and non-trivial." Grounded P/R/F1 use the fixed gold set. Augmented metrics also judge findings that match nothing. Not a line match. Senior re-label agreed 96.6%. Severity slices: Critical, Medium, Low.
Leaderboard extract today, top of the table: OhMyBug F1 83.0 / P 92.0 / R 75.6 (2026-10-25); intent-review-agent 82.2 / 92.0 / 74.4 (2026-10-20); Copilot Max 75.7 / 96.8 / 62.2 (2026-10-16). Qodo 68.3 (2026-09-28). Cursor 60.9 (2026-09-27). Greptile 33.4 / 95.2 / 20.2 (2026-06-16, row 21). Newest date in that top-21 extract is 2026-10-26 (Copilot Lite). HeyDeer's own post (2026-10-29, one day before the window) says the default view is high-severity and quotes their precision 99.0 and recall 51.4, which match row 10. https://heydeer.ai/blog/highest-precision-on-reviewbench I did not click a severity filter. Augment and CodeRabbit were not in the top 21 extract.
This repo (`docs/bench/results.md` §5): 25-PR test, ReviewBench's judge, product pool-verify-v1 on 3.5 grounded F1 12.2 (P 69.2 / R 6.7). Best config on that slice, pool-raw-x2 3 Super, 21.3. Stated there as not a leaderboard submission. Final 219×3 was not run.

**CodeReviewBench.** https://codereviewbench.com/ and https://codereviewbench.com/leaderboard
30 PRs, 95 human-authored bugs, judge claude-haiku-4-5, one run at vendor defaults, ranked by F1. Top row on the page: DeepSeek V4 Pro F1 43.9, P 43.6, R 44.2, 95% CI 32.3–56.3. Scorecards name the harness "kodus". Who operates the site beyond that was not established.

**Qodo's own set, 2026-10-12** (before the window, not in the plan). https://www.qodo.ai/blog/which-llm-should-review-your-code/
125 PRs, 703 bugs that were later fixed, single reviewer, explorer off, pairwise judge Claude Sonnet 4.6. The results table was not in the excerpts retrieved, so no leader F1 is copied here.

Cursor's resolution rate is a different metric: an LLM, at merge time, decides whether the author fixed the flagged bug. It is not golden-comment P/R/F. See claim 2.

## 3. Five claims in the plan, checked against the cited pages

**1. Greptile: an LLM severity score of 1–10, cut at 7, was "nearly random". Confirmed.**
https://www.greptile.com/blog/make-llms-shut-up (Daksh Gupta, 2024-12-18). Quote: "The LLMs judgment of its own output was nearly random." Same post: about 79% of earlier comments were nits; the filter that worked blocks a comment with cosine similarity over a threshold to at least 3 downvoted comments; address rate moved from 19% to 55+%. This is the same finding as decision 056. No new reason to retry a confidence cut.

**2. Bugbot voted inside one run over reordered diffs. Confirmed for the launch pipeline. The plan's "shuffled" is a paraphrase, and the same post says they left that pipeline.**
https://cursor.com/blog/building-bugbot (Jon Kaplan, 2026-01-15). Quote: "Run eight parallel passes with randomized diff order" and "Majority voting to filter out bugs found during only one pass." Also: "Each pass received a different ordering of the diff." The word "shuffled" is not in that post. A Cursor forum announcement of it (2026-01-16) does say "shuffled diffs": https://forum.cursor.com/t/building-a-better-bugbot/149040
Same blog post, later section: the largest gains came when they "switched Bugbot to a fully agentic design" that decides where to dig "instead of following a fixed sequence of passes," and the agent "was too cautious" until prompts became aggressive. The 8-pass vote is the launch flow, not what that post says shipped afterwards.
The "52% to over 70%" sentence is in that 15 Jan post (40 experiments, bugs per run 0.4 to 0.7). Later Cursor posts, still before this window: 2026-04-08, "the resolution rate is nearing 80%" and a table with Bugbot 78.13% on 50,310 PRs (https://cursor.com/blog/bugbot-learning); 2026-05-11, default effort "80% of bugs identified are resolved by merge time" (https://cursor.com/blog/may-2026-bugbot-changes). 2026-06-10: Composer 2.5 powers Bugbot, and they report 10% more bugs per review (https://cursor.com/blog/bugbot-updates-june-2026). Those are resolution-rate and count claims, not golden-comment F. They do not reopen decision 064: 064 voted whole reruns; this vote was several passes inside one launch-era run, and Cursor's own later write-up says the fixed pass sequence was replaced.

**3. Greptile: a different model family raises catch rate about 10%. The sentence is real. The 10 is not in the research chart.**
https://www.greptile.com/blog/how-to-build-a-code-review-agent (2026-10-09): "In our research on model inversion, bug catch rates go up ~10% when you do this."
The linked research post, https://www.greptile.com/blog/model-inversion (Rodrigo Caridad, 2026-07-21), does not contain "~10%" in the indexed text. Its P0/P1 recall chart reads 60.0% same-model vs 62.0% cross-model on Claude-authored PRs, and 50.5% vs 53.7% on Codex-authored PRs. The post calls the feature experimental. Sample size was not on the page (a "thousand PRs" figure appears only in a third-party summary and is not used). Product code here may call only Nemotron, so a second family is out of bounds anyway. This is not a measured reason to add one.

**4. Augment published 65/55/59 on this same 50-PR set. Confirmed, with the judge unnamed.**
https://www.augmentcode.com/blog/we-benchmarked-7-ai-code-review-tools-on-real-world-prs-here-are-the-results
Quote of the set: "50 pull requests across five multi-million line open-source codebases, including Sentry, Grafana, Cal.com, Discourse, and Keycloak." Table: Augment 65/55/59, Cursor 60/41/49, Greptile 45/45/45, CodeRabbit 36/43/39. They say they corrected the golden comments and published them at https://github.com/ai-code-review-evaluations. The page never names the model that decided a match. Decision 054 already re-scored the recorded reviews with bench-judge-v1 and got a higher F for all five, same order. The introducing post (last updated 2026-09-17) still says the reviewer is "Powered by GPT-5.2": https://www.augmentcode.com/blog/introducing-augment-code-review

**5. CodeRabbit "runs 20+ linters". Wrong against the cited docs page as fetched today.**
Plan §2.3 cites https://docs.coderabbit.ai/tools. That page now says "50+ third-party linters and security analysis tools" and names a sandbox. https://docs.coderabbit.ai/tools/reference, "Last updated: November 1, 2026", says "59 static analysis tools". ESLint, Biome, Oxlint, Semgrep, ast-grep, and ShellCheck are still in the catalog (https://docs.coderabbit.ai/tools/list). A stale mirror of the overview still says "40+". The "20+" figure was not on the cited page.

## 4. What this lane would carry into the shared conclusion

The week after 30 Oct did not publish a new review architecture. CodeRabbit spent it on security-scan volume and said the extra findings are unverified. Qodo spent it on a cross-repo map. Greptile's last product note, just outside the window, is driving the running app, which the plan already lists as a large item.
Leaderboard rank is not a technique. The same tools change order when the matcher changes from golden-comment F (this repo's judge), to F2 with three commercial judges (Martian offline), to "did the author fix it" (Martian online and Cursor's resolution rate), to ReviewBench's Sonnet 5 rubric. Copying whoever is first on one board is [UNVERIFIED] as a way to move bench-judge-v1.
Lost levers stay lost. Severity cuts failed in Greptile's 2024 post and in decision 056. Whole-run voting failed in 064; Bugbot's published vote was an older within-run design that the same post says they replaced with an agent. A second model family is both a hackathon-rule problem and a 2–3 point chart, not a 10-point result, on model-authored PRs.
The measurement gap the outside numbers make sharper: this repo has no fresh held-out set (CONTEXT: Cal.com is spent), and every public board uses a matcher this repo does not run. A new set is useful only with the matcher fixed in advance. Which pipeline change to measure on it is the other lanes' question; this lane does not have a new candidate from the last week.

Sources for §§1–3 are the URLs above. Repo numbers are decision 054 and `docs/bench/results.md` §5. No Nebius call. No benchmark run. No files outside `docs/research/2026-11-07/`.
