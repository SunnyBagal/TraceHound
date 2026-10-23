# Nebius Token Factory and NVIDIA Nemotron: feedback summary

A one-page summary of `FEEDBACK.md` (26 dated entries, 30 Sep – 21 Oct 2026). Every count and
error string below is copied from those entries, and each entry has the details. Facts come first;
opinions are labelled.

## What we called

- **Inference:** `POST /v1/chat/completions` (OpenAI-compatible, native `tools`) and
  `GET /v1/models`, on `api.tokenfactory.us-central1.nebius.com`. Since 21 Oct, Nemotron 3.5
  Super also uses `api.tokenfactory.us-north1.nebius.com`.
- **Models:** `nvidia/NVIDIA-Nemotron-3-Nano-30B-A3B` (naming, repair agent, early reviewer),
  `nvidia/nemotron-3-super-120b-a12b` (repair agent, reviewer, verifier, judge, fixes),
  `nvidia/Nemotron-3.5-Super-VL` (reviewer and verifier since 23 Oct), and
  `Qwen/Qwen3-235B-A22B-Instruct-2507` (second judge only).
- **Sandboxes (Contree):** `https://api.tokenfactory.nebius.com/sandboxes/v1`. No sandbox ever ran.

## Counts (largest batches)

| batch (FEEDBACK entry) | model | requests | OK | failed |
|---|---|---:|---:|---:|
| Held-out repair evaluation (5–6 Oct) | Nano | 2,365 | 2,361 | 4 (timeouts) |
| | 3 Super | 1,769 | 1,767 | 2 (timeouts) |
| Review benchmark, decisions 054–059 (14–16 Oct) | 3 Super, Nano | 961 | 960 | 1 (2 of the OK replies had no `usage`) |
| Second judge and validity checks (16 Oct) | Qwen, 3 Super | 939 | 939 | 0 |
| Blind test-set run (17 Oct) | 3 Super, Qwen | 1,139 | 1,138 | 1 |
| Vote across runs (18 Oct) | 3 Super, Qwen | 1,443 | 1,442 | 1 |
| Evidence verifier (19 Oct) | 3 Super, Qwen | 1,172 | 1,172 | 0 |
| 3.5 Super, us-central1 (20 Oct) | 3.5 Super | 35 | 0 | 35 (HTTP 404) |
| 3.5 Super, us-north1 (21 Oct) | 3.5 Super | 624 | 623 | 1 |
| | 3 Super, Qwen (judges) | 260 | 260 | 0 |

Smaller probes (naming, reasoning controls, tool calling: 30 Sep and 18 Oct) all returned HTTP 200.
No HTTP 429 was recorded. The only HTTP errors recorded are the 35 × 404 below; the one failed
judge request on 17 Oct is not classified in `FEEDBACK.md`.

## Problems, with exact error strings

1. **A listed model that answers 404.** On us-central1, `GET /v1/models` lists
   `nvidia/Nemotron-3.5-Super-VL`. Chat completions for that id on the same key and base URL
   returned, 35 times out of 35:
   `` HTTP 404: The model `nvidia/Nemotron-3.5-Super-VL` does not exist. ``
   The model is served from us-north1, where `nvidia/nemotron-3-super-120b-a12b` returns
   `model_not_found`. The console's code sample for 3.5 shows us-north1; the API gave no hint.
2. **3.5 Super returns invalid JSON under reasoning.** In 3 dev runs (40, 40 and 23 PRs),
   20 reviewer chunks and 3 verifier calls failed twice in a row:
   `the reply is not valid JSON; after one retry: the reply is not valid JSON`.
   43 more chunks were invalid on the first reply and valid on the retry. 79 of 624 responses had
   exactly 32,000 completion tokens, the request's `max_tokens`. (3 Super, same prompts: 0–1 such
   chunk per 40-PR run.)
