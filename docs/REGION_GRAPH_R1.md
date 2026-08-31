# Phase R1 — Diagnostic Region Graph

Phase R1 reads the accepted post-B+C palette raster as a 4-connected component map. It does not mutate the raster and is not called by readiness, numbering, contours, SVG/PDF or approval.

## Deterministic identity and geometry

- Region IDs are assigned in row-major first-pixel order.
- An edge exists only for direct 4-connected adjacency.
- Shared boundary is counted once by scanning right and down pixel sides.
- Pixel measurements are also converted to the fixed 400 × 500 mm artwork space.
- The 5 pt fit flag reuses the existing production placement test without changing its thresholds.
- Semantic overlap uses the existing normalized semantic rectangles; `eye`, `text` and `logo` are critical.

## Pair classification

Classification is conservative and diagnostic only:

- `SEMANTIC-RISK`: either endpoint overlaps eye/text/logo, semantic ownership conflicts, or a semantic region would be absorbed into a nonsemantic one.
- `NOT-USEFUL`: neither endpoint currently fails the 5 pt fit test.
- `TOPOLOGY-RISK`: contact is only one pixel side or less than 1% of the smaller perimeter.
- `COLOR-RISK`: CIE Lab distance exceeds 18, or 24 for two regions in the same semantic owner.
- `SAFE-CANDIDATE`: a remaining directly adjacent pair containing a failed endpoint.

For a safe pair, R1 constructs a temporary in-memory union solely to test whether one merge could make a failed endpoint fit 5 pt. No union is written back. The one-pass reduction estimate greedily chooses deterministic, non-overlapping safe pairs ordered by score and region IDs.

## Regression contract

Graph construction must be byte-for-byte deterministic for the same labels, paints and semantic rectangles. NEW174 production raster, contours, SVG, PDF, checkpoint, region count and number count remain unchanged.
