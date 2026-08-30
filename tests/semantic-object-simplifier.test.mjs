import assert from "node:assert/strict";
import test from "node:test";

import { simulateSemanticObjectSimplifierFromLabelMap } from "../lib/paint-processor.ts";

const width = 400;
const height = 500;
const ownerBox = { x0: 40, y0: 40, x1: 360, y1: 460 };
const semanticRegions = [{ kind: "face", label: "test-face", x: 0.1, y: 0.08, width: 0.8, height: 0.84, priority: "protected" }];

const paints = [
  { id: 1, code: "A", name: "Anchor", hex: "#808080" },
  { id: 2, code: "B", name: "Microtone", hex: "#858585" },
  { id: 3, code: "C", name: "Outside", hex: "#202020" },
  { id: 4, code: "D", name: "Second anchor", hex: "#888888" },
];

function maskBox(x0 = ownerBox.x0, y0 = ownerBox.y0, x1 = ownerBox.x1, y1 = ownerBox.y1) {
  const mask = new Uint8Array(width * height);
  for (let y = y0; y < y1; y++) mask.fill(1, y * width + x0, y * width + x1);
  return mask;
}

function ownership({ critical = new Uint8Array(width * height), ambiguous = false } = {}) {
  const face = maskBox();
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
    bboxProtectedPixels: face.length,
    bboxProtectedRegionCount: 1,
    bboxCriticalProtectedPixels: 0,
    bboxCriticalProtectedRegionCount: 0,
    bboxProtectedPixelsReleased: 0,
    regionsNewlyProtectedByCriticalCore: 0,
    semanticAreaReductionPercent: 0,
    criticalCoreCoverage: 100,
    maskCheckpoint: "SM-TEST",
  };
}

function baseFixture() {
  const labels = new Uint8Array(width * height);
  labels.fill(2);
  for (let y = ownerBox.y0; y < ownerBox.y1; y++) labels.fill(0, y * width + ownerBox.x0, y * width + ownerBox.x1);
  for (let y = 100; y < 120; y++) labels[y * width + 100] = 1;
  for (let y = 360; y < 410; y++) for (let x = 280; x < 330; x++) labels[y * width + x] = 1;
  return labels;
}

test("S2 deterministically absorbs a failed same-owner microregion into a stable anchor on a private clone", async () => {
  const labels = baseFixture();
  const original = labels.slice();
  const first = await simulateSemanticObjectSimplifierFromLabelMap(labels, width, height, paints, semanticRegions, ownership(), { profile: "balanced" });
  const second = await simulateSemanticObjectSimplifierFromLabelMap(labels, width, height, paints, semanticRegions, ownership(), { profile: "balanced" });

  assert.deepEqual(labels, original, "production input remains immutable");
  assert.equal(first.acceptedSemanticOperations, 1);
  assert.equal(first.start.failCount - first.end.failCount, 1);
  assert.equal(first.criticalPixelsChanged, 0);
  assert.equal(first.ownerSilhouettePixelsChanged, 0);
  assert.deepEqual(first, second);
});

test("S2 rejects a failed region that touches the critical-mask boundary", async () => {
  const labels = baseFixture();
  const critical = new Uint8Array(width * height);
  for (let y = 100; y < 120; y++) critical[y * width + 101] = 1;
  const result = await simulateSemanticObjectSimplifierFromLabelMap(labels, width, height, paints, semanticRegions, ownership({ critical }), { profile: "balanced" });

  assert.equal(result.acceptedSemanticOperations, 0);
  assert.ok(result.rejectedOperationsByReason["touches-critical-boundary"] > 0);
  assert.equal(result.criticalPixelsChanged, 0);
  assert.deepEqual(result.simulatedLabels, labels);
});

test("S2 preserves the owner silhouette", async () => {
  const labels = baseFixture();
  for (let y = 100; y < 120; y++) {
    labels[y * width + 100] = 0;
    labels[y * width + ownerBox.x0] = 1;
  }
  const result = await simulateSemanticObjectSimplifierFromLabelMap(labels, width, height, paints, semanticRegions, ownership(), { profile: "balanced" });

  assert.equal(result.acceptedSemanticOperations, 0);
  assert.ok(result.rejectedOperationsByReason["owner-silhouette-boundary"] > 0);
  assert.equal(result.ownerSilhouettePixelsChanged, 0);
  assert.equal(result.ownerSilhouetteBoundaryEdgesChanged, 0);
});

test("S2 rejects ambiguous S1 ownership instead of guessing", async () => {
  const labels = baseFixture();
  const result = await simulateSemanticObjectSimplifierFromLabelMap(labels, width, height, paints, semanticRegions, ownership({ ambiguous: true }), { profile: "balanced" });

  assert.equal(result.acceptedSemanticOperations, 0);
  assert.ok(result.rejectedOperationsByReason["ambiguous-owner"] > 0);
  assert.deepEqual(result.simulatedLabels, labels);
});

test("S2 exploratory profile still preserves a strong local internal edge", async () => {
  const labels = baseFixture();
  const contrastPaints = [paints[0], { ...paints[1], hex: "#a0a0a0" }, paints[2], paints[3]];
  const result = await simulateSemanticObjectSimplifierFromLabelMap(labels, width, height, contrastPaints, semanticRegions, ownership(), { profile: "exploratory" });

  assert.equal(result.acceptedSemanticOperations, 0);
  assert.ok(result.rejectedOperationsByReason["strong-internal-boundary"] > 0);
  assert.equal(result.strongInternalBoundariesRemoved, 0);
});

test("S2 rolls back a batch that would eliminate the last global color components", async () => {
  const labels = new Uint8Array(width * height);
  labels.fill(2);
  for (let y = ownerBox.y0; y < ownerBox.y1; y++) {
    labels.fill(0, y * width + ownerBox.x0, y * width + 200);
    labels.fill(3, y * width + 200, y * width + ownerBox.x1);
  }
  for (let y = 100; y < 120; y++) labels[y * width + 100] = 1;
  for (let y = 300; y < 320; y++) labels[y * width + 300] = 1;
  const original = labels.slice();
  const result = await simulateSemanticObjectSimplifierFromLabelMap(labels, width, height, paints, semanticRegions, ownership(), {
    profile: "balanced",
    maxPasses: 1,
  });

  assert.equal(result.acceptedSemanticOperations, 0);
  assert.equal(result.rejectedOperationsByReason["rollback-eliminated-production-color"], 2);
  assert.deepEqual(result.simulatedLabels, original);
  assert.deepEqual(labels, original);
});
