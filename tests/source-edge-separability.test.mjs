import assert from "node:assert/strict";
import test from "node:test";

import { auditSourceEdgeSeparabilityFromLabelMap } from "../lib/paint-processor.ts";

function paints(count) {
  return Array.from({ length: count }, (_, index) => {
    const value = (96 + index * 7).toString(16).padStart(2, "0");
    return { id: index + 1, code: String.fromCharCode(65 + index), name: `Paint ${index + 1}`, hex: `#${value}${value}${value}` };
  });
}

function rgb(width, height, colorAt) {
  const pixels = new Uint8Array(width * height * 3);
  for (let y = 0; y < height; y++) for (let x = 0; x < width; x++) {
    const color = colorAt(x, y);
    const offset = (y * width + x) * 3;
    pixels[offset] = color[0];
    pixels[offset + 1] = color[1];
    pixels[offset + 2] = color[2];
  }
  return pixels;
}

function ownership(width, height, definitions, ownerDefinitions) {
  const semanticMask = new Uint8Array(width * height);
  const criticalMask = new Uint8Array(width * height);
  const ownerMasks = ownerDefinitions.map((owner) => ({
    ownerId: owner.ownerId,
    kind: owner.kind,
    priority: owner.priority ?? "protected",
    mask: new Uint8Array(width * height),
  }));
  for (const definition of definitions) for (const pixel of definition.pixels) {
    if (definition.ownerIds.length) semanticMask[pixel] = 1;
    if (definition.critical) criticalMask[pixel] = 1;
    for (const ownerId of definition.ownerIds) ownerMasks[ownerId].mask[pixel] = 1;
  }
  const count = (mask) => mask.reduce((sum, value) => sum + value, 0);
  return {
    width,
    height,
    semanticMask,
    criticalMask,
    ownerMasks,
    regions: definitions.map((definition, regionId) => ({
      regionId,
      pixelArea: definition.pixels.length,
      ownerIds: definition.ownerIds,
      kinds: definition.kinds,
      ambiguous: definition.ambiguous ?? false,
      critical: definition.critical ?? false,
      evidence: [],
    })),
    protectedPixels: count(semanticMask),
    protectedRegionCount: definitions.filter((definition) => definition.ownerIds.length).length,
    criticalProtectedPixels: count(criticalMask),
    criticalProtectedRegionCount: definitions.filter((definition) => definition.critical).length,
    ambiguousOwnershipCount: definitions.filter((definition) => definition.ambiguous).length,
    bboxProtectedPixels: count(semanticMask),
    bboxProtectedRegionCount: definitions.filter((definition) => definition.ownerIds.length).length,
    bboxCriticalProtectedPixels: count(criticalMask),
    bboxCriticalProtectedRegionCount: definitions.filter((definition) => definition.critical).length,
    bboxProtectedPixelsReleased: 0,
    regionsNewlyProtectedByCriticalCore: 0,
    semanticAreaReductionPercent: 0,
    criticalCoreCoverage: 100,
    maskCheckpoint: "SM-W1-SYNTHETIC",
  };
}

test("W1 classifies a flat source boundary as weak and a clear source step as strong", async () => {
  const width = 80;
  const height = 100;
  const labels = new Uint8Array(width * height);
  for (let y = 0; y < height; y++) labels.fill(1, y * width + width / 2, y * width + width);
  const base = { mode: "golden", sourceWidth: width, sourceHeight: height, sourceChannels: 3, labels, width, height, paints: paints(2) };

  const flat = await auditSourceEdgeSeparabilityFromLabelMap({
    ...base,
    sourcePixels: rgb(width, height, () => [128, 128, 128]),
  });
  const step = await auditSourceEdgeSeparabilityFromLabelMap({
    ...base,
    sourcePixels: rgb(width, height, (x) => x < width / 2 ? [0, 0, 0] : [255, 255, 255]),
  });

  assert.equal(flat.internalBoundaryEdges, 1);
  assert.equal(flat.edges[0].sourceGradient.p90, 0);
  assert.equal(flat.goldenWeakBoundaryRate[4].rate, 100);
  assert.ok(step.edges[0].sourceGradient.p90 > 90);
  assert.equal(step.goldenWeakBoundaryRate[12].rate, 0);
});

