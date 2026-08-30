# Phase W1 — Source-edge separability / oracle plane audit

W1 is a diagnostic upper-bound experiment. It reads decoded original-source pixels, the immutable accepted palette label map and, for semantic fixtures, the accepted S1 region ownership. It has no production or UI call site and never emits or mutates a raster, preview, Final Region Map, number placement, contour, SVG or PDF.

## Deterministic source mapping

- The harness must decode the source with a deterministic decoder and pass decoded RGB/RGBA pixels plus decode time to `auditSourceEdgeSeparabilityFromLabelMap`.
- The decoded dimensions and decoded-pixel FNV-1a checkpoint are part of the result. Encoded JPG/PNG/WebP bytes are not used as the determinism contract.
- Source and label-map aspect ratios may differ by at most 0.5%. W1 throws `SOURCE_ASPECT_RATIO_MISMATCH` above that limit instead of guessing a crop.
- Compatible full-frame images are mapped to the label grid with deterministic pixel-centre nearest-neighbour sampling. This adds no crop, blur, smoothing or new colours. A second checkpoint records the normalized pixels.
- RGB and label inputs are checksummed again before return; mutation is a hard error.

## Boundary signal

For every shared 4-neighbour segment between distinct current regions, W1 measures CIE Lab delta across the immediate two pixels and, where image bounds permit, across the next pair one pixel farther along the same normal. The segment value is the deterministic median of those one/two deltas. Segment values are aggregated per region-adjacency edge as sample count, mean, median/P50, P90 and maximum. Existing shared-boundary length and accepted-palette Lab delta remain attached as diagnostics.

NEW174 calibration considers every internal adjacency edge. `goldenWeakBoundaryRate(T)` is the percentage of those edges whose source P90 is at most `T`, for `T = 4, 8, 12`. Golden geometry is never unioned or contracted.

## Semantic eligibility

FT edges are eligible only when both endpoint regions have one identical S1 owner, one identical compatible kind (`face`, `hand`, `key-detail`), and neither endpoint is ambiguous or critical. Missing ownership, owner silhouettes, cross-owner edges, incompatible kinds and critical ownership are excluded before source strength is considered. Eligible edges are split into `FAIL-FAIL`, `FAIL-PASS` and `PASS-PASS` using the unchanged exact 5 pt placement result.

## Geometry-only oracle

For each threshold, W1 connects only eligible edges whose source P90 is at most the threshold. Each connected cluster is represented by a temporary union of its existing pixels and passed to the exact production 5 pt geometry test. Because no production colour or number is selected, the audit uses the accepted one-digit geometry as an explicitly optimistic upper bound.

Only paintable unions contribute `oracleResolvableFail` and theoretical region reduction. PASS regions consumed by paintable planes are reported separately, including a stricter count limited to clusters that resolve at least one FAIL. Owner breakdowns and the ten largest connected clusters are returned for each threshold. No label, colour or output pixel is ever written.

## Synthetic contract

`tests/source-edge-separability.test.mjs` covers flat and strong source boundaries, critical/cross-owner/ambiguous exclusion, a paintable weak-edge union, separate PASS consumption, immutable source/label arrays, repeatable checkpoints and the aspect-ratio stop condition.

Real-fixture measurements are intentionally not embedded in this pre-regression implementation commit. The bounded W1 run is limited to NEW174, FT159, FT161 and FT163 after the commit is created.
