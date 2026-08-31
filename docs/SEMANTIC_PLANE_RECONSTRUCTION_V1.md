# Phase V1 — Validator-seeded semantic plane reconstruction

V1 is a deterministic diagnostic dry-run over a private clone of the accepted post-B+C palette label map. It has no production, UI, approval, Final Region Map, numbering, contour, SVG or PDF call site.

## Pixel-plane reconstruction

- Only unambiguous S1 `face`, `hand` and `key-detail` owner interiors are eligible.
- Critical eye/text/logo pixels, ambiguous ownership, owner-silhouette pixels and original strong internal edge pixels form an immutable barrier map.
- Strong edges use the accepted S2 contract: an internal same-owner graph edge is strong at `max(12, owner P90 Lab delta)`.
- Existing exact-5-pt-passable components contribute stable seeds. Distance-transform local maxima that can physically contain the 5 pt footprint add seeds, with deterministic 6 mm separation under the single balanced parameter set.
- A deterministic multi-source region grow assigns interior pixels by path cost combining spatial distance, original Lab gradient and Lab deviation from the seed color. Old 4-connected region IDs are not growth barriers.
- Each resulting plane is assigned a deterministic weighted Lab medoid selected only from production paints originally assigned to that plane. No color is invented.

## Independent owner rollback

Every owner is rebuilt and validated separately. Its trial is accepted only if FAIL decreases, or FAIL is unchanged while region count decreases, and all of these remain true:

- FAIL does not increase;
- 5 pt coverage does not decrease;
- failed raster area does not increase;
- no previously passable component becomes failed;
- critical, silhouette and strong-edge pixels remain unchanged;
- no strong protected boundary is removed;
- no previously active production color disappears.

Rejected owners leave the current simulation clone unchanged. The source `Uint8Array` is never mutated.

## Bounded diagnostics

The simulator reports fixture and per-owner start/end regions, FAIL, semantic FAIL, coverage and failed area; face/hand/key-detail FAIL; accepted and rolled-back owners; seeds and final planes; changed raster/semantic area and Lab distribution; all hard-safety counters; active/eliminated colors; deterministic raster/graph checkpoints; and runtime split across seed generation, region growing, graph rebuild and readiness acceptance checks.

The caller supplies the fixture runtime cap. The Phase V1 regression uses one balanced parameter set and a hard 10-minute cap per fixture.
