import {
  APPROVED_PREVIEW_COORDINATE_FRAME,
  FT161_X1B_LIVE_SPEC,
  SEMANTIC_PLANE_COST_BASIS,
  buildFt161SemanticPlaneRequest,
  parseSemanticPlaneLiveResponse,
  semanticPlaneCostUsd,
  summarizeSemanticPlaneLiveResult,
} from "./semantic-plane-live.ts";

export const FT161_CLOUDFLARE_ONE_SHOT = Object.freeze({
  claimId: "FT161-X1B-v1",
  sourceAssetPath: "/reference/history/ft161-source.jpg",
  approvedAssetPath: "/reference/history/ft161-approved.png",
  confirmation: "RUN_FT161_X1B_ONCE",
  tokenHeader: "x-x1b-one-shot-token",
  requestLimit: 1,
  retryLimit: 0,
});

type OpenAiUsage = {
  prompt_tokens?: number;
  completion_tokens?: number;
  total_tokens?: number;
};

type OpenAiPayload = {
  choices?: Array<{ message?: { content?: string } }>;
  usage?: OpenAiUsage;
  error?: { message?: string; code?: string };
};

export type Ft161OneShotArtifact = {
  rawResponse: string;
  semanticPlanes: unknown | null;
  report: Record<string, unknown>;
};

export type Ft161OneShotResult = {
  status: number;
  body: Record<string, unknown>;
};

export type Ft161OneShotDependencies = {
  apiKey?: string;
  expectedToken?: string;
  claimOnce: () => Promise<boolean>;
  loadAsset: (path: string) => Promise<Uint8Array>;
  openAiFetch: typeof fetch;
  now?: () => number;
};

function safeEqual(left: string, right: string) {
  const encoder = new TextEncoder();
  const leftBytes = encoder.encode(left);
  const rightBytes = encoder.encode(right);
  let difference = leftBytes.length ^ rightBytes.length;
  const length = Math.max(leftBytes.length, rightBytes.length);
  for (let index = 0; index < length; index++) difference |= (leftBytes[index] || 0) ^ (rightBytes[index] || 0);
  return difference === 0;
}

function exactConfirmation(input: unknown) {
  if (!input || typeof input !== "object" || Array.isArray(input)) return false;
  const record = input as Record<string, unknown>;
  const keys = Object.keys(record).sort();
  return keys.length === 2
    && keys[0] === "confirmation"
    && keys[1] === "fixture"
    && record.fixture === FT161_X1B_LIVE_SPEC.fixture
    && record.confirmation === FT161_CLOUDFLARE_ONE_SHOT.confirmation;
}

function imageDataUrl(bytes: Uint8Array, mimeType: string) {
  let binary = "";
  const chunkSize = 32_768;
  for (let index = 0; index < bytes.length; index += chunkSize) {
    binary += String.fromCharCode(...bytes.subarray(index, Math.min(bytes.length, index + chunkSize)));
  }
  return `data:${mimeType};base64,${btoa(binary)}`;
}

function approvedPngDimensions(bytes: Uint8Array) {
  const signature = [137, 80, 78, 71, 13, 10, 26, 10];
  if (bytes.length < 24 || signature.some((value, index) => bytes[index] !== value)) {
    throw new Error("FT161 approved preview is not a valid PNG");
  }
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const width = view.getUint32(16);
  const height = view.getUint32(20);
  if (!width || !height) throw new Error("FT161 approved preview has invalid dimensions");
  return { width, height };
}

function openAiContent(payload: OpenAiPayload) {
  const content = payload.choices?.[0]?.message?.content;
  if (typeof content !== "string" || !content) throw new Error("X1B response has no semantic-plane JSON content");
  return content;
}

function jsonPayload(rawResponse: string): OpenAiPayload {
  try { return JSON.parse(rawResponse) as OpenAiPayload; } catch { return {}; }
}

function noStore(status: number, body: Record<string, unknown>): Ft161OneShotResult {
  return { status, body };
}

