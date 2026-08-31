import {
  parseSemanticPlaneDocument,
  preflightRasterizedSemanticPlanes,
  rasterizeSemanticPlaneDocument,
  semanticPlaneDocumentJsonSchema,
  type RasterizedSemanticPlanes,
  type SemanticOwnerKind,
  type SemanticPlaneDocument,
} from "./semantic-planes.ts";

export const APPROVED_PREVIEW_COORDINATE_FRAME = "image-2-approved-preview-normalized-0..1000" as const;

export const FT161_X1B_LIVE_SPEC = Object.freeze({
  fixture: "FT161",
  sourcePath: "public/reference/history/ft161-source.jpg",
  approvedPreviewPath: "public/reference/history/ft161-approved.png",
  model: "gpt-5.6-terra",
  requestLimit: 1,
  retryLimit: 0,
  optInEnvironmentVariable: "ALLOW_LIVE_SEMANTIC_X1B",
  outputDirectory: ".x1b-live/ft161",
});

export const SEMANTIC_PLANE_COST_BASIS = Object.freeze({
  description: "gpt-5.6-terra standard: input $2/M, output $12/M",
  inputUsdPerMillionTokens: 2,
  outputUsdPerMillionTokens: 12,
});

const semanticPlaneStrictResponseJsonSchema = Object.fromEntries(
  Object.entries(semanticPlaneDocumentJsonSchema).filter(([keyword]) => keyword !== "$schema"),
) as Omit<typeof semanticPlaneDocumentJsonSchema, "$schema">;

export const semanticPlaneLiveResponseJsonSchema = {
  type: "object",
  additionalProperties: false,
  properties: {
    coordinateFrame: {
      type: "string",
      const: APPROVED_PREVIEW_COORDINATE_FRAME,
      description: "All polygon coordinates refer to Image 2, the approved preview, normalized to 0..1000.",
    },
    semanticPlanes: semanticPlaneStrictResponseJsonSchema,
  },
  required: ["coordinateFrame", "semanticPlanes"],
} as const;

export const FT161_SEMANTIC_PLANE_PROMPT = [
  "This is a bounded paint-by-numbers production-geometry analysis of exactly one FT161 pair.",
  "Image 1 is the original source and is ONLY the identity and semantic reference.",
  "Image 2 is the approved palette preview and is the ONLY geometry and coordinate frame.",
  `Return ${APPROVED_PREVIEW_COORDINATE_FRAME}: every polygon coordinate MUST refer to Image 2 and be normalized from 0 to 1000.`,
  "Do not infer, estimate, or return a source-to-preview crop, aspect-ratio, or geometric transform.",
  "Return the exact semantic-planes/v1 document nested in the required response envelope.",
  "Cover visible face, hand, text, logo, and key-detail owners. Represent each visible eye or pupil as a critical-detail plane within its face owner because semantic-planes/v1 has no separate eye owner kind.",
  "Use broad coherent paintable base/supporting/structural planes, not texture fragments, decorative noise, crumbs, or slivers.",
  "Preserve identity-critical boundaries. Critical details may be small; ordinary supporting/base planes should be designed for eventual exact 5 pt production fit.",
  "This is production geometry, not artistic redesign. Do not add production colours and do not repair or reinterpret the approved preview.",
].join(" ");

export type SemanticPlaneLiveEnvelope = {
  coordinateFrame: typeof APPROVED_PREVIEW_COORDINATE_FRAME;
  semanticPlanes: SemanticPlaneDocument;
};

export type SemanticFailComponent = {
  id: string;
  pixels: readonly number[];
  expectedSemantic?: SemanticOwnerKind | "eye";
};

export type SemanticFailAttribution = {
  componentCount: number;
  exactOwnedComponentCount: number;
  ambiguousComponentCount: number;
  uncoveredComponentCount: number;
  pixelCount: number;
  exactOwnedPixelCount: number;
  ambiguousPixelCount: number;
  uncoveredPixelCount: number;
  face: {
    targetComponentCount: number;
    targetPixelCount: number;
    faceOwnedPixelCount: number;
    ambiguousPixelCount: number;
    uncoveredPixelCount: number;
    wrongOwnerPixelCount: number;
    coveragePercent: number;
  };
  components: Array<{
    id: string;
    status: "exact-owned" | "ambiguous" | "uncovered";
    pixelCount: number;
    exactOwnedPixelCount: number;
    ambiguousPixelCount: number;
    uncoveredPixelCount: number;
    ownerIds: string[];
    planeIds: string[];
  }>;
};

