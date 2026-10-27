# Devpost submission checklist

Deadline: 30 Oct 2026, 22:30 IST. Submit on 29 Oct. Status as of 27 Oct (bunny-06 fill). Numbers
come from the brain's `submission/numbers.md` only. Owners: **Sunny** (by hand: accounts,
settings, video, the Devpost form, merges), **chat** (numbers.md and decisions), **relay** (071b;
results.md and the viewer's `/benchmark`), **Bunny** (docs fills: README #54, `docs/devpost/` #58;
seed-01 scoring), **Gemini** (claims verifier, gemini-01, after bunny-06), **Cursor** (UI in
`viewer/`, not the `/benchmark` tables).

## Open slots carried in the drafts

| slot | source (numbers.md) | who fills numbers.md | who fills the drafts |
|---|---|---|---|
| `[[TBD-SEEDED]]` | §7, seed-01 | Sunny (hand steps) + Bunny (scoring), then chat | Bunny |
| `[[TBD-ULTRA]]` | §5, 071b run 11 | relay (071b), then chat | Bunny |
| `[[TBD-LEVERS]]` | §9, levers v2 replay (codex-14) | chat | Bunny |

## R14 requirements

| # | requirement | status (27 Oct) | who | evidence / what's left |
|---|---|---|---|---|
| 1 | Uses Nebius Token Factory and at least one NVIDIA open model | ✅ done | — | Every review stage calls Nemotron 3.5 Super on Token Factory (`docs/action/README.md`, decisions 067, 068). |
| 2 | Public repo with an open licence | ✅ done | — | `SunnyBagal/TraceHound` is public; `LICENSE` is MIT; `package.json` says `"license": "MIT"`. |
| 3 | MIT licence visible in the repo's About sidebar | ✅ done | — | `gh repo view --json licenseInfo` → `{"key":"mit","name":"MIT License"}` (23 Oct). The sidebar itself was not checked visually. |
| 4 | About text matches the product | ❌ not done | Sunny | The About description still reads "Persistent repository intelligence … guides sandboxed agents toward tested fixes", the pre-pivot framing. Suggest: "Open-source GitHub Action that reviews pull requests with NVIDIA Nemotron on Nebius Token Factory. Every loss is published." Homepage is set to the dashboard. Topics are empty. |
| 5 | README highlights the NVIDIA models and Token Factory | ⏳ filled (#54, draft) | Sunny merges after `[[TBD-…]]` are filled (Bunny) | #54 now has the results (Cal.com v2 and v1, all 50), the v2 paragraph, ReviewBench test runs, cost, losses, live demo and what's next, from numbers.md. Open: `[[TBD-SEEDED]]`, `[[TBD-ULTRA]]`, `[[TBD-LEVERS]]`. |
| 6 | README pin | ✅ in #54 | — | The install block pins `@0aeef06fa8742cc8a36581c3894e554b8748c965 # review-freeze-2` with `model: 'nvidia/Nemotron-3.5-Super-VL'`. "Built with" says 3.5 Super is the product model (decision 068). |
| 7 | Working demo, free for judges until 15 Dec, **without a judge's own Nebius key** | ✅ for viewing; ⏳ seeded PRs | Sunny + Bunny (seed-01); Sunny (Vercel) | Browsing the recorded reviews, the dashboard and the seeded PRs is enough (chat, 27 Oct). Judges can't trigger a review without write access to the demo repo: the Action runs only on same-repository PRs (forks get no secrets) and spends our key. The writeup says so. Dashboard `/`, `/reviews`, `/benchmark` returned 200 on 23 Oct; `/reviews` reads GitHub's public API without a token (unauthenticated rate limit per viewer IP). [[SUNNY: confirm Vercel hosting stays up until 15 Dec.]] |
| 8 | Demo reviews come from the frozen config | ⏳ seed-01 | Sunny + Bunny | The demo repo pins `@0aeef06` with the 3.5 model. Demo PR #2 under 3.5 posted no findings (24 Oct). The older reviews were Nano generators: never show them as the current config. Demo PR #6 is never merged. Seeded PRs: `[[TBD-SEEDED]]`. |
| 9 | Video under 3 minutes, public on YouTube, shows it working | ⏳ script updated | Sunny | `docs/devpost/video-script.md` (2:50, numbers from numbers.md, 3.5 and freeze-2 on screen). Shots 2, 3 and part of 6 wait for `[[TBD-SEEDED]]`. Shoot 28 Oct. Set the YouTube video to Public, not Unlisted. [[SUNNY: YouTube URL]] |
| 10 | No third-party trademarks in the video | ✅ decided; ⏳ shoot | Sunny | Chat, 27 Oct: NVIDIA/Nebius names may appear where their own UI or our model id shows them; no logos as decoration; GitHub's UI may appear. The script names no other reviewer. `/benchmark`'s tables and the graph's technology logos stay off screen. |
| 11 | No competitor names in the Devpost text | ✅ in draft | Gemini (claims check), then Sunny | `writeup.md` uses numbers.md §1 and §2's allowed sentences without names ("five commercial reviewers", "the leading commercial reviewer"). The v3 defects are credited to "an automated review", not by product name. "How we built it" names the AI coding assistants used (Claude Code, Codex, Cursor, Devin, Grok, Gemini; chat, 27 Oct), factually and without logos; Cursor is also a reviewer company in the benchmark, so this is the one place a reviewer company's name appears, as a coding tool. The linked `docs/bench/results.md` and README do name the reviewers. Contracts claim bounded on 23 Oct (codex-13 audit); its network wording is numbers.md §0 rule 10. |
| 12 | English | ✅ | — | All drafts are in English. |
| 13 | Feedback on Nebius and NVIDIA | ✅ source ready; ⏳ paste | Sunny | `FEEDBACK.md` and `docs/devpost/nebius-feedback-summary.md`. Any Nebius call after 23 Oct adds a dated entry (standing rule); update the summary's counts before pasting. |
| 14 | Existing project "significantly updated" after 26 Aug, with an explanation | ⏳ draft with open questions | Sunny | `docs/devpost/what-changed-since-26-aug.md`. The git history starts on 30 Sep. [[SUNNY: what existed before 26 Aug (FixFlow?), and whether the 30 Sep work was written that day.]] |
| 15 | Write-up fields | ⏳ filled except open slots | Bunny (slots), Gemini (claims check), Sunny (personal reason, paste) | `docs/devpost/writeup.md`: filled from numbers.md. Open: `[[TBD-SEEDED]]`, `[[TBD-ULTRA]]`, `[[TBD-LEVERS]]`, `[[SUNNY: personal reason]]`, `[[SUNNY: YouTube URL]]`. |
| 16 | Track | ⏳ | Sunny | `docs/reviewer-plan.md` names "Coding and Agentic Engineering". Choose it in the form. |
| 17 | Submit by 29 Oct | ⏳ | Sunny | — |

## Plan, 27–29 Oct

| day | item | who |
|---|---|---|
| 27 Oct | bunny-06: README #54 and Devpost #58 filled from numbers.md | Bunny |
| 27 Oct | 071b (Ultra run 11) → numbers.md §5 | relay, then chat |
| 27 Oct | levers v2 replay → numbers.md §9 | chat |
| 27 Oct | seed-01 hand steps, then scoring → numbers.md §7 | Sunny, Bunny, then chat |
| 27–28 Oct | results.md and viewer `/benchmark` fill (after 071b) | relay |
| 27–28 Oct | UI changes in `viewer/` | Cursor |
| 28 Oct | fill `[[TBD-…]]` in both drafts | Bunny |
| 28 Oct | claims verifier on both drafts (gemini-01) | Gemini |
| 28 Oct | shoot and upload the video; About text; Vercel check | Sunny |
| 29 Oct | merge #54 and #58; paste the Devpost fields; submit | Sunny |

## Judging criteria, and where the write-up covers them

Judging is pass/fail, then four equal criteria.

| criterion | covered in `writeup.md` |
|---|---|
| Technological Implementation (incl. how well NVIDIA models are used) | "How we built it" leads: the four parts of the pipeline, which Nemotron model runs which stage and why, the region routing, partial reviews, budget guardrails, pre-registration and freeze tags. |
| Design | "What it does": one review per PR, fixes GitHub can commit in one click, contracts, the dashboard. The video shows it working. |
| Potential Impact | One YAML block to install, cents per PR, a public benchmark comparison with intervals. |
| Quality of the Idea | Evidence-first review, and every loss published (accomplishments, challenges). |

## Repo state checked for this list

- `main` @ `36de717` (27 Oct), merged into both draft branches.
- Tag `review-freeze-2` → `0aeef06`.
- Local gates on both branches: see the bunny-06 report.
