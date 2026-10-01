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
