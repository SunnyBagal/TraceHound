# Devpost submission checklist

Deadline: 30 Oct 2026, 22:30 IST. Submit on 29 Oct. Status as of 28 Oct (seed-01 fill). Numbers
come from the brain's `submission/numbers.md` only. Owners: **Sunny** (by hand: accounts,
settings, video, the Devpost form, merges), **chat** (numbers.md, decisions and the claims check), **relay** (071b;
results.md and the viewer's `/benchmark`), **Bunny** (docs fills: README #54, `docs/devpost/` #58;
seed-01 scoring), **Claude B** (UI, ui-11, in
`viewer/`, not the `/benchmark` tables).

## Open slots carried in the drafts

| slot | source (numbers.md) | who fills numbers.md | who fills the drafts |
|---|---|---|---|
| Seeded PRs | §7, seed-01 | ✅ scored 28 Oct | ✅ done: seed-01, 28 Oct |
| `[[TBD-ULTRA]]` | §5, 071b run 11 | relay (071b), then chat | ✅ done: relay (fill-01, 27 Oct) |
| `[[TBD-LEVERS]]` | §9, levers v2 replay (codex-14) | chat | ✅ done: relay (fill-01, 27 Oct) |

## R14 requirements

| # | requirement | status (28 Oct) | who | evidence / what's left |
|---|---|---|---|---|
| 1 | Uses Nebius Token Factory and at least one NVIDIA open model | ✅ done | — | Every review stage calls Nemotron 3.5 Super on Token Factory (`docs/action/README.md`, decisions 067, 068). |
| 2 | Public repo with an open licence | ✅ done | — | `SunnyBagal/TraceHound` is public; `LICENSE` is MIT; `package.json` says `"license": "MIT"`. |
| 3 | MIT licence visible in the repo's About sidebar | ✅ done | — | `gh repo view --json licenseInfo` → `{"key":"mit","name":"MIT License"}` (23 Oct). The sidebar itself was not checked visually. |
| 4 | About text matches the product | ❌ not done | Sunny | The About description still reads "Persistent repository intelligence … guides sandboxed agents toward tested fixes", the pre-pivot framing. Suggest: "Open-source GitHub Action that reviews pull requests with NVIDIA Nemotron on Nebius Token Factory. Every loss is published." Homepage is set to the dashboard. Topics are empty. |
| 5 | README highlights the NVIDIA models and Token Factory | ✅ filled (#54, draft), seed-01, 28 Oct | Sunny merges | #54 has the results, losses, live demo and seeded PRs from numbers.md; seeded slots done. |
| 6 | README pin | ✅ in #54 | — | The install block pins `review-freeze-2.1` (`86fd5d7`) with `model: 'nvidia/Nemotron-3.5-Super-VL'`: the review pipeline at `review-freeze-2`; the Action at `review-freeze-2.1` fixes installation only. |
| 7 | Working demo, free for judges until 15 Dec, **without a judge's own Nebius key** | ✅ seeded PRs for viewing (seed-01, 28 Oct); ⏳ hosting confirmation | Sunny (Vercel) | The 30 seeded PRs on two public mirror repos: [Recall](https://github.com/SunnyBagal/recall-seeded) and [Linea](https://github.com/SunnyBagal/linea-seeded). Judges can't trigger a review without write access to the demo repo: the Action runs only on same-repository PRs (forks get no secrets) and spends our key. The writeup says so. [[SUNNY: confirm Vercel hosting stays up until 15 Dec.]] |
| 8 | Demo reviews come from the frozen config | ✅ seed-01, 28 Oct | — | pool-verify-v1 on 3.5; Recall ran the Action at `0aeef06`, Linea at `86fd5d7` (the install fix). Model catch: [check-then-act race](https://github.com/SunnyBagal/recall-seeded/pull/4#discussion_r4393814033); contract-check catch: [renamed route still used in an unedited file](https://github.com/SunnyBagal/recall-seeded/pull/7#pullrequestreview-5673943375), no model. 3 of the 4 cross-file catches came from the deterministic contract check. No other reviewer was run on these PRs. |
| 9 | Video under 3 minutes, public on YouTube, shows it working | ✅ seeded script slots done (seed-01, 28 Oct); ⏳ shoot | Sunny | `docs/devpost/video-script.md` (2:50); model catch, contract-check catch and allowed sentence filled. Dashboard fallback is the GitHub review. Shoot 28 Oct. Set the YouTube video to Public, not Unlisted. [[SUNNY: YouTube URL]] |
| 10 | No third-party trademarks in the video | ✅ decided; ⏳ shoot | Sunny | Chat, 27 Oct: NVIDIA/Nebius names may appear where their own UI or our model id shows them; no logos as decoration; GitHub's UI may appear. The script names no other reviewer. `/benchmark`'s tables and the graph's technology logos stay off screen. |
| 11 | No competitor names in the Devpost text | ✅ in draft | chat (claims check), then Sunny | `writeup.md` uses allowed sentences without names ("five commercial reviewers", "the leading commercial reviewer"). The v3 defects are credited to "an automated review". Seeded test: no other reviewer was run on these PRs. |
| 12 | English | ✅ | — | All drafts are in English. |
| 13 | Feedback on Nebius and NVIDIA | ✅ source ready; ⏳ paste | Sunny | `FEEDBACK.md` and `docs/devpost/nebius-feedback-summary.md`. Any Nebius call after 23 Oct adds a dated entry (standing rule); update the summary's counts before pasting. |
| 14 | Existing project "significantly updated" after 26 Aug, with an explanation | ⏳ draft with open questions | Sunny | `docs/devpost/what-changed-since-26-aug.md`. The git history starts on 30 Sep. [[SUNNY: what existed before 26 Aug (FixFlow?), and whether the 30 Sep work was written that day.]] |
| 15 | Write-up fields | ✅ seeded slots done (seed-01, 28 Oct); ⏳ Sunny slots | chat (claims check), Sunny (personal reason, paste) | `docs/devpost/writeup.md`: seeded slots filled from numbers.md §7. Open: `[[SUNNY: personal reason]]`, `[[SUNNY: YouTube URL]]`. |
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
| 27–28 Oct | UI changes in `viewer/` (ui-11) | Claude B |
| 28 Oct | fill `[[TBD-…]]` in both drafts | Bunny |
| 28 Oct | claims check on both drafts | chat |
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
