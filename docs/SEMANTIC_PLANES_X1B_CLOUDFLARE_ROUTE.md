# Temporary X1B Cloudflare one-shot route

The local-only temporary route is `POST /api/internal/x1b-ft161-one-shot`. It is not wired into the UI and is not deployed by this phase.

The route reads the authenticated ChatGPT email with `getChatGPTUser()` and does not call the write-capable workspace bootstrap. It then runs one read-only D1 query joining the existing `users` and `memberships` rows for `org_hobruk`. Authorization passes only when the authenticated email owns the one existing `owner` membership and the organization has exactly one owner in total. Zero owners, multiple owners, a non-matching user, or an unavailable authorization query all fail closed before confirmation, asset loading, the one-shot claim, or OpenAI.

No disposable remote token is required. The route reads the existing write-only `OPENAI_API_KEY` from the Cloudflare runtime without exposing or copying it. The request body must be exactly `{ "fixture": "FT161", "confirmation": "RUN_FT161_X1B_ONCE" }`.

Only the fixed FT161 source and approved-preview assets are loaded. A D1 `INSERT OR IGNORE` claim for `FT161-X1B-v1` is acquired immediately before the outbound request, providing a global durable one-call guard across Worker isolates. A failed transport, upstream response, or invalid semantic contract consumes the claim and is never retried.

The response uses `Cache-Control: no-store` and returns the raw upstream body, parsed contract when valid, request ID, token usage, exact repository pricing-basis cost, deterministic raster checkpoints and exact 5 pt preflight. The caller is responsible for saving this sole-existing-owner response locally during a separately authorized live phase, then removing the temporary route.
