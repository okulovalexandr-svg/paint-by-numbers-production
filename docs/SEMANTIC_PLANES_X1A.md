# Phase X1A — Semantic-plane contract and deterministic rasterizer

X1A defines the isolated geometry contract for a later source-image vision call. X1A itself makes no AI/API call and has no production, UI, approval, Final Region Map, numbering, contour, SVG or PDF call site.

## Strict document shape

`SemanticPlaneDocument` is strict JSON with no additional properties:

```json
{
  "version": "semantic-planes/v1",
  "owners": [
    { "id": "owner-face", "kind": "face", "label": "Face", "polygon": [{ "x": 0, "y": 0 }] }
  ],
  "planes": [
    { "id": "plane-skin", "ownerId": "owner-face", "label": "Skin base", "role": "base", "polygon": [{ "x": 0, "y": 0 }] }
  ]
}
```

Actual polygons require 3–128 points. Coordinates are finite normalized numbers in `0..1000`. IDs are stable ASCII identifiers. Owner kinds are `face`, `hair`, `hand`, `clothing`, `animal`, `object`, `background`, `text`, `logo`, and `key-detail`. Plane roles are `base`, `supporting`, `structural-detail`, and `critical-detail`.

Eyes, pupils, readable text, logos and emblems are represented as `critical-detail` polygons inside an appropriate owner. The contract has no production-colour field: colour sampling and palette snap remain a separate future deterministic stage.

## Validation

The parser rejects unknown/missing fields, invalid IDs, duplicate IDs, missing owners, illegal kind/role combinations, non-finite or out-of-range coordinates, polygons with fewer than three points, zero-length edges, area below one normalized square unit, and self-intersection. It never clamps or repairs geometry.

Owners are one flat non-overlapping level; a broad overlapping `person` owner is deliberately absent. Topology is checked on a fixed 256 × 256 validation raster. At most one shared conflict pixel per owner pair is tolerated for raster boundary quantization. Larger owner overlap, cross-owner plane overlap, or plane area outside its owner is rejected.

## Raster output

Owners and planes are sorted by stable ID before rasterization. Pixel centres are tested by deterministic even-odd polygon fill. Output includes:

- `ownerMap` and `planeMap` (`-1` means unassigned/ambiguous);
- `criticalMask`, `protectedMask`, and `ambiguityMask`;
- ambiguity pixel count;
- per-plane selected pixel area after precedence;
- canonical document and full raster checkpoints.

Inside one owner, precedence is `critical-detail > structural-detail > supporting > base`. Equal-role overlap is ambiguous. Cross-owner conflicts never choose a winner: they remain ambiguous or are rejected by validation.

## Exact 5 pt preflight

Every 4-connected component of every selected plane is passed to the existing production `findNumberPlacement` machinery through a diagnostic-only adapter. The deterministic sorted plane index supplies the label length for this preflight; it is not a production colour choice. Results include plane/component counts, 5 pt pass/fail counts, coverage, failed pixels, failed area in mm²/percent, and component-level outcomes. There is no 3 pt fallback and no leader-line path.

## Synthetic contract

`tests/semantic-plane-contract.test.mjs` covers repeatable rasterization, critical-over-base precedence, cross-owner rejection, malformed geometry rejection, exact 5 pt narrow/broad behavior, immutable input, strict absence of production colours, and stable/change-sensitive checkpoints.
