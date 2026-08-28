export type ProductionPaint = {
  id: number;
  code: string;
  name: string;
  hex: string;
};

export type SemanticRegionKind = "face" | "eye" | "text" | "logo" | "hand" | "key-detail";

export type SemanticRegion = {
  kind: SemanticRegionKind;
  label: string;
  x: number;
  y: number;
  width: number;
  height: number;
  priority: "critical" | "protected";
};

export type PaintProcessOptions = {
  semanticRegions?: SemanticRegion[];
  preserveSemanticDetails?: boolean;
  productionReadiness?: ProductionReadinessResult;
  onProgress?: (stage: string, progress: number) => void;
};

export type ProductionReadinessStatus = "PASS" | "WARN" | "FAIL";

export type ProductionReadinessPhysicalMetrics = {
  min: number;
  p10: number;
  p25: number;
  median: number;
  p75: number;
  p90: number;
  max: number;
};

export type ProductionReadinessResult = {
  width: number;
  height: number;
  regionCount: number;
  fitCount: number;
  failCount: number;
  fitCoverage: number;
  failedAreaPixels: number;
  failedAreaMm2: number;
  failedAreaPercent: number;
  densityPer100Cm2: number;
  failedAreaBuckets: {
    "<1": number;
    "1-2": number;
    "2-4": number;
    "4-8": number;
    "8-16": number;
    ">16": number;
  };
  failedBBoxWidthMm: ProductionReadinessPhysicalMetrics;
  failedBBoxHeightMm: ProductionReadinessPhysicalMetrics;
  microIslandFailCount: number;
  status: ProductionReadinessStatus;
};

export type ProductionReadinessOptions = {
  semanticAvailable?: boolean;
};

export type NonSemanticNoiseCorrectionDiagnostics = {
  correctedComponentCount: number;
  correctedPixelCount: number;
  correctedAreaMm2: number;
  correctedAreaPercent: number;
  skippedSemanticCount: number;
  skippedTooLargeCount: number;
  skippedNoNeighborCount: number;
  skippedOnlyColorCount: number;
  semanticFailCountAfter: number;
  nonSemanticFailCountAfter: number;
  semanticPixelChangeCount: number;
};

export type NonSemanticNoiseCorrectionResult = {
  correctedRaster: string;
  diagnostics: NonSemanticNoiseCorrectionDiagnostics;
};

export type PaintProcessResult = {
  preview: string;
  scheme: string;
  svg: string;
  pdf: string;
  checkpointId: string;
  usedColors: ProductionPaint[];
  regionCount: number;
  numberCount: number;
  removedAreas: number;
  unlabeledRegionCount: number;
  stackedNumberCount: number;
  repairedRegionCount: number;
  protectedRegionCount: number;
  minimumRegionArea: number;
};

type Lab = [number, number, number];
type ColorSample = { key: number; count: number; weight: number; lab: Lab };
type NumberMark = {
  label: number;
  x: number;
  y: number;
  area: number;
  fontSize: number;
  rotation: number;
  stacked: boolean;
};
type Component = {
  label: number;
  pixels: number[];
  boundary: Uint32Array;
  minX: number;
  maxX: number;
  minY: number;
  maxY: number;
};

const NEIGHBORS = [[1, 0], [-1, 0], [0, 1], [0, -1]] as const;
const ARTWORK_WIDTH_MM = 400;
const ARTWORK_HEIGHT_MM = 500;
const PRINT_WIDTH_MM = 475;
const PRINT_HEIGHT_MM = 575;
const TECHNICAL_MARGIN_MM = 37.5;
const POINT_TO_MM = 25.4 / 72;

type PrintScale = {
  pixelsPerMm: number;
  minimumFontPx: number;
  maximumFontPx: number;
  contourWidthPx: number;
};

type CooperativeYield = (force?: boolean) => Promise<void>;

function createCooperativeYield(): CooperativeYield {
  let lastYield = performance.now();
  return async (force = false) => {
    const now = performance.now();
    if (!force && now - lastYield < 14) return;
    await new Promise<void>((resolve) => {
      requestAnimationFrame(() => window.setTimeout(resolve, 0));
    });
    lastYield = performance.now();
  };
}

function printScale(width: number, height: number): PrintScale {
  const pixelsPerMm = Math.min(width / ARTWORK_WIDTH_MM, height / ARTWORK_HEIGHT_MM);
  return {
    pixelsPerMm,
    minimumFontPx: 5 * POINT_TO_MM * pixelsPerMm,
    maximumFontPx: 8 * POINT_TO_MM * pixelsPerMm,
    contourWidthPx: 0.25 * POINT_TO_MM * pixelsPerMm,
  };
}

function approvedPaletteAssignment(rgb: Uint8ClampedArray, palette: ProductionPaint[]) {
  const counts = new Map<number, number>();
  for (let pixel = 0; pixel < rgb.length; pixel += 3) {
    const key = (rgb[pixel] << 16) | (rgb[pixel + 1] << 8) | rgb[pixel + 2];
    counts.set(key, (counts.get(key) || 0) + 1);
  }
  if (counts.size > 80) throw new Error("Approved preview must contain no more than 80 flat colors");

  const paletteByHex = new Map(palette.map((paint, index) => [paint.hex.toUpperCase(), { paint, index }]));
  const colors = [...counts.entries()].map(([key, count]) => {
    const color: [number, number, number] = [(key >> 16) & 255, (key >> 8) & 255, key & 255];
    const hex = `#${color.map((value) => value.toString(16).padStart(2, "0")).join("").toUpperCase()}`;
    const exact = paletteByHex.get(hex);
    return { key, count, rgb: color, hex, exact };
  }).sort((left, right) => {
    if (left.exact && right.exact) return left.exact.index - right.exact.index;
    if (left.exact) return -1;
    if (right.exact) return 1;
    const lightLeft = left.rgb[0] * .2126 + left.rgb[1] * .7152 + left.rgb[2] * .0722;
    const lightRight = right.rgb[0] * .2126 + right.rgb[1] * .7152 + right.rgb[2] * .0722;
    return lightRight - lightLeft || right.count - left.count;
  });
  const assignment = new Map<number, number>();
  colors.forEach((color, index) => assignment.set(color.key, index));
  return {
    selectedPaints: colors.map((color) => color.exact?.paint || {
      id: 1_000_000 + color.key,
      code: color.hex,
      name: "Цвет утверждённого превью",
      hex: color.hex,
    }),
    selectedRgb: colors.map((color) => color.rgb),
    assignment,
  };
}

function buildSemanticProtectionMask(width: number, height: number, regions: SemanticRegion[]) {
  const mask = new Uint8Array(width * height);
  for (const region of regions) {
    const critical = region.priority === "critical" || region.kind === "eye" || region.kind === "text" || region.kind === "logo";
    const padding = critical ? 0.16 : 0.08;
    const x0 = Math.max(0, Math.floor((region.x - region.width * padding) * width));
    const y0 = Math.max(0, Math.floor((region.y - region.height * padding) * height));
    const x1 = Math.min(width, Math.ceil((region.x + region.width * (1 + padding)) * width));
    const y1 = Math.min(height, Math.ceil((region.y + region.height * (1 + padding)) * height));
    const value = critical ? 2 : 1;
    for (let y = y0; y < y1; y++) {
      const row = y * width;
      for (let x = x0; x < x1; x++) mask[row + x] = Math.max(mask[row + x], value);
    }
  }
  return mask;
}

function buildCriticalDetailMask(width: number, height: number, regions: SemanticRegion[]) {
  const mask = new Uint8Array(width * height);
  for (const region of regions) {
    const critical = region.priority === "critical"
      || region.kind === "eye"
      || region.kind === "text"
      || region.kind === "logo"
      || region.kind === "key-detail";
    if (!critical) continue;
    // The source-first layer must be tight. Large padded rectangles preserve
    // unrelated skin/background texture and were the reason previous attempts
    // looked noisy around faces.
    const padding = 0.025;
    const x0 = Math.max(0, Math.floor((region.x - region.width * padding) * width));
    const y0 = Math.max(0, Math.floor((region.y - region.height * padding) * height));
    const x1 = Math.min(width, Math.ceil((region.x + region.width * (1 + padding)) * width));
    const y1 = Math.min(height, Math.ceil((region.y + region.height * (1 + padding)) * height));
    for (let y = y0; y < y1; y++) {
      const row = y * width;
      for (let x = x0; x < x1; x++) mask[row + x] = 1;
    }
  }
  return mask;
}

function buildSemanticNoiseMasks(width: number, height: number, regions: SemanticRegion[]) {
  const semantic = new Uint8Array(width * height);
  const halo = new Uint8Array(width * height);
  const haloX = Math.ceil(2 / (ARTWORK_WIDTH_MM / width));
  const haloY = Math.ceil(2 / (ARTWORK_HEIGHT_MM / height));
  for (const region of regions) {
    const x0 = Math.max(0, Math.floor(region.x * width));
    const y0 = Math.max(0, Math.floor(region.y * height));
    const x1 = Math.min(width, Math.ceil((region.x + region.width) * width));
    const y1 = Math.min(height, Math.ceil((region.y + region.height) * height));
    for (let y = y0; y < y1; y++) {
      const row = y * width;
      for (let x = x0; x < x1; x++) semantic[row + x] = 1;
    }
    const haloX0 = Math.max(0, x0 - haloX);
    const haloY0 = Math.max(0, y0 - haloY);
    const haloX1 = Math.min(width, x1 + haloX);
    const haloY1 = Math.min(height, y1 + haloY);
    for (let y = haloY0; y < haloY1; y++) {
      const row = y * width;
      for (let x = haloX0; x < haloX1; x++) halo[row + x] = 1;
    }
  }
  return { semantic, halo };
}

function dilateMask(mask: Uint8Array, width: number, height: number, radius = 2) {
  let current = mask;
  for (let pass = 0; pass < radius; pass++) {
    const next = current.slice();
    for (let y = 0; y < height; y++) {
      for (let x = 0; x < width; x++) {
        const index = y * width + x;
        if (current[index]) continue;
        for (const [dx, dy] of NEIGHBORS) {
          const nx = x + dx;
          const ny = y + dy;
          if (nx >= 0 && nx < width && ny >= 0 && ny < height && current[ny * width + nx]) {
            next[index] = 1;
            break;
          }
        }
      }
    }
    current = next;
  }
  return current;
}

function componentProtectionLevel(component: Component, protectionMask?: Uint8Array) {
  if (!protectionMask) return 0;
  let protectedPixels = 0;
  let criticalPixels = 0;
  for (const index of component.pixels) {
    if (protectionMask[index]) protectedPixels++;
    if (protectionMask[index] === 2) criticalPixels++;
  }
  if (criticalPixels >= Math.max(1, Math.ceil(component.pixels.length * 0.2))) return 2;
  if (protectedPixels >= Math.max(1, Math.ceil(component.pixels.length * 0.35))) return 1;
  return 0;
}

function componentAvailableForNumbers(component: Component, width: number, exclusionMask?: Uint8Array) {
  if (!exclusionMask) return component;
  const pixels = component.pixels.filter((index) => !exclusionMask[index]);
  if (!pixels.length) return null;
  if (pixels.length === component.pixels.length) return component;
  let minX = width;
  let maxX = 0;
  let minY = Number.POSITIVE_INFINITY;
  let maxY = 0;
  for (const index of pixels) {
    const x = index % width;
    const y = Math.floor(index / width);
    minX = Math.min(minX, x);
    maxX = Math.max(maxX, x);
    minY = Math.min(minY, y);
    maxY = Math.max(maxY, y);
  }
  return {
    ...component,
    pixels,
    boundary: new Uint32Array(),
    minX,
    maxX,
    minY,
    maxY,
  };
}

function hexToRgb(hex: string): [number, number, number] {
  const value = hex.replace("#", "");
  return [0, 2, 4].map((offset) => Number.parseInt(value.slice(offset, offset + 2), 16)) as [number, number, number];
}

