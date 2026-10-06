# Feedback: Nebius Token Factory + NVIDIA Nemotron

Observations from building TraceHound. Facts only; newest entries at the bottom.

---

## 2026-09-30 · Nano model id in the cookbook code sample doesn't resolve

- **Where the ids appear**
  - `nebius/token-factory-cookbook`, `models/nemotron/nemotron3-nano-30b.md`, Python code
    sample (line 30): `model="nvidia/nvidia-nemotron-3-nano-30b-a3b"`, with
    `base_url="https://api.tokenfactory.us-central1.nebius.com/v1/"` (line 25).
  - Same repo, `models/nemotron/README.md`, playground link for the same model:
    `https://tokenfactory.nebius.com/playground?models=nvidia/NVIDIA-Nemotron-3-Nano-30B-A3B`.
  - `GET https://api.tokenfactory.us-central1.nebius.com/v1/models` (our account, 2026-09-30)
    lists `nvidia/NVIDIA-Nemotron-3-Nano-30B-A3B`. It does not list
    `nvidia/nvidia-nemotron-3-nano-30b-a3b`.
- **Effect:** model ids are matched case-sensitively, so the documented code sample's id isn't
  in the model list. We caught this with a `GET /models` preflight, so no completion request
  was sent and nothing was billed. We did not test what `/chat/completions` returns for the
  lowercase id.
- **Other Nemotron ids in the same `GET /models` response:** `nvidia/Nemotron-3-Ultra-550b-a55b`,
  `nvidia/nemotron-3-super-120b-a12b`, `nvidia/Nemotron-3_5-Lightning`. The Super and Ultra
  ids match their cookbook pages (`nemotron3-super-120B.md`, `nemotron3-ultra-550b-a55b.md`).
  The list had 18 models in total.
- **What we changed:** the default model is `nvidia/NVIDIA-Nemotron-3-Nano-30B-A3B`, and a
  failed id check now suggests the closest case-insensitive match from `GET /models`.

---

## 2026-09-30 · First live run: component naming with Nemotron 3 Nano

- **Model:** `nvidia/NVIDIA-Nemotron-3-Nano-30B-A3B`
- **Endpoint:** `POST https://api.tokenfactory.us-central1.nebius.com/v1/chat/completions`
  (OpenAI-compatible)
- **Request:** `temperature: 0`, `max_tokens: 1500`. It had a system prompt asking for
  `{"name","summary"}` JSON, and a user message holding one component's extracted facts as JSON
  (roughly 600–900 characters: files, routes, entry points, env vars, neighbours; no source
  code).
- **Task:** 7 calls, one per component, at concurrency 4. Input was the demo repo
  `rahul-MyGit/cex-v2-boilercode` @ `da0e3d6`.

### What worked
- All 7 calls returned HTTP 200 with `finish_reason: "stop"`.
- All 7 `message.content` values parsed as the requested JSON object and passed validation.
  None needed the heuristic fallback.
- Reasoning came back in a separate `message.reasoning` field (739–1548 characters). The
  `content` field held only the JSON answer (112–148 characters), with no `<think>` tags and no
  code fences.
- `usage.prompt_tokens`, `usage.completion_tokens` and `usage.total_tokens` were present on
  every response.

### Latency and tokens (live calls)

| Component (heuristic name) | Latency | Prompt tok | Completion tok | Total |
|---|---:|---:|---:|---:|
| Backend Server | 2895 ms | 269 | 217 | 486 |
| Postgres | 3105 ms | 245 | 251 | 496 |
| Auth API | 3418 ms | 302 | 315 | 617 |
| Redis | 3835 ms | 293 | 459 | 752 |
| Exchange API | 2754 ms | 335 | 286 | 621 |
| Engine Worker | 2238 ms | 285 | 228 | 513 |
| Backend Shared | 2827 ms | 298 | 294 | 592 |
| **Total** | 2238–3835 ms each | 2027 | 2050 | 4077 |

- Wall time for the whole analyze run was 7064 ms, including static analysis and the model
  list preflight.
- Cost: `config/prices.json` has no real Nano price yet, so the ledger priced these calls with
  our $5 / $15 per 1M placeholder: est. $0.04089. The real cost is not known from the API
  response.
