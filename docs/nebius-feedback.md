# Token Factory feedback: nvidia/Nemotron-3.5-Super-VL (2026-11-08)

For the Token Factory product and docs team. Facts first. Lines marked Opinion or Question are not measurements. Calls were non-streaming `POST /v1/chat/completions`. No prompts, no reply text.

## 1. No token-level reasoning budget

The public docs expose a level, not a token count.

- https://docs.tokenfactory.nebius.com/api-reference/inference/create-chat-completion.md and https://api.tokenfactory.nebius.com/openapi.json (`ChatCompletionRequest.reasoning_effort`): string enum `none`, `minimal`, `low`, `medium`, `high`, `xhigh`, plus a separate `const: max`. The HTML page (same path, no `.md`) shows `Available options: none, minimal, low, medium, high, xhigh`.
- https://build.nvidia.com/nvidia/nemotron-3.5-super-vl-120b-a12b/modelcard: "Reasoning mode is configurable through the chat template (`enable_thinking=True/False`)." The same page's hosted schema: "Controls Super's reasoning mode. `none` disables reasoning tokens, `low` enables low-effort reasoning, and `high` enables full reasoning. Snippets translate this field into the model's `chat_template_kwargs`." Those snippets set `{"enable_thinking": true, "low_effort": true}` when effort is `low`.
- https://catalog.ngc.nvidia.com/orgs/nim/teams/nvidia/models/nemotron-3.5-super-vl-120b-a12b: "Configurable through the chat template (enable_thinking = True/False)".
- In openapi.json, `reasoning_budget`, `thinking_budget`, and `budget_tokens` occur 0 times. The nearest field is `max_completion_tokens`: "An upper bound for the number of tokens that can be generated for a completion, including visible output tokens and reasoning tokens."

Observed: 42 first replies to `nvidia/Nemotron-3.5-Super-VL` with `max_tokens` 32,000. 26 returned empty content, `finish_reason` `length`, with `reasoning_tokens` = `completion_tokens` = 32,000.

Opinion: a reasoning-token budget that reserves room for the answer would have helped. `reasoning_effort` and `low_effort` are not that cap.

## 2. `json_schema` is in the enum and the guide; the field text says it is not

- Same chat-completions page: `ResponseFormat.type` enum `"text"`, `"json_object"`, `"json_schema"`. `JsonSchemaResponseFormat` requires `name` and `schema` (`strict` is optional).
- https://docs.tokenfactory.nebius.com/ai-models-inference/json.md: "Make a request to the Nebius Token Factory API with `{"type": "json_schema"}` in `response_format`".
- Same chat-completions page, `response_format` description: "Only {'type': 'json_object'} or {'type': 'text' } is supported."

Observed: 26 requests with `response_format` type `json_schema` were accepted. None was refused for `response_format` or `json_schema`.

Opinion: please make that field text match the enum, or name the models that reject `json_schema`.

## 3. This model has no "JSON mode" tag

- json.md: "Use `JSON mode` tag in on a model card to find a model with structured output supported."
- https://tokenfactory.nebius.com/api/public/models_info: `"name": "Nemotron 3.5 Super VL"`, flavor `nvidia/Nemotron-3.5-Super-VL`, both `"tags": []`. Other models on that list do have `"JSON mode"` (for example `openai/gpt-oss-120b`). https://tokenfactory.nebius.com/model-catalog.md contains no "JSON mode" string.

Observed: the 26 `json_schema` requests in item 2 were still accepted.

Question: is `json_schema` enforced for this model, or only accepted?

## Client timeout on long non-streaming replies

Observed the same day, earlier, on us-north1: four non-streaming calls at `max_tokens` 32,000 did not return response headers within 300 s. Our client raised `fetch failed` with no HTTP status at exactly 300 s (Node's fetch headers timeout), below the 600 s timeout we set. Not an HTTP error from Token Factory.

Opinion: please document expected time-to-headers for long reasoning replies, or recommend streaming when a reply can run for several minutes.

---
Drafted by grok (2026-11-08); every URL and quoted sentence above was re-opened and checked by artu1 the same day (HTTP 200; quotes found verbatim; 0 budget parameters in openapi.json; 0 "JSON mode" in model-catalog.md).