3. **Sandboxes access with no explanation.** Without a project: `400 {"error": "Missing \"Project\" header"}`.
   With one, `GET /whoami` returned HTTP 200 with every permission `false`, and list and spawn
   returned `{"status": 403, "error": "Insufficient permissions: list"}` and
   `{"status": 403, "error": "Insufficient permissions: spawn or spawn_disposable"}`. Support
   (case AISTUDIOSUP-1966) said Sandboxes are "not yet ready to be used" on our account. None of
   these responses, and no docs page we found, mentioned the separate beta-access request.
4. **Dropped connections with no status.** `fetch failed` (no HTTP status or body) on one long
   Nano reviewer request, and `request failed: fetch failed` on one 3 Super call in a 790-call
   batch; one more on 3.5. Six held-out-evaluation requests hit our own 60 s timeout
   (`The operation was aborted due to timeout`) with no HTTP response.
5. **HTTP 200 without `usage`.** 2 Nano reviewer responses had no `usage` object. The docs don't
   say whether that can happen or how such a call is billed.
6. **Cookbook model id that doesn't resolve.** The cookbook's Nano code sample uses
   `nvidia/nvidia-nemotron-3-nano-30b-a3b`; `GET /v1/models` lists
   `nvidia/NVIDIA-Nemotron-3-Nano-30B-A3B`, and ids are case-sensitive.
7. **Reasoning controls.** `reasoning_effort` is in the OpenAPI spec without saying which models
   honour it. On Nano, `reasoning_effort: "none"` returned `content: null` with the answer in
   `message.reasoning`. `chat_template_kwargs.enable_thinking=false` worked, but it is not in the
   spec.
8. **Reasoning tokens not reported for Nano.** `usage.completion_tokens_details` was null on every
   Nano response (0 of 2,313 turns); 3 Super reported `reasoning_tokens` on every turn.
9. **Prices are not readable from the API.** Our budget guard prices calls from third-party
   trackers (`config/prices.json`); we have not confirmed them in the console.

## Model behaviour (NVIDIA Nemotron)

- Nano, as a tool-calling agent (2,313 turns): 405 calls to `str_replace_editor` and 5 to
  `execute_bash`, neither of which was offered. 387 turns (16.7%) returned reasoning only, with no
  tool call and no content (147 at the 4,096-token limit, 240 with `finish_reason: "stop"`). 3 Super
  called an un-offered tool once in 1,752 turns. No tool-call `arguments` string was invalid JSON.
- Nano naming summaries, checked by hand: 5 of 7 on one repo and 2 of 7 on another made a claim the
  code contradicts. One reply rewrote ASCII hyphens in an identifier as U+2011 NON-BREAKING HYPHEN.
- 3 Super with reasoning on, for short strict-JSON tasks (judge, verifier): 212 / 143 / 146 / 101
  requests per batch with 0 to 3 retries for invalid JSON and 0 HTTP failures.
- NVIDIA's model card recommends temperature 1.0 and top_p 0.95; all our runs used temperature 0.
  The same frozen reviewer spread 12.4 F points across five runs at temperature 0.

## What would have helped

- **A region field on each `/v1/models` entry**, or a per-region list of only the models callable
  there. A 404 for a listed model should say why (region, account, not deployed).
- **A reasoning budget separate from `max_tokens`**, or a JSON / schema-constrained output mode
  that works with reasoning on. Opinion: most of 3.5's invalid-JSON replies look like truncation.
- **`usage` on every 200**, with reasoning tokens broken out for every model.
- **An HTTP status and a request id** on failures, instead of a dropped connection, so a failure
  can be matched to server logs.
- **Sandboxes:** say in the 403 body, in `/whoami` and on the overview page that beta access must
  be requested; list Sandboxes permissions in the Team Access docs.
- **Catalog prices in the API** (for example on `GET /v1/models`), so a budget guard needs no
  third-party listing.
- **Docs:** which models honour `reasoning_effort`; `chat_template_kwargs` in the spec; the cookbook's
  Nano id fixed.

In the batches above: 10,707 chat requests, of which 35 were the 404s, 9 were transport failures
or our own timeouts, and 1 is not classified. Opinion: apart from the 3.5 region issue, the API was
dependable for our workload.