function rgbToLab(r: number, g: number, b: number): Lab {
  const linear = [r, g, b].map((channel) => {
    const value = channel / 255;
    return value <= 0.04045 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4;
  });
  const x = (linear[0] * 0.4124 + linear[1] * 0.3576 + linear[2] * 0.1805) / 0.95047;
  const y = linear[0] * 0.2126 + linear[1] * 0.7152 + linear[2] * 0.0722;
  const z = (linear[0] * 0.0193 + linear[1] * 0.1192 + linear[2] * 0.9505) / 1.08883;
  const transform = (value: number) => value > 0.008856 ? Math.cbrt(value) : 7.787 * value + 16 / 116;
  const fx = transform(x);
  const fy = transform(y);
  const fz = transform(z);
  return [116 * fy - 16, 500 * (fx - fy), 200 * (fy - fz)];
}

function labDistance(a: Lab, b: Lab) {
  const dl = a[0] - b[0];
  const da = a[1] - b[1];
  const db = a[2] - b[2];
  return dl * dl + da * da + db * db;
}

function colorKey(r: number, g: number, b: number) {
  return ((r >> 4) << 8) | ((g >> 4) << 4) | (b >> 4);
}

function edgeAwareSmooth(source: Uint8ClampedArray, width: number, height: number) {
  let current = source;
  const threshold = 48 * 48;
  for (let pass = 0; pass < 2; pass++) {
    const next = new Uint8ClampedArray(current.length);
    for (let y = 0; y < height; y++) {
      for (let x = 0; x < width; x++) {
        const center = (y * width + x) * 3;
        const cr = current[center];
        const cg = current[center + 1];
        const cb = current[center + 2];
        let totalWeight = 3;
        let r = cr * 3;
        let g = cg * 3;
        let b = cb * 3;
        for (let oy = -1; oy <= 1; oy++) {
          const ny = y + oy;
          if (ny < 0 || ny >= height) continue;
          for (let ox = -1; ox <= 1; ox++) {
            if (ox === 0 && oy === 0) continue;
            const nx = x + ox;
            if (nx < 0 || nx >= width) continue;
            const index = (ny * width + nx) * 3;
            const dr = current[index] - cr;
            const dg = current[index + 1] - cg;
            const db = current[index + 2] - cb;
            if (dr * dr + dg * dg + db * db > threshold) continue;
            r += current[index];
            g += current[index + 1];
            b += current[index + 2];
            totalWeight++;
          }
        }
        next[center] = Math.round(r / totalWeight);
        next[center + 1] = Math.round(g / totalWeight);
        next[center + 2] = Math.round(b / totalWeight);
      }
    }
    current = next;
  }
  return current;
}

function computeEdgeStrength(rgb: Uint8ClampedArray, width: number, height: number) {
  const luminance = new Float32Array(width * height);
  const edges = new Uint8Array(width * height);
  for (let pixel = 0; pixel < luminance.length; pixel++) {
    luminance[pixel] = rgb[pixel * 3] * 0.2126 + rgb[pixel * 3 + 1] * 0.7152 + rgb[pixel * 3 + 2] * 0.0722;
  }
  for (let y = 1; y < height - 1; y++) {
    for (let x = 1; x < width - 1; x++) {
      const index = y * width + x;
      const gx = -luminance[index - width - 1] + luminance[index - width + 1]
        - 2 * luminance[index - 1] + 2 * luminance[index + 1]
        - luminance[index + width - 1] + luminance[index + width + 1];
      const gy = -luminance[index - width - 1] - 2 * luminance[index - width] - luminance[index - width + 1]
        + luminance[index + width - 1] + 2 * luminance[index + width] + luminance[index + width + 1];
      edges[index] = Math.min(255, Math.round(Math.hypot(gx, gy) * 0.45));
    }
  }
  return edges;
}

function buildSamples(rgb: Uint8ClampedArray, edges: Uint8Array) {
  const bins = new Map<number, { count: number; weight: number; r: number; g: number; b: number }>();
  for (let index = 0; index < rgb.length; index += 3) {
    const r = rgb[index];
    const g = rgb[index + 1];
    const b = rgb[index + 2];
    const key = colorKey(r, g, b);
    const pixel = index / 3;
    const chroma = Math.max(r, g, b) - Math.min(r, g, b);
    const weight = 1 + Math.min(1.2, chroma / 105) + Math.min(1.4, edges[pixel] / 110);
    const sample = bins.get(key);
    if (sample) {
      sample.count++;
      sample.weight += weight;
      sample.r += r;
      sample.g += g;
      sample.b += b;
    } else {
      bins.set(key, { count: 1, weight, r, g, b });
    }
  }
  return [...bins.entries()].map(([key, sample]): ColorSample => ({
    key,
    count: sample.count,
    weight: sample.weight,
    lab: rgbToLab(sample.r / sample.count, sample.g / sample.count, sample.b / sample.count),
  }));
}

function choosePalette(samples: ColorSample[], paletteLabs: Lab[], requested: number) {
  const count = Math.max(1, Math.min(requested, paletteLabs.length));
  let candidateIndexes = paletteLabs.map((_, index) => index);
  if (candidateIndexes.length > 180) {
    const coverage = new Float64Array(candidateIndexes.length);
    for (const sample of samples) {
      let closest = 0;
      let best = Number.POSITIVE_INFINITY;
      for (let candidate = 0; candidate < paletteLabs.length; candidate++) {
        const distance = labDistance(sample.lab, paletteLabs[candidate]);
        if (distance < best) { best = distance; closest = candidate; }
      }
      coverage[closest] += sample.weight;
    }
    const candidateLimit = Math.min(180, Math.max(96, count * 4));
    candidateIndexes = candidateIndexes.sort((a, b) => coverage[b] - coverage[a]).slice(0, candidateLimit);
  }
  const candidateLabs = candidateIndexes.map((index) => paletteLabs[index]);
  const selected: number[] = [];
  const distances = new Float64Array(samples.length);
  distances.fill(Number.POSITIVE_INFINITY);

  for (let step = 0; step < count; step++) {
    let bestCandidate = -1;
    let bestScore = step === 0 ? Number.POSITIVE_INFINITY : -1;
    for (let candidate = 0; candidate < candidateLabs.length; candidate++) {
      if (selected.includes(candidate)) continue;
      let score = 0;
      for (let sampleIndex = 0; sampleIndex < samples.length; sampleIndex++) {
        const distance = labDistance(samples[sampleIndex].lab, candidateLabs[candidate]);
        score += samples[sampleIndex].weight * (step === 0 ? distance : Math.max(0, distances[sampleIndex] - distance));
      }
      if ((step === 0 && score < bestScore) || (step > 0 && score > bestScore)) {
        bestScore = score;
        bestCandidate = candidate;
      }
    }
    if (bestCandidate < 0) break;
    selected.push(bestCandidate);
    for (let sampleIndex = 0; sampleIndex < samples.length; sampleIndex++) {
      distances[sampleIndex] = Math.min(distances[sampleIndex], labDistance(samples[sampleIndex].lab, candidateLabs[bestCandidate]));
    }
  }
  return selected.map((index) => candidateIndexes[index]);
}

export async function selectProductionColors(
  fileUrl: string,
  palette: ProductionPaint[],
  requestedColors: number,
): Promise<ProductionPaint[]> {
  if (!palette.length) throw new Error("Production palette is empty");
  const image = new Image();
  image.src = fileUrl;
  await image.decode();
  const scale = Math.min(1, 420 / Math.max(image.width, image.height));
  const width = Math.max(1, Math.round(image.width * scale));
  const height = Math.max(1, Math.round(image.height * scale));
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const context = canvas.getContext("2d", { willReadFrequently: true })!;
  context.imageSmoothingEnabled = true;
  context.drawImage(image, 0, 0, width, height);
  const source = context.getImageData(0, 0, width, height).data;
  const rgb = new Uint8ClampedArray(width * height * 3);
  for (let pixel = 0; pixel < width * height; pixel++) {
    rgb[pixel * 3] = source[pixel * 4];
    rgb[pixel * 3 + 1] = source[pixel * 4 + 1];
    rgb[pixel * 3 + 2] = source[pixel * 4 + 2];
  }
  const edges = computeEdgeStrength(rgb, width, height);
  const samples = buildSamples(edgeAwareSmooth(rgb, width, height), edges);
  const paletteLabs = palette.map((paint) => {
    const [r, g, b] = hexToRgb(paint.hex);
    return rgbToLab(r, g, b);
  });
  return choosePalette(samples, paletteLabs, requestedColors).map((index) => palette[index]);
}

export async function snapImageToProductionPalette(
  fileUrl: string,
  palette: ProductionPaint[],
): Promise<string> {
  if (!palette.length) throw new Error("Production palette is empty");
  const image = new Image();
  image.src = fileUrl;
  await image.decode();
  // Keep the full GPT Image portrait output (normally up to 1024 x 1536).
  // The previous 1280 px cap silently reduced it to about 853 x 1280 before
  // the production map was even built, which removed useful eye and letter
  // geometry. The production processor uses the same 1600 px checkpoint cap.
  const scale = Math.min(1, 1600 / Math.max(image.width, image.height));
  const width = Math.max(1, Math.round(image.width * scale));
  const height = Math.max(1, Math.round(image.height * scale));
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const context = canvas.getContext("2d", { willReadFrequently: true })!;
  context.imageSmoothingEnabled = false;
  context.drawImage(image, 0, 0, width, height);
  const imageData = context.getImageData(0, 0, width, height);
  const rgb = new Uint8ClampedArray(width * height * 3);
  for (let pixel = 0; pixel < width * height; pixel++) {
    rgb[pixel * 3] = imageData.data[pixel * 4];
    rgb[pixel * 3 + 1] = imageData.data[pixel * 4 + 1];
    rgb[pixel * 3 + 2] = imageData.data[pixel * 4 + 2];
  }
  // GPT Image can leave nearly invisible tonal grain inside otherwise flat
  // shapes. Mapping those raw pixels one by one turns that grain into hundreds
  // of false paint islands. FT154/FT155 first stabilised the colour planes and
  // only then matched them to the production palette. This edge-aware pass
  // removes intra-plane noise while keeping real eyes, letters and silhouettes.
  const edges = computeEdgeStrength(rgb, width, height);
  const smoothed = edgeAwareSmooth(rgb, width, height);
  const paletteRgb = palette.map((paint) => hexToRgb(paint.hex));
  const paletteLabs = paletteRgb.map(([r, g, b]) => rgbToLab(r, g, b));
  const assignments = new Map<number, number>();
  let labels = new Uint8Array(width * height);
  for (let pixel = 0; pixel < width * height; pixel++) {
    const rgbOffset = pixel * 3;
    const r = smoothed[rgbOffset];
    const g = smoothed[rgbOffset + 1];
    const b = smoothed[rgbOffset + 2];
    const key = (r << 16) | (g << 8) | b;
    let closest = assignments.get(key);
    if (closest === undefined) {
      const lab = rgbToLab(r, g, b);
      let best = Number.POSITIVE_INFINITY;
      closest = 0;
      for (let color = 0; color < paletteLabs.length; color++) {
        const distance = labDistance(lab, paletteLabs[color]);
        if (distance < best) { best = distance; closest = color; }
      }
      assignments.set(key, closest);
    }
    labels[pixel] = closest;
  }
  // At this stage the image model has already drawn all meaningful geometry.
  // A palette-colour fleck surrounded by another colour is output noise, not a
  // source edge. The historical checkpoint used the same unconditional
  // majority cleanup before the number-fit test.
  labels = majorityCleanup(labels, width, height, paletteRgb.length, edges, false);
  for (let pixel = 0; pixel < width * height; pixel++) {
    const offset = pixel * 4;
    const [mappedR, mappedG, mappedB] = paletteRgb[labels[pixel]];
    imageData.data[offset] = mappedR;
    imageData.data[offset + 1] = mappedG;
    imageData.data[offset + 2] = mappedB;
    imageData.data[offset + 3] = 255;
  }
  context.putImageData(imageData, 0, 0);
  return canvas.toDataURL("image/png");
}

