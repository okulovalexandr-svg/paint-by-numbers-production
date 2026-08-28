# Confirmed Project Decisions

This file stores decisions that should not be re-litigated in every chat/session.

## D-001 — Approved preview is not the current problem
The artwork preview has already reached the desired quality in prior work. Do not replace or broadly redesign the preview-generation logic while solving contours.

## D-002 — Current priority is contours only
The immediate goal is production-quality regions and contours. Numbering, SVG/PDF packaging, UI polish, deployment, auth, and database work are deferred until contours pass acceptance.

## D-003 — Repository docs are the persistent context
Future sessions should read `AGENTS.md`, `docs/CURRENT_TASK.md`, `docs/GOLDEN_SPEC.md`, and this file instead of reprocessing old chat history.

## D-004 — Final Region Map is the geometry source of truth
Segmentation/cleanup/merge must produce one canonical region map. Downstream contour geometry must derive from it; no independent re-tracing later.

## D-005 — Do not blindly delete small regions
Micro-regions must be evaluated contextually and merged intelligently when appropriate. Meaningful small details must be preserved.

## D-006 — Fix the earliest broken stage
When output is wrong, identify the first pipeline stage where it diverges from the approved reference and fix that stage rather than adding downstream compensating hacks.

## D-007 — Development should be regression-driven
Once the Golden Reference artifacts are committed, changes must be checked against them so a fix cannot silently break previously correct behavior.

## D-008 — Approved previews must pass production readiness before approval
A palette-ready preview may be approved only when every 4-connected visible region fits the exact production 5 pt number test. A validated approved map is the immutable Final Region Map; production SVG/PDF generation must not merge, recolor, clean or resegment it.

## Next missing artifact
The repository still needs the actual Golden Reference files (approved source image, approved preview, and preferably the known-good contour/reference output). Once available, store them under a `golden/` directory and use them as regression fixtures.
