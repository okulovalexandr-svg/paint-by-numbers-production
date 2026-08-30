import { fitsExactFivePointPixelComponent } from "./paint-processor.ts";

export const SEMANTIC_PLANE_DOCUMENT_VERSION = "semantic-planes/v1" as const;
export const SEMANTIC_PLANE_VALIDATION_RASTER_SIZE = 256;
export const SEMANTIC_PLANE_OVERLAP_TOLERANCE_PIXELS = 1;

export const SEMANTIC_OWNER_KINDS = [
  "face",
  "hair",
  "hand",
  "clothing",
  "animal",
  "object",
  "background",
  "text",
  "logo",
  "key-detail",
] as const;

export const SEMANTIC_PLANE_ROLES = [
  "base",
  "supporting",
  "structural-detail",
  "critical-detail",
] as const;

export type SemanticOwnerKind = typeof SEMANTIC_OWNER_KINDS[number];
export type SemanticPlaneRole = typeof SEMANTIC_PLANE_ROLES[number];
export type SemanticPlanePoint = { x: number; y: number };
export type SemanticPlanePolygon = SemanticPlanePoint[];

export type SemanticPlaneOwner = {
  id: string;
  kind: SemanticOwnerKind;
  label: string;
  polygon: SemanticPlanePolygon;
};

export type SemanticPlane = {
  id: string;
  ownerId: string;
  label: string;
  role: SemanticPlaneRole;
  polygon: SemanticPlanePolygon;
};

export type SemanticPlaneDocument = {
  version: typeof SEMANTIC_PLANE_DOCUMENT_VERSION;
  owners: SemanticPlaneOwner[];
  planes: SemanticPlane[];
};

export type RasterizedSemanticPlaneArea = {
  planeId: string;
  ownerId: string;
  role: SemanticPlaneRole;
  pixelArea: number;
};

export type RasterizedSemanticPlanes = {
  width: number;
  height: number;
  ownerIds: string[];
  planeIds: string[];
  ownerMap: Int32Array;
  planeMap: Int32Array;
  criticalMask: Uint8Array;
  protectedMask: Uint8Array;
  ambiguityMask: Uint8Array;
  ambiguityPixelCount: number;
  planePixelAreas: RasterizedSemanticPlaneArea[];
  documentCheckpoint: string;
  checkpoint: string;
};

export type SemanticPlaneComponentPreflight = {
  componentId: number;
  pixelArea: number;
  fits5Pt: boolean;
};

export type SemanticPlanePreflightPlane = {
  planeId: string;
  pixelArea: number;
  componentCount: number;
  passCount: number;
  failCount: number;
  coverage: number;
  components: SemanticPlaneComponentPreflight[];
};

export type SemanticPlanePreflight = {
  width: number;
  height: number;
  planeCount: number;
  componentCount: number;
  passCount: number;
  failCount: number;
  coverage: number;
  failedAreaPixels: number;
  failedAreaMm2: number;
  failedAreaPercent: number;
  planes: SemanticPlanePreflightPlane[];
};

const pointSchema = {
  type: "object",
  additionalProperties: false,
  properties: {
    x: { type: "number", minimum: 0, maximum: 1000 },
    y: { type: "number", minimum: 0, maximum: 1000 },
  },
  required: ["x", "y"],
} as const;

export const semanticPlaneDocumentJsonSchema = {
  $schema: "https://json-schema.org/draft/2020-12/schema",
  type: "object",
  additionalProperties: false,
  properties: {
    version: { type: "string", const: SEMANTIC_PLANE_DOCUMENT_VERSION },
    owners: {
      type: "array",
      minItems: 1,
      maxItems: 64,
      items: {
        type: "object",
        additionalProperties: false,
        properties: {
          id: { type: "string", pattern: "^[A-Za-z][A-Za-z0-9._-]{0,63}$" },
          kind: { type: "string", enum: SEMANTIC_OWNER_KINDS },
          label: { type: "string", minLength: 1, maxLength: 120 },
          polygon: { type: "array", minItems: 3, maxItems: 128, items: pointSchema },
        },
        required: ["id", "kind", "label", "polygon"],
      },
    },
    planes: {
      type: "array",
      minItems: 1,
      maxItems: 256,
      items: {
        type: "object",
        additionalProperties: false,
        properties: {
          id: { type: "string", pattern: "^[A-Za-z][A-Za-z0-9._-]{0,63}$" },
          ownerId: { type: "string", pattern: "^[A-Za-z][A-Za-z0-9._-]{0,63}$" },
          label: { type: "string", minLength: 1, maxLength: 120 },
          role: { type: "string", enum: SEMANTIC_PLANE_ROLES },
          polygon: { type: "array", minItems: 3, maxItems: 128, items: pointSchema },
        },
        required: ["id", "ownerId", "label", "role", "polygon"],
      },
    },
  },
  required: ["version", "owners", "planes"],
} as const;

