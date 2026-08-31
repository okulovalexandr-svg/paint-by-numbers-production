import assert from "node:assert/strict";
import test from "node:test";

import { simulateValidatorSeededSemanticPlaneReconstructionFromLabelMap } from "../lib/paint-processor.ts";

const width = 400;
const height = 500;
const ownerBox = { x0: 40, y0: 40, x1: 360, y1: 460 };
const semanticRegions = [{ kind: "face", label: "test-face", x: 0.1, y: 0.08, width: 0.8, height: 0.84, priority: "protected" }];
const paints = [
  { id: 1, code: "A", name: "Main plane", hex: "#808080" },
  { id: 2, code: "B", name: "Weak microtone", hex: "#858585" },
  { id: 3, code: "C", name: "Strong plane", hex: "#202020" },
  { id: 4, code: "D", name: "Outside", hex: "#E0E0E0" },
];

function boxMask() {
  const mask = new Uint8Array(width * height);
  for (let y = ownerBox.y0; y < ownerBox.y1; y++) mask.fill(1, y * width + ownerBox.x0, y * width + ownerBox.x1);
  return mask;
}

function ownership({ critical = new Uint8Array(width * height), ambiguous = false } = {}) {
  const face = boxMask();
  const ownerMasks = [{ ownerId: 0, kind: "face", priority: "protected", mask: face }];
  if (ambiguous) ownerMasks.push({ ownerId: 1, kind: "hand", priority: "protected", mask: face.slice() });
  return {
    width,
    height,
    semanticMask: face.slice(),
    criticalMask: critical,
    ownerMasks,
    regions: [],
    protectedPixels: face.reduce((sum, value) => sum + value, 0),
    protectedRegionCount: 1,
    criticalProtectedPixels: critical.reduce((sum, value) => sum + value, 0),
    criticalProtectedRegionCount: critical.some(Boolean) ? 1 : 0,
    ambiguousOwnershipCount: ambiguous ? 1 : 0,
    bboxProtectedPixels: face.reduce((sum, value) => sum + value, 0),
    bboxProtectedRegionCount: 1,
    bboxCriticalProtectedPixels: 0,
    bboxCriticalProtectedRegionCount: 0,
    bboxProtectedPixelsReleased: 0,
    regionsNewlyProtectedByCriticalCore: 0,
    semanticAreaReductionPercent: 0,
    criticalCoreCoverage: 100,
    maskCheckpoint: "SM-V1-TEST",
  };
}

function fragmentedFixture({ keepWeakColorOutside = true, strongSplit = false } = {}) {
  const labels = new Uint8Array(width * height);
  labels.fill(3);
  for (let y = ownerBox.y0; y < ownerBox.y1; y++) {
    labels.fill(0, y * width + ownerBox.x0, y * width + ownerBox.x1);
    if (strongSplit) labels.fill(2, y * width + 200, y * width + ownerBox.x1);
  }
  for (let y = 70; y < 430; y += 24) for (let x = 70; x < 330; x += 24) {
    if (strongSplit && x >= 190) continue;
    for (let yy = y; yy < y + 8; yy++) for (let xx = x; xx < x + 3; xx++) labels[yy * width + xx] = 1;
  }
  if (keepWeakColorOutside) for (let y = 5; y < 25; y++) labels.fill(1, y * width + 5, y * width + 25);
  return labels;
}

test("V1 reconstructs weak semantic microgeometry deterministically on a private clone", async () => {
  const labels = fragmentedFixture();
  const original = labels.slice();
  const first = await simulateValidatorSeededSemanticPlaneReconstructionFromLabelMap(labels, width, height, paints, semanticRegions, ownership());
  const second = await simulateValidatorSeededSemanticPlaneReconstructionFromLabelMap(labels, width, height, paints, semanticRegions, ownership());

  assert.deepEqual(labels, original, "production input remains immutable");
  assert.ok(first.reconstructedOwnersCount >= 1);
  assert.ok(first.end.failCount < first.start.failCount
    || (first.end.failCount === first.start.failCount && first.end.regions < first.start.regions));
  assert.notDeepEqual(first.simulatedLabels, original);
  assert.equal(first.criticalPixelsChanged, 0);
  assert.equal(first.ownerSilhouettePixelsChanged, 0);
  assert.equal(first.strongEdgePixelsChanged, 0);
  assert.equal(first.newFailuresCreated, 0);
  assert.equal(first.finalRasterCheckpoint, second.finalRasterCheckpoint);
  assert.equal(first.finalGraphCheckpoint, second.finalGraphCheckpoint);
  assert.deepEqual(first.simulatedLabels, second.simulatedLabels);
});

test("V1 keeps critical pixels, owner silhouette and strong internal edges immutable", async () => {
  const labels = fragmentedFixture({ strongSplit: true });
  const critical = new Uint8Array(width * height);
  for (let y = 230; y < 250; y++) for (let x = 120; x < 140; x++) critical[y * width + x] = 1;
  const result = await simulateValidatorSeededSemanticPlaneReconstructionFromLabelMap(labels, width, height, paints, semanticRegions, ownership({ critical }));

  assert.equal(result.criticalPixelsChanged, 0);
  assert.equal(result.ownerSilhouettePixelsChanged, 0);
  assert.equal(result.ownerSilhouetteBoundaryEdgesChanged, 0);
  assert.equal(result.strongEdgePixelsChanged, 0);
  assert.equal(result.strongEdgeBoundaryEdgesRemoved, 0);
  assert.equal(result.newFailuresCreated, 0);
});

test("V1 rejects ambiguous ownership instead of reconstructing it", async () => {
  const labels = fragmentedFixture();
  const result = await simulateValidatorSeededSemanticPlaneReconstructionFromLabelMap(labels, width, height, paints, semanticRegions, ownership({ ambiguous: true }));

  assert.equal(result.reconstructedOwnersCount, 0);
  assert.ok(result.rolledBackOwnersCount >= 1);
  assert.deepEqual(result.simulatedLabels, labels);
});

test("V1 rolls an owner back when reconstruction would eliminate a production color", async () => {
  const labels = fragmentedFixture({ keepWeakColorOutside: false });
  const result = await simulateValidatorSeededSemanticPlaneReconstructionFromLabelMap(labels, width, height, paints, semanticRegions, ownership());

  assert.equal(result.reconstructedOwnersCount, 0);
  assert.equal(result.owners[0].rollbackReason, "production-color-eliminated");
  assert.deepEqual(result.simulatedLabels, labels);
  assert.deepEqual(result.eliminatedColorCodes, []);
});
