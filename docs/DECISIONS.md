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

## D-009 — Phase B may remove only proven non-semantic noise before approval
Before readiness validation, a failed component may be absorbed into an adjacent stable component only when it is smaller than 4 mm², outside every semantic region and its physical 2 mm halo, and its removal cannot eliminate its production color. The correction is deterministic, changes only the component's own pixels, and never runs on an approved Final Region Map.

## D-010 — Phase C may minimally expand only non-semantic irregular regions
After Phase B and before readiness validation, a remaining failed non-semantic component of at least 4 mm² may borrow safe adjacent pixels without changing its production color. Expansion is capped at 2 mm and `min(12 mm², 50% of target area)`, must preserve donor connectivity and its existing 5 pt placement, and never runs on semantic geometry or an approved Final Region Map.

## D-011 — Missing numbers are never an accepted production outcome
Missing internal numbers in legacy PDF output are a defect of the old application, not permissible behavior. Every visible final 4-connected region must have exactly one internal number of at least 5 pt; coverage is 100% and unlabeled is 0.

## D-012 — Production correction is upstream and approval-gated
Validator-guided production correction may run only on a failed palette-ready preview before visual approval. It must preserve the failed candidate and readiness diagnostics, requires an explicit user action for each AI edit, and cannot mutate an approved Final Region Map.

## D-013 — The approved Final Region Map remains immutable
After a corrected preview passes production readiness and is visually approved, that exact approved Final Region Map remains immutable. Downstream contours, numbering, SVG and PDF derive from it without correction, cleanup, recoloring or resegmentation.

## D-014 — Phase A2 selects correction guidance from readiness coverage
Production correction remains one explicit user-triggered AI edit before approval. When current 5 pt fit coverage is below 25%, the AI receives `global-rebuild` guidance that treats the original source as the preferred identity/composition reference and reconstructs a globally over-fragmented preview into broader coherent paint regions. At 25% coverage or above, it receives `local-repair` guidance that preserves good regions and repairs highlighted failures locally. This split changes AI guidance only; validator thresholds and the deterministic post-AI pipeline remain unchanged.

## D-015 — A selected production palette is an allowed set
Production-correction output may use only colors from the selected production palette, but it does not have to use every listed color. A rarely used color must never be forced into tiny regions merely to keep that color visible.

## Next missing artifact
The repository still needs the actual Golden Reference files (approved source image, approved preview, and preferably the known-good contour/reference output). Once available, store them under a `golden/` directory and use them as regression fixtures.