export class SemanticPlaneValidationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "SemanticPlaneValidationError";
  }
}

const idPattern = /^[A-Za-z][A-Za-z0-9._-]{0,63}$/;
const ownerKindSet = new Set<string>(SEMANTIC_OWNER_KINDS);
const roleSet = new Set<string>(SEMANTIC_PLANE_ROLES);
const roleRank: Record<SemanticPlaneRole, number> = {
  base: 1,
  supporting: 2,
  "structural-detail": 3,
  "critical-detail": 4,
};
const allowedRolesByKind: Record<SemanticOwnerKind, ReadonlySet<SemanticPlaneRole>> = {
  face: new Set(SEMANTIC_PLANE_ROLES),
  hair: new Set(SEMANTIC_PLANE_ROLES),
  hand: new Set(SEMANTIC_PLANE_ROLES),
  clothing: new Set(SEMANTIC_PLANE_ROLES),
  animal: new Set(SEMANTIC_PLANE_ROLES),
  object: new Set(SEMANTIC_PLANE_ROLES),
  background: new Set(["base", "supporting"]),
  text: new Set(["structural-detail", "critical-detail"]),
  logo: new Set(["structural-detail", "critical-detail"]),
  "key-detail": new Set(["supporting", "structural-detail", "critical-detail"]),
};

function validationError(message: string): never {
  throw new SemanticPlaneValidationError(message);
}

function recordValue(value: unknown, path: string): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) validationError(`${path} must be an object`);
  return value as Record<string, unknown>;
}

function exactKeys(value: Record<string, unknown>, keys: readonly string[], path: string) {
  const allowed = new Set(keys);
  const unexpected = Object.keys(value).filter((key) => !allowed.has(key));
  if (unexpected.length) validationError(`${path} has unsupported field ${unexpected[0]}`);
  const missing = keys.filter((key) => !(key in value));
  if (missing.length) validationError(`${path} is missing ${missing[0]}`);
}

function textValue(value: unknown, path: string, id = false) {
  if (typeof value !== "string" || value.length < 1 || value.length > (id ? 64 : 120)) validationError(`${path} is invalid`);
  if (id && !idPattern.test(value)) validationError(`${path} must be a stable identifier`);
  return value;
}

function signedPolygonArea(polygon: SemanticPlanePolygon) {
  let twiceArea = 0;
  for (let index = 0; index < polygon.length; index++) {
    const current = polygon[index];
    const next = polygon[(index + 1) % polygon.length];
    twiceArea += current.x * next.y - next.x * current.y;
  }
  return twiceArea / 2;
}

function orientation(a: SemanticPlanePoint, b: SemanticPlanePoint, c: SemanticPlanePoint) {
  return (b.x - a.x) * (c.y - a.y) - (b.y - a.y) * (c.x - a.x);
}

function pointOnSegment(a: SemanticPlanePoint, b: SemanticPlanePoint, point: SemanticPlanePoint) {
  if (Math.abs(orientation(a, b, point)) > 1e-9) return false;
  return point.x >= Math.min(a.x, b.x) - 1e-9 && point.x <= Math.max(a.x, b.x) + 1e-9
    && point.y >= Math.min(a.y, b.y) - 1e-9 && point.y <= Math.max(a.y, b.y) + 1e-9;
}

function segmentsIntersect(a: SemanticPlanePoint, b: SemanticPlanePoint, c: SemanticPlanePoint, d: SemanticPlanePoint) {
  const abC = orientation(a, b, c);
  const abD = orientation(a, b, d);
  const cdA = orientation(c, d, a);
  const cdB = orientation(c, d, b);
  if (((abC > 0 && abD < 0) || (abC < 0 && abD > 0)) && ((cdA > 0 && cdB < 0) || (cdA < 0 && cdB > 0))) return true;
  return (Math.abs(abC) <= 1e-9 && pointOnSegment(a, b, c))
    || (Math.abs(abD) <= 1e-9 && pointOnSegment(a, b, d))
    || (Math.abs(cdA) <= 1e-9 && pointOnSegment(c, d, a))
    || (Math.abs(cdB) <= 1e-9 && pointOnSegment(c, d, b));
}