export async function runFt161CloudflareOneShot(
  input: { authorized: boolean; providedToken?: string; requestBody: unknown },
  dependencies: Ft161OneShotDependencies,
): Promise<Ft161OneShotResult> {
  if (!input.authorized) return noStore(401, { error: "authentication required", code: "x1b_unauthorized" });
  if (!dependencies.expectedToken) return noStore(503, { error: "X1B one-shot token is not configured", code: "x1b_token_not_configured" });
  if (!input.providedToken || !safeEqual(input.providedToken, dependencies.expectedToken)) {
    return noStore(403, { error: "X1B one-shot token rejected", code: "x1b_token_rejected" });
  }
  if (!exactConfirmation(input.requestBody)) {
    return noStore(400, { error: "Exact FT161 one-shot confirmation is required", code: "x1b_confirmation_required" });
  }
  if (!dependencies.apiKey) return noStore(503, { error: "OPENAI_API_KEY is not configured", code: "x1b_openai_not_configured" });

  let sourceBytes: Uint8Array;
  let approvedBytes: Uint8Array;
  try {
    sourceBytes = await dependencies.loadAsset(FT161_CLOUDFLARE_ONE_SHOT.sourceAssetPath);
    approvedBytes = await dependencies.loadAsset(FT161_CLOUDFLARE_ONE_SHOT.approvedAssetPath);
  } catch (error) {
    return noStore(500, {
      error: error instanceof Error ? error.message : String(error),
      code: "x1b_fixed_asset_failed",
    });
  }

  let dimensions: { width: number; height: number };
  try { dimensions = approvedPngDimensions(approvedBytes); } catch (error) {
    return noStore(500, {
      error: error instanceof Error ? error.message : String(error),
      code: "x1b_approved_asset_invalid",
    });
  }

  if (!await dependencies.claimOnce()) {
    return noStore(409, { error: "FT161 X1B one-shot was already claimed", code: "x1b_already_claimed" });
  }

  const now = dependencies.now || (() => performance.now());
  const startedAt = now();
  const request = buildFt161SemanticPlaneRequest(
    imageDataUrl(sourceBytes, "image/jpeg"),
    imageDataUrl(approvedBytes, "image/png"),
  );
  let response: Response;
  try {
    response = await dependencies.openAiFetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${dependencies.apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(request),
    });
  } catch (error) {
    return noStore(502, {
      error: error instanceof Error ? error.message : String(error),
      code: "x1b_transport_failed",
      requestCount: 1,
      retryCount: 0,
    });
  }

  const rawResponse = await response.text();
  const payload = jsonPayload(rawResponse);
  const runtimeMs = now() - startedAt;
  const baseReport = {
    phase: "X1B",
    fixture: FT161_X1B_LIVE_SPEC.fixture,
    model: FT161_X1B_LIVE_SPEC.model,
    request: {
      endpoint: "POST /v1/chat/completions",
      imageOrder: [
        { image: 1, role: "source identity/semantic reference", path: FT161_X1B_LIVE_SPEC.sourcePath },
        { image: 2, role: "approved preview geometry/coordinate reference", path: FT161_X1B_LIVE_SPEC.approvedPreviewPath },
      ],
      coordinateFrame: APPROVED_PREVIEW_COORDINATE_FRAME,
      requestCount: 1,
      requestLimit: FT161_CLOUDFLARE_ONE_SHOT.requestLimit,
      retryCount: 0,
      retryLimit: FT161_CLOUDFLARE_ONE_SHOT.retryLimit,
    },
    response: {
      status: response.status,
      requestId: response.headers.get("x-request-id"),
      usage: payload.usage || null,
      costUsd: semanticPlaneCostUsd(payload.usage),
      costBasis: SEMANTIC_PLANE_COST_BASIS.description,
    },
    runtimeMs,
  };

  if (!response.ok) {
    const artifact: Ft161OneShotArtifact = {
      rawResponse,
      semanticPlanes: null,
      report: {
        ...baseReport,
        validation: { valid: false, error: payload.error?.message || `HTTP ${response.status}` },
      },
    };
    return noStore(502, { ok: false, artifact });
  }

  try {
    const parsed = parseSemanticPlaneLiveResponse(openAiContent(payload), dimensions.width, dimensions.height);
    const artifact: Ft161OneShotArtifact = {
      rawResponse,
      semanticPlanes: parsed.envelope.semanticPlanes,
      report: {
        ...baseReport,
        validation: { valid: true, coordinateFrame: parsed.envelope.coordinateFrame },
        contract: summarizeSemanticPlaneLiveResult(parsed.envelope, parsed.raster),
        exact5PtPreflight: parsed.preflight,
        failAttribution: {
          available: false,
          reason: "Current immutable FT161 semantic FAIL components are supplied only in the separately authorized report step.",
        },
      },
    };
    return noStore(200, { ok: true, artifact });
  } catch (error) {
    const artifact: Ft161OneShotArtifact = {
      rawResponse,
      semanticPlanes: null,
      report: {
        ...baseReport,
        validation: { valid: false, error: error instanceof Error ? error.message : String(error) },
      },
    };
    return noStore(422, { ok: false, artifact });
  }
}
