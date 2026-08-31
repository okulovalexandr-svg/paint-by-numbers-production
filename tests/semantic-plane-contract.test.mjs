import assert from "node:assert/strict";
import test from "node:test";

import {
  parseSemanticPlaneDocument,
  preflightSemanticPlaneDocument,
  rasterizeSemanticPlaneDocument,
  SEMANTIC_PLANE_DOCUMENT_VERSION,
  semanticPlaneDocumentJsonSchema,
} from "../lib/semantic-planes.ts";

const rectangle = (x0, y0, x1, y1) => [
  { x: x0, y: y0 },
  { x: x1, y: y0 },
  { x: x1, y: y1 },
  { x: x0, y: y1 },
];

function faceDocument() {
  return {
    version: SEMANTIC_PLANE_DOCUMENT_VERSION,
    owners: [{ id: "owner-face", kind: "face", label: "Face", polygon: rectangle(100, 100, 900, 900) }],
    planes: [
      { id: "plane-base", ownerId: "owner-face", label: "Skin base", role: "base", polygon: rectangle(100, 100, 900, 900) },
      { id: "plane-eye", ownerId: "owner-face", label: "Eye and pupil", role: "critical-detail", polygon: rectangle(400, 400, 600, 600) },
    ],
  };
}

test("X1A rasterization is deterministic and critical detail overrides base inside one owner", () => {
  const document = faceDocument();
  const original = structuredClone(document);
  const first = rasterizeSemanticPlaneDocument(document, 100, 100);
  const second = rasterizeSemanticPlaneDocument(document, 100, 100);
  const center = 50 * 100 + 50;
  const criticalIndex = first.planeIds.indexOf("plane-eye");

  assert.equal(first.planeMap[center], criticalIndex);
  assert.equal(first.criticalMask[center], 1);
  assert.equal(first.protectedMask[center], 1);
  assert.equal(first.ambiguityMask[center], 0);
  assert.equal(first.planePixelAreas.find((plane) => plane.planeId === "plane-base").pixelArea, 6000);
  assert.equal(first.planePixelAreas.find((plane) => plane.planeId === "plane-eye").pixelArea, 400);
  assert.deepEqual(first.ownerMap, second.ownerMap);
  assert.deepEqual(first.planeMap, second.planeMap);
  assert.equal(first.documentCheckpoint, second.documentCheckpoint);
  assert.equal(first.checkpoint, second.checkpoint);
  assert.deepEqual(document, original, "input document remains immutable");
});

test("X1A critical detail resolves lower-role same-owner ambiguity", () => {
  const document = faceDocument();
  document.planes.splice(1, 0, {
    id: "plane-base-overlap",
    ownerId: "owner-face",
    label: "Overlapping base",
    role: "base",
    polygon: rectangle(300, 300, 700, 700),
  });
  const raster = rasterizeSemanticPlaneDocument(document, 100, 100);
  const center = 50 * 100 + 50;

  assert.equal(raster.planeMap[center], raster.planeIds.indexOf("plane-eye"));
  assert.equal(raster.criticalMask[center], 1);
  assert.equal(raster.ambiguityMask[center], 0);
});

test("X1A rejects cross-owner overlap instead of silently choosing a winner", () => {
  const document = {
    version: SEMANTIC_PLANE_DOCUMENT_VERSION,
    owners: [
      { id: "owner-face", kind: "face", label: "Face", polygon: rectangle(100, 100, 650, 900) },
      { id: "owner-hand", kind: "hand", label: "Hand", polygon: rectangle(500, 200, 900, 800) },
    ],
    planes: [
      { id: "plane-face", ownerId: "owner-face", label: "Face base", role: "base", polygon: rectangle(100, 100, 650, 900) },
      { id: "plane-hand", ownerId: "owner-hand", label: "Hand base", role: "base", polygon: rectangle(500, 200, 900, 800) },
    ],
  };
  assert.throws(() => parseSemanticPlaneDocument(document), /overlap above raster tolerance/);
});