function polygonValue(value: unknown, path: string): SemanticPlanePolygon {
  if (!Array.isArray(value) || value.length < 3 || value.length > 128) validationError(`${path} must contain 3..128 points`);
  const polygon = value.map((candidate, index) => {
    const point = recordValue(candidate, `${path}[${index}]`);
    exactKeys(point, ["x", "y"], `${path}[${index}]`);
    const x = point.x;
    const y = point.y;
    if (typeof x !== "number" || typeof y !== "number" || !Number.isFinite(x) || !Number.isFinite(y) || x < 0 || x > 1000 || y < 0 || y > 1000) {
      validationError(`${path}[${index}] coordinates must be finite and within 0..1000`);
    }
    return { x, y };
  });
  for (let index = 0; index < polygon.length; index++) {
    const next = (index + 1) % polygon.length;
    if (polygon[index].x === polygon[next].x && polygon[index].y === polygon[next].y) validationError(`${path} has a zero-length edge`);
  }
  if (Math.abs(signedPolygonArea(polygon)) < 1) validationError(`${path} has degenerate area`);
  for (let left = 0; left < polygon.length; left++) {
    const leftNext = (left + 1) % polygon.length;
    for (let right = left + 1; right < polygon.length; right++) {
      const rightNext = (right + 1) % polygon.length;
      if (left === right || leftNext === right || rightNext === left) continue;
      if (segmentsIntersect(polygon[left], polygon[leftNext], polygon[right], polygon[rightNext])) {
        validationError(`${path} is self-intersecting`);
      }
    }
  }
  return polygon;
}

function pointInsidePolygon(x: number, y: number, polygon: SemanticPlanePolygon) {
  let inside = false;
  for (let current = 0, previous = polygon.length - 1; current < polygon.length; previous = current++) {
    const a = polygon[current];
    const b = polygon[previous];
    if ((a.y > y) !== (b.y > y) && x < (b.x - a.x) * (y - a.y) / (b.y - a.y) + a.x) inside = !inside;
  }
  return inside;
}

function polygonMask(polygon: SemanticPlanePolygon, width: number, height: number) {
  const mask = new Uint8Array(width * height);
  const minX = Math.min(...polygon.map((point) => point.x));
  const maxX = Math.max(...polygon.map((point) => point.x));
  const minY = Math.min(...polygon.map((point) => point.y));
  const maxY = Math.max(...polygon.map((point) => point.y));
  const x0 = Math.max(0, Math.floor(minX * width / 1000 - 0.5));
  const x1 = Math.min(width - 1, Math.ceil(maxX * width / 1000 - 0.5));
  const y0 = Math.max(0, Math.floor(minY * height / 1000 - 0.5));
  const y1 = Math.min(height - 1, Math.ceil(maxY * height / 1000 - 0.5));
  for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) {
    const normalizedX = (x + 0.5) * 1000 / width;
    const normalizedY = (y + 0.5) * 1000 / height;
    if (pointInsidePolygon(normalizedX, normalizedY, polygon)) mask[y * width + x] = 1;
  }
  return mask;
}

function pairKey(left: number, right: number) {
  return left < right ? `${left}:${right}` : `${right}:${left}`;
}