- A second run on the unchanged commit was served from our local response cache: 0 requests,
  $0.

### What didn't work / open questions
- `usage.completion_tokens_details` was `null`, so reasoning tokens can't be separated from
  answer tokens. The reasoning text was about 5–10× longer than the answer, so most completion
  tokens were most likely reasoning, but the API response doesn't say.
- In the Engine Worker summary, the queue name `backend-to-engine-broker` (plain ASCII hyphens
  in the input facts) came back written with U+2011 NON-BREAKING HYPHEN (3 occurrences), so it
  no longer string-matches the identifier.
- The Exchange API summary says "cryptocurrency exchange". The word "crypto" does not appear
  in the facts sent for that component.
- Names returned vs. the input facts:
  - "Backend Server" → "Health Check Service". Its facts listed one route (`GET /health`) and
    four `dependsOn` edges: it imports `authRouter`, `exchangeRouter`, `env`, and
    `connectRedis`/`listenForEngineResponses`/`pingRedis`.
  - "Redis" → "Redis Queue Manager"; "Postgres" → "Postgres Database"; "Auth API" →
    "Authentication Service"; "Exchange API" → "Exchange Service".
  - "Backend Shared" and "Engine Worker" were returned unchanged.
- Engine Worker summary: "Consumes messages from the backend‑to‑engine‑broker queue for Redis
  consumers." Its facts also list a `produces` relation (`lPush dynamic key`), which the
  summary doesn't mention.

---

## 2026-09-30 · Reasoning controls on Nemotron 3 Nano (`nvidia/NVIDIA-Nemotron-3-Nano-30B-A3B`)

- **Docs:** the Token Factory OpenAPI spec (`https://api.tokenfactory.nebius.com/openapi.json`,
  `ChatCompletionRequest.reasoning_effort`) documents `reasoning_effort` with values
  `none | minimal | low | medium | high | xhigh | max`, but doesn't say which models honor it.
  `chat_template_kwargs` is not in the spec.
- **Probe:** same facts payload (Backend Server component, 401 prompt tokens), temperature 0,
  `max_tokens` 1500, cache off:

  | Request variant | Latency | Completion tok | `message.reasoning` | `message.content` |
  |---|---:|---:|---:|---|
  | none (model default) | 2292 ms | 315 | 1216 chars | valid JSON |
  | `reasoning_effort: "none"` | 899 ms | 29 | 131 chars | **empty** (second call: `null`, 30 tok) |
  | `reasoning_effort: "low"` | 1381 ms | 215 | 733 chars | valid JSON |
  | `chat_template_kwargs: {"enable_thinking": false}` | 874 ms | 29 | not present | valid JSON |

- With `reasoning_effort: "none"`, the response was HTTP 200 with `finish_reason: "stop"` and
  `content: null`. The complete JSON answer was in `message.reasoning`.
- `usage.completion_tokens_details` was `null` in every response, so reasoning tokens aren't
  reported separately.
- **Full naming run with `enable_thinking: false`** (7 components): 915–1467 ms per call, 229
  completion tokens total (2,021 with reasoning on the same facts), 2,513 total tokens. All 7
  replies were valid JSON.

---

## 2026-09-30 · Nano vs Super on the same naming task

- **Setup:** 7 components, identical facts payloads, `chat_template_kwargs.enable_thinking=false`,
  temperature 0, cache off for Super. The Nano numbers are from its fresh (uncached) run
  earlier the same day.
- **Models:** `nvidia/NVIDIA-Nemotron-3-Nano-30B-A3B` and `nvidia/nemotron-3-super-120b-a12b`.
  Both resolved via `GET /models`.
- **Latency per call:** Nano 915–1467 ms (sum 8193 ms); Super 582–1390 ms (sum 6966 ms).
- **Tokens:** Nano 2,284 prompt + 229 completion; Super 2,284 prompt + 234 completion.
- **Est. cost** (config/prices.json, third-party rates): Nano $0.00019; Super $0.00090.
- **All 14 replies** were valid JSON and passed TraceHound's naming checks.
- **Content not supported by the facts sent:**
  - Super, Engine Worker: "using Prisma models". No Prisma fact exists for that component.
  - Super, Redis: "BRPOP/LPUSH". The facts spell the ops `brPop`/`lPush`.
  - Nano, Auth API: "validates credentials". The facts list the `/signin` route only.
