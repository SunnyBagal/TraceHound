# Viewer round 1 — 17 Oct 2026

The public switcher exposes three real repos and the two real Recall change sets. The worker-deletion demo, seeded CEX diff and toy repair run are explicitly `public: false` in `changesets/index.json`; `?dev=1` restores them. Direct hidden change-set loads are also filtered.

The viewer keeps its dark canvas and existing type scale, with body copy at least 14px. Kind tokens drive the left border, header and icon, with selection and highlights taking precedence. The collapsible legend lists only kinds present. Nodes expand from snapshot facts, cap their lists at eight items, reflow with ELK, keep the clicked node anchored, and restore expansion from the URL hash. Summary text is the snapshot summary or existing heuristic subtitle; none was authored by hand.

Overview separates Summary, provenance, technology cards and routes. Route and file rows show evidence snippets immediately; Show more fetches source at the analyzed SHA. Known declaration ranges win; other previews use thirty lines of surrounding context. GitHub links remain visible. Fetch failures retain the snippet. The provenance link replaces SHA copying; the browser makes at most one cached comparison request per page and silently omits failed freshness checks.

## Snapshots

Both repos were cloned into `/private/tmp` and analyzed with the existing CLI, `configs/recall.tracehound.json`, and explicit `--naming heuristic`. No source changes were made to the analyzer, no repo dependencies were installed, and no model requests were made. Older snapshots remain indexed.

| Repo | Main commit | Commit date | Analyzer | Files | Nodes | Edges | Warnings |
| --- | --- | --- | --- | ---: | ---: | ---: | ---: |
| Recall | `20ac149ea593ccc032426674ec36927da3f30f16` | 7 Oct 2026 | 0.10.0 | 55 | 7 | 6 | 2 |
| tracehound-demo (Recall copy) | `efc58448e828167d909bedca5b3f7a697449c7fd` | 17 Oct 2026 | 0.10.0 | 63 | 7 | 6 | 2 |

Recall's remote `main` still contains both warned files at `20ac149` (verified with `git ls-tree`). The requested disappearance of deleted-file warnings could not be confirmed: neither file is deleted in that commit. Both new snapshots have exactly these two `orphan-file` warnings, and no queue or override warnings:

- `recall-backend/Usecontent.tsx`: not imported and not an entry point; two exported symbols have no consumers.
- `recall-frontend/src/icons/SidebarToggle.tsx`: not imported and not an entry point; one exported symbol has no consumers.

The existing CEX snapshot is retained at `da0e3d6`, with one orphan warning for `engine/src/store/exchange-store.ts` (15 exported symbols without consumers).

## Validation

Before each final gate, `env | grep -E '^GIT_'` printed nothing. Gates ran in plain subprocess shells, outside hooks.

| Gate | Result |
| --- | --- |
| `pnpm test` | 732 passed, 6 skipped; 65 test files passed, 5 skipped |
| Action tests | 64 passed |
| Analyzer tests | 509 passed, 6 skipped |
| Viewer tests | 159 passed |
| `pnpm typecheck` | All 3 packages passed |
| `pnpm --filter @tracehound/viewer build` | Passed; static routes and exported snapshot/change-set/impact references verified |
| Snapshot version guard | Every repo latest is analyzer 0.10.0 |

Viewer tests cover visibility, provenance, one-request freshness caching, all schema kind tokens and AA contrast, legend membership, mixed-height layout without overlap, expand/collapse with URL restoration, immediate route/file snippets, pinned source fetching, declaration bounds and offline fallback. Viewer tests use an offline fetch stub by default.

One intermediate commit, `f6df5a9`, was created with a malformed new content test before its failed gate was noticed. `6b1def6` fixes it while adding URL expansion state. History was preserved; all final gates pass. This is an exception to the requested every-commit-green rule.

## Browser review

The viewer was run locally with Next development mode, then the final static export was served locally for these Chrome captures. The public GitHub comparison succeeded (`0 commits behind main` for Recall). A live Show more request loaded the signup handler's recorded lines 35–70 at `20ac149`. The screenshot files are full browser-window captures:

- [Recall graph collapsed](recall-collapsed.png)
- [API expanded](api-expanded.png)
- [Kind legend](legend.png)
- [Inspector Overview](inspector-overview.png)
- [Route with code](route-code.png)
- [File with code](file-code.png)
- [Public repo switcher](repo-switcher.png)

## Deferred and schema limits

Nebius spend: **$0**. Step 9 remains gated until Sunny writes **“062 is done”** in this task. No Nemotron Super naming pass or FEEDBACK entry was made. New snapshots contain no model-written summaries. Existing `summary: false` overrides remain respected.

The frozen analyzer emits seven kinds: api, worker, service, library, db, cache and queue. The token table also defines violet web-app and pink external-service tokens, but the viewer does not infer those kinds. Recall's frontend is explicitly `service` in the snapshot and therefore remains teal. Its entry file is available through expansion when no exports exist; otherwise service expansion lists exported symbols. A future schema change is needed to emit a distinct frontend kind. Older snapshots without publication metadata show an honest `commit @ <sha>` fallback rather than an invented branch or date.

No dependencies were added. No files outside the authorized UI paths were changed. ui-02 remains out of scope.
