# Devpost submission checklist

Deadline: 30 Oct 2026, 22:30 IST. Submit on 29 Oct. Status as of 23 Oct, from this job's checks.
"Sunny" means the owner does it by hand (accounts, settings, video, the Devpost form). "Fill job"
means the 26–27 Oct job that replaces the placeholders.

## R14 requirements

| # | requirement | status (23 Oct) | who | evidence / what's left |
|---|---|---|---|---|
| 1 | Uses Nebius Token Factory and at least one NVIDIA open model | ✅ done | — | Every review stage calls Nemotron on Token Factory (`docs/action/README.md`, decisions 067, 068). |
| 2 | Public repo with an open licence | ✅ done | — | `SunnyBagal/TraceHound` is public; `LICENSE` is MIT; `package.json` says `"license": "MIT"`. |
| 3 | MIT licence visible in the repo's About sidebar | ✅ done | — | `gh repo view --json licenseInfo` → `{"key":"mit","name":"MIT License"}`: GitHub has detected it, and the sidebar's licence entry comes from that field. The sidebar itself was not checked visually. |
| 4 | About text matches the product | ❌ not done | Sunny | The About description still reads "Persistent repository intelligence … guides sandboxed agents toward tested fixes", the pre-pivot framing. Suggest: "Open-source GitHub Action that reviews pull requests with NVIDIA Nemotron on Nebius Token Factory. Every loss is published." Homepage is set to the dashboard. Topics are empty. |
| 5 | README highlights the NVIDIA models and Token Factory | ⏳ draft (#54, open) | Fill job, then Sunny merges | #54 has `[[RESULTS-TABLE]]`, `[[REVIEWBENCH]]`, `[[SEEDED-TEST]]`, `[[COST]]`. It is also out of date after decision 068 (see "README pin" below). |
| 6 | README pin | ⏳ to fix in #54 | Fill job | Read here as the Action reference in the README's install block. #54 uses `@main` and sets `model: nvidia/nemotron-3-super-120b-a12b # The benchmarked model`, and its "Built with" says "Nemotron 3.5 Super is being evaluated (decision 067)". Since 068 the default is 3.5 and the freeze is `review-freeze-2` → `0aeef06fa8742cc8a36581c3894e554b8748c965` (what `.github/workflows/tracehound-review.yml` pins). [[SUNNY: if "README pin" meant something else, e.g. pinning the repo on your GitHub profile, say so.]] |
| 7 | Working demo, free for judges until 15 Dec, **without a judge's own Nebius key** | ✅ for viewing; ⚠️ see notes | Sunny | Dashboard `https://tracehound-tau.vercel.app` returned 200 for `/`, `/reviews` and `/benchmark` on 23 Oct. It is a static export and needs no key. `/reviews` reads `SunnyBagal/tracehound-demo` from GitHub's public API without a token, so it is subject to GitHub's unauthenticated rate limit per viewer IP. Seeing a *new* review needs a PR on the demo repo, which uses our key. Installing the Action in a judge's own repo needs their key. [[SUNNY: is "browse recorded reviews + dashboard" enough for R14, or should judges be able to trigger a review (e.g. open a PR on the demo repo, running on our key under a cap)?]] [[SUNNY: confirm Vercel hosting stays up until 15 Dec.]] |
| 8 | Demo reviews come from the frozen config | ❌ not yet | Fill job (26 Oct seeded test) | The reviews on `tracehound-demo` PRs #1–#5 date from 17–18 Oct (Nano reviewers, before freeze-2). The 26 Oct seeded test makes fresh ones. Until then, don't show or quote the old ones ("2 of 4 seeded lines") as the current config. |
| 9 | Video under 3 minutes, public on YouTube, shows it working | ❌ not started | Sunny | Script: `docs/devpost/video-script.md` (2:50). Shoot after the 26 Oct fill. Set the YouTube video to Public, not Unlisted. [[SUNNY: YouTube URL]] |
| 10 | No third-party trademarks in the video | ⏳ script only | Sunny | The script names no other reviewer. `/benchmark`'s tables and the graph's technology logos must stay off screen. [[SUNNY: whether the NVIDIA / Nebius marks and GitHub's UI may appear.]] |
| 11 | No competitor names in the Devpost text | ⏳ draft | Sunny | `writeup.md` says "compared with five commercial reviewers; see the results doc". [[SUNNY: decision 066's claim names three reviewers; writeup.md uses a version without names. Approve it or pick other wording.]] The linked `docs/bench/results.md` and README do name them. That is the evidence a judge follows, not the Devpost text. |
| 12 | English | ✅ | — | All drafts are in English. |
| 13 | Feedback on Nebius and NVIDIA | ✅ source ready; ⏳ paste | Sunny | `FEEDBACK.md` (26 entries) and `docs/devpost/nebius-feedback-summary.md`. Any Nebius call on 26 Oct adds a dated entry (standing rule); update the summary's counts after it. |
| 14 | Existing project "significantly updated" after 26 Aug, with an explanation | ⏳ draft with open questions | Sunny | `docs/devpost/what-changed-since-26-aug.md`. The git history starts on 30 Sep. [[SUNNY: what existed before 26 Aug (FixFlow?), and whether the 30 Sep work was written that day.]] |
| 15 | Write-up fields | ⏳ draft | Fill job, then Sunny | `docs/devpost/writeup.md`: placeholders `[[RB-FINAL]]`, `[[SEEDED]]`, `[[CALCOM-V2]]`, `[[ALL50-V2]]`, plus `[[SUNNY: …]]` items. |
| 16 | Track | ⏳ | Sunny | `docs/reviewer-plan.md` names "Coding and Agentic Engineering". Choose it in the form. |
| 17 | Submit by 29 Oct | ⏳ | Sunny | — |

## Judging criteria, and where the write-up covers them

Judging is pass/fail, then four equal criteria.

| criterion | covered in `writeup.md` |
|---|---|
| Technological Implementation (incl. how well NVIDIA models are used) | "How we built it" leads: the four parts of the pipeline, which Nemotron model runs which stage and why, the region routing, partial reviews, budget guardrails, pre-registration and freeze tags. |
| Design | "What it does": one review per PR, fixes GitHub can commit in one click, contracts, the dashboard. The video shows it working. |
| Potential Impact | One YAML block to install, cents per PR, a public benchmark comparison with intervals. |
| Quality of the Idea | Evidence-first review, and every loss published (accomplishments, challenges). |

## Repo state checked for this list

- `main` @ `8712273`: CI succeeded on 23 Oct; ReviewBench smoke and image builds succeeded on `0aeef06`.
- Local gates on `docs/devpost-drafts`: `pnpm test` and `pnpm typecheck` green (action 237, analyzer
  880 + 7 skipped, viewer 188).
- Tag `review-freeze-2` → `0aeef06`.