function majorityCleanup(
  labels: Uint8Array,
  width: number,
  height: number,
  colorCount: number,
  edges: Uint8Array,
  preserveEdges = true,
) {
  let current = labels;
  for (let pass = 0; pass < 3; pass++) {
    const next = current.slice();
    const counts = new Uint8Array(colorCount);
    for (let y = 1; y < height - 1; y++) {
      for (let x = 1; x < width - 1; x++) {
        counts.fill(0);
        const index = y * width + x;
        if (preserveEdges && edges[index] > 86) continue;
        for (let oy = -1; oy <= 1; oy++) {
          for (let ox = -1; ox <= 1; ox++) counts[current[index + oy * width + ox]]++;
        }
        let winner = current[index];
        for (let label = 0; label < colorCount; label++) {
          if (counts[label] > counts[winner]) winner = label;
        }
        if (winner !== current[index] && counts[winner] >= 5 && counts[current[index]] <= 3) next[index] = winner;
      }
    }
    current = next;
  }
  return current;
}

async function walkComponents(
  labels: Uint8Array,
  width: number,
  height: number,
  colorCount: number,
  visit: (component: Component) => void | Promise<void>,
  cooperativeYield: CooperativeYield,
) {
  const visited = new Uint8Array(labels.length);
  for (let start = 0; start < labels.length; start++) {
    if ((start & 16383) === 0) await cooperativeYield();
    if (visited[start]) continue;
    const label = labels[start];
    const queue = [start];
    const pixels: number[] = [];
    const boundary = new Uint32Array(colorCount);
    let minX = width;
    let maxX = 0;
    let minY = height;
    let maxY = 0;
    visited[start] = 1;
    for (let cursor = 0; cursor < queue.length; cursor++) {
      if (cursor > 0 && (cursor & 16383) === 0) await cooperativeYield();
      const index = queue[cursor];
      pixels.push(index);
      const x = index % width;
      const y = Math.floor(index / width);
      minX = Math.min(minX, x);
      maxX = Math.max(maxX, x);
      minY = Math.min(minY, y);
      maxY = Math.max(maxY, y);
      for (const [dx, dy] of NEIGHBORS) {
        const nx = x + dx;
        const ny = y + dy;
        if (nx < 0 || nx >= width || ny < 0 || ny >= height) continue;
        const next = ny * width + nx;
        if (labels[next] === label) {
          if (!visited[next]) { visited[next] = 1; queue.push(next); }
        } else {
          boundary[labels[next]]++;
        }
      }
    }
    await visit({ label, pixels, boundary, minX, maxX, minY, maxY });
  }
}

function componentDistance(component: Component, imageWidth: number) {
  const padding = 2;
  const localWidth = component.maxX - component.minX + 1 + padding * 2;
  const localHeight = component.maxY - component.minY + 1 + padding * 2;
  const mask = new Uint8Array(localWidth * localHeight);
  const distance = new Uint16Array(localWidth * localHeight);
  for (const index of component.pixels) {
    const x = index % imageWidth - component.minX + padding;
    const y = Math.floor(index / imageWidth) - component.minY + padding;
    mask[y * localWidth + x] = 1;
  }
  distance.fill(30000);
  for (let index = 0; index < mask.length; index++) if (!mask[index]) distance[index] = 0;
  for (let y = 1; y < localHeight - 1; y++) {
    for (let x = 1; x < localWidth - 1; x++) {
      const index = y * localWidth + x;
      if (!mask[index]) continue;
      distance[index] = Math.min(distance[index], distance[index - 1] + 3, distance[index - localWidth] + 3, distance[index - localWidth - 1] + 4, distance[index - localWidth + 1] + 4);
    }
  }
  for (let y = localHeight - 2; y > 0; y--) {
    for (let x = localWidth - 2; x > 0; x--) {
      const index = y * localWidth + x;
      if (!mask[index]) continue;
      distance[index] = Math.min(distance[index], distance[index + 1] + 3, distance[index + localWidth] + 3, distance[index + localWidth + 1] + 4, distance[index + localWidth - 1] + 4);
    }
  }
  const at = (imageIndex: number) => {
    const x = imageIndex % imageWidth - component.minX + padding;
    const y = Math.floor(imageIndex / imageWidth) - component.minY + padding;
    return distance[y * localWidth + x] / 3;
  };
  let max = 0;
  for (const index of component.pixels) max = Math.max(max, at(index));
  return { at, max };
}

function componentOrientation(component: Component, imageWidth: number) {
  let meanX = 0;
  let meanY = 0;
  for (const index of component.pixels) {
    meanX += index % imageWidth;
    meanY += Math.floor(index / imageWidth);
  }
  meanX /= component.pixels.length;
  meanY /= component.pixels.length;
  let xx = 0;
  let yy = 0;
  let xy = 0;
  for (const index of component.pixels) {
    const dx = index % imageWidth - meanX;
    const dy = Math.floor(index / imageWidth) - meanY;
    xx += dx * dx;
    yy += dy * dy;
    xy += dx * dy;
  }
  const trace = xx + yy;
  const spread = Math.sqrt((xx - yy) ** 2 + 4 * xy * xy);
  const major = Math.max(1, (trace + spread) / 2);
  const minor = Math.max(1, (trace - spread) / 2);
  let angle = Math.atan2(2 * xy, xx - yy) * 90 / Math.PI;
  while (angle > 90) angle -= 180;
  while (angle < -90) angle += 180;
  return { angle, elongation: Math.sqrt(major / minor) };
}

function componentMask(component: Component, imageWidth: number) {
  const padding = 2;
  const width = component.maxX - component.minX + 1 + padding * 2;
  const height = component.maxY - component.minY + 1 + padding * 2;
  const mask = new Uint8Array(width * height);
  for (const index of component.pixels) {
    const x = index % imageWidth - component.minX + padding;
    const y = Math.floor(index / imageWidth) - component.minY + padding;
    mask[y * width + x] = 1;
  }
  return { mask, width, height, padding };
}

function rectangleFits(
  geometry: ReturnType<typeof componentMask>,
  component: Component,
  centerX: number,
  centerY: number,
  boxWidth: number,
  boxHeight: number,
  angle: number,
) {
  const radians = angle * Math.PI / 180;
  const cosine = Math.cos(radians);
  const sine = Math.sin(radians);
  const stepsX = Math.max(3, Math.ceil(boxWidth / 0.65));
  const stepsY = Math.max(3, Math.ceil(boxHeight / 0.65));
  for (let iy = 0; iy <= stepsY; iy++) {
    const localY = (iy / stepsY - 0.5) * boxHeight;
    for (let ix = 0; ix <= stepsX; ix++) {
      const localX = (ix / stepsX - 0.5) * boxWidth;
      const x = centerX + localX * cosine - localY * sine;
      const y = centerY + localX * sine + localY * cosine;
      const maskX = Math.round(x - component.minX + geometry.padding);
      const maskY = Math.round(y - component.minY + geometry.padding);
      if (maskX < 0 || maskX >= geometry.width || maskY < 0 || maskY >= geometry.height) return false;
      if (!geometry.mask[maskY * geometry.width + maskX]) return false;
    }
  }
  return true;
}

function fitNumberAt(
  component: Component,
  imageWidth: number,
  anchor: number,
  label: number,
  geometry: ReturnType<typeof componentMask>,
  orientation: ReturnType<typeof componentOrientation>,
  scale: PrintScale,
) {
  const value = String(label + 1);
  const centerX = anchor % imageWidth;
  const centerY = Math.floor(anchor / imageWidth);
  // FT154/FT155 used the real condensed production-number geometry and tried
  // the full set of useful rotations. The old browser port measured numbers
  // as ordinary Arial (up to 42% wider and 42% taller) and only tried 0/90°
  // for most regions. That falsely classified hundreds of perfectly printable
  // eye, face and lettering regions as "too small" and merged them away.
  const principal = Math.round(orientation.angle * 10) / 10;
  const angles = [...new Set([0, 90, 45, -45, 25, -25, 65, -65, principal])];
  let best: { fontSize: number; rotation: number; stacked: boolean; score: number } | null = null;
  const formats = value.length > 1 ? [false, true] : [false];
  for (const stacked of formats) {
    const candidateAngles = stacked ? [0] : angles;
    for (const rotation of candidateAngles) {
      const fits = (fontSize: number) => {
        // Nimbus Sans Narrow is the accepted FT154/FT155 number face. Its
        // advance is 0.456 em per digit and its printable glyph height is
        // 0.76 em. Stacked two-digit labels use the same 0.10 em gap as the
        // production scripts.
        const textWidth = stacked ? fontSize * 0.456 : fontSize * value.length * 0.456;
        const textHeight = stacked
          ? fontSize * (value.length * 0.76 + Math.max(0, value.length - 1) * 0.10)
          : fontSize * 0.76;
        return rectangleFits(geometry, component, centerX, centerY, textWidth + 0.36, textHeight + 0.36, rotation);
      };
      if (!fits(scale.minimumFontPx)) continue;
      let low = scale.minimumFontPx;
      let high = scale.maximumFontPx;
      if (fits(high)) {
        low = high;
      } else {
        for (let iteration = 0; iteration < 8; iteration++) {
          const middle = (low + high) / 2;
          if (fits(middle)) low = middle;
          else high = middle;
        }
      }
      const score = low - Math.abs(rotation) * 0.0005 + (stacked ? 0 : 0.025);
      if (!best || score > best.score) best = { fontSize: low, rotation, stacked, score };
    }
  }
  return best;
}

function findNumberPlacement(
  component: Component,
  imageWidth: number,
  label: number,
  distance: ReturnType<typeof componentDistance>,
  geometry: ReturnType<typeof componentMask>,
  orientation: ReturnType<typeof componentOrientation>,
  scale: PrintScale,
  existingAnchors: number[] = [],
  minimumSpacing = 0,
  minimumClearance = 0.5,
) {
  // The widest pixel is not always the best place in a curved eye, letter or
  // clothing fold. Keep several geometrically strong candidates, then run the
  // exact rotated rectangle test on each before deciding that a region must
  // be merged. This avoids false removals caused by a single bad anchor.
  const candidates: Array<{ anchor: number; clearance: number; score: number }> = [];
  const candidateLimit = 12;
  for (const anchor of component.pixels) {
    const clearance = distance.at(anchor);
    if (clearance < minimumClearance) continue;
    let spacing = Number.POSITIVE_INFINITY;
    if (existingAnchors.length) {
      const x = anchor % imageWidth;
      const y = Math.floor(anchor / imageWidth);
      for (const existing of existingAnchors) {
        spacing = Math.min(spacing, Math.hypot(existing % imageWidth - x, Math.floor(existing / imageWidth) - y));
      }
      if (spacing < minimumSpacing * 0.45) continue;
    }
    const score = existingAnchors.length ? Math.min(clearance * 8, spacing) : clearance * 8;
    if (candidates.length === candidateLimit && score <= candidates[candidates.length - 1].score) continue;
    let position = candidates.findIndex((candidate) => score > candidate.score);
    if (position < 0) position = candidates.length;
    candidates.splice(position, 0, { anchor, clearance, score });
    if (candidates.length > candidateLimit) candidates.pop();
  }
  for (const candidate of candidates) {
    if (existingAnchors.length && candidate.score < minimumSpacing * 0.72) continue;
    const fit = fitNumberAt(component, imageWidth, candidate.anchor, label, geometry, orientation, scale);
    if (fit) return { ...candidate, fit };
  }
  return null;
}

