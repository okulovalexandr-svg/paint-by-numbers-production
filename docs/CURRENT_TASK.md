# CURRENT TASK — Contours First

## Status
The approved artwork preview already exists conceptually and must be treated as fixed. The current blocker is the production contour stage.

## Mandatory execution plan
Before changing code, read `docs/CONTOUR_AUDIT.md`.

Execute the phases in that file in order. Do not skip directly to contour smoothing or general refactoring.

The immediate next action is **Phase 1** from `docs/CONTOUR_AUDIT.md`: make a ready production-palette preview bypass any second palette snap/cleanup, then run NEW174 as the Golden regression fixture and report the intermediate statistics before changing merge or contour-tracing logic.

## Goal
Create production-quality regions and contours that preserve the approved preview and match the contour quality previously achieved successfully in chat/manual processing.

## Scope for this task
Only this chain is in scope:

`approved preview -> palette-mapped raster -> connected regions -> cleanup/merge -> Final Region Map -> contours`

Do **not** proceed to numbering, SVG/PDF production packaging, UI redesign, deployment, auth, database, or unrelated features.

## Core requirements
- Use only approved production palette colors.
- Build connected regions from the same palette-mapped result used for the approved preview.
- Final Region Map is the single source of truth for contour geometry.
- No independent re-tracing from a raster later in the pipeline.
- Avoid meaningless tiny circular islands and excessive fragmentation.
- Preserve visually meaningful small details.
- Boundaries between neighboring regions must be coherent and should not create doubled or offset contour lines.
- Regions must be closed and geometrically valid.
- Large visible regions present in the preview must not disappear.

## Small-region policy
Never use a single global threshold to blindly remove all small regions.

For each candidate micro-region, evaluate:
1. shared boundary length with neighbors;
2. color distance;
3. neighboring region size;
4. whether the region represents an important detail;
5. whether merging changes the visual meaning of the approved preview.

Prefer merging into the neighbor with the strongest shared boundary when visually reasonable.

## Protected details
Do not aggressively simplify/merge regions belonging to:
- eyes, pupils, facial features;
- text, logos, jersey/helmet markings;
- fingers and narrow object details;
- flowers and other meaningful small elements;
- important architecture/object edges.

## Required diagnostics
Before judging success, export or expose intermediate artifacts equivalent to:
- palette-mapped image;
- raw connected-component region map;
- cleaned region map;
- merged/final region map;
- region IDs overlay;
- suspicious-small-regions overlay;
- final contour preview;
- machine-readable region statistics if practical.

## Acceptance criteria
This task is complete only when:
- contour result visually matches the approved artwork structure;
- no large regions are lost;
- meaningless micro-circles/islands are substantially eliminated;
- important small details are retained;
- boundaries are clean and not duplicated;
- all regions are closed/valid;
- repeated runs on the same input are deterministic;
- contour output is good enough to serve as the basis for later numbering and SVG/PDF stages.

## Working rule
Find the **earliest stage** where the app diverges from the Golden Reference and fix that stage only. Do not compensate for an earlier bug by adding hacks later in the pipeline.