test("W1 excludes critical, cross-owner and ambiguous edges regardless of source gradient", async () => {
  const width = 80;
  const height = 100;
  const labels = new Uint8Array(width * height);
  const regionPixels = Array.from({ length: 4 }, () => []);
  for (let y = 0; y < height; y++) for (let x = 0; x < width; x++) {
    const region = Math.floor(x / 20);
    const pixel = y * width + x;
    labels[pixel] = region;
    regionPixels[region].push(pixel);
  }
  const semanticOwnership = ownership(width, height, [
    { pixels: regionPixels[0], ownerIds: [0], kinds: ["face"], critical: true },
    { pixels: regionPixels[1], ownerIds: [0], kinds: ["face"] },
    { pixels: regionPixels[2], ownerIds: [1], kinds: ["face"] },
    { pixels: regionPixels[3], ownerIds: [0, 1], kinds: ["face"], ambiguous: true },
  ], [
    { ownerId: 0, kind: "face" },
    { ownerId: 1, kind: "face" },
  ]);
  const result = await auditSourceEdgeSeparabilityFromLabelMap({
    mode: "semantic",
    sourcePixels: rgb(width, height, () => [110, 110, 110]),
    sourceWidth: width,
    sourceHeight: height,
    sourceChannels: 3,
    labels,
    width,
    height,
    paints: paints(4),
    semanticOwnership,
  });

  assert.equal(result.eligibleSemanticAdjacencyCount, 0);
  assert.deepEqual(result.edges.map((edge) => edge.exclusionReason), [
    "critical-ownership",
    "cross-owner",
    "ambiguous-ownership",
  ]);
  assert.ok(result.edges.every((edge) => edge.sourceGradient.p90 === 0));
});

test("W1 counts a paintable weak-edge union without mutation and reports PASS consumption separately", async () => {
  const width = 400;
  const height = 500;
  const labels = new Uint8Array(width * height);
  labels.fill(2);
  const leftPixels = [];
  const rightPixels = [];
  for (let y = 100; y < 104; y++) {
    for (let x = 100; x < 102; x++) { labels[y * width + x] = 0; leftPixels.push(y * width + x); }
    for (let x = 102; x < 105; x++) { labels[y * width + x] = 1; rightPixels.push(y * width + x); }
  }
  const backgroundPixels = [];
  for (let pixel = 0; pixel < labels.length; pixel++) if (labels[pixel] === 2) backgroundPixels.push(pixel);
  const semanticOwnership = ownership(width, height, [
    { pixels: backgroundPixels, ownerIds: [], kinds: [] },
    { pixels: leftPixels, ownerIds: [0], kinds: ["face"] },
    { pixels: rightPixels, ownerIds: [0], kinds: ["face"] },
  ], [{ ownerId: 0, kind: "face" }]);
  const sourcePixels = rgb(width, height, () => [120, 120, 120]);
  const originalLabels = labels.slice();
  const originalSource = sourcePixels.slice();
  const input = {
    mode: "semantic",
    sourcePixels,
    sourceWidth: width,
    sourceHeight: height,
    sourceChannels: 3,
    labels,
    width,
    height,
    paints: paints(3),
    semanticOwnership,
  };

  const first = await auditSourceEdgeSeparabilityFromLabelMap(input);
  const second = await auditSourceEdgeSeparabilityFromLabelMap(input);
  const oracle = first.oracleByThreshold[4];

  assert.equal(first.edgeClasses["FAIL-PASS"].edgeCount, 1);
  assert.equal(first.edgeClasses["FAIL-PASS"].weakEdges[4].count, 1);
  assert.equal(oracle.oraclePlaneClusters, 1);
  assert.equal(oracle.oracleResolvableFail, 1);
  assert.equal(oracle.theoreticalRegionReduction, 1);
  assert.equal(oracle.passRegionsConsumed, 1);
  assert.equal(oracle.passRegionsConsumedForFailGain, 1);
  assert.equal(oracle.largestClusters[0].fits5Pt, true);
  assert.deepEqual(labels, originalLabels);
  assert.deepEqual(sourcePixels, originalSource);
  assert.equal(first.labelMapUnchanged, true);
  assert.equal(first.decodedSourceUnchanged, true);
  assert.equal(first.auditCheckpoint, second.auditCheckpoint);
  assert.equal(first.source.decodedPixelCheckpoint, second.source.decodedPixelCheckpoint);
  assert.deepEqual(first.edges, second.edges);
});

test("W1 stops an aspect-ratio mismatch above 0.5% instead of guessing a crop", async () => {
  const width = 80;
  const height = 100;
  await assert.rejects(
    auditSourceEdgeSeparabilityFromLabelMap({
      mode: "golden",
      sourcePixels: rgb(100, 100, () => [0, 0, 0]),
      sourceWidth: 100,
      sourceHeight: 100,
      sourceChannels: 3,
      labels: new Uint8Array(width * height),
      width,
      height,
      paints: paints(1),
    }),
    /SOURCE_ASPECT_RATIO_MISMATCH/,
  );
});
