import assert from "node:assert/strict";
import test from "node:test";

import { buildRegionGraphDiagnosticFromLabelMap } from "../lib/paint-processor.ts";

const paints = [
  { id: 11, code: "P11", name: "Dark", hex: "#202020" },
  { id: 12, code: "P12", name: "Mid", hex: "#808080" },
  { id: 13, code: "P13", name: "Light", hex: "#E0E0E0" },
];

test("region graph is deterministic and leaves its label-map input unchanged", async () => {
  const labels = Uint8Array.from([
    0, 0, 1,
    0, 2, 1,
    2, 2, 1,
  ]);
  const original = labels.slice();
  const first = await buildRegionGraphDiagnosticFromLabelMap(labels, 3, 3, paints);
  const second = await buildRegionGraphDiagnosticFromLabelMap(labels, 3, 3, paints);

  assert.deepEqual(first, second);
  assert.deepEqual(labels, original);
  assert.equal(first.summary.totalNodes, 3);
  assert.equal(first.summary.totalEdges, 3);
});

test("adjacency and shared-boundary lengths are stable for 4-connected regions", async () => {
  const graph = await buildRegionGraphDiagnosticFromLabelMap(Uint8Array.from([
    0, 0, 1,
    0, 2, 1,
    2, 2, 1,
  ]), 3, 3, paints);
  const boundaries = graph.edges.map(({ regionA, regionB, sharedBoundaryPx }) => [regionA, regionB, sharedBoundaryPx]);

  assert.deepEqual(boundaries, [
    [0, 1, 1],
    [0, 2, 3],
    [1, 2, 2],
  ]);
  assert.deepEqual(graph.nodes.map((node) => node.neighboringRegionIds), [[1, 2], [0, 2], [0, 1]]);
  assert.deepEqual(graph.nodes.map((node) => node.perimeterPx), [8, 8, 8]);
});
