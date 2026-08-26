# Contour Audit — baseline v26

Baseline commit: `5942bd78096e27de8056583c05a56575c9e797f8`

## Golden reference already present

Use NEW174 as the first regression fixture:

- approved palette preview: `public/reference/new174/approved-preview.png`
- known-good contour result: `public/reference/new174/production-contours.png`
- source: `public/reference/new174/source.webp`

The project card also records the historical control values for NEW174:

- regions: `541`
- numbers: `541`
- removed/merged areas: `349`
- unlabeled regions: `0`

These values are controls, not a reason to force the algorithm to fake those numbers.

## First confirmed pipeline problem

The app currently has two different meanings mixed together:

1. an AI/artwork preview that still needs to be snapped once to the production palette;
2. an already approved palette-mapped preview that must be treated as immutable geometry.

`snapImageToProductionPalette()` is not an identity operation. It performs edge-aware smoothing, nearest-palette mapping and `majorityCleanup()` before returning the PNG.

That is acceptable only for the one-time conversion of an AI/artwork preview into the approved production-palette raster.

It is NOT acceptable to call this function again when rebuilding contours from an already approved palette-mapped preview.

At least one regeneration path in `app/studio.tsx` currently calls `snapImageToProductionPalette(activeProject.approvedPreviewUrl, aiPalette)` before `processPaintImage(..., "approved")`. This means an already approved reference can be cleaned/smoothed again before connected regions are built.

This violates the project rule: fix the earliest divergent stage and do not compensate later.

## Phase 1 — do only this first

### Goal

Make an approved palette-mapped preview immutable.

### Required behavior

For an image that is already the approved production-palette raster:

`approved palette raster -> exact labels -> regions`

There must be no second:

- smoothing;
- majority cleanup;
- palette snapping;
- recoloring;
- resampling other than unavoidable image decode/dimension preservation.

### NEW174 regression path

For the first test, feed this file directly into the approved processing path:

`/reference/new174/approved-preview.png`

with the NEW174 28-color palette.

Do NOT pass it through `snapImageToProductionPalette()` first.

Generate the intermediate label/region map and contour result.

Compare against:

`/reference/new174/production-contours.png`

Report:

- width/height used by the processor;
- unique colors before label extraction;
- raw connected-component count;
- region count after cleanup/merge;
- removed/merged count;
- unlabeled count;
- whether repeated runs produce the identical checkpoint/result.

## Stop condition after Phase 1

Do not change `mergeUnnumberableAreas()`, `traceUniqueBoundaries()`, SVG/PDF, numbering geometry or semantic-detail restoration in the same change.

After bypassing the second snap/cleanup, run NEW174 and report the result.

If NEW174 now matches the known-good contour structure closely, the earliest bug was the repeated palette cleanup.

If it still diverges, stop and move to Phase 2 audit below. Do not add downstream hacks.

## Phase 2 audit — only if Phase 1 is insufficient

Inspect `mergeUnnumberableAreas()` before changing contour tracing.

There is a suspicious implementation inconsistency in baseline v26:

- the comments say the accepted production script merged failed component IDs as a stable batch;
- the current loop applies pixel recoloring immediately while iterating the same snapshot of components/adjacency.

This makes the result order-dependent and can change which neighbour later failed components effectively join.

If NEW174 still diverges after Phase 1, compare the current immediate-merge behavior against the known-good batch semantics before touching `traceUniqueBoundaries()`.

## Phase 3 audit — only after the Final Region Map matches

Only when the final label map is proven correct should `traceUniqueBoundaries()` be evaluated.

The contour tracer should remain a renderer of the Final Region Map, not a place to repair segmentation mistakes.

Check:

- one unique shared boundary between neighbouring labels;
- junction continuity;
- no duplicate/offset boundaries;
- smoothing does not move junction endpoints;
- closed cycles remain closed;
- no new geometry is invented from raster edge detection.

## Important architectural rule

Do not use protected-detail contour overlays as a permanent substitute for a correct Final Region Map.

The desired end state is one canonical region map for production geometry. If a meaningful detail must survive, preserve it in that map through the region policy rather than deleting it and redrawing a separate compensating contour layer later.

## Current work order

1. Bypass repeated `snapImageToProductionPalette()` for already approved palette rasters.
2. Run NEW174 direct Golden regression.
3. Report exact statistics and visual comparison.
4. If still wrong, audit merge semantics.
5. Only then audit contour tracing.

Do not work on PDF, UI, auth, database or unrelated features.