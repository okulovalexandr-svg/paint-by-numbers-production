import { mkdir, readFile, writeFile } from "node:fs/promises";
import { resolve } from "node:path";

import {
  APPROVED_PREVIEW_COORDINATE_FRAME,
  FT161_X1B_LIVE_SPEC,
  SEMANTIC_PLANE_COST_BASIS,
  assertFt161LiveOptIn,
  buildFt161SemanticPlaneRequest,
  parseSemanticPlaneLiveResponse,
  semanticPlaneCostUsd,
  summarizeSemanticPlaneLiveResult,
} from "../lib/semantic-plane-live.ts";

assertFt161LiveOptIn(process.env);

if (!process.env.OPENAI_API_KEY) throw new Error("OPENAI_API_KEY is required for the authorized FT161 live run");

const startedAt = performance.now();
const sourcePath = resolve(FT161_X1B_LIVE_SPEC.sourcePath);
const approvedPath = resolve(FT161_X1B_LIVE_SPEC.approvedPreviewPath);
const outputDirectory = resolve(FT161_X1B_LIVE_SPEC.outputDirectory);
const rawResponsePath = resolve(outputDirectory, "raw-response.json");
const contractPath = resolve(outputDirectory, "semantic-planes.json");
const reportPath = resolve(outputDirectory, "report.json");

function dataUrl(bytes, mimeType) {
  return `data:${mimeType};base64,${bytes.toString("base64")}`;
}

function pngDimensions(bytes) {
  if (bytes.length < 24 || bytes.toString("ascii", 1, 4) !== "PNG") throw new Error("FT161 approved preview must be a valid PNG");
  return { width: bytes.readUInt32BE(16), height: bytes.readUInt32BE(20) };
}

function responseContent(payload) {
  const content = payload?.choices?.[0]?.message?.content;
  if (typeof content !== "string" || !content) throw new Error("Live semantic-plane response has no JSON content");
  return content;
}

await mkdir(outputDirectory, { recursive: true });
const [sourceBytes, approvedBytes] = await Promise.all([readFile(sourcePath), readFile(approvedPath)]);
const dimensions = pngDimensions(approvedBytes);
const request = buildFt161SemanticPlaneRequest(
  dataUrl(sourceBytes, "image/jpeg"),
  dataUrl(approvedBytes, "image/png"),
);

let requestCount = 0;
requestCount++;
const response = await fetch("https://api.openai.com/v1/chat/completions", {
  method: "POST",
  headers: {
    Authorization: `Bearer ${process.env.OPENAI_API_KEY}`,
    "Content-Type": "application/json",
  },
  body: JSON.stringify(request),
});
const rawResponse = await response.text();
await writeFile(rawResponsePath, rawResponse, "utf8");

let payload = {};
try { payload = JSON.parse(rawResponse); } catch { /* The fail-closed report below retains the raw body. */ }
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
    requestCount,
    requestLimit: FT161_X1B_LIVE_SPEC.requestLimit,
    retryCount: 0,
    retryLimit: FT161_X1B_LIVE_SPEC.retryLimit,
  },
  response: {
    status: response.status,
    requestId: response.headers.get("x-request-id"),
    usage: payload?.usage || null,
    costUsd: semanticPlaneCostUsd(payload?.usage),
    costBasis: SEMANTIC_PLANE_COST_BASIS.description,
  },
  output: { rawResponsePath, contractPath, reportPath },
};

if (!response.ok) {
  await writeFile(reportPath, JSON.stringify({
    ...baseReport,
    validation: { valid: false, error: payload?.error?.message || `HTTP ${response.status}` },
    runtimeMs: performance.now() - startedAt,
  }, null, 2));
  throw new Error(`FT161 live semantic request failed with HTTP ${response.status}; no retry was attempted`);
}

try {
  const parsed = parseSemanticPlaneLiveResponse(responseContent(payload), dimensions.width, dimensions.height);
  await writeFile(contractPath, JSON.stringify(parsed.envelope.semanticPlanes, null, 2));
  await writeFile(reportPath, JSON.stringify({
    ...baseReport,
    validation: { valid: true, coordinateFrame: parsed.envelope.coordinateFrame },
    contract: summarizeSemanticPlaneLiveResult(parsed.envelope, parsed.raster),
    exact5PtPreflight: parsed.preflight,
    failAttribution: {
      available: false,
      reason: "Provide current immutable FT161 semantic FAIL components to attributeSemanticFailComponents in the separately authorized report phase.",
    },
    runtimeMs: performance.now() - startedAt,
  }, null, 2));
} catch (error) {
  await writeFile(reportPath, JSON.stringify({
    ...baseReport,
    validation: { valid: false, error: error instanceof Error ? error.message : String(error) },
    runtimeMs: performance.now() - startedAt,
  }, null, 2));
  throw error;
}

console.log(`FT161 semantic-plane live report: ${reportPath}`);