async function mergeUnnumberableAreas(
  labels: Uint8Array,
  width: number,
  height: number,
  colorCount: number,
  selectedLabs: Lab[],
  scale: PrintScale,
  maximumPasses = 3,
  protectionMask?: Uint8Array,
  sourceLabels?: Uint8Array,
  numberExclusionMask?: Uint8Array,
  cooperativeYield: CooperativeYield = async () => undefined,
  onIteration?: (iteration: number, failuresBefore: number, changed: number) => void,
) {
  // FT154/FT155 merged failed component IDs as one stable batch. The previous
  // browser port recolored pixels while it was still walking the same pass;
  // neighbouring micro-regions could then swap colors and survive indefinitely.
  // This snapshot + batch replacement follows the accepted production script.
  let removedAreas = 0;
  for (let pass = 0; pass < maximumPasses; pass++) {
    const components: Component[] = [];
    const componentMap = new Int32Array(labels.length);
    await walkComponents(labels, width, height, colorCount, (component) => {
      const componentId = components.length + 1;
      components.push(component);
      for (const index of component.pixels) componentMap[index] = componentId;
    }, cooperativeYield);

    const failures: number[] = [];
    const protectionLevels = new Uint8Array(components.length + 1);
    for (let componentIndex = 0; componentIndex < components.length; componentIndex++) {
      const component = components[componentIndex];
      const placementComponent = componentAvailableForNumbers(component, width, numberExclusionMask);
      // A base component that is completely covered by the immutable
      // source-detail layer is only underpaint. It is not visible, does not
      // receive a number and must not keep the merge loop alive. Every
      // visible base component still has to pass the real 5 pt fit test.
      if (numberExclusionMask && !placementComponent) continue;
      const placementFits = placementComponent ? Boolean(findNumberPlacement(
        placementComponent,
        width,
        component.label,
        componentDistance(placementComponent, width),
        componentMask(placementComponent, width),
        componentOrientation(placementComponent, width),
        scale,
      )) : false;
      const componentId = componentIndex + 1;
      protectionLevels[componentId] = componentProtectionLevel(component, protectionMask);
      if (!placementFits) failures.push(componentId);
      await cooperativeYield();
    }
    if (!failures.length) {
      onIteration?.(pass + 1, 0, 0);
      break;
    }

    const adjacency = new Map<number, Map<number, number>>();
    const addAdjacency = (left: number, right: number) => {
      if (left === right) return;
      let leftMap = adjacency.get(left);
      if (!leftMap) { leftMap = new Map(); adjacency.set(left, leftMap); }
      leftMap.set(right, (leftMap.get(right) || 0) + 1);
      let rightMap = adjacency.get(right);
      if (!rightMap) { rightMap = new Map(); adjacency.set(right, rightMap); }
      rightMap.set(left, (rightMap.get(left) || 0) + 1);
    };
    for (let y = 0; y < height; y++) {
      const row = y * width;
      for (let x = 0; x < width; x++) {
        const index = row + x;
        if (x + 1 < width) addAdjacency(componentMap[index], componentMap[index + 1]);
        if (y + 1 < height) addAdjacency(componentMap[index], componentMap[index + width]);
      }
      if ((y & 31) === 0) await cooperativeYield();
    }

    const failedSet = new Set(failures);
    let changed = 0;
    failures.sort((a, b) => components[a - 1].pixels.length - components[b - 1].pixels.length);
    for (const componentId of failures) {
      const component = components[componentId - 1];
      let neighbours = [...(adjacency.get(componentId)?.entries() || [])]
        .map(([id, shared]) => ({ id, shared }));
      if (!neighbours.length) continue;

      // FT rule: merge into a stable component first, then prefer a larger
      // plane. Semantic protection is a preference, never a dead end: if no
      // equally protected neighbour exists, convergence still continues.
      const stable = neighbours.filter((item) => !failedSet.has(item.id));
      if (stable.length) neighbours = stable;
      const protectionLevel = protectionLevels[componentId];
      if (protectionLevel) {
        const protectedNeighbours = neighbours.filter((item) => protectionLevels[item.id] >= protectionLevel);
        if (protectedNeighbours.length) neighbours = protectedNeighbours;
      }
      const larger = neighbours.filter((item) => components[item.id - 1].pixels.length > component.pixels.length);
      if (larger.length) neighbours = larger;

      const sourceLab: Lab = [0, 0, 0];
      for (const index of component.pixels) {
        const lab = selectedLabs[sourceLabels?.[index] ?? component.label];
        sourceLab[0] += lab[0];
        sourceLab[1] += lab[1];
        sourceLab[2] += lab[2];
      }
      sourceLab[0] /= component.pixels.length;
      sourceLab[1] /= component.pixels.length;
      sourceLab[2] /= component.pixels.length;
      let replacementLabel = component.label;
      let bestScore = Number.POSITIVE_INFINITY;
      for (const neighbour of neighbours) {
        const neighbourComponent = components[neighbour.id - 1];
        // Read the neighbour's current label. Earlier small failures in this
        // pass may already have joined it; using the stale snapshot label can
        // make two adjacent failures exchange colours forever (A→B, B→A).
        const neighbourLabel = labels[neighbourComponent.pixels[0]];
        if (neighbourLabel === component.label) continue;
        const colorError = Math.sqrt(labDistance(sourceLab, selectedLabs[neighbourLabel]));
        const score = colorError
          - Math.min(neighbour.shared, 60) * 0.06
          - Math.log1p(neighbourComponent.pixels.length) * 0.10;
        if (score < bestScore) {
          bestScore = score;
          replacementLabel = neighbourLabel;
        }
      }
      if (replacementLabel === component.label) continue;
      // Apply immediately so the remaining failures see a monotonic merge,
      // not a batch of cyclic colour swaps.
      for (const index of component.pixels) labels[index] = replacementLabel;
      changed++;
      await cooperativeYield();
    }

    onIteration?.(pass + 1, failures.length, changed);
    if (!changed) break;
    removedAreas += changed;
    await cooperativeYield(true);
  }
  return removedAreas;
}

type ContourPoint = [number, number];

function simplifyOpenPath(points: ContourPoint[], epsilon: number) {
  if (points.length <= 2) return points;
  const keep = new Uint8Array(points.length);
  keep[0] = 1;
  keep[points.length - 1] = 1;
  const stack: Array<[number, number]> = [[0, points.length - 1]];
  const threshold = epsilon * epsilon;
  while (stack.length) {
    const [start, end] = stack.pop()!;
    const [ax, ay] = points[start];
    const [bx, by] = points[end];
    const dx = bx - ax;
    const dy = by - ay;
    const lengthSquared = dx * dx + dy * dy;
    let farthest = -1;
    let farthestDistance = threshold;
    for (let index = start + 1; index < end; index++) {
      const [px, py] = points[index];
      let distance: number;
      if (!lengthSquared) {
        distance = (px - ax) ** 2 + (py - ay) ** 2;
      } else {
        const cross = dy * px - dx * py + bx * ay - by * ax;
        distance = cross * cross / lengthSquared;
      }
      if (distance > farthestDistance) {
        farthestDistance = distance;
        farthest = index;
      }
    }
    if (farthest >= 0) {
      keep[farthest] = 1;
      stack.push([start, farthest], [farthest, end]);
    }
  }
  return points.filter((_, index) => keep[index]);
}

function simplifyBoundaryPath(points: ContourPoint[], epsilon: number) {
  const closed = points.length > 3
    && points[0][0] === points[points.length - 1][0]
    && points[0][1] === points[points.length - 1][1];
  if (!closed) return simplifyOpenPath(points, epsilon);
  const body = points.slice(0, -1);
  let split = 1;
  let farthest = -1;
  for (let index = 1; index < body.length; index++) {
    const distance = (body[index][0] - body[0][0]) ** 2 + (body[index][1] - body[0][1]) ** 2;
    if (distance > farthest) {
      farthest = distance;
      split = index;
    }
  }
  if (split < 2 || split > body.length - 2) return points;
  const first = simplifyOpenPath(body.slice(0, split + 1), epsilon);
  const second = simplifyOpenPath([...body.slice(split), body[0]], epsilon);
  return [...first.slice(0, -1), ...second];
}

function smoothBoundaryPath(points: ContourPoint[], iterations = 2) {
  if (points.length < 3) return points;
  const closed = points[0][0] === points[points.length - 1][0]
    && points[0][1] === points[points.length - 1][1];
  let current = closed ? points.slice(0, -1) : points.slice();
  for (let pass = 0; pass < iterations; pass++) {
    const next: ContourPoint[] = [];
    if (!closed) next.push(current[0]);
    const segments = closed ? current.length : current.length - 1;
    for (let index = 0; index < segments; index++) {
      const a = current[index];
      const b = current[(index + 1) % current.length];
      next.push([
        a[0] * 0.75 + b[0] * 0.25,
        a[1] * 0.75 + b[1] * 0.25,
      ]);
      next.push([
        a[0] * 0.25 + b[0] * 0.75,
        a[1] * 0.25 + b[1] * 0.75,
      ]);
    }
    if (!closed) next.push(current[current.length - 1]);
    current = next;
  }
  if (closed) current.push(current[0]);
  return current;
}

async function traceUniqueBoundaries(
  labels: Uint8Array,
  width: number,
  height: number,
  epsilon = 0.65,
  cooperativeYield: CooperativeYield = async () => undefined,
) {
  const gridWidth = width + 1;
  const gridHeight = height + 1;
  // A full-resolution preview can contain hundreds of thousands of contour
  // segments. Map<number, number[]> plus string edge keys exhausted mobile
  // Safari's memory. Four direction bits per grid node represent exactly the
  // same graph in compact typed arrays and keep the FT-style vector geometry.
  const adjacency = new Uint8Array(gridWidth * gridHeight);
  const EAST = 1;
  const SOUTH = 2;
  const WEST = 4;
  const NORTH = 8;
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const index = y * width + x;
      if (x < width - 1 && labels[index] !== labels[index + 1]) {
        const top = y * gridWidth + x + 1;
        const bottom = top + gridWidth;
        adjacency[top] |= SOUTH;
        adjacency[bottom] |= NORTH;
      }
      if (y < height - 1 && labels[index] !== labels[index + width]) {
        const left = (y + 1) * gridWidth + x;
        adjacency[left] |= EAST;
        adjacency[left + 1] |= WEST;
      }
    }
    if ((y & 31) === 0) await cooperativeYield();
  }
  const used = new Uint8Array(adjacency.length);
  const bits = [EAST, SOUTH, WEST, NORTH] as const;
  const offsets = [1, gridWidth, -1, -gridWidth] as const;
  const opposite = [WEST, NORTH, EAST, SOUTH] as const;
  const degree = [0, 1, 1, 2, 1, 2, 2, 3, 1, 2, 2, 3, 2, 3, 3, 4];
  const nodePoint = (node: number): ContourPoint => [node % gridWidth, Math.floor(node / gridWidth)];
  const walk = async (start: number, firstDirection: number, cycle: boolean) => {
    const nodes = [start];
    let current = start;
    let direction = firstDirection;
    while (true) {
      const next = current + offsets[direction];
      used[current] |= bits[direction];
      used[next] |= opposite[direction];
      current = next;
      nodes.push(current);
      if (cycle && current === start) break;
      if (!cycle && degree[adjacency[current]] !== 2) break;
      direction = -1;
      for (let candidate = 0; candidate < bits.length; candidate++) {
        if ((adjacency[current] & bits[candidate]) && !(used[current] & bits[candidate])) {
          direction = candidate;
          break;
        }
      }
      if (direction < 0) break;
      if ((nodes.length & 8191) === 0) await cooperativeYield();
    }
    // FT154/FT155 used rounded vector paths rather than raw pixel stairs.
    // Simplification removes redundant grid points; two Chaikin passes then
    // reproduce the smooth fractional geometry visible in their final SVGs.
    return smoothBoundaryPath(simplifyBoundaryPath(nodes.map(nodePoint), epsilon));
  };
  const paths: ContourPoint[][] = [];
  for (let start = 0; start < adjacency.length; start++) {
    if (degree[adjacency[start]] === 2) continue;
    for (let direction = 0; direction < bits.length; direction++) {
      if (!(adjacency[start] & bits[direction]) || (used[start] & bits[direction])) continue;
      const path = await walk(start, direction, false);
      if (path.length >= 2) paths.push(path);
    }
    if ((start & 32767) === 0) await cooperativeYield();
  }
  for (let start = 0; start < adjacency.length; start++) {
    for (let direction = 0; direction < bits.length; direction++) {
      if (!(adjacency[start] & bits[direction]) || (used[start] & bits[direction])) continue;
      const path = await walk(start, direction, true);
      if (path.length >= 3) paths.push(path);
    }
    if ((start & 32767) === 0) await cooperativeYield();
  }
  return paths;
}

