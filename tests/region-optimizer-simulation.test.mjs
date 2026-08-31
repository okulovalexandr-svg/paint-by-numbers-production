import assert from "node:assert/strict";
import test from "node:test";

import { simulateIterativeRegionOptimizerFromLabelMap } from "../lib/paint-processor.ts";

const width = 400;
const height = 500;
const paints = [
  { id: 1, code: "A", name: "Base", hex: "#808080" },
  { id: 2, code: "B", name: "Nearby", hex: "#858585" },
];

function fixture(thinRegions = 3, keepColor = true) {
  const labels = new Uint8Array(width * height);
  for (let region = 0; region < thinRegions; region++) {
    const x = 40 + region * 30;
    for (let y = 20; y < 40; y++) labels[y * width + x] = 1;
  }
  if (keepColor) for (let y = 380; y < 400; y++) for (let x = 300; x < 305; x++) labels[y * width + x] = 1;
  return labels;
}

test("iterative dry-run rebuilds the graph and deterministically accepts improving operations", async () => {
  const labels = fixture();
  const original = labels.slice();
  const first = await simulateIterativeRegionOptimizerFromLabelMap(labels, width, height, paints, [], { maxPasses: 10 });
  const second = await simulateIterativeRegionOptimizerFromLabelMap(labels, width, height, paints, [], { maxPasses: 10 });

  assert.deepEqual(labels, original, "production input remains immutable");
  assert.equal(first.start.failCount, 3);
  assert.equal(first.end.failCount, 0);
  assert.equal(first.acceptedOperations, 3);
  assert.equal(first.passes, 3, "shared target forces a graph rebuild between accepted operations");
  assert.deepEqual(first, second);
});

test("a rejected color-eliminating operation rolls back without changing the simulated raster", async () => {
  const labels = fixture(1, false);
  const result = await simulateIterativeRegionOptimizerFromLabelMap(labels, width, height, paints, [], { maxPasses: 5 });

  assert.equal(result.acceptedOperations, 0);
  assert.equal(result.rejectedOperationsByReason["would-eliminate-production-color"], 1);
  assert.deepEqual(result.simulatedLabels, labels);
  assert.deepEqual(result.end, result.start);
});
