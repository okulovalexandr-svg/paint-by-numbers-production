# Phase X1B-PREP — bounded FT161 live harness

X1B-PREP prepares one future semantic-plane experiment without executing it. The harness is isolated from production and reuses the exact `semantic-planes/v1` X1A parser, validator, rasterizer, and exact 5 pt preflight.

The request is permanently bounded to one request and zero retries. Image 1 is `public/reference/history/ft161-source.jpg` and supplies identity/semantic context only. Image 2 is `public/reference/history/ft161-approved.png` and is the only geometry frame. Every returned polygon must use `image-2-approved-preview-normalized-0..1000`.

The response envelope carries that coordinate-frame assertion plus the unchanged X1A document. A mismatched frame or malformed document fails closed. No source-to-approved transform, silent polygon repair, recolouring, region merging, Final Region Map, contour, numbering, SVG, PDF, UI, or production integration is present.

The future live runner refuses before reading credentials or images unless `ALLOW_LIVE_SEMANTIC_X1B=1` is explicitly set. On an authorized run it saves the raw response, parsed contract, validation/raster/preflight report, request ID, usage, exact repository pricing-basis cost, checkpoints, and runtime under `.x1b-live/ft161/`. Invalid output is saved and reported once without retry.

Reusable diagnostic attribution reports exact-owned, ambiguous, and uncovered pixels/components for immutable semantic FAIL component pixel sets, plus face/eye-target coverage. X1B-PREP exercises this only with synthetic data; it does not read or alter a production raster.
