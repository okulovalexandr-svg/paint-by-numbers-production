# Golden Reference Specification

## Purpose
This file defines the stable target behavior for the paint-by-numbers production pipeline. It replaces repeated re-analysis of old conversations.

## Primary principle
Do not invent a new algorithm when a successful result already exists. Reproduce the approved result deterministically inside the application.

## Canonical pipeline
`Original -> Preprocess -> Production Palette Mapping -> Segmentation -> Region Cleanup -> Region Merge -> Final Region Map -> Contours -> Number Placement -> SVG -> PDF`

For the current development phase, stop at **Contours**.

## Single source of truth
After the Final Region Map exists, geometry must not be reconstructed independently for preview, contours, SVG, or PDF. All downstream outputs must derive from the same region geometry.

## Production palette
Only colors from the approved Hobruk production palette may remain after palette mapping. Downstream stages must not invent new colors.

## Region identity
Disconnected components of the same paint color are different regions and must have different region IDs.

Each final region should retain enough metadata to diagnose behavior, ideally including:
- region ID;
- production paint/color ID;
- area;
- bounding box;
- contour/geometry;
- neighboring regions;
- merge history/status;
- later: label position/status.

## Micro-region behavior
Small regions are not automatically noise. A micro-region must be evaluated using adjacency/shared border, color distance, size, visual importance, and effect on the approved image.

Avoid the failure mode where the image becomes filled with meaningless tiny circles/islands.

## Protected detail policy
Preserve meaningful small geometry including facial features, eyes, pupils, text/logos, clothing markings, flowers, fingers, narrow object details, and important architectural details.

## Contours
Contours must be generated from Final Region Map geometry, not by running a fresh raster trace.

Neighboring regions should share coherent boundaries. Avoid duplicated, slightly offset lines and tiny artificial gaps.

Contour simplification may be used, but tolerance must be conservative around important small features and adaptive to region size/shape.

All production regions must have valid, closed geometry.

## Later numbering policy
When contour work is complete, labels should be placed using an interior-safe method such as distance transform / pole-of-inaccessibility rather than naïve centroid placement. This is NOT part of the current task.

## Later SVG/PDF policy
SVG and PDF must derive from the same final vector geometry. PDF must never rasterize and re-analyze the SVG. This is NOT part of the current task.

## Diagnostics
The pipeline should be inspectable without chat history. A future debug package should include intermediate stage images/maps, contours, region data, validation data, and logs.

## Golden Test
One approved source image plus its approved preview/region/contour result will become the first regression fixture. Future changes must not regress it.

## Determinism
The same input, palette, and settings must produce the same regions and contours across repeated runs.

## Production dimensions
Target artwork is 40 x 50 cm with the existing production stretch allowance workflow resulting in 47.5 x 57.5 cm when applicable. Orientation and exact export layout are later-stage concerns and must not distract from contour work now.

## Definition of success for current phase
The application can take the approved preview/palette-mapped result and produce a clean, faithful, deterministic region map and contour result with:
- no lost large areas;
- no excessive meaningless micro-islands;
- protected small details preserved;
- coherent shared boundaries;
- closed valid regions;
- visual structure matching the approved reference.
