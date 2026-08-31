# Phase S1 — Region-aligned semantic ownership masks

S1 is diagnostic only. It reads the accepted post-B+C 4-connected label map and the existing semantic rectangles, then returns semantic masks made exclusively from complete existing paint regions. It is not called by production processing, readiness, Phase B/C, approval, numbering, contours, SVG or PDF.

## Deterministic ownership

For every semantic rectangle and paint region, S1 records bbox intersection pixels, overlap relative to the paint region and rectangle, centroid inclusion, critical-core intersection, and adjacency growth.

- `eye`, `text` and `logo` are critical. A region is protected when at least 35% of it overlaps the rectangle, its centroid is in the centered 50% core, or it intersects the core at all. Core intersection is deliberately conservative.
- `face`, `hand` and `key-detail` seed ownership at 60% region overlap, or at 30% with the centroid inside the rectangle.
- Protected growth requires direct adjacency to an existing seed, an in-box centroid, at least 20% region overlap, and region area no larger than half of the bbox. This rejects huge crossing/background components.
- Critical ownership takes precedence over protected ownership. Multiple owners at the same winning priority are retained and marked ambiguous.
- Every owner mask, the combined semantic mask and the critical mask are unions of whole region IDs. No region is partially masked.

The existing R2 simulator remains bbox-based by default. A diagnostic-only `semanticOwnership` option allows the same unchanged R2 objective and topology/color safeguards to be measured against S1 masks.

## Regression summary

The accepted post-B+C inputs were unchanged. Mask and graph construction produced identical hashes across two independent builds.

| Fixture | Bbox protected % | S1 protected % | Area reduction % | Bbox regions | S1 regions | Ambiguous | Core coverage |
|---|---:|---:|---:|---:|---:|---:|---:|
| NEW174 | 0.000 | 0.000 | 0.000 | 0 | 0 | 0 | 100% |
| FT159 | 8.059 | 6.945 | 13.832 | 1233 | 1168 | 0 | 100% |
| FT160 | 1.200 | 0.233 | 80.604 | 91 | 89 | 0 | 100% |
| FT161 | 21.880 | 21.886 | -0.026 | 5748 | 5644 | 79 | 100% |
| FT162 | 6.825 | 5.521 | 19.100 | 2184 | 2089 | 273 | 100% |
| FT163 | 51.100 | 50.999 | 0.197 | 3233 | 3171 | 0 | 100% |

| Fixture | Bbox R2 end regions / FAIL | S1 R2 end regions / FAIL | Bbox FAIL reduction | S1 FAIL reduction | Delta pp |
|---|---:|---:|---:|---:|---:|
| NEW174 | 541 / 0 | 541 / 0 | 0.000% | 0.000% | 0.000 |
| FT159 | 2453 / 857 | 2355 / 755 | 25.283% | 34.176% | +8.893 |
| FT160 | 1284 / 114 | 1277 / 107 | 34.104% | 38.150% | +4.046 |
| FT161 | 6319 / 4577 | 6271 / 4528 | 10.026% | 10.989% | +0.963 |
| FT162 | 3790 / 1665 | 3739 / 1613 | 15.568% | 18.205% | +2.637 |
| FT163 | 3475 / 1277 | 3465 / 1269 | 24.616% | 25.089% | +0.472 |

All S1 simulations changed zero eye/text/logo pixels and created zero new failures. No fixture improved by more than 10 percentage points, so rectangular overprotection is measurable but is not the dominant R2 limit overall. Remaining failures are still overwhelmingly semantic in FT159 and FT161–FT163; FT161 and FT162 also expose real ownership ambiguity. Exact polygon input may improve ownership evidence, but S1 alone is not sufficient evidence to wire R2 into production.