function checkpointIdentity(labels: Uint8Array, paints: ProductionPaint[], width: number, height: number) {
  let hash = 0x811c9dc5;
  const update = (value: number) => {
    hash ^= value & 255;
    hash = Math.imul(hash, 0x01000193);
  };
  update(width);
  update(width >>> 8);
  update(height);
  update(height >>> 8);
  for (const label of labels) update(label);
  for (const paint of paints) {
    for (const character of `${paint.id}:${paint.code}:${paint.hex.toUpperCase()}`) update(character.charCodeAt(0));
  }
  return `CP-${(hash >>> 0).toString(16).padStart(8, "0").toUpperCase()}`;
}

function clipPathsToMask(paths: ContourPoint[][], mask: Uint8Array, width: number, height: number) {
  const result: ContourPoint[][] = [];
  const inside = ([x, y]: ContourPoint) => {
    const px = Math.max(0, Math.min(width - 1, Math.floor(x)));
    const py = Math.max(0, Math.min(height - 1, Math.floor(y)));
    for (let oy = -1; oy <= 0; oy++) {
      for (let ox = -1; ox <= 0; ox++) {
        const nx = px + ox;
        const ny = py + oy;
        if (nx >= 0 && nx < width && ny >= 0 && ny < height && mask[ny * width + nx]) return true;
      }
    }
    return false;
  };
  for (const path of paths) {
    let segment: ContourPoint[] = [];
    for (const point of path) {
      if (inside(point)) {
        segment.push(point);
      } else if (segment.length) {
        if (segment.length >= 2) result.push(segment);
        segment = [];
      }
    }
    if (segment.length >= 2) result.push(segment);
  }
  return result;
}

function productionSvg(
  paths: ContourPoint[][],
  detailPaths: ContourPoint[][],
  marks: NumberMark[],
  width: number,
  height: number,
  scale: PrintScale,
  checkpointId: string,
) {
  const mapX = (value: number) => TECHNICAL_MARGIN_MM + value / width * ARTWORK_WIDTH_MM;
  const mapY = (value: number) => TECHNICAL_MARGIN_MM + value / height * ARTWORK_HEIGHT_MM;
  const pathData = paths.map((path) => path.map((point, index) => {
    const command = index ? "L" : "M";
    return `${command}${mapX(point[0]).toFixed(3)},${mapY(point[1]).toFixed(3)}`;
  }).join(" "));
  const detailPathData = detailPaths.map((path) => path.map((point, index) => {
    const command = index ? "L" : "M";
    return `${command}${mapX(point[0]).toFixed(3)},${mapY(point[1]).toFixed(3)}`;
  }).join(" "));
  const numberElements = marks.map((mark) => {
    const x = mapX(mark.x);
    const y = mapY(mark.y);
    const fontMm = mark.fontSize / scale.pixelsPerMm;
    const value = String(mark.label + 1);
    const transform = mark.rotation ? ` transform="rotate(${mark.rotation.toFixed(2)} ${x.toFixed(3)} ${y.toFixed(3)})"` : "";
    if (mark.stacked && value.length > 1) {
      const offset = fontMm * 0.38;
      return `<text x="${x.toFixed(3)}" y="${y.toFixed(3)}" font-size="${fontMm.toFixed(3)}"${transform}><tspan x="${x.toFixed(3)}" y="${(y - offset).toFixed(3)}">${value[0]}</tspan><tspan x="${x.toFixed(3)}" y="${(y + offset).toFixed(3)}">${value.slice(1)}</tspan></text>`;
    }
    return `<text x="${x.toFixed(3)}" y="${y.toFixed(3)}" font-size="${fontMm.toFixed(3)}"${transform}>${value}</text>`;
  });
  const svg = [
    '<?xml version="1.0" encoding="UTF-8"?>',
    `<svg xmlns="http://www.w3.org/2000/svg" width="${PRINT_WIDTH_MM}mm" height="${PRINT_HEIGHT_MM}mm" viewBox="0 0 ${PRINT_WIDTH_MM} ${PRINT_HEIGHT_MM}">`,
    `<title>Hobruk production contours · ${checkpointId}</title>`,
    `<desc>One immutable label map; 0.25 pt contours; 5–8 pt numbers; ${checkpointId}</desc>`,
    '<rect width="100%" height="100%" fill="#FFFFFF"/>',
    `<g id="contours" fill="none" stroke="#777777" stroke-width="${(0.25 * POINT_TO_MM).toFixed(9)}" stroke-linecap="round" stroke-linejoin="round">`,
    ...pathData.map((data) => `<path d="${data}"/>`),
    `<rect x="${TECHNICAL_MARGIN_MM}" y="${TECHNICAL_MARGIN_MM}" width="${ARTWORK_WIDTH_MM}" height="${ARTWORK_HEIGHT_MM}" stroke-width="${(0.55 * POINT_TO_MM).toFixed(9)}"/>`,
    '</g>',
    `<g id="source-protected-details" data-source="approved-preview" fill="none" stroke="#6F6F6F" stroke-width="${(0.18 * POINT_TO_MM).toFixed(9)}" stroke-linecap="round" stroke-linejoin="round">`,
    ...detailPathData.map((data) => `<path d="${data}"/>`),
    '</g>',
    '<g id="numbers" fill="#777777" font-family="Arial Narrow, Nimbus Sans Narrow, sans-serif" font-stretch="condensed" font-weight="400" text-anchor="middle" dominant-baseline="middle">',
    ...numberElements,
    '</g>',
    '</svg>',
  ].join("\n");
  // Blob URLs avoid duplicating a large vector file through URI encoding,
  // which was another major memory spike on iPhone Safari.
  return URL.createObjectURL(new Blob([svg], { type: "image/svg+xml;charset=utf-8" }));
}

function productionPdf(
  paths: ContourPoint[][],
  detailPaths: ContourPoint[][],
  marks: NumberMark[],
  width: number,
  height: number,
  scale: PrintScale,
  checkpointId: string,
  paints: ProductionPaint[],
) {
  const pointsPerMm = 72 / 25.4;
  const pageWidth = PRINT_WIDTH_MM * pointsPerMm;
  const pageHeight = PRINT_HEIGHT_MM * pointsPerMm;
  const margin = TECHNICAL_MARGIN_MM * pointsPerMm;
  const mapX = (value: number) => margin + value / width * ARTWORK_WIDTH_MM * pointsPerMm;
  const mapY = (value: number) => pageHeight - margin - value / height * ARTWORK_HEIGHT_MM * pointsPerMm;
  const contourCommands: string[] = [
    "q",
    "0.4667 G",
    "1 J 1 j",
    "0.25 w",
  ];
  for (const path of paths) {
    if (path.length < 2) continue;
    contourCommands.push(`${mapX(path[0][0]).toFixed(3)} ${mapY(path[0][1]).toFixed(3)} m`);
    for (let index = 1; index < path.length; index++) {
      contourCommands.push(`${mapX(path[index][0]).toFixed(3)} ${mapY(path[index][1]).toFixed(3)} l`);
    }
    contourCommands.push("S");
  }
  contourCommands.push(`${margin.toFixed(3)} ${margin.toFixed(3)} ${(ARTWORK_WIDTH_MM * pointsPerMm).toFixed(3)} ${(ARTWORK_HEIGHT_MM * pointsPerMm).toFixed(3)} re S`);
  contourCommands.push("Q");
  contourCommands.push("q");
  contourCommands.push("0.4353 G");
  contourCommands.push("1 J 1 j");
  contourCommands.push("0.18 w");
  for (const path of detailPaths) {
    if (path.length < 2) continue;
    contourCommands.push(`${mapX(path[0][0]).toFixed(3)} ${mapY(path[0][1]).toFixed(3)} m`);
    for (let index = 1; index < path.length; index++) {
      contourCommands.push(`${mapX(path[index][0]).toFixed(3)} ${mapY(path[index][1]).toFixed(3)} l`);
    }
    contourCommands.push("S");
  }
  contourCommands.push("Q");
  contourCommands.push("0.4667 g");
  for (const mark of marks) {
    const value = String(mark.label + 1);
    const fontPoints = mark.fontSize / scale.pixelsPerMm / POINT_TO_MM;
    const x = mapX(mark.x);
    const y = mapY(mark.y);
    const radians = -mark.rotation * Math.PI / 180;
    const cosine = Math.cos(radians);
    const sine = Math.sin(radians);
    const drawText = (text: string, offsetY = 0) => {
      const estimatedWidth = fontPoints * text.length * 0.44;
      contourCommands.push("q");
      contourCommands.push(`${cosine.toFixed(6)} ${sine.toFixed(6)} ${(-sine).toFixed(6)} ${cosine.toFixed(6)} ${x.toFixed(3)} ${(y + offsetY).toFixed(3)} cm`);
      contourCommands.push(`BT /F1 ${fontPoints.toFixed(3)} Tf 78 Tz 1 0 0 1 ${(-estimatedWidth / 2).toFixed(3)} ${(-fontPoints * 0.31).toFixed(3)} Tm (${text}) Tj ET`);
      contourCommands.push("Q");
    };
    if (mark.stacked && value.length > 1) {
      drawText(value[0], fontPoints * 0.38);
      drawText(value.slice(1), -fontPoints * 0.38);
    } else {
      drawText(value);
    }
  }
  contourCommands.push(`% ${checkpointId}`);

  // Page two is the production color map. It is generated locally from the
  // same compact paint order that supplies the numbers on page one.
  const safePdfText = (value: string) => value
    .replace(/[^\x20-\x7E]/g, "?")
    .replace(/([\\()])/g, "\\$1");
  const paletteCommands: string[] = [
    "0 g",
    `BT /F1 18 Tf 1 0 0 1 ${(18 * pointsPerMm).toFixed(3)} ${(pageHeight - 22 * pointsPerMm).toFixed(3)} Tm (HOBRUK COLOR MAP) Tj ET`,
    `BT /F1 8 Tf 1 0 0 1 ${(18 * pointsPerMm).toFixed(3)} ${(pageHeight - 29 * pointsPerMm).toFixed(3)} Tm (${checkpointId}) Tj ET`,
  ];
  const columns = 4;
  const rowCount = Math.max(1, Math.ceil(paints.length / columns));
  const paletteMargin = 18 * pointsPerMm;
  const startY = pageHeight - 42 * pointsPerMm;
  const availableHeight = startY - 18 * pointsPerMm;
  const cellWidth = (pageWidth - paletteMargin * 2) / columns;
  const cellHeight = Math.min(32 * pointsPerMm, availableHeight / rowCount);
  const swatchSize = Math.min(18 * pointsPerMm, cellHeight - 6 * pointsPerMm);
  paints.forEach((paint, index) => {
    const column = index % columns;
    const row = Math.floor(index / columns);
    const x = paletteMargin + column * cellWidth;
    const y = startY - (row + 1) * cellHeight + (cellHeight - swatchSize) / 2;
    const [r, g, b] = hexToRgb(paint.hex).map((value) => value / 255);
    paletteCommands.push("q");
    paletteCommands.push(`${r.toFixed(5)} ${g.toFixed(5)} ${b.toFixed(5)} rg`);
    paletteCommands.push(`${x.toFixed(3)} ${y.toFixed(3)} ${swatchSize.toFixed(3)} ${swatchSize.toFixed(3)} re f`);
    paletteCommands.push("Q");
    paletteCommands.push(`0.4667 G 0.5 w ${x.toFixed(3)} ${y.toFixed(3)} ${swatchSize.toFixed(3)} ${swatchSize.toFixed(3)} re S`);
    const textX = x + swatchSize + 3 * pointsPerMm;
    const numberY = y + swatchSize * 0.66;
    const codeY = y + swatchSize * 0.36;
    paletteCommands.push(`0 g BT /F1 10 Tf 1 0 0 1 ${textX.toFixed(3)} ${numberY.toFixed(3)} Tm (${index + 1}) Tj ET`);
    paletteCommands.push(`0 g BT /F1 6.5 Tf 1 0 0 1 ${textX.toFixed(3)} ${codeY.toFixed(3)} Tm (${safePdfText(paint.code.slice(0, 22))}) Tj ET`);
    paletteCommands.push(`0.3 g BT /F1 5.5 Tf 1 0 0 1 ${textX.toFixed(3)} ${(y + 1.2 * pointsPerMm).toFixed(3)} Tm (${safePdfText(paint.hex.toUpperCase())}) Tj ET`);
  });
  paletteCommands.push(`% ${checkpointId}`);

  const contourStream = contourCommands.join("\n");
  const paletteStream = paletteCommands.join("\n");
  const objects = [
    "<< /Type /Catalog /Pages 2 0 R >>",
    "<< /Type /Pages /Kids [3 0 R 4 0 R] /Count 2 >>",
    `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${pageWidth.toFixed(3)} ${pageHeight.toFixed(3)}] /Resources << /Font << /F1 5 0 R >> >> /Contents 6 0 R >>`,
    `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${pageWidth.toFixed(3)} ${pageHeight.toFixed(3)}] /Resources << /Font << /F1 5 0 R >> >> /Contents 7 0 R >>`,
    "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>",
    `<< /Length ${contourStream.length} >>\nstream\n${contourStream}\nendstream`,
    `<< /Length ${paletteStream.length} >>\nstream\n${paletteStream}\nendstream`,
  ];
  let pdf = "%PDF-1.4\n%HOBRUK\n";
  const offsets = [0];
  objects.forEach((object, index) => {
    offsets.push(pdf.length);
    pdf += `${index + 1} 0 obj\n${object}\nendobj\n`;
  });
  const xref = pdf.length;
  pdf += `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n`;
  for (let index = 1; index <= objects.length; index++) {
    pdf += `${String(offsets[index]).padStart(10, "0")} 00000 n \n`;
  }
  pdf += `trailer\n<< /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF`;
  return URL.createObjectURL(new Blob([pdf], { type: "application/pdf" }));
}

