AGREE

Non-blocking wording on DRAFT-CONCLUSION.md line 7. "known mechanical cause (16 of 56 golden-runs sit in PRs with a failed chunk)" is stronger than the measurement. claude.r1.md:7 calls those 16 an upper bound: generator misses that sit in a PR with a failed chunk, not misses shown to be that chunk. Section 1 already gates on a failure count (E2) and no-harm (E3), and the ranked table says "at most +16 … upper bound." Replacement for that clause: "it is the only generator-miss subset with a measured failure beside it (16 of 56 golden-runs sit in PRs with a failed chunk; upper bound, claude.r1)."

Checked and left as written:
- Cache replay by key does not scan the shared cache. `ResponseCache.key` is sha256(model + request) (`cache.ts:13-15`); `get` reads one file (`cache.ts:17-19`). Reviewer cache reads are off today (`run-test-set.ts:140`). Turning them on is a runner change, and E1's fresh-capture fallback covers a miss. A stored body is the full completion (`client.ts:301`), and a hit returns `finishReason` (`client.ts:372-379` into `review.ts:61-63`), so E4 can split length vs other reasons without listing the directory.
- B1 then B2 keeps one-switch attribution inside the $4 cap. That matches the one-switch point in scout.r2.
- "both skips the verifier" stays dropped: +6 TP and +8 FP comments over runs 7r+8 (`comms/devin-to-claude-1.answer.md:18-19`).
- 3.5 Super VL is $0.30 / $0.06 cached / $0.90, and Lightning is $0.06 / $0.24, on https://tokenfactory.nebius.com/api/public/models_info (fetched 2026-11-07). Completed dev runs cached 0 calls, so line 53's "$0 today" holds. A hit is ledgered at $0 (`client.ts:262`).
- Augment −14.0 [−22.6, −4.7] is `docs/bench/results.md:97`. Tied with Cursor and Greptile on all 50 is `results.md:10`.
- Line 61 does not depend on the rejected instruction-file claims. Claude Code reads CLAUDE.md when both files exist, and the Codex guide has no CODEX.md (VERIFY.md).
- The "1 of 10" Cal.com clause is a published count. The exit criteria do not use Cal.com results.

No inbound comms at draft time.