function validateRasterTopology(document: SemanticPlaneDocument) {
  const size = SEMANTIC_PLANE_VALIDATION_RASTER_SIZE;
  const ownerMasks = document.owners.map((owner) => polygonMask(owner.polygon, size, size));
  const ownerAtPixel = new Int16Array(size * size);
  ownerAtPixel.fill(-1);
  const ownerOverlap = new Map<string, number>();
  for (let ownerIndex = 0; ownerIndex < ownerMasks.length; ownerIndex++) for (let pixel = 0; pixel < ownerAtPixel.length; pixel++) {
    if (!ownerMasks[ownerIndex][pixel]) continue;
    const existing = ownerAtPixel[pixel];
    if (existing < 0) ownerAtPixel[pixel] = ownerIndex;
    else if (existing !== ownerIndex) {
      const key = pairKey(existing, ownerIndex);
      const count = (ownerOverlap.get(key) || 0) + 1;
      ownerOverlap.set(key, count);
      if (count > SEMANTIC_PLANE_OVERLAP_TOLERANCE_PIXELS) validationError(`owners ${document.owners[existing].id} and ${document.owners[ownerIndex].id} overlap above raster tolerance`);
    }
  }

  const ownerIndexById = new Map(document.owners.map((owner, index) => [owner.id, index]));
  const firstPlaneOwner = new Int16Array(size * size);
  firstPlaneOwner.fill(-1);
  const crossOwnerPlaneOverlap = new Map<string, number>();
  for (const plane of document.planes) {
    const ownerIndex = ownerIndexById.get(plane.ownerId)!;
    const mask = polygonMask(plane.polygon, size, size);
    let outsideOwner = 0;
    for (let pixel = 0; pixel < mask.length; pixel++) {
      if (!mask[pixel]) continue;
      if (!ownerMasks[ownerIndex][pixel]) {
        outsideOwner++;
        if (outsideOwner > SEMANTIC_PLANE_OVERLAP_TOLERANCE_PIXELS) validationError(`plane ${plane.id} lies outside owner ${plane.ownerId}`);
      }
      const existingOwner = firstPlaneOwner[pixel];
      if (existingOwner < 0) firstPlaneOwner[pixel] = ownerIndex;
      else if (existingOwner !== ownerIndex) {
        const key = pairKey(existingOwner, ownerIndex);
        const count = (crossOwnerPlaneOverlap.get(key) || 0) + 1;
        crossOwnerPlaneOverlap.set(key, count);
        if (count > SEMANTIC_PLANE_OVERLAP_TOLERANCE_PIXELS) validationError(`planes from owners ${document.owners[existingOwner].id} and ${plane.ownerId} overlap above raster tolerance`);
      }
    }
  }
}

export function parseSemanticPlaneDocument(input: unknown): SemanticPlaneDocument {
  let candidate = input;
  if (typeof input === "string") {
    try { candidate = JSON.parse(input) as unknown; } catch { validationError("SemanticPlaneDocument is not valid JSON"); }
  }
  const root = recordValue(candidate, "document");
  exactKeys(root, ["version", "owners", "planes"], "document");
  if (root.version !== SEMANTIC_PLANE_DOCUMENT_VERSION) validationError(`document.version must be ${SEMANTIC_PLANE_DOCUMENT_VERSION}`);
  if (!Array.isArray(root.owners) || root.owners.length < 1 || root.owners.length > 64) validationError("document.owners must contain 1..64 owners");
  if (!Array.isArray(root.planes) || root.planes.length < 1 || root.planes.length > 256) validationError("document.planes must contain 1..256 planes");

  const ids = new Set<string>();
  const owners = root.owners.map((value, index): SemanticPlaneOwner => {
    const owner = recordValue(value, `owners[${index}]`);
    exactKeys(owner, ["id", "kind", "label", "polygon"], `owners[${index}]`);
    const id = textValue(owner.id, `owners[${index}].id`, true);
    if (ids.has(id)) validationError(`duplicate id ${id}`);
    ids.add(id);
    if (typeof owner.kind !== "string" || !ownerKindSet.has(owner.kind)) validationError(`owners[${index}].kind is invalid`);
    return {
      id,
      kind: owner.kind as SemanticOwnerKind,
      label: textValue(owner.label, `owners[${index}].label`),
      polygon: polygonValue(owner.polygon, `owners[${index}].polygon`),
    };
  });
  const ownerById = new Map(owners.map((owner) => [owner.id, owner]));
  const planes = root.planes.map((value, index): SemanticPlane => {
    const plane = recordValue(value, `planes[${index}]`);
    exactKeys(plane, ["id", "ownerId", "label", "role", "polygon"], `planes[${index}]`);
    const id = textValue(plane.id, `planes[${index}].id`, true);
    if (ids.has(id)) validationError(`duplicate id ${id}`);
    ids.add(id);
    const ownerId = textValue(plane.ownerId, `planes[${index}].ownerId`, true);
    const owner = ownerById.get(ownerId);
    if (!owner) validationError(`plane ${id} references missing owner ${ownerId}`);
    if (typeof plane.role !== "string" || !roleSet.has(plane.role)) validationError(`planes[${index}].role is invalid`);
    const role = plane.role as SemanticPlaneRole;
    if (!allowedRolesByKind[owner.kind].has(role)) validationError(`plane ${id} role ${role} is illegal for owner kind ${owner.kind}`);
    return {
      id,
      ownerId,
      label: textValue(plane.label, `planes[${index}].label`),
      role,
      polygon: polygonValue(plane.polygon, `planes[${index}].polygon`),
    };
  });
  const document: SemanticPlaneDocument = { version: SEMANTIC_PLANE_DOCUMENT_VERSION, owners, planes };
  validateRasterTopology(document);
  return document;
}