- **Differing names** (Nano → Super): Redis Queue → Task Queue; User Data Store → Database
  Layer; Backend Server → API Gateway; Backend Shared → Shared Utilities. Auth
  ("Authentication Service"), Exchange ("Exchange API") and Engine Worker were the same.

---

## 2026-09-30 · Sandboxes (Contree): docs review and first API calls

- **Docs used:** `https://docs.tokenfactory.nebius.com/llms.txt` (index), `/sandboxes/overview`,
  `/sandboxes/cli/tutorial/installation`, `/sandboxes/sdk/python_sdk/getting-started`, and the
  OpenAPI spec `https://eu-north.nebius.computer/static/api.yaml`.
- **REST API:** base `https://api.tokenfactory.nebius.com/sandboxes/v1`. Security schemes:
  `IAMBearerAuth` (`Authorization: Bearer …`) plus `IAMProjectHeader` (a header named `Project`).
- **Token:** the CLI install page says it falls back to `NEBIUS_API_KEY` and reads the project
  from `CONTREE_PROJECT`, then `NEBIUS_AI_PROJECT`.
- **Missing project:** `GET /v1/whoami` and `GET /v1/images` with only
  `Authorization: Bearer <NEBIUS_API_KEY>` both returned `400 {"error": "Missing \"Project\" header"}`.
  The Token Factory inference API needs no project ID; Sandboxes does.
- **Spawn options:** `InstanceSpawnRequest.networking.enabled` defaults to `true`; `disposable`
  defaults to `false`; `timeout` is in seconds.
- **Beta limits** (overview page): 50 simultaneously running operations; untagged checkpoint
  images are retained for 180 days.
- **Pricing:** no sandbox pricing appeared on the pages above or on
  `/other-capabilities/billing-new`.
- **Live run:** not performed yet (no project ID available).
  `scripts/sandbox-spike.ts` is ready; it needs `NEBIUS_AI_PROJECT`.

---

## 2026-09-30 · Sandboxes (Contree): live spike blocked by permissions

- **Setup:** `NEBIUS_API_KEY` (the same key that serves inference) plus `NEBIUS_AI_PROJECT`,
  sent as `Authorization: Bearer …` and `Project: …` to
  `https://api.tokenfactory.nebius.com/sandboxes/v1`. Script: `node --env-file=.env
  scripts/sandbox-spike.ts`. Two runs, about 08:17 UTC.
- **`GET /whoami`:** HTTP 200 in about 0.5 s. With the project header present, auth succeeds,
  but every permission flag is `false`:
  `{"import":false,"spawn":false,"spawn_disposable":false,"list":false,"cancel":false,"set_image_tag":false}`.
  Also returned: `operations_stat` (0 running instances, 0 running imports) and `limits`
  (`instance_max_timeout` 3600 s, `instance_max_concurrency` 50, `instance_max_layer_bytes`
  12884901888 (12 GiB), `images_import_max_concurrency` 8, `images_import_max_timeout` 3600 s).
- **`token_expiration`** in `/whoami` was 5 minutes after each call, and it moved forward
  between calls (08:21:55, then 08:22:19). It looks like a short-lived token derived per request,
  not the API key's own expiry.
- **`GET /images?limit=200`, `GET /images`, `GET /operations?limit=5`:** HTTP 403
  `{"status": 403, "error": "Insufficient permissions: list"}`.
- **`POST /instances`** (`image: tag:ubuntu:latest`, `disposable: true`, `timeout: 300`,
  `networking.enabled: true`): HTTP 403
  `{"status": 403, "error": "Insufficient permissions: spawn or spawn_disposable"}`.
  No operation was created, so nothing needed cancelling.
- **Script exit code:** 1 on both runs (the first stopped at the images 403; the second, after
  a fallback, stopped at the spawn 403). Total wall time under 1 s each.
