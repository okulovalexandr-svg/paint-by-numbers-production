import assert from "node:assert/strict";
import test from "node:test";

import { selectReducedProductionColorsFromSamples } from "../lib/paint-processor.ts";

const hex = (value) => `#${value.toString(16).padStart(6, "0")}`;
const palette = Array.from({ length: 45 }, (_, index) => {
  const level = Math.round(index * 255 / 44);
  const red = index === 22 ? 245 : level;
  const green = index === 22 ? 45 : level;
  const blue = index === 22 ? 70 : level;
  return { id: index + 1, code: `P${index + 1}`, name: `Paint ${index + 1}`, hex: hex((red << 16) | (green << 8) | blue) };
});
const samples = palette.map((paint, index) => {
  const rgb = Number.parseInt(paint.hex.slice(1), 16);
  return {
    r: (rgb >> 16) & 255,
    g: (rgb >> 8) & 255,
    b: rgb & 255,
    count: index === 0 || index === 22 || index === 44 ? 2_000 : 10_000 - Math.abs(22 - index) * 120,
  };
});

test("45-color allowed pool deterministically reduces to an allowed 28-color subset", () => {
  const first = selectReducedProductionColorsFromSamples(samples, palette, 28);
  const second = selectReducedProductionColorsFromSamples(samples, palette, 28);
  const allowedIds = new Set(palette.map((paint) => paint.id));

  assert.equal(first.length, 28);
  assert.deepEqual(first.map((paint) => paint.id), second.map((paint) => paint.id));
  assert.ok(first.every((paint) => allowedIds.has(paint.id)));
  assert.ok(first.some((paint) => paint.id === 1), "dark structural anchor is preserved");
  assert.ok(first.some((paint) => paint.id === 23), "saturated accent anchor is preserved");
  assert.ok(first.some((paint) => paint.id === 45), "light structural anchor is preserved");
});