function canonicalDocument(document: SemanticPlaneDocument) {
  const point = (value: SemanticPlanePoint) => [value.x, value.y];
  return JSON.stringify({
    version: document.version,
    owners: [...document.owners].sort((left, right) => left.id.localeCompare(right.id))
      .map((owner) => ({ id: owner.id, kind: owner.kind, label: owner.label, polygon: owner.polygon.map(point) })),
    planes: [...document.planes].sort((left, right) => left.id.localeCompare(right.id))
      .map((plane) => ({ id: plane.id, ownerId: plane.ownerId, label: plane.label, role: plane.role, polygon: plane.polygon.map(point) })),
  });
}

function fnvCheckpoint(prefix: string, strings: string[], arrays: ArrayLike<number>[]) {
  let hash = 0x811c9dc5;
  const update = (value: number) => { hash ^= value & 255; hash = Math.imul(hash, 0x01000193); };
  for (const value of strings) for (const character of value) {
    const code = character.charCodeAt(0);
    update(code); update(code >>> 8);
  }
  for (const array of arrays) for (let index = 0; index < array.length; index++) {
    const value = array[index];
    update(value); update(value >>> 8); update(value >>> 16); update(value >>> 24);
  }
  return `${prefix}-${(hash >>> 0).toString(16).padStart(8, "0").toUpperCase()}`;
}

export function rasterizeSemanticPlaneDocument(input: unknown, width: number, height: number): RasterizedSemanticPlanes {
  if (!Number.isInteger(width) || width < 1 || width > 4096 || !Number.isInteger(height) || height < 1 || height > 4096) {
    throw new Error("Semantic-plane raster dimensions must be integers within 1..4096");
  }
  const document = parseSemanticPlaneDocument(input);
  const owners = [...document.owners].sort((left, right) => left.id.localeCompare(right.id));
  const planes = [...document.planes].sort((left, right) => left.id.localeCompare(right.id));
  const ownerIds = owners.map((owner) => owner.id);
  const planeIds = planes.map((plane) => plane.id);
  const ownerIndexById = new Map(ownerIds.map((id, index) => [id, index]));
  const ownerMap = new Int32Array(width * height);
  const planeMap = new Int32Array(width * height);
  ownerMap.fill(-1);
  planeMap.fill(-1);
  const ownerHits = new Uint8Array(width * height);
  const ambiguityMask = new Uint8Array(width * height);
  for (let ownerIndex = 0; ownerIndex < owners.length; ownerIndex++) {
    const mask = polygonMask(owners[ownerIndex].polygon, width, height);
    for (let pixel = 0; pixel < mask.length; pixel++) if (mask[pixel]) {
      if (!ownerHits[pixel]) ownerMap[pixel] = ownerIndex;
      else { ownerMap[pixel] = -1; ambiguityMask[pixel] = 1; }
      ownerHits[pixel]++;
    }
  }

  const selectedRank = new Uint8Array(width * height);
  for (let planeIndex = 0; planeIndex < planes.length; planeIndex++) {
    const plane = planes[planeIndex];
    const ownerIndex = ownerIndexById.get(plane.ownerId)!;
    const mask = polygonMask(plane.polygon, width, height);
    const rank = roleRank[plane.role];
    for (let pixel = 0; pixel < mask.length; pixel++) if (mask[pixel]) {
      if (ownerMap[pixel] !== ownerIndex) {
        planeMap[pixel] = -1;
        ambiguityMask[pixel] = 1;
        continue;
      }
      if (rank > selectedRank[pixel]) {
        planeMap[pixel] = planeIndex;
        selectedRank[pixel] = rank;
        ambiguityMask[pixel] = 0;
      } else if (rank === selectedRank[pixel]) {
        planeMap[pixel] = -1;
        ambiguityMask[pixel] = 1;
      }
    }
  }

  const criticalMask = new Uint8Array(width * height);
  const protectedMask = new Uint8Array(width * height);
  const pixelAreas = new Uint32Array(planes.length);
  let ambiguityPixelCount = 0;
  for (let pixel = 0; pixel < planeMap.length; pixel++) {
    if (ambiguityMask[pixel]) { ambiguityPixelCount++; continue; }
    const planeIndex = planeMap[pixel];
    if (planeIndex < 0) continue;
    pixelAreas[planeIndex]++;
    const role = planes[planeIndex].role;
    if (role === "structural-detail" || role === "critical-detail") protectedMask[pixel] = 1;
    if (role === "critical-detail") criticalMask[pixel] = 1;
  }
  const documentCheckpoint = fnvCheckpoint("SPD", [canonicalDocument(document)], []);
  const checkpoint = fnvCheckpoint("SPR", [`${width}x${height}`, documentCheckpoint, ...ownerIds, ...planeIds], [ownerMap, planeMap, criticalMask, protectedMask, ambiguityMask]);
  return {
    width,
    height,
    ownerIds,
    planeIds,
    ownerMap,
    planeMap,
    criticalMask,
    protectedMask,
    ambiguityMask,
    ambiguityPixelCount,
    planePixelAreas: planes.map((plane, index) => ({
      planeId: plane.id,
      ownerId: plane.ownerId,
      role: plane.role,
      pixelArea: pixelAreas[index],
    })),
    documentCheckpoint,
    checkpoint,
  };
}