- **Not answered (no sandbox ran):** command output and exit code inside a sandbox, spawn
  latency, cost, whether the npm registry and bun.sh are reachable, whether `redis-server` runs.
- **Cost:** none shown and none incurred, since no operation was created.
- **Docs:** the CLI install page says to "Get an API token and project ID from your ConTree
  project". The Team Access "Groups & Access management" page lists project-level permissions
  for Files, Fine-tuning, Batch, Dedicated/Public Endpoints and Prompt Presets, but not
  Sandboxes. We found no page saying how to get Sandboxes permissions on a key or project.
- **Error quality:** the 403 bodies name the missing permission, and `/whoami` shows the full
  permission set, so the cause was clear after one call.

---

## 2026-09-30 · Sandboxes need a separate beta-access request

- **What unblocked it:** Sandboxes access has to be requested separately from the Token Factory
  console. After that request, the console said Sandboxes are free during beta and runs don't
  consume credits. (Access is still pending as of this entry.)
- **None of the signals we hit said this:**
  - `GET /whoami` returned HTTP 200 with every permission `false` and no hint about why or how
    to change it.
  - The 403 bodies (`Insufficient permissions: list`,
    `Insufficient permissions: spawn or spawn_disposable`) name the missing permission but not
    that beta access is required.
  - The Team Access docs ("Groups & Access management") list project-level permissions for
    other APIs but don't mention Sandboxes or a beta request.
- **Suggestion:** mention the beta-access request in the 403 body or the `/whoami` response,
  and on the Sandboxes overview and CLI install pages.

---

## 2026-09-30 · Tool calling on Nemotron 3 Nano (OpenAI-style `tools`)

- **Setup:** `POST /v1/chat/completions`, model `nvidia/NVIDIA-Nemotron-3-Nano-30B-A3B`,
  temperature 0, `tool_choice: "auto"`, two function tools (`add(a, b)`, `get_weather(city)`),
  one user message asking for both. Script: `scripts/tool-calling-spike.ts`. 3 calls, $0.00019
  at the tracker rates in `config/prices.json`.
- **(a) Reasoning off** (`chat_template_kwargs.enable_thinking=false`): HTTP 200,
  `finish_reason: "tool_calls"`, `message.content: null`, and two parallel entries in
  `message.tool_calls`. Each is `{id: "chatcmpl-tool-<hex>", type: "function", function: {name,
  arguments}}`, with `arguments` a JSON **string** that parsed: `{"b": 25, "a": 17}` and
  `{"city": "Paris"}`. 377 prompt + 57 completion tokens, 2057 ms.
- **(b) Reasoning on** (model default): the same two tool calls in `message.tool_calls`, with
  valid JSON arguments. The thinking text went to `message.reasoning` (≈1.3k chars), not to
  `content` (null) or into the tool calls. 377 + 396 tokens, 4327 ms.
