import assert from "node:assert/strict";
import test from "node:test";

import { buildRegionAlignedSemanticOwnershipFromLabelMap } from "../lib/paint-processor.ts";

const box = (kind, x, y, width, height) => ({
  kind,
  label: `test-${kind}`,
  x,
  y,
  width,
  height,
  priority: ["eye", "text", "logo"].includes(kind) ? "critical" : "protected",
});

test("rejects a crossing background region and emits exact whole-region masks", async () => {
  const width = 10;
  const height = 10;
  const labels = new Uint8Array(width * height);
  for (let y = 4; y < 6; y++) for (let x = 4; x < 6; x++) labels[y * width + x] = 1;

  const result = await buildRegionAlignedSemanticOwnershipFromLabelMap(labels, width, height, [box("face", 0.3, 0.3, 0.4, 0.4)]);
  assert.equal(result.semanticMask[0], 0, "large crossing background is not owned");
  for (let y = 4; y < 6; y++) for (let x = 4; x < 6; x++) assert.equal(result.semanticMask[y * width + x], 1);
  for (const region of result.regions) {
    const values = new Set();
    for (let pixel = 0; pixel < labels.length; pixel++) if (labels[pixel] === labels[region.regionId === 0 ? 0 : 44]) values.add(result.semanticMask[pixel]);
    assert.equal(values.size, 1, "no paint region is partially masked");
  }
});

test("critical core retains a complete crossing paint region", async () => {
  const width = 10;
  const height = 10;
  const labels = new Uint8Array(width * height);
  for (let x = 0; x < width; x++) labels[5 * width + x] = 1;

  const result = await buildRegionAlignedSemanticOwnershipFromLabelMap(labels, width, height, [box("eye", 0.4, 0.4, 0.2, 0.2)]);
  for (let x = 0; x < width; x++) assert.equal(result.criticalMask[5 * width + x], 1);
  assert.equal(result.criticalCoreCoverage, 100);
  assert.ok(result.criticalProtectedRegionCount >= 1);
});

test("nested critical eye ownership takes precedence over face ownership", async () => {
  const width = 8;
  const height = 8;
  const labels = new Uint8Array(width * height);
  for (let y = 3; y < 5; y++) for (let x = 3; x < 5; x++) labels[y * width + x] = 1;
  const regions = [box("face", 0.25, 0.25, 0.5, 0.5), box("eye", 0.375, 0.375, 0.25, 0.25)];

  const result = await buildRegionAlignedSemanticOwnershipFromLabelMap(labels, width, height, regions);
  const center = 3 * width + 3;
  assert.equal(result.ownerMasks[0].mask[center], 0);
  assert.equal(result.ownerMasks[1].mask[center], 1);
  assert.equal(result.regions.find((region) => region.critical)?.ambiguous, false);
});

test("overlapping protected objects produce deterministic ambiguous ownership", async () => {
  const width = 8;
  const height = 8;
  const labels = new Uint8Array(width * height);
  for (let y = 3; y < 5; y++) for (let x = 3; x < 5; x++) labels[y * width + x] = 1;
  const regions = [box("face", 0.25, 0.25, 0.5, 0.5), box("hand", 0.25, 0.25, 0.5, 0.5)];

  const first = await buildRegionAlignedSemanticOwnershipFromLabelMap(labels, width, height, regions);
  const second = await buildRegionAlignedSemanticOwnershipFromLabelMap(labels, width, height, regions);
  const ambiguous = first.regions.find((region) => region.ambiguous);
  assert.deepEqual(ambiguous?.ownerIds, [0, 1]);
  assert.equal(first.ambiguousOwnershipCount, 1);
  assert.equal(first.maskCheckpoint, second.maskCheckpoint);
  assert.deepEqual(first, second);
});

test("protected ownership grows through adjacency only within conservative bounds", async () => {
  const width = 10;
  const height = 10;
  const labels = new Uint8Array(width * height);
  labels[4 * width + 4] = 1;
  for (let x = 0; x < width; x++) labels[5 * width + x] = 2;

  const result = await buildRegionAlignedSemanticOwnershipFromLabelMap(labels, width, height, [box("key-detail", 0.4, 0, 0.19, 1)]);
  for (let x = 0; x < width; x++) assert.equal(result.semanticMask[5 * width + x], 1);
  const grown = result.regions.find((region) => region.evidence.some((item) => item.adjacentToOwnedRegion));
  assert.ok(grown, "adjacent in-envelope candidate grows from a seed");
});