export function preflightRasterizedSemanticPlanes(raster: RasterizedSemanticPlanes): SemanticPlanePreflight {
  const { width, height, planeMap, planeIds } = raster;
  if (planeMap.length !== width * height) throw new Error("Semantic-plane preflight raster dimensions do not match");
  const visited = new Uint8Array(planeMap.length);
  const planeComponents = Array.from({ length: planeIds.length }, () => [] as number[][]);
  for (let start = 0; start < planeMap.length; start++) {
    const planeIndex = planeMap[start];
    if (planeIndex < 0 || visited[start]) continue;
    const queue = [start];
    const pixels: number[] = [];
    visited[start] = 1;
    for (let cursor = 0; cursor < queue.length; cursor++) {
      const pixel = queue[cursor];
      pixels.push(pixel);
      const x = pixel % width;
      const y = Math.floor(pixel / width);
      const neighbors = [
        x > 0 ? pixel - 1 : -1,
        x + 1 < width ? pixel + 1 : -1,
        y > 0 ? pixel - width : -1,
        y + 1 < height ? pixel + width : -1,
      ];
      for (const next of neighbors) if (next >= 0 && !visited[next] && planeMap[next] === planeIndex) {
        visited[next] = 1;
        queue.push(next);
      }
    }
    planeComponents[planeIndex].push(pixels);
  }

  let componentCount = 0;
  let passCount = 0;
  let failedAreaPixels = 0;
  const planes = planeIds.map((planeId, planeIndex): SemanticPlanePreflightPlane => {
    const components = planeComponents[planeIndex].map((pixels, componentIndex): SemanticPlaneComponentPreflight => {
      const fits5Pt = fitsExactFivePointPixelComponent(pixels, width, height, planeIndex);
      componentCount++;
      if (fits5Pt) passCount++;
      else failedAreaPixels += pixels.length;
      return { componentId: componentIndex, pixelArea: pixels.length, fits5Pt };
    });
    const planePassCount = components.filter((component) => component.fits5Pt).length;
    return {
      planeId,
      pixelArea: components.reduce((sum, component) => sum + component.pixelArea, 0),
      componentCount: components.length,
      passCount: planePassCount,
      failCount: components.length - planePassCount,
      coverage: components.length ? planePassCount / components.length * 100 : 100,
      components,
    };
  });
  const failCount = componentCount - passCount;
  return {
    width,
    height,
    planeCount: planes.filter((plane) => plane.pixelArea > 0).length,
    componentCount,
    passCount,
    failCount,
    coverage: componentCount ? passCount / componentCount * 100 : 100,
    failedAreaPixels,
    failedAreaMm2: failedAreaPixels * 400 * 500 / (width * height),
    failedAreaPercent: width * height ? failedAreaPixels / (width * height) * 100 : 0,
    planes,
  };
}

export function preflightSemanticPlaneDocument(input: unknown, width: number, height: number) {
  const raster = rasterizeSemanticPlaneDocument(input, width, height);
  return { raster, preflight: preflightRasterizedSemanticPlanes(raster) };
}