async function collectNumberMarks(
  labels: Uint8Array,
  width: number,
  height: number,
  colorCount: number,
  scale: PrintScale,
  protectionMask?: Uint8Array,
  numberExclusionMask?: Uint8Array,
  cooperativeYield: CooperativeYield = async () => undefined,
) {
  const marks: NumberMark[] = [];
  let regionCount = 0;
  let unlabeledRegionCount = 0;
  let protectedRegionCount = 0;
  let minimumRegionArea = Number.POSITIVE_INFINITY;
  await walkComponents(labels, width, height, colorCount, (component) => {
    const placementComponent = componentAvailableForNumbers(component, width, numberExclusionMask);
    // Fully covered underpaint belongs to the source-first detail overlay,
    // not to the numbered paint surface. Excluding it keeps the production
    // invariant meaningful: one 5–8 pt mark for every visible base region.
    if (numberExclusionMask && !placementComponent) return;
    regionCount++;
    minimumRegionArea = Math.min(minimumRegionArea, component.pixels.length);
    const marksBefore = marks.length;
    const distance = placementComponent ? componentDistance(placementComponent, width) : new Float32Array();
    const geometry = placementComponent ? componentMask(placementComponent, width) : { mask: new Uint8Array(), width: 0, height: 0, padding: 0 };
    const orientation = placementComponent ? componentOrientation(placementComponent, width) : { angle: 0, elongation: 1 };
    const protectionLevel = componentProtectionLevel(component, protectionMask);
    if (protectionLevel) protectedRegionCount++;
    const placement = placementComponent ? findNumberPlacement(
      placementComponent,
      width,
      component.label,
      distance,
      geometry,
      orientation,
      scale,
    ) : null;
    if (placement) {
      const fontSize = Math.max(scale.minimumFontPx, Math.min(scale.maximumFontPx, placement.fit.fontSize, placement.clearance * 2.1));
      marks.push({
        label: component.label,
        x: placement.anchor % width,
        y: Math.floor(placement.anchor / width),
        area: component.pixels.length,
        fontSize,
        rotation: placement.fit.rotation,
        stacked: placement.fit.stacked,
      });
    }
    if (marks.length === marksBefore) unlabeledRegionCount++;
  }, cooperativeYield);
  return {
    marks,
    regionCount,
    unlabeledRegionCount,
    protectedRegionCount,
    minimumRegionArea: Number.isFinite(minimumRegionArea) ? minimumRegionArea : 0,
    stackedNumberCount: marks.filter((mark) => mark.stacked).length,
  };
}

function physicalMetricSummary(values: number[]): ProductionReadinessPhysicalMetrics {
  if (!values.length) return { min: 0, p10: 0, p25: 0, median: 0, p75: 0, p90: 0, max: 0 };
  const sorted = [...values].sort((left, right) => left - right);
  const at = (ratio: number) => {
    const position = (sorted.length - 1) * ratio;
    const lower = Math.floor(position);
    const upper = Math.ceil(position);
    return sorted[lower] + (sorted[upper] - sorted[lower]) * (position - lower);
  };
  return {
    min: sorted[0],
    p10: at(.1),
    p25: at(.25),
    median: at(.5),
    p75: at(.75),
    p90: at(.9),
    max: sorted[sorted.length - 1],
  };
}

export async function correctNonSemanticNoise(
  fileUrl: string,
  palette: ProductionPaint[],
  semanticRegions: SemanticRegion[] = [],
): Promise<NonSemanticNoiseCorrectionResult> {
  if (!palette.length) throw new Error("Production palette is empty");
  const cooperativeYield = createCooperativeYield();
  const image = new Image();
  image.src = fileUrl;
  await image.decode();
  await new Promise<void>((resolve) => requestAnimationFrame(() => resolve()));
  const resizeScale = Math.min(1, 3000 / Math.max(image.width, image.height));
  const width = Math.max(1, Math.round(image.width * resizeScale));
  const height = Math.max(1, Math.round(image.height * resizeScale));
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const context = canvas.getContext("2d", { willReadFrequently: true })!;
  context.imageSmoothingEnabled = false;
  context.drawImage(image, 0, 0, width, height);
  const imageData = context.getImageData(0, 0, width, height);
  const rgb = new Uint8ClampedArray(width * height * 3);
  const paletteKeys = new Set(palette.map((paint) => Number.parseInt(paint.hex.slice(1), 16)));
  for (let pixel = 0; pixel < width * height; pixel++) {
    const source = pixel * 4;
    if (imageData.data[source + 3] !== 255) throw new Error("Production-ready preview must be fully opaque");
    const key = (imageData.data[source] << 16) | (imageData.data[source + 1] << 8) | imageData.data[source + 2];
    if (!paletteKeys.has(key)) throw new Error("Noise correction requires exact production palette colors");
    rgb[pixel * 3] = imageData.data[source];
    rgb[pixel * 3 + 1] = imageData.data[source + 1];
    rgb[pixel * 3 + 2] = imageData.data[source + 2];
    if ((pixel & 131071) === 0) await cooperativeYield();
  }

  const approved = approvedPaletteAssignment(rgb, palette);
  const labels = new Uint8Array(width * height);
  const labelPixelCounts = new Uint32Array(approved.selectedPaints.length);
  for (let pixel = 0; pixel < labels.length; pixel++) {
    const key = (rgb[pixel * 3] << 16) | (rgb[pixel * 3 + 1] << 8) | rgb[pixel * 3 + 2];
    const label = approved.assignment.get(key) ?? 0;
    labels[pixel] = label;
    labelPixelCounts[label]++;
  }

  const components: Component[] = [];
  const componentMap = new Int32Array(labels.length);
  await walkComponents(labels, width, height, approved.selectedPaints.length, (component) => {
    const id = components.length;
    components.push(component);
    for (const pixel of component.pixels) componentMap[pixel] = id;
  }, cooperativeYield);
  const adjacency = new Map<number, Map<number, number>>();
  const addAdjacency = (left: number, right: number) => {
    if (left === right) return;
    let neighbours = adjacency.get(left);
    if (!neighbours) { neighbours = new Map(); adjacency.set(left, neighbours); }
    neighbours.set(right, (neighbours.get(right) || 0) + 1);
    neighbours = adjacency.get(right);
    if (!neighbours) { neighbours = new Map(); adjacency.set(right, neighbours); }
    neighbours.set(left, (neighbours.get(left) || 0) + 1);
  };
  for (let y = 0; y < height; y++) {
    const row = y * width;
    for (let x = 0; x < width; x++) {
      const index = row + x;
      if (x + 1 < width) addAdjacency(componentMap[index], componentMap[index + 1]);
      if (y + 1 < height) addAdjacency(componentMap[index], componentMap[index + width]);
    }
    if ((y & 31) === 0) await cooperativeYield();
  }

  const scale = printScale(width, height);
  const pixelAreaMm2 = ARTWORK_WIDTH_MM * ARTWORK_HEIGHT_MM / labels.length;
  const { semantic, halo } = buildSemanticNoiseMasks(width, height, semanticRegions);
  const eligible = new Uint8Array(components.length);
  const diagnostics: NonSemanticNoiseCorrectionDiagnostics = {
    correctedComponentCount: 0,
    correctedPixelCount: 0,
    correctedAreaMm2: 0,
    correctedAreaPercent: 0,
    skippedSemanticCount: 0,
    skippedTooLargeCount: 0,
    skippedNoNeighborCount: 0,
    skippedOnlyColorCount: 0,
    semanticFailCountAfter: 0,
    nonSemanticFailCountAfter: 0,
    semanticPixelChangeCount: 0,
  };

  for (let id = 0; id < components.length; id++) {
    const component = components[id];
    const placement = findNumberPlacement(
      component,
      width,
      component.label,
      componentDistance(component, width),
      componentMask(component, width),
      componentOrientation(component, width),
      scale,
    );
    if (placement) continue;
    if (component.pixels.some((pixel) => semantic[pixel] || halo[pixel])) {
      diagnostics.skippedSemanticCount++;
      continue;
    }
    const areaMm2 = component.pixels.length * pixelAreaMm2;
    if (areaMm2 >= 4) {
      diagnostics.skippedTooLargeCount++;
      continue;
    }
    if (labelPixelCounts[component.label] === component.pixels.length) {
      diagnostics.skippedOnlyColorCount++;
      continue;
    }
    if (!adjacency.get(id)?.size) {
      diagnostics.skippedNoNeighborCount++;
      continue;
    }
    eligible[id] = 1;
    await cooperativeYield();
  }

  const selectedLabs = approved.selectedRgb.map(([r, g, b]) => rgbToLab(r, g, b));
  const replacements: Array<{ id: number; label: number }> = [];
  for (let id = 0; id < components.length; id++) {
    if (!eligible[id]) continue;
    const component = components[id];
    const neighbours = [...(adjacency.get(id)?.entries() || [])]
      .filter(([neighbourId]) => !eligible[neighbourId])
      .map(([neighbourId, shared]) => ({ id: neighbourId, shared, component: components[neighbourId] }))
      .sort((left, right) => {
        if (left.shared !== right.shared) return right.shared - left.shared;
        const leftDistance = labDistance(selectedLabs[component.label], selectedLabs[left.component.label]);
        const rightDistance = labDistance(selectedLabs[component.label], selectedLabs[right.component.label]);
        if (leftDistance !== rightDistance) return leftDistance - rightDistance;
        if (left.component.pixels.length !== right.component.pixels.length) return right.component.pixels.length - left.component.pixels.length;
        return left.id - right.id;
      });
    const replacement = neighbours[0];
    if (!replacement) {
      diagnostics.skippedNoNeighborCount++;
      continue;
    }
    replacements.push({ id, label: replacement.component.label });
  }

  const correctedLabels = labels.slice();
  for (const replacement of replacements) {
    const component = components[replacement.id];
    const [r, g, b] = approved.selectedRgb[replacement.label];
    for (const pixel of component.pixels) {
      const target = pixel * 4;
      imageData.data[target] = r;
      imageData.data[target + 1] = g;
      imageData.data[target + 2] = b;
      correctedLabels[pixel] = replacement.label;
      if (semantic[pixel]) diagnostics.semanticPixelChangeCount++;
    }
    diagnostics.correctedComponentCount++;
    diagnostics.correctedPixelCount += component.pixels.length;
    await cooperativeYield();
  }
  diagnostics.correctedAreaMm2 = diagnostics.correctedPixelCount * pixelAreaMm2;
  diagnostics.correctedAreaPercent = diagnostics.correctedPixelCount / labels.length * 100;
  await walkComponents(correctedLabels, width, height, approved.selectedPaints.length, (component) => {
    const placement = findNumberPlacement(
      component,
      width,
      component.label,
      componentDistance(component, width),
      componentMask(component, width),
      componentOrientation(component, width),
      scale,
    );
    if (placement) return;
    if (component.pixels.some((pixel) => semantic[pixel])) diagnostics.semanticFailCountAfter++;
    else diagnostics.nonSemanticFailCountAfter++;
  }, cooperativeYield);
  if (!diagnostics.correctedComponentCount) return { correctedRaster: fileUrl, diagnostics };
  context.putImageData(imageData, 0, 0);
  return { correctedRaster: canvas.toDataURL("image/png"), diagnostics };
}