function objectValue(value: unknown, label: string): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error(`${label} must be an object`);
  return value as Record<string, unknown>;
}

function exactEnvelopeKeys(value: Record<string, unknown>) {
  const keys = Object.keys(value).sort();
  if (keys.length !== 2 || keys[0] !== "coordinateFrame" || keys[1] !== "semanticPlanes") {
    throw new Error("Live semantic-plane response must contain only coordinateFrame and semanticPlanes");
  }
}

export function assertFt161LiveOptIn(environment: Record<string, string | undefined>) {
  if (environment[FT161_X1B_LIVE_SPEC.optInEnvironmentVariable] !== "1") {
    throw new Error(`Live semantic X1B is disabled; set ${FT161_X1B_LIVE_SPEC.optInEnvironmentVariable}=1 for the separately authorized FT161 run`);
  }
}

export function buildFt161SemanticPlaneMessages(sourceDataUrl: string, approvedPreviewDataUrl: string) {
  return [
    {
      role: "system" as const,
      content: "Return strict semantic-plane production geometry. Never redesign, recolour, merge, or silently repair geometry.",
    },
    {
      role: "user" as const,
      content: [
        { type: "text" as const, text: FT161_SEMANTIC_PLANE_PROMPT },
        { type: "image_url" as const, image_url: { url: sourceDataUrl, detail: "original" as const } },
        { type: "image_url" as const, image_url: { url: approvedPreviewDataUrl, detail: "original" as const } },
      ],
    },
  ];
}

export function buildFt161SemanticPlaneRequest(sourceDataUrl: string, approvedPreviewDataUrl: string) {
  return {
    model: FT161_X1B_LIVE_SPEC.model,
    reasoning_effort: "none",
    messages: buildFt161SemanticPlaneMessages(sourceDataUrl, approvedPreviewDataUrl),
    response_format: {
      type: "json_schema",
      json_schema: {
        name: "ft161_semantic_planes_v1",
        strict: true,
        schema: semanticPlaneLiveResponseJsonSchema,
      },
    },
    max_completion_tokens: 12_000,
  };
}

export function parseSemanticPlaneLiveResponse(input: unknown, width: number, height: number) {
  let candidate = input;
  if (typeof input === "string") {
    try { candidate = JSON.parse(input) as unknown; } catch { throw new Error("Live semantic-plane response is not valid JSON"); }
  }
  const envelope = objectValue(candidate, "Live semantic-plane response");
  exactEnvelopeKeys(envelope);
  if (envelope.coordinateFrame !== APPROVED_PREVIEW_COORDINATE_FRAME) {
    throw new Error(`Live semantic-plane response must use ${APPROVED_PREVIEW_COORDINATE_FRAME}`);
  }
  const document = parseSemanticPlaneDocument(envelope.semanticPlanes);
  const raster = rasterizeSemanticPlaneDocument(document, width, height);
  const preflight = preflightRasterizedSemanticPlanes(raster);
  return {
    envelope: { coordinateFrame: APPROVED_PREVIEW_COORDINATE_FRAME, semanticPlanes: document } satisfies SemanticPlaneLiveEnvelope,
    raster,
    preflight,
  };
}

function countMask(mask: ArrayLike<number>) {
  let count = 0;
  for (let index = 0; index < mask.length; index++) if (mask[index]) count++;
  return count;
}

function sortedCounts(values: readonly string[]) {
  const counts: Record<string, number> = {};
  for (const value of [...values].sort()) counts[value] = (counts[value] || 0) + 1;
  return counts;
}

export function summarizeSemanticPlaneLiveResult(
  envelope: SemanticPlaneLiveEnvelope,
  raster: RasterizedSemanticPlanes,
) {
  return {
    coordinateFrame: envelope.coordinateFrame,
    ownerCount: envelope.semanticPlanes.owners.length,
    planeCount: envelope.semanticPlanes.planes.length,
    ownerCountsByKind: sortedCounts(envelope.semanticPlanes.owners.map((owner) => owner.kind)),
    planeCountsByRole: sortedCounts(envelope.semanticPlanes.planes.map((plane) => plane.role)),
    ambiguityPixelCount: raster.ambiguityPixelCount,
    criticalPixelCount: countMask(raster.criticalMask),
    protectedPixelCount: countMask(raster.protectedMask),
    documentCheckpoint: raster.documentCheckpoint,
    rasterCheckpoint: raster.checkpoint,
    planePixelAreas: raster.planePixelAreas,
  };
}

