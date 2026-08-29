# Phase R2 — Iterative Region Optimizer Simulation

R2 is a dry-run simulator over a private clone of the accepted post-B+C label raster. It is not called by production processing, readiness approval, the Final Region Map, numbering, contours, SVG/PDF or UI.

## Iteration

1. Build the R1 graph and exact 5 pt fit state.
2. Rank current `SAFE-CANDIDATE` edges deterministically by resolved failure, Lab distance, shared boundary, donor area and stable region IDs.
3. Select a non-overlapping batch with at most one target color per batch and recolor only the cloned donor components.
4. Rebuild the full graph and exact fit state.
5. Accept the batch only when FAIL does not increase, coverage does not decrease, region count decreases by exactly the number of operations, no previously fitting affected component fails and no critical pixel changes. The exact reduction check prevents unplanned target bridges; a failed batch is discarded.
6. Stop when no improving operation remains, 20 passes complete or `min(5000, initial regions)` operations have been accepted.

## Safety policy

- Eye, text and logo rectangles are hard-protected.
- Face, hand and key-detail candidates require the same single semantic owner and kind, at least 95% overlap for both components and Lab distance at most 8.
- A donor containing a hole or joining multiple target components is rejected.
- A merge that would remove the last component of a production color is rejected.
- The production input raster is copied on entry and never written.

The simulator reports trajectories and deterministic checkpoints only. Its simulated labels must not be used as production output without a separately approved production phase.
