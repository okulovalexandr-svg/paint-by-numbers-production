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

These values are controls, not targets to fake.

## Confirmed pipeline behavior

There are three distinct states that must not be mixed:

1. raw source photo;
2. AI/artwork preview that may still need one snap to the production palette;
3. ready production-palette preview whose geometry must be treated as the reference for regions/contours.

`snapImageToProductionPalette()` is NOT an identity operation. It performs edge-aware smoothing, nearest-palette assignment and `majorityCleanup()`.

### Confirmed ready-preview problem

`loadApprovedPreview()` stores a user-uploaded ready preview as `aiPreviewUrl` but clears `aiPalette`.

Then `prepareProductionMap()` sees no `aiPalette`, selects colors again and runs:

`snapImageToProductionPalette(activeProject.aiPreviewUrl, aiPalette)`

before `processPaintImage(..., "approved")`.

Therefore a user-uploaded preview that is already the desired production-palette artwork can be cleaned/recolored again before connected regions are extracted.

This is the earliest confirmed place where an already-good preview can diverge from its intended geometry.

### Confirmed second geometry-changing stage

Inside `processPaintImage(..., "approved")`, the initial label map is copied and then `mergeUnnumberableAreas()` may run up to 24 passes. Regions that cannot fit the current 5 pt number-placement test are recolored into neighbouring regions before contours are traced.

So the current pipeline is effectively:

`ready preview -> optional second snap/cleanup -> labels -> merge for number fit -> contours`

This means contour geometry is coupled to numbering constraints. For the current contours-only task, this coupling must be measured against the Golden Reference rather than assumed correct.

## Phase 1 — preserve a ready preview exactly before region logic

### Goal

When the input is explicitly a ready/approved production-palette preview, do not snap or clean it again.

Required path:

`ready palette raster -> exact color labels -> connected regions`

No second:

- smoothing;
- majority cleanup;
- palette snapping;
- recoloring;
- AI redraw.

### NEW174 regression

Feed this file directly to the approved label/region path:

`/reference/new174/approved-preview.png`

with the NEW174 28-color palette.

Do NOT call `snapImageToProductionPalette()` on this fixture.

Before changing merge or contour tracing, report:

- working width/height;
- unique input colors;
- raw connected-component count;
- exact deterministic checkpoint/hash of the initial label map if practical.

## Phase 2 — measure the merge stage separately

Run the same NEW174 label map through the current `mergeUnnumberableAreas()` implementation and report:

- raw region count before merge;
- final region count after merge;
- removed/merged count;
- unlabeled count;
- repeatability across repeated runs;
- visual comparison of the final region map with the known-good contour reference.

Historical controls are 541 final regions, 349 merged/removed areas and 0 unlabeled regions.

Do not change merge semantics until this comparison exists.

### Merge implementation to audit if it diverges

The current comments describe a stable/batch behavior from accepted production scripts, while the implementation recolors component pixels immediately while iterating a component/adjacency snapshot. If NEW174 diverges after Phase 1, inspect this order dependence before changing contour tracing.

## Phase 3 — contour tracer only after Final Region Map is validated

`traceUniqueBoundaries()` must be treated only as a renderer of the final label map.

Check:

- exactly one shared boundary between different neighbouring labels;
- junction continuity;
- no duplicate/offset lines;
- smoothing does not move branch/junction endpoints incorrectly;
- closed cycles remain closed;
- no geometry is invented from source-image edge detection.

Only change simplification/smoothing after proving that the Final Region Map itself matches the Golden Reference.

## Important architectural direction

The long-term production geometry should come from one canonical Final Region Map.

The current separate protected-detail overlay may be useful diagnostically, but should not become a permanent way to delete meaningful geometry from the base map and redraw it later as a compensating line layer. Meaningful details should survive in the canonical region policy whenever possible.

## Current work order

1. Add an explicit path/state for a ready production-palette preview so it bypasses `snapImageToProductionPalette()`.
2. Run NEW174 directly from `approved-preview.png` and record raw region statistics.
3. Run current merge logic unchanged and record final statistics.
4. Compare result to `production-contours.png` and the 541/349/0 controls.
5. If the map diverges, audit merge semantics.
6. Only after the map matches, inspect `traceUniqueBoundaries()`.

Do not work on PDF, UI redesign, auth, database or unrelated features.