export function semanticPlaneCostUsd(usage: { prompt_tokens?: number; completion_tokens?: number } | null | undefined) {
  if (!usage) return null;
  const input = usage.prompt_tokens || 0;
  const output = usage.completion_tokens || 0;
  return Number((
    input * SEMANTIC_PLANE_COST_BASIS.inputUsdPerMillionTokens / 1_000_000
    + output * SEMANTIC_PLANE_COST_BASIS.outputUsdPerMillionTokens / 1_000_000
  ).toFixed(6));
}

export function attributeSemanticFailComponents(
  document: SemanticPlaneDocument,
  raster: RasterizedSemanticPlanes,
  failComponents: readonly SemanticFailComponent[],
): SemanticFailAttribution {
  if (raster.ownerMap.length !== raster.width * raster.height || raster.planeMap.length !== raster.ownerMap.length) {
    throw new Error("Semantic FAIL attribution raster dimensions do not match");
  }
  const ownerKindById = new Map(document.owners.map((owner) => [owner.id, owner.kind]));
  let exactOwnedPixelCount = 0;
  let ambiguousPixelCount = 0;
  let uncoveredPixelCount = 0;
  let faceTargetComponentCount = 0;
  let faceTargetPixelCount = 0;
  let faceOwnedPixelCount = 0;
  let faceAmbiguousPixelCount = 0;
  let faceUncoveredPixelCount = 0;
  let faceWrongOwnerPixelCount = 0;

  const components = failComponents.map((component) => {
    if (!component.id || !component.pixels.length) throw new Error("Semantic FAIL components require an id and pixels");
    const pixels = [...new Set(component.pixels)];
    if (pixels.some((pixel) => !Number.isInteger(pixel) || pixel < 0 || pixel >= raster.ownerMap.length)) {
      throw new Error(`Semantic FAIL component ${component.id} contains an invalid pixel`);
    }
    const ownerIds = new Set<string>();
    const planeIds = new Set<string>();
    let exact = 0;
    let ambiguous = 0;
    let uncovered = 0;
    const faceTarget = component.expectedSemantic === "face" || component.expectedSemantic === "eye";
    if (faceTarget) {
      faceTargetComponentCount++;
      faceTargetPixelCount += pixels.length;
    }
    for (const pixel of pixels) {
      if (raster.ambiguityMask[pixel]) {
        ambiguous++;
        if (faceTarget) faceAmbiguousPixelCount++;
        continue;
      }
      const ownerIndex = raster.ownerMap[pixel];
      if (ownerIndex < 0) {
        uncovered++;
        if (faceTarget) faceUncoveredPixelCount++;
        continue;
      }
      exact++;
      const ownerId = raster.ownerIds[ownerIndex];
      ownerIds.add(ownerId);
      const planeIndex = raster.planeMap[pixel];
      if (planeIndex >= 0) planeIds.add(raster.planeIds[planeIndex]);
      if (faceTarget) {
        if (ownerKindById.get(ownerId) === "face") faceOwnedPixelCount++;
        else faceWrongOwnerPixelCount++;
      }
    }
    exactOwnedPixelCount += exact;
    ambiguousPixelCount += ambiguous;
    uncoveredPixelCount += uncovered;
    const status = ambiguous > 0 || ownerIds.size > 1
      ? "ambiguous" as const
      : uncovered > 0
        ? "uncovered" as const
        : "exact-owned" as const;
    return {
      id: component.id,
      status,
      pixelCount: pixels.length,
      exactOwnedPixelCount: exact,
      ambiguousPixelCount: ambiguous,
      uncoveredPixelCount: uncovered,
      ownerIds: [...ownerIds].sort(),
      planeIds: [...planeIds].sort(),
    };
  });

  return {
    componentCount: components.length,
    exactOwnedComponentCount: components.filter((component) => component.status === "exact-owned").length,
    ambiguousComponentCount: components.filter((component) => component.status === "ambiguous").length,
    uncoveredComponentCount: components.filter((component) => component.status === "uncovered").length,
    pixelCount: exactOwnedPixelCount + ambiguousPixelCount + uncoveredPixelCount,
    exactOwnedPixelCount,
    ambiguousPixelCount,
    uncoveredPixelCount,
    face: {
      targetComponentCount: faceTargetComponentCount,
      targetPixelCount: faceTargetPixelCount,
      faceOwnedPixelCount,
      ambiguousPixelCount: faceAmbiguousPixelCount,
      uncoveredPixelCount: faceUncoveredPixelCount,
      wrongOwnerPixelCount: faceWrongOwnerPixelCount,
      coveragePercent: faceTargetPixelCount ? faceOwnedPixelCount / faceTargetPixelCount * 100 : 100,
    },
    components,
  };
}
