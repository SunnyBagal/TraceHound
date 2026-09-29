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
