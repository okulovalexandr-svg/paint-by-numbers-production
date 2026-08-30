import assert from "node:assert/strict";
import test from "node:test";

import {
  APPROVED_PREVIEW_COORDINATE_FRAME,
  FT161_SEMANTIC_PLANE_PROMPT,
  FT161_X1B_LIVE_SPEC,
  assertFt161LiveOptIn,
  attributeSemanticFailComponents,
  buildFt161SemanticPlaneMessages,
  parseSemanticPlaneLiveResponse,
  semanticPlaneLiveResponseJsonSchema,
} from "../lib/semantic-plane-live.ts";

const rectangle = (x0, y0, x1, y1) => [
  { x: x0, y: y0 }, { x: x1, y: y0 }, { x: x1, y: y1 }, { x: x0, y: y1 },
];

function validEnvelope() {
  return {
    coordinateFrame: APPROVED_PREVIEW_COORDINATE_FRAME,
    semanticPlanes: {
      version: "semantic-planes/v1",
      owners: [{ id: "owner-face", kind: "face", label: "Face", polygon: rectangle(0, 0, 800, 1000) }],
      planes: [
        { id: "plane-face-a", ownerId: "owner-face", label: "Face base A", role: "base", polygon: rectangle(0, 0, 600, 1000) },
        { id: "plane-face-b", ownerId: "owner-face", label: "Face base B", role: "base", polygon: rectangle(400, 0, 800, 1000) },
      ],
    },
  };
}

test("X1B-PREP keeps deterministic Image 1 source then Image 2 approved ordering", () => {
  const first = buildFt161SemanticPlaneMessages("data:image/jpeg;base64,SOURCE", "data:image/png;base64,APPROVED");
  const second = buildFt161SemanticPlaneMessages("data:image/jpeg;base64,SOURCE", "data:image/png;base64,APPROVED");
  const content = first[1].content;

  assert.deepEqual(first, second);
  assert.match(content[0].text, /Image 1 is the original source/);
  assert.match(content[0].text, /Image 2 is the approved palette preview/);
  assert.equal(content[1].image_url.url, "data:image/jpeg;base64,SOURCE");
  assert.equal(content[2].image_url.url, "data:image/png;base64,APPROVED");
});

test("X1B-PREP prompt and schema require the approved-preview coordinate frame", () => {
  assert.match(FT161_SEMANTIC_PLANE_PROMPT, new RegExp(APPROVED_PREVIEW_COORDINATE_FRAME.replace(".", "\\.")));
  assert.equal(semanticPlaneLiveResponseJsonSchema.properties.coordinateFrame.const, APPROVED_PREVIEW_COORDINATE_FRAME);
  const wrongFrame = validEnvelope();
  wrongFrame.coordinateFrame = "image-1-source-normalized-0..1000";
  assert.throws(() => parseSemanticPlaneLiveResponse(wrongFrame, 10, 10), /must use image-2-approved-preview/);
});

test("X1B-PREP strict valid response parses and rasterizes identically twice", () => {
  const input = JSON.stringify(validEnvelope());
  const first = parseSemanticPlaneLiveResponse(input, 10, 10);
  const second = parseSemanticPlaneLiveResponse(input, 10, 10);

  assert.deepEqual(first.raster.ownerMap, second.raster.ownerMap);
  assert.deepEqual(first.raster.planeMap, second.raster.planeMap);
  assert.equal(first.raster.checkpoint, second.raster.checkpoint);
  assert.equal(first.raster.documentCheckpoint, second.raster.documentCheckpoint);
});

test("X1B-PREP malformed geometry responses fail closed", () => {
  const selfIntersecting = validEnvelope();
  selfIntersecting.semanticPlanes.planes[0].polygon = [
    { x: 0, y: 0 }, { x: 600, y: 1000 }, { x: 0, y: 1000 }, { x: 600, y: 0 },
  ];
  assert.throws(() => parseSemanticPlaneLiveResponse(selfIntersecting, 10, 10), /self-intersecting|degenerate/);

  const outOfRange = validEnvelope();
  outOfRange.semanticPlanes.planes[0].polygon[0].x = 1001;
  assert.throws(() => parseSemanticPlaneLiveResponse(outOfRange, 10, 10), /within 0\.\.1000/);

  const unknownOwner = validEnvelope();
  unknownOwner.semanticPlanes.planes[0].ownerId = "owner-missing";
  assert.throws(() => parseSemanticPlaneLiveResponse(unknownOwner, 10, 10), /missing owner/);

  assert.throws(() => parseSemanticPlaneLiveResponse("not-json", 10, 10), /not valid JSON/);
});

test("X1B-PREP reports same-owner plane ambiguity without reassignment", () => {
  const parsed = parseSemanticPlaneLiveResponse(validEnvelope(), 10, 10);
  const ambiguousPixel = 5 * 10 + 5;

  assert.ok(parsed.raster.ambiguityPixelCount > 0);
  assert.equal(parsed.raster.ambiguityMask[ambiguousPixel], 1);
  assert.equal(parsed.raster.planeMap[ambiguousPixel], -1);
});

test("X1B-PREP live harness refuses without explicit opt-in and stays bounded", () => {
  assert.throws(() => assertFt161LiveOptIn({}), /ALLOW_LIVE_SEMANTIC_X1B=1/);
  assert.equal(FT161_X1B_LIVE_SPEC.fixture, "FT161");
  assert.equal(FT161_X1B_LIVE_SPEC.sourcePath, "public/reference/history/ft161-source.jpg");
  assert.equal(FT161_X1B_LIVE_SPEC.approvedPreviewPath, "public/reference/history/ft161-approved.png");
  assert.equal(FT161_X1B_LIVE_SPEC.requestLimit, 1);
  assert.equal(FT161_X1B_LIVE_SPEC.retryLimit, 0);
});

test("X1B-PREP synthetic FAIL attribution reports exact-owned, ambiguous and uncovered", () => {
  const parsed = parseSemanticPlaneLiveResponse(validEnvelope(), 10, 10);
  const report = attributeSemanticFailComponents(parsed.envelope.semanticPlanes, parsed.raster, [
    { id: "face-exact", expectedSemantic: "face", pixels: [21, 22] },
    { id: "eye-ambiguous", expectedSemantic: "eye", pixels: [24] },
    { id: "face-uncovered", expectedSemantic: "face", pixels: [29] },
  ]);

  assert.equal(report.componentCount, 3);
  assert.equal(report.exactOwnedComponentCount, 1);
  assert.equal(report.ambiguousComponentCount, 1);
  assert.equal(report.uncoveredComponentCount, 1);
  assert.equal(report.exactOwnedPixelCount, 2);
  assert.equal(report.ambiguousPixelCount, 1);
  assert.equal(report.uncoveredPixelCount, 1);
  assert.equal(report.face.targetPixelCount, 4);
  assert.equal(report.face.faceOwnedPixelCount, 2);
  assert.equal(report.face.coveragePercent, 50);
});
