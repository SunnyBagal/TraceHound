# Deterministic reviewer gates (S1, S6)

`prefilterDiff(files, { ignore })` accepts `parseDiff` files and returns `{ kept, dropped: [{ path, rule }] }`. Files and hunks are not mutated. `ignore` comes from the optional `tracehound.json` field `review.ignore`; its default is `[]`. Existing config defaults are unchanged. Globs use Node's repo-relative POSIX glob matching.

| S1 rule id | What it drops and why |
| --- | --- |
| `lockfile` | Files named pnpm-lock.yaml, package-lock.json, yarn.lock, bun.lock, bun.lockb, Cargo.lock, poetry.lock, Gemfile.lock, go.sum or composer.lock, at any depth: dependency resolution noise. |
| `generated` | Files with @generated or DO NOT EDIT in the first five added lines; files under dist/, build/, out/, .next/, coverage/, vendor/ or node_modules/; *.min.js, *.min.css, *.map, *.pb.go and *_pb2.py: generated artifacts obscure authored changes. |
| `snapshot` | Files under __snapshots__/ or ending in .snap: recorded output obscures authored logic. |
| `binary` | Files with Git's Binary files … differ or GIT binary patch header: no text to review. |
| `whitespace` | Individual hunks whose concatenated added and removed text is equal after removing all whitespace: no substantive text change; retain the file and other hunks with their original coordinates. |
| `config-ignore` | Files matching review.ignore globs: explicit repository review exclusions. |

Whole-file rules take precedence over hunk filtering. A whitespace entry in `dropped` can coexist with that path in `kept`, even when all its hunks were removed. The post-gate treats only wholly removed paths as `prefiltered`.

`gateFindings(candidates, ctx)` returns `{ kept, dropped: [{ finding, rule, detail }] }`, plus optional `skipped` diagnostics for unchecked base evidence. The context supplies the parsed diff, `readFileAt(path)` for the head checkout, optional `readBaseFileAt(path)`, a suppressions array, options, and optionally an already computed S1 result. Otherwise the gate computes S1 itself. Rules run in this order:

| S6 rule id | What it drops and why |
| --- | --- |
| `prefiltered` | Findings on paths wholly removed by S1: excluded review material. |
| `not-in-diff` | Numbered findings outside added or context lines of retained hunks, or null-line file comments whose path is absent from the retained diff: no PR location; contract and tsc sources instead require their path to exist at head. |
| `evidence-missing` | Findings with absent or empty evidence when requireEvidence is true: requested substantiation is missing. |
| `evidence-mismatch` | Findings with any empty, invalid or unmatched checked quote: base-side citations use the base reader; head-side or unspecified citations use head; each first line must be within ±3 of its cited 1-based revision line, with multiline quotes matching consecutively. Base citations are skipped with a detail when no base reader is supplied. |
| `style` | Style-category findings, or reviewed nit patterns only when no runtime defect signal matches: preserve bug reports even when they use words such as consider or typo; contract-category and contract/tsc-source findings are always exempt from style filtering. |
| `suppressed` | Findings accepted by any injected suppression fingerprint matcher: honor explicit suppressions; persistence and fingerprint generation are deferred to codex-09. |
| `duplicate` | Findings agreeing on normalized path and non-null lines within 3, using scripts/bench/agree-rule.ts: retain the highest votes, then highest severity, then earliest input. |
| `severity-floor` | Findings with an explicit severity below minSeverity: honor the requested floor; unspecified severity passes. |
| `cap` | Findings beyond maxPerPr, ranked by votes, severity, then input order: honor the requested review limit. |

Severities rank low < medium < high < critical. Missing votes rank as zero; missing severity ranks below low for ranking only. Duplicate selection visits ranked candidates and compares each to retained winners; a discarded candidate cannot discard another candidate. This handles overlapping three-line neighborhoods deterministically and preserves idempotence. Selected findings retain their original objects, fields, and input order. Reapplying the gate to `kept` yields the same `kept` and no new drops with the same head reader and suppression matchers.

The reviewed `defectSignals` list in `gate/nits.ts` covers crash, throw/throws, exception, TypeError, null, undefined, NaN, panic, fail/fails, error, wrong, incorrect, broken/breaks, never, always, leak, race, overflow, off-by-one, injection, XSS, unauthorized, bypass, data loss, deadlock, infinite loop, regression, is never set, and returns … instead of. Matching is case-insensitive and uses word boundaries. These general-purpose signals protect nit-shaped runtime reports; an explicit style category still drops unless a contract/compiler exemption applies.

With options unset and suppressions empty, S6 applies prefiltered, not-in-diff, evidence-mismatch when evidence is present, style, and duplicate. The CLI currently supplies an empty suppression array. Neither stage calls a model or uses the network.

```sh
pnpm tracehound gate --pr input.json --findings findings.json --repo /path/to/head --out gated.json
pnpm tracehound gate --pr input.json --findings findings.json --repo /path/to/head --out gated.json --base <sha> --require-evidence --min-severity medium --max-per-pr 5
```

The PR JSON needs a string `diff`, matching recorded reviewer inputs. Findings accept `{ "findings": [{ "path", "line", "body" }] }`, the pool-verify-v1 `{ "comments": [...] }` envelope, or a bare array. Optional candidate fields are source, votes, evidence, scenario, severity and category; extra finding fields are preserved. Evidence items have path, line, quote and optional side (`base` or `head`, defaulting to head). Lines are positive integers or null for findings; evidence lines are positive integers. Null lines denote file-level comments on retained diff paths. The compatibility fixtures are synthetic and contain no benchmark material. Declared excluded repository identities are rejected.

Output is `{ kept, dropped, counts }`; counts aggregate dropped findings by S6 rule id, including only rules that fired. The cap accepts a non-negative safe integer, including zero. The head reader refuses absolute paths, traversal and symlinks escaping the checkout. Invalid input exits with status 1 without echoing file contents. Action integration and real dev-output evaluation are deferred; pool-verify-v1 is unchanged.

`--base <sha>` accepts an existing commit SHA (7–64 hexadecimal characters, including abbreviated SHAs), resolves it once, and reads blobs with local `git show <sha>:<path>`. All Git calls use `cleanGitEnv()`; no shell, network, textconv or external diff helper is used. Absolute paths and traversal are rejected. A supplied reader that cannot find a file produces an evidence mismatch. With no base reader, each base citation is left unchecked and reported in optional `skipped: [{ finding, rule: "evidence-mismatch", detail }]`; detail states that base evidence was skipped because no base reader was supplied. These diagnostics preserve candidate identity and do not increment dropped-finding counts. Head evidence is always checked, including alongside skipped base citations.