test("X1A rejects self-intersecting, degenerate and malformed geometry contracts", () => {
  const selfIntersecting = faceDocument();
  selfIntersecting.planes[0].polygon = [
    { x: 100, y: 100 }, { x: 900, y: 100 }, { x: 100, y: 900 }, { x: 900, y: 900 }, { x: 500, y: 200 },
  ];
  assert.throws(() => parseSemanticPlaneDocument(selfIntersecting), /self-intersecting/);

  const degenerate = faceDocument();
  degenerate.planes[0].polygon = [{ x: 100, y: 100 }, { x: 500, y: 500 }, { x: 900, y: 900 }];
  assert.throws(() => parseSemanticPlaneDocument(degenerate), /degenerate area/);

  const nonFinite = faceDocument();
  nonFinite.planes[0].polygon[0].x = Number.POSITIVE_INFINITY;
  assert.throws(() => parseSemanticPlaneDocument(nonFinite), /finite and within 0\.\.1000/);

  const duplicate = faceDocument();
  duplicate.planes[0].id = duplicate.owners[0].id;
  assert.throws(() => parseSemanticPlaneDocument(duplicate), /duplicate id/);

  const missingOwner = faceDocument();
  missingOwner.planes[0].ownerId = "owner-missing";
  assert.throws(() => parseSemanticPlaneDocument(missingOwner), /missing owner/);

  const illegalRole = {
    version: SEMANTIC_PLANE_DOCUMENT_VERSION,
    owners: [{ id: "owner-background", kind: "background", label: "Background", polygon: rectangle(0, 0, 1000, 1000) }],
    planes: [{ id: "plane-critical", ownerId: "owner-background", label: "Invalid critical texture", role: "critical-detail", polygon: rectangle(100, 100, 900, 900) }],
  };
  assert.throws(() => parseSemanticPlaneDocument(illegalRole), /illegal for owner kind background/);

  const colorField = faceDocument();
  colorField.planes[0].productionColor = "#FFFFFF";
  assert.throws(() => parseSemanticPlaneDocument(colorField), /unsupported field productionColor/);
});

test("X1A exact 5 pt preflight fails a narrow plane and passes a broad plane", () => {
  const document = {
    version: SEMANTIC_PLANE_DOCUMENT_VERSION,
    owners: [{ id: "owner-object", kind: "object", label: "Object", polygon: rectangle(50, 50, 950, 950) }],
    planes: [
      { id: "plane-broad", ownerId: "owner-object", label: "Broad plane", role: "base", polygon: rectangle(100, 150, 600, 850) },
      { id: "plane-narrow", ownerId: "owner-object", label: "Narrow detail", role: "structural-detail", polygon: rectangle(700, 200, 702, 800) },
    ],
  };
  const { raster, preflight } = preflightSemanticPlaneDocument(document, 400, 500);
  const broad = preflight.planes.find((plane) => plane.planeId === "plane-broad");
  const narrow = preflight.planes.find((plane) => plane.planeId === "plane-narrow");

  assert.equal(raster.ambiguityPixelCount, 0);
  assert.equal(broad.componentCount, 1);
  assert.equal(broad.passCount, 1);
  assert.equal(narrow.componentCount, 1);
  assert.equal(narrow.failCount, 1);
  assert.equal(preflight.componentCount, 2);
  assert.equal(preflight.passCount, 1);
  assert.equal(preflight.failCount, 1);
  assert.equal(preflight.coverage, 50);
  assert.ok(preflight.failedAreaPixels > 0);
});

test("X1A checkpoints are stable and change when document geometry changes", () => {
  const original = faceDocument();
  const changed = structuredClone(original);
  changed.planes[1].polygon[0].x += 5;
  const first = rasterizeSemanticPlaneDocument(original, 120, 120);
  const repeat = rasterizeSemanticPlaneDocument(original, 120, 120);
  const modified = rasterizeSemanticPlaneDocument(changed, 120, 120);

  assert.equal(first.checkpoint, repeat.checkpoint);
  assert.equal(first.documentCheckpoint, repeat.documentCheckpoint);
  assert.notEqual(first.documentCheckpoint, modified.documentCheckpoint);
  assert.notEqual(first.checkpoint, modified.checkpoint);
  assert.equal(semanticPlaneDocumentJsonSchema.additionalProperties, false);
  assert.equal("productionColor" in semanticPlaneDocumentJsonSchema.properties.planes.items.properties, false);
});
