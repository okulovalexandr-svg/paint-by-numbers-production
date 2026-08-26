# Paint-by-Numbers Production — Agent Instructions

This repository is the persistent source of truth for development. Do **not** reconstruct the project from old chat history unless explicitly asked. Read this file first, then `docs/CURRENT_TASK.md`, `docs/GOLDEN_SPEC.md`, and `docs/DECISIONS.md`.

## Current priority
The artwork preview pipeline has already reached an acceptable/ideal visual result in prior work. **Do not redesign or replace the preview algorithm.**

The current task is only:

> Reproduce production-quality regions and contours from the already-approved preview, matching the successful contour quality previously achieved outside the app.

Stop after contours are correct. Do not spend time on numbering, SVG/PDF production export, UI polish, authentication, deployment, database work, or unrelated refactors until the contour acceptance criteria are met.

## Development rules
1. Preserve working behavior before changing anything.
2. Work one pipeline stage at a time.
3. Use a single canonical `Final Region Map` as the source of geometry.
4. Never re-segment independently for preview, contours, SVG, or PDF.
5. Do not delete small regions blindly. Merge only when justified by adjacency, shared boundary, color similarity, and semantic importance.
6. Protect meaningful small details (eyes, facial features, text/logos, flowers, fingers, important object details).
7. Add diagnostic outputs so failures can be inspected without rereading chat history.
8. Every fix must be regression-safe against the Golden Reference.
9. Avoid broad refactors until the contour pipeline is stable.
10. When a new decision is confirmed, record it in `docs/DECISIONS.md` so future chats do not need old context.

## Required workflow for every coding session
1. Read `docs/CURRENT_TASK.md`.
2. Inspect the existing implementation before editing.
3. Identify the earliest pipeline stage where output diverges from the Golden Reference.
4. Change only that stage.
5. Produce/debug intermediate artifacts.
6. Compare against acceptance criteria.
7. Record the result and any confirmed decision.

## Token-efficiency rule
Do not ask the user to re-explain the full project. The repository documentation is authoritative. Ask only for a missing artifact that cannot be inferred from the repository (for example, the exact Golden Reference image/file if it has not yet been committed).
