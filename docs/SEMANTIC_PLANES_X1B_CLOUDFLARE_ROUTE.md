# Temporary X1B Cloudflare one-shot route

The local-only temporary route is `POST /api/internal/x1b-ft161-one-shot`. It is not wired into the UI and is not deployed by this phase.

The route is protected by the Site's custom owner-only access, the existing workspace session, and a separate disposable `X1B_ONE_SHOT_TOKEN` request header. It reads the existing write-only `OPENAI_API_KEY` from the Cloudflare runtime without exposing or copying it. The request body must be exactly `{ "fixture": "FT161", "confirmation": "RUN_FT161_X1B_ONCE" }`.

Only the fixed FT161 source and approved-preview assets are loaded. A D1 `INSERT OR IGNORE` claim for `FT161-X1B-v1` is acquired immediately before the outbound request, providing a global durable one-call guard across Worker isolates. A failed transport, upstream response, or invalid semantic contract consumes the claim and is never retried.

The response uses `Cache-Control: no-store` and returns the raw upstream body, parsed contract when valid, request ID, token usage, exact repository pricing-basis cost, deterministic raster checkpoints and exact 5 pt preflight. The caller is responsible for saving this owner-only response locally during a separately authorized live phase, then removing the temporary route and disposable token.