export async function validateProductionReadiness(
  fileUrl: string,
  palette: ProductionPaint[],
  options: ProductionReadinessOptions = {},
): Promise<ProductionReadinessResult> {
  if (!palette.length) throw new Error("Production palette is empty");
  const cooperativeYield = createCooperativeYield();
  const image = new Image();
  image.src = fileUrl;
  await image.decode();
  await new Promise<void>((resolve) => requestAnimationFrame(() => resolve()));
  const resizeScale = Math.min(1, 3000 / Math.max(image.width, image.height));
  const width = Math.max(1, Math.round(image.width * resizeScale));
  const height = Math.max(1, Math.round(image.height * resizeScale));
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const context = canvas.getContext("2d", { willReadFrequently: true })!;
  context.imageSmoothingEnabled = false;
  context.drawImage(image, 0, 0, width, height);
  const rgba = context.getImageData(0, 0, width, height).data;
  const rgb = new Uint8ClampedArray(width * height * 3);
  for (let pixel = 0; pixel < width * height; pixel++) {
    if (rgba[pixel * 4 + 3] !== 255) throw new Error("Production-ready preview must be fully opaque");
    rgb[pixel * 3] = rgba[pixel * 4];
    rgb[pixel * 3 + 1] = rgba[pixel * 4 + 1];
    rgb[pixel * 3 + 2] = rgba[pixel * 4 + 2];
    if ((pixel & 131071) === 0) await cooperativeYield();
  }

  const approved = approvedPaletteAssignment(rgb, palette);
  const labels = new Uint8Array(width * height);
  for (let pixel = 0; pixel < labels.length; pixel++) {
    const key = (rgb[pixel * 3] << 16) | (rgb[pixel * 3 + 1] << 8) | rgb[pixel * 3 + 2];
    labels[pixel] = approved.assignment.get(key) ?? 0;
  }

  const scale = printScale(width, height);
  const pixelAreaMm2 = ARTWORK_WIDTH_MM * ARTWORK_HEIGHT_MM / labels.length;
  const pixelWidthMm = ARTWORK_WIDTH_MM / width;
  const pixelHeightMm = ARTWORK_HEIGHT_MM / height;
  const failedAreaBuckets: ProductionReadinessResult["failedAreaBuckets"] = {
    "<1": 0,
    "1-2": 0,
    "2-4": 0,
    "4-8": 0,
    "8-16": 0,
    ">16": 0,
  };
  const failedWidths: number[] = [];
  const failedHeights: number[] = [];
  let regionCount = 0;
  let fitCount = 0;
  let failedAreaPixels = 0;
  await walkComponents(labels, width, height, approved.selectedPaints.length, async (component) => {
    regionCount++;
    const placement = findNumberPlacement(
      component,
      width,
      component.label,
      componentDistance(component, width),
      componentMask(component, width),
      componentOrientation(component, width),
      scale,
    );
    if (placement) {
      fitCount++;
      return;
    }
    failedAreaPixels += component.pixels.length;
    const areaMm2 = component.pixels.length * pixelAreaMm2;
    const bucket = areaMm2 < 1 ? "<1"
      : areaMm2 < 2 ? "1-2"
      : areaMm2 < 4 ? "2-4"
      : areaMm2 < 8 ? "4-8"
      : areaMm2 <= 16 ? "8-16"
      : ">16";
    failedAreaBuckets[bucket]++;
    failedWidths.push((component.maxX - component.minX + 1) * pixelWidthMm);
    failedHeights.push((component.maxY - component.minY + 1) * pixelHeightMm);
    await cooperativeYield();
  }, cooperativeYield);

  const failCount = regionCount - fitCount;
  const fitCoverage = regionCount ? fitCount / regionCount * 100 : 100;
  const failedAreaMm2 = failedAreaPixels * pixelAreaMm2;
  const failedAreaPercent = failedAreaPixels / labels.length * 100;
  const artworkAreaCm2 = ARTWORK_WIDTH_MM * ARTWORK_HEIGHT_MM / 100;
  const densityPer100Cm2 = regionCount / (artworkAreaCm2 / 100);
  const hardFailure = failCount >= 1 || fitCoverage < 100 || failedAreaPercent > 0;
  const status: ProductionReadinessStatus = hardFailure
    ? "FAIL"
    : densityPer100Cm2 > 50 || options.semanticAvailable === false
      ? "WARN"
      : "PASS";

  return {
    width,
    height,
    regionCount,
    fitCount,
    failCount,
    fitCoverage,
    failedAreaPixels,
    failedAreaMm2,
    failedAreaPercent,
    densityPer100Cm2,
    failedAreaBuckets,
    failedBBoxWidthMm: physicalMetricSummary(failedWidths),
    failedBBoxHeightMm: physicalMetricSummary(failedHeights),
    microIslandFailCount: failedAreaBuckets["<1"] + failedAreaBuckets["1-2"] + failedAreaBuckets["2-4"] + failedAreaBuckets["4-8"],
    status,
  };
}