- **(c) Second turn:** the (a) conversation plus the assistant message with its `tool_calls`,
  then two `role: "tool"` messages (matching `tool_call_id`s). Result: `finish_reason: "stop"`,
  `tool_calls: []`, and `content` with a correct answer ("The sum of 17 and 25 is **42**. … 18°C
  … cloudy"). 476 + 36 tokens, 1168 ms.
- **Message keys** in every response: `content, refusal, role, annotations, audio,
  function_call, tool_calls, reasoning` (`reasoning` null when off).
  `usage.completion_tokens_details` was absent/null, so reasoning tokens aren't broken out.

---

## 2026-10-01 · Sandboxes: support says not yet available on this account (AISTUDIOSUP-1966)

- **Asked:** how to get Sandboxes permissions after the separate beta-access request. Since
  2026-09-30, `GET /whoami` has returned every permission `false`, and list and spawn return 403
  (entries above).
- **Answer:** Nebius support (case AISTUDIOSUP-1966) replied that Token Factory Sandboxes are
  "not yet ready to be used" on this account. No date was given.
- **Impact on the project:** local Docker is now the sandbox of record for development,
  evaluation and reproduction (decision 036). The Sandboxes spike script is parked in
  `scripts/parked/`, `NEBIUS_AI_PROJECT` is no longer part of setup, and the provider interface
  stays so a Sandboxes provider can be added if access arrives. Model calls (Nemotron Nano)
  still go to Token Factory.

---

## 2026-10-01 · Nano component summaries checked against the code

Component names and one-sentence summaries come from Nemotron Nano (reasoning off), working from
extracted facts only (decisions 012, 020). Each was checked by hand against the code:

- **Recall** (`SunnyBagal/Recall` @ `5d2165a`): 7 model-named components. **5 of 7 summaries**
  made a claim the code contradicts, and 3 of 7 names were misleading.
- **CEX** (`SunnyBagal/cex-v2-boilercode` @ `da0e3d6`): 7 model-named components (2 more are
  named by config). **2 of 7 summaries** made a claim the code contradicts; 0 of 7 names were
  wrong.
- **Examples:**
  - Recall's Redis node was named "Redis Cache" and summarized as "Stores and retrieves cached
    data…". The code only passes the Redis client to BullMQ as its connection
    (`config/queue.ts:6,11`, `worker.ts:115`); there are no cache reads or writes.
  - Recall's worker summary said it "sends results to Brainly Shared"; it writes them to the
    Postgres `contents` table (`worker.ts:94-104`).
  - CEX's auth summary said it "validates credentials"; `signin` is an empty `//TODO` stub
    (`backend/src/controllers/auth-controller.ts:36-38`).
- **Checks:** identifiers in names and summaries are checked deterministically (decision 021);
  prose claims are not, which is why the viewer labels them "Model-written … prose not
  verified". None of the errors above were caught by the identifier checks.
- **What we do:** wrong names are replaced with config overrides, and wrong summaries are
  dropped (`"summary": false`), never rewritten by hand (decision 035).

---

## 2026-10-07 · Backfill: held-out evaluation through the Token Factory API (2026-10-05/06)

Backfilled on 2026-10-07 from records that already existed; no new calls were made. Sources:

- **Run records:** `~/Projects/TraceHound-eval/runs/heldout-eval/` (197 JSON run records = 181
  model runs + 16 oracle canaries that make no model call). Of the 181, 177 made model calls (84
  Nano, 93 Super). The other 4 never started (see "Outage window").
- **Spend ledger:** `.tracehound/spend.jsonl` (the path is set in
  `packages/analyzer/src/harness/evaluate.ts:23` and `packages/analyzer/src/llm/setup.ts:16`;
  `~/Projects/TraceHound-eval/.tracehound/spend.jsonl` is a symlink to it). Only lines between
  the first record's `startedAt` (2026-10-05T15:05:15.726Z) and the last record's `endedAt`
  (2026-10-06T05:06:38.472Z) are used: 4,134 lines.
- **Driver log:** `~/Projects/TraceHound-eval/runs/heldout-eval/driver.log`.
- **Endpoint:** `POST /chat/completions` on the client's default base URL
  `https://api.tokenfactory.us-central1.nebius.com/v1` (`packages/analyzer/src/llm/client.ts:7`;
  whether `NEBIUS_BASE_URL` overrode it during the evaluation is not recorded), one
  request per agent turn, native `tools` with `tool_choice: "auto"`, temperature 0,
  `max_tokens` 4096 (reasoning on; `packages/analyzer/src/harness/loop.ts:255`). Client timeout 60 s
  (`AbortSignal.timeout`, default `timeoutMs` 60_000 in `packages/analyzer/src/llm/client.ts:95`),
  no retries. Concurrency 1.
- Percentiles are nearest-rank. Numbers were computed by a script kept under `runs/` (gitignored).

### API reliability

| | Nano (`nvidia/NVIDIA-Nemotron-3-Nano-30B-A3B`) | Super (`nvidia/nemotron-3-super-120b-a12b`) |
|---|---:|---:|
| Requests (ledger lines in the window) | 2,365 | 1,769 |
| Successful responses (ledger `ok: true`; same count in the records' `usage.calls`) | 2,361 | 1,767 |
| Failed requests | 4 | 2 |
| of which client timeouts at 60 s | 4 | 2 |
| HTTP error responses (any non-2xx status) | 0 | 0 |
| Rate-limit responses (HTTP 429) | 0 | 0 |
| Responses served from our local cache | 0 | 0 |

- **Exact error string** of all 6 failures, from the run records' `agentRun.error`:
  `The operation was aborted due to timeout`. This is Node's message for our own 60 s
  `AbortSignal.timeout`; Token Factory returned no error body. The ledger lines for these 6 have
  `ok: false`, `usageReported: false` and `outputTokens` = 4096 (the client's upper-bound charge for
  a request with no response; a 4xx would have been recorded with 0 tokens,
  `packages/analyzer/src/llm/client.ts:183-206`). So none of the 6 got any HTTP response.
- **When** (ledger timestamps, UTC): Nano 2026-10-05 17:01:58, 17:38:54, 20:18:18, 20:23:37;
  Super 2026-10-06 01:41:58, 04:52:51. Each ended its run early; five of those runs were voided and
  re-run once under the evaluation protocol (`docs/eval/heldout-results.md`, "Validity checks").
- **How long the timed-out requests would have taken:** not recorded (the client aborts at 60 s).
- **Outage window:** no Token Factory outage is recorded. The one outage in the evaluation was on
  the evaluation machine's side: 4 Super runs failed before any model call with
  `harness error: git clone https://github.com/SunnyBagal/Recall.git failed: fatal: unable to access 'https://github.com/SunnyBagal/Recall.git/': Could not resolve host: github.com`
  (record `startedAt` 2026-10-06T01:42:11.988Z to 01:42:13.341Z), and a canary failed the same way
  at 2026-10-06 07:12:13 IST (01:42:13Z) (`driver.log`). The next canary passed at 09:34:09 IST
  (04:04:09Z). The Super timeout at 01:41:58Z came 13 s before the first failed clone; the records
  can't tell whether it was the same local network failure. Whether the Token Factory API was
  reachable during that window: not recorded (no model request was sent in it).

### Latency per call (successful calls)

`latencyMs` per call, measured by our client from request start to parsed response
(`usage.calls[].latencyMs` in the run records). Failed (timed-out) requests are not included, so
the Nano tail is cut off at 60 s.

| Model | n | min | median | p95 | max |
|---|---:|---:|---:|---:|---:|
| Nano | 2,361 | 1,293 ms | 6,674 ms | 40,724 ms | 57,379 ms |
| Super | 1,767 | 602 ms | 1,645 ms | 7,166 ms | 38,062 ms |

Time to first token: not recorded (requests are not streamed).

### Tokens and cost per call

Token counts are the API's `usage.prompt_tokens` / `usage.completion_tokens`. Cost is computed by
our client from those counts and the rates in `config/prices.json` (Nano $0.06 / $0.24, Super
$0.30 / $0.90 per 1M input / output tokens, taken from third-party trackers and not verified in the
Nebius console). The amount Nebius actually billed for these calls: not recorded.

| Model | Input tok / call: median · p95 · max | Output tok / call: median · p95 · max | Input total | Output total | Cost / call: median · max | Cost total (successful calls) |
|---|---|---|---:|---:|---|---:|
| Nano | 7,532 · 13,432 · 17,852 | 515 · 4,096 · 4,096 | 17,813,913 | 2,363,080 | $0.00062 · $0.00191 | $1.63597 |
| Super | 7,455 · 15,003 · 19,599 | 153 · 1,036 · 4,096 | 13,748,273 | 543,716 | $0.00253 · $0.00914 | $4.61383 |

- **Ledger vs per-call figures: they agree.** For each model, the multiset of (input tokens,
  output tokens) over the ledger's `ok: true` lines equals the multiset over the records'
  `usage.calls`, call for call (Nano 2,361, Super 1,767), and the cost sums match ($1.63597,
  $4.61383). The ledger has 6 lines more than the records: the 6 timeouts, charged at the upper
  bound, $0.00654 (Nano) + $0.01140 (Super) = $0.01794. Ledger total in the window: $6.26774.
- **Reasoning tokens:** Super reported `usage.completion_tokens_details.reasoning_tokens` on every
  recorded turn (1,752 of 1,752; median 98, max 4,096, total 434,333; median share of completion
  tokens 0.67). Nano reported it on none (0 of 2,313). For Nano, the share of completion tokens
  spent on reasoning is not recorded.

### Model behaviour through the API (reasoning on, all 177 model runs)

Turn-level data covers 2,313 of 2,361 Nano calls and 1,752 of 1,767 Super calls: the last call of
a run that hit the 300,000-token budget is billed but not stored as a turn (48 Nano runs, 15
Super runs). For those 63 calls, finish reason and tool calls are not recorded.

| | Nano | Super |
|---|---:|---:|
| Turns with `finish_reason` `tool_calls` | 1,919 | 1,751 |
| `finish_reason` `length` (all at exactly 4,096 output tokens = `max_tokens`) | 149 | 1 |
| `finish_reason` `stop` | 245 | 0 |
| Turns with no tool call | 394 | 1 |
| of which also empty `content` (reasoning only) | 387 | 1 |
| Turns at 4,096 output tokens that still returned tool calls (`finish_reason` `tool_calls`) | 3 | 0 |
| Tool calls returned | 1,919 | 1,751 |
| Calls to tools that were not offered | 410 | 1 |
| Tool-call `arguments` that were not valid JSON | 0 | 0 |

- **Tools that do not exist:** Nano called `str_replace_editor` 405 times and `execute_bash` 5
  times. Neither was offered. 341 of the `str_replace_editor` calls matched one of the argument
  shapes our harness maps to a real tool (decision 047); the other 64, and the 5 `execute_bash`
  calls, got our unknown-tool error. Super called `find_first` once (not offered).
- **Malformed arguments:** every `function.arguments` string in both models' tool calls parsed as
  a JSON object. Calls with well-formed JSON whose arguments failed our schema check were not
  counted in this backfill.
- **Reasoning on:** every recorded turn carried a non-empty `message.reasoning` (Nano median 2,069
  characters, max 20,468; Super median 426, max 17,495). On Nano, 16.7% of turns (387 of 2,313)
  returned reasoning only, with neither a tool call nor content: 147 because the 4,096-token limit
  was reached, 240 with `finish_reason: "stop"`.
- Opinion: a Nano reply that stops with only reasoning text and no tool call or content looks like
  a turn that ended inside the thinking phase. Neither the response nor the docs we read says
  whether that is expected.

---

## 2026-10-07 · Sandboxes (Contree): what the project record says about the spike and why it was cut

Quoted from `docs/decisions.md`; `docs/build-log.md` has no entry about the Contree spike. Nothing
was re-run.

- Decision 022 (the plan): "Sandboxes (Contree) have a documented REST API with a published OpenAPI
  3 spec (`https://eu-north.nebius.computer/static/api.yaml`, base
  `https://api.tokenfactory.nebius.com/sandboxes/v1`)" … "Auth is `Authorization: Bearer
  <NEBIUS_API_KEY>` plus a `Project: <project id>` header." … "*(Parked by decision 036: the script
  now lives in `scripts/parked/`; Sandboxes aren't available on this account, and Docker is the
  sandbox of record.)*"
- Decision 026, rejected alternative (e): "Building the Contree provider now: its API permissions
  are unverified (FEEDBACK 2026-09-30), so an untested second provider would just be guesswork."
- Decision 036 (why it was cut): "Nebius support (case **AISTUDIOSUP-1966**) replied that Token
  Factory Sandboxes are not yet ready to be used on this account. Since 2026-09-30 the beta request
  had left `/whoami` with every permission `false` and list/spawn returning 403 (FEEDBACK.md). There
  is no date to plan around, so the local Docker provider becomes the sandbox for development,
  evaluation, and for judges reproducing runs." Rejected: "(a) Waiting for Sandboxes: no date, and
  the evaluation needs a sandbox now."
- Decision 036 (what stays): "A Token Factory Sandboxes provider can be added later behind the same
  interface, once access exists, with the parked spike as its starting point."
- So no Nebius sandbox ever ran a command for this project. Spawn latency, in-sandbox behaviour,
  network reachability and sandbox cost: not recorded.