export async function processPaintImage(
  fileUrl: string,
  palette: ProductionPaint[],
  requestedColors: number,
  mode: "source" | "approved" | "ai-approved" = "source",
  options: PaintProcessOptions = {},
): Promise<PaintProcessResult> {
  if (!palette.length) throw new Error("Production palette is empty");
  const cooperativeYield = createCooperativeYield();
  const report = async (stage: string, progress: number) => {
    options.onProgress?.(stage, progress);
    await cooperativeYield(true);
  };
  await report("Читаем утверждённое превью…", 3);
  const image = new Image();
  image.src = fileUrl;
  await image.decode();
  await new Promise<void>((resolve) => requestAnimationFrame(() => resolve()));
  // Manually approved maps keep their native detail up to the production-size
  // edge. AI-approved maps retain the existing 1600 px cap, while raw
  // photographs continue to use the smaller, smoother local draft path.
  const maximumWorkingEdge = mode === "source" ? 1000 : mode === "approved" ? 3000 : 1600;
  const resizeScale = Math.min(1, maximumWorkingEdge / Math.max(image.width, image.height));
  const width = Math.max(1, Math.round(image.width * resizeScale));
  const height = Math.max(1, Math.round(image.height * resizeScale));
  const physicalScale = printScale(width, height);
  const readiness = mode === "approved" ? options.productionReadiness : undefined;
  const immutableApprovedMap = Boolean(
    readiness
    && readiness.failCount === 0
    && readiness.fitCoverage === 100
    && readiness.failedAreaPercent === 0
    && readiness.width === width
    && readiness.height === height,
  );
  if (readiness && !immutableApprovedMap) {
    throw new Error("Production readiness does not match the approved preview");
  }
  const protectionMask = mode !== "source" && !immutableApprovedMap && options.preserveSemanticDetails
    ? buildSemanticProtectionMask(width, height, options.semanticRegions || [])
    : undefined;
  const criticalDetailRegionMask = mode !== "source" && !immutableApprovedMap && options.preserveSemanticDetails
    ? buildCriticalDetailMask(width, height, options.semanticRegions || [])
    : undefined;
  // Merging and final numbering must use the exact same exclusion geometry.
  // Otherwise a component may pass its merge-time fit on the one-pixel edge
  // that is later reserved around a protected eye or letter.
  const numberExclusionMask = criticalDetailRegionMask
    ? dilateMask(criticalDetailRegionMask, width, height, 1)
    : undefined;
  const source = document.createElement("canvas");
  source.width = width;
  source.height = height;
  const context = source.getContext("2d", { willReadFrequently: true })!;
  context.imageSmoothingEnabled = mode === "source";
  context.drawImage(image, 0, 0, width, height);
  const imageData = context.getImageData(0, 0, width, height);
  const rgb = new Uint8ClampedArray(width * height * 3);
  for (let pixel = 0; pixel < width * height; pixel++) {
    rgb[pixel * 3] = imageData.data[pixel * 4];
    rgb[pixel * 3 + 1] = imageData.data[pixel * 4 + 1];
    rgb[pixel * 3 + 2] = imageData.data[pixel * 4 + 2];
    if ((pixel & 131071) === 0) await cooperativeYield();
  }

  await report("Сохраняем геометрию утверждённых цветов…", 12);
  const edges = computeEdgeStrength(rgb, width, height);
  // An approved preview already contains intentional, flat production regions.
  // Smoothing it would erase exactly the eyes, whiskers and flower details that
  // were approved by the artist.
  const smoothed = mode === "source" ? edgeAwareSmooth(rgb, width, height) : rgb;
  const paletteRgb = palette.map((paint) => hexToRgb(paint.hex));
  const paletteLabs = paletteRgb.map(([r, g, b]) => rgbToLab(r, g, b));
  let selectedPaints: ProductionPaint[];
  let selectedRgb: [number, number, number][];
  const assignment = new Map<number, number>();

  if (mode === "approved") {
    // Approved previews from the project history contain 41–45 intentional
    // flat colors. Preserve every one of them instead of forcing the image
    // through the 28-color NEW174 subset.
    const approved = approvedPaletteAssignment(smoothed, palette);
    selectedPaints = approved.selectedPaints;
    selectedRgb = approved.selectedRgb;
    for (const [key, label] of approved.assignment) assignment.set(key, label);
  } else if (mode === "ai-approved") {
    // The AI preview already defines the geometry. Snap its pixels directly to
    // the selected production paints, but never smooth, re-cluster or redraw
    // the regions. This keeps eyes, facial features and other approved detail.
    selectedPaints = palette.slice(0, Math.max(1, Math.min(requestedColors, palette.length)));
    selectedRgb = selectedPaints.map((paint) => hexToRgb(paint.hex));
    const selectedLabsForAi = selectedRgb.map(([r, g, b]) => rgbToLab(r, g, b));
    for (let pixel = 0; pixel < smoothed.length; pixel += 3) {
      const key = (smoothed[pixel] << 16) | (smoothed[pixel + 1] << 8) | smoothed[pixel + 2];
      if (assignment.has(key)) continue;
      const lab = rgbToLab(smoothed[pixel], smoothed[pixel + 1], smoothed[pixel + 2]);
      let closest = 0;
      let best = Number.POSITIVE_INFINITY;
      for (let color = 0; color < selectedLabsForAi.length; color++) {
        const distance = labDistance(lab, selectedLabsForAi[color]);
        if (distance < best) { best = distance; closest = color; }
      }
      assignment.set(key, closest);
    }
  } else {
    const samples = buildSamples(smoothed, edges);
    const selectedIndexes = choosePalette(samples, paletteLabs, requestedColors);
    selectedPaints = selectedIndexes.map((index) => palette[index]);
    selectedRgb = selectedIndexes.map((index) => paletteRgb[index]);
    const selectedLabsForDraft = selectedIndexes.map((index) => paletteLabs[index]);
    for (const sample of samples) {
      let closest = 0;
      let best = Number.POSITIVE_INFINITY;
      for (let color = 0; color < selectedLabsForDraft.length; color++) {
        const distance = labDistance(sample.lab, selectedLabsForDraft[color]);
        if (distance < best) { best = distance; closest = color; }
      }
      assignment.set(sample.key, closest);
    }
  }
  const selectedLabs = selectedRgb.map(([r, g, b]) => rgbToLab(r, g, b));

  await report("Собираем цветовые области…", 24);
  let labels = new Uint8Array(width * height);
  for (let pixel = 0; pixel < labels.length; pixel++) {
    const key = mode === "source"
      ? colorKey(smoothed[pixel * 3], smoothed[pixel * 3 + 1], smoothed[pixel * 3 + 2])
      : (smoothed[pixel * 3] << 16) | (smoothed[pixel * 3 + 1] << 8) | smoothed[pixel * 3 + 2];
    labels[pixel] = assignment.get(key) ?? 0;
    if ((pixel & 131071) === 0) await cooperativeYield();
  }
  let removedAreas = 0;
  let repairedRegionCount = 0;
  let sourceLabelsForDetails: Uint8Array | undefined;
  if (mode === "source") {
    labels = majorityCleanup(labels, width, height, selectedPaints.length, edges);
    removedAreas += await mergeUnnumberableAreas(labels, width, height, selectedPaints.length, selectedLabs, physicalScale, 3, undefined, undefined, undefined, cooperativeYield);
    labels = majorityCleanup(labels, width, height, selectedPaints.length, edges);
    removedAreas += await mergeUnnumberableAreas(labels, width, height, selectedPaints.length, selectedLabs, physicalScale, 3, undefined, undefined, undefined, cooperativeYield);
  } else if (!immutableApprovedMap) {
    // This is the decisive FT154/FT155 production rule: detail survives until
    // a region demonstrably cannot contain its real 5 pt paint number. Only
    // then is it merged into the nearest suitable neighbour. Their accepted
    // maps converged after two cleanup iterations with zero missing labels.
    // No blanket "all regions under 20 px" deletion runs before this test.
    sourceLabelsForDetails = labels.slice();
    // Source-first production keeps the approved pixels of eyes, lettering and
    // logos in a separate immutable layer. The numbered base may therefore
    // merge an impossible micro-region without destroying what the customer
    // sees or the fine contour that is printed above it.
    await report("Проверяем области реальным прямоугольником 5 pt…", 42);
    removedAreas += await mergeUnnumberableAreas(
      labels,
      width,
      height,
      selectedPaints.length,
      selectedLabs,
      physicalScale,
      24,
      protectionMask,
      sourceLabelsForDetails,
      numberExclusionMask,
      cooperativeYield,
      (iteration, failuresBefore) => {
        const progress = failuresBefore === 0 ? 66 : Math.min(65, 42 + iteration * 0.9);
        options.onProgress?.(
          failuresBefore === 0
            ? "Все области прошли проверку цифры 5 pt"
            : `Доводим микрозоны: проход ${iteration}/24 · осталось ${failuresBefore}`,
          progress,
        );
      },
    );
  } else {
    // The pre-approval validator has already proved that every connected
    // region fits the real 5 pt number. Keep this exact label map immutable:
    // no merge, recoloring, cleanup or protected-detail reconstruction.
    await report("Используем проверенную неизменяемую карту областей…", 66);
  }
  const detailRestoreMask = new Uint8Array(labels.length);
  if (sourceLabelsForDetails && criticalDetailRegionMask) {
    for (let pixel = 0; pixel < labels.length; pixel++) {
      if (criticalDetailRegionMask[pixel] && labels[pixel] !== sourceLabelsForDetails[pixel]) {
        detailRestoreMask[pixel] = 1;
      }
    }
    const restoredRegions = new Set<number>();
    for (let regionIndex = 0; regionIndex < (options.semanticRegions || []).length; regionIndex++) {
      const region = (options.semanticRegions || [])[regionIndex];
      const critical = region.priority === "critical" || ["eye", "text", "logo", "key-detail"].includes(region.kind);
      if (!critical) continue;
      const x0 = Math.max(0, Math.floor(region.x * width));
      const y0 = Math.max(0, Math.floor(region.y * height));
      const x1 = Math.min(width, Math.ceil((region.x + region.width) * width));
      const y1 = Math.min(height, Math.ceil((region.y + region.height) * height));
      outer: for (let y = y0; y < y1; y++) {
        for (let x = x0; x < x1; x++) {
          if (detailRestoreMask[y * width + x]) { restoredRegions.add(regionIndex); break outer; }
        }
      }
    }
    repairedRegionCount = restoredRegions.size;
  }
  const detailContourMask = criticalDetailRegionMask
    ? dilateMask(detailRestoreMask, width, height, 2).map((value, index) => value && criticalDetailRegionMask[index] ? 1 : 0)
    : detailRestoreMask;
  const finalNumberExclusionMask = numberExclusionMask || detailRestoreMask;

  // The base and protected source pixels share one compact production palette.
  // A colour used only in an eye or logo must therefore remain in the legend.
  const usedLabelSet = new Set(labels);
  if (sourceLabelsForDetails) {
    for (let pixel = 0; pixel < labels.length; pixel++) {
      if (detailRestoreMask[pixel]) usedLabelSet.add(sourceLabelsForDetails[pixel]);
    }
  }
  const usedLabels = [...usedLabelSet].sort((a, b) => a - b);
  const compactLabel = new Uint8Array(selectedPaints.length);
  usedLabels.forEach((label, index) => { compactLabel[label] = index; });
  for (let pixel = 0; pixel < labels.length; pixel++) labels[pixel] = compactLabel[labels[pixel]];
  const detailLabels = sourceLabelsForDetails?.slice();
  if (detailLabels) {
    for (let pixel = 0; pixel < detailLabels.length; pixel++) detailLabels[pixel] = compactLabel[detailLabels[pixel]];
  }
  const usedPaints = usedLabels.map((label) => selectedPaints[label]);
  const usedRgb = usedLabels.map((label) => selectedRgb[label]);

  await report("Расставляем цифры 5–8 pt…", 68);
  const previewData = new ImageData(width, height);
  for (let pixel = 0; pixel < labels.length; pixel++) {
    const renderLabel = detailLabels && detailRestoreMask[pixel] ? detailLabels[pixel] : labels[pixel];
    const [r, g, b] = usedRgb[renderLabel];
    previewData.data[pixel * 4] = r;
    previewData.data[pixel * 4 + 1] = g;
    previewData.data[pixel * 4 + 2] = b;
    previewData.data[pixel * 4 + 3] = 255;
  }
  const previewCanvas = document.createElement("canvas");
  previewCanvas.width = width;
  previewCanvas.height = height;
  previewCanvas.getContext("2d")!.putImageData(previewData, 0, 0);

  const numbering = await collectNumberMarks(labels, width, height, usedPaints.length, physicalScale, protectionMask, finalNumberExclusionMask, cooperativeYield);
  const marks = numbering.marks;
  if (immutableApprovedMap && readiness && (
    numbering.regionCount !== readiness.regionCount
    || marks.length !== readiness.fitCount
  )) {
    throw new Error("Validated Final Region Map changed before production export");
  }
  // Normalize the raster proof to the historical 40 x 50 cm Golden canvas.
  // Production SVG/PDF keep using the original working coordinates below.
  const schemeWidth = 2400;
  const schemeHeight = 3000;
  const schemeScaleX = schemeWidth / width;
  const schemeScaleY = schemeHeight / height;
  const schemePixelsPerMm = schemeWidth / ARTWORK_WIDTH_MM;
  const schemeContourWidthPx = 0.25 * POINT_TO_MM * schemePixelsPerMm;
  const schemeFontScale = schemePixelsPerMm / physicalScale.pixelsPerMm;
  const scheme = document.createElement("canvas");
  scheme.width = schemeWidth;
  scheme.height = schemeHeight;
  const schemeContext = scheme.getContext("2d")!;
  schemeContext.fillStyle = "#ffffff";
  schemeContext.fillRect(0, 0, schemeWidth, schemeHeight);
  schemeContext.strokeStyle = "#777777";
  schemeContext.lineWidth = schemeContourWidthPx;
  schemeContext.lineJoin = "round";
  schemeContext.lineCap = "round";
  await report("Строим точные векторные контуры…", 82);
  const contourPaths = await traceUniqueBoundaries(labels, width, height, 0.65, cooperativeYield);
  const rawDetailPaths = detailLabels && detailRestoreMask.some(Boolean)
    ? await traceUniqueBoundaries(detailLabels, width, height, 0.48, cooperativeYield)
    : [];
  const detailPaths = clipPathsToMask(rawDetailPaths, detailContourMask, width, height);
  schemeContext.beginPath();
  for (const path of contourPaths) {
    schemeContext.moveTo(path[0][0] * schemeScaleX, path[0][1] * schemeScaleY);
    for (let index = 1; index < path.length; index++) {
      schemeContext.lineTo(path[index][0] * schemeScaleX, path[index][1] * schemeScaleY);
    }
  }
  schemeContext.stroke();
  if (detailPaths.length) {
    schemeContext.beginPath();
    schemeContext.strokeStyle = "#6f6f6f";
    schemeContext.lineWidth = Math.max(0.45, schemeContourWidthPx * 0.72);
    for (const path of detailPaths) {
      schemeContext.moveTo(path[0][0] * schemeScaleX, path[0][1] * schemeScaleY);
      for (let index = 1; index < path.length; index++) {
        schemeContext.lineTo(path[index][0] * schemeScaleX, path[index][1] * schemeScaleY);
      }
    }
    schemeContext.stroke();
  }
  schemeContext.strokeStyle = "#666666";
  schemeContext.lineWidth = 0.55;
  schemeContext.strokeRect(0.4, 0.4, schemeWidth - 0.8, schemeHeight - 0.8);
  schemeContext.textAlign = "center";
  schemeContext.textBaseline = "middle";
  schemeContext.fillStyle = "#777777";
  for (const mark of [...marks].sort((a, b) => b.area - a.area)) {
    const value = String(mark.label + 1);
    const schemeFontSize = mark.fontSize * schemeFontScale;
    schemeContext.save();
    schemeContext.translate(mark.x * schemeScaleX, mark.y * schemeScaleY);
    if (mark.rotation) schemeContext.rotate(mark.rotation * Math.PI / 180);
    schemeContext.scale(0.78, 1);
    schemeContext.font = `400 ${schemeFontSize}px Arial`;
    if (mark.stacked && value.length > 1) {
      const offset = schemeFontSize * .38;
      schemeContext.fillText(value[0], 0, -offset);
      schemeContext.fillText(value.slice(1), 0, offset);
    } else {
      schemeContext.fillText(value, 0, 0);
    }
    schemeContext.restore();
  }

  // A production file is never released with a missing number. Every
  // connected region must contain a label. All numbers are 5–8 pt;
  // protected semantic details are repaired before this point so the same
  // strict 5–8 pt rule applies everywhere, exactly as in FT154/FT155.
  if (numbering.unlabeledRegionCount > 0) {
    throw new Error(`Производственная проверка остановлена: ${numbering.unlabeledRegionCount} областей без цифры`);
  }

  await report("Собираем SVG и PDF из одной карты…", 94);
  const checkpointLabels = labels.slice();
  if (detailLabels) {
    for (let pixel = 0; pixel < checkpointLabels.length; pixel++) {
      if (detailRestoreMask[pixel]) checkpointLabels[pixel] = detailLabels[pixel];
    }
  }
  const checkpointId = checkpointIdentity(checkpointLabels, usedPaints, width, height);
  const svg = productionSvg(contourPaths, detailPaths, marks, width, height, physicalScale, checkpointId);
  const pdf = productionPdf(contourPaths, detailPaths, marks, width, height, physicalScale, checkpointId, usedPaints);

  const result = {
    preview: previewCanvas.toDataURL("image/png"),
    scheme: scheme.toDataURL("image/png"),
    svg,
    pdf,
    checkpointId,
    usedColors: usedPaints,
    regionCount: numbering.regionCount,
    numberCount: marks.length,
    removedAreas,
    unlabeledRegionCount: numbering.unlabeledRegionCount,
    stackedNumberCount: numbering.stackedNumberCount,
    repairedRegionCount,
    protectedRegionCount: numbering.protectedRegionCount,
    minimumRegionArea: numbering.minimumRegionArea,
  };
  await report("Производственная карта готова", 100);
  return result;
}
