import assert from "node:assert/strict";
import test from "node:test";

import {
  FT161_CLOUDFLARE_ONE_SHOT,
  runFt161CloudflareOneShot,
} from "../lib/semantic-plane-cloudflare-one-shot.ts";

const rectangle = (x0, y0, x1, y1) => [
  { x: x0, y: y0 }, { x: x1, y: y0 }, { x: x1, y: y1 }, { x: x0, y: y1 },
];

function approvedPng(width = 40, height = 50) {
  const bytes = new Uint8Array(24);
  bytes.set([137, 80, 78, 71, 13, 10, 26, 10]);
  const view = new DataView(bytes.buffer);
  view.setUint32(16, width);
  view.setUint32(20, height);
  return bytes;
}

function validModelResponse() {
  return {
    coordinateFrame: "image-2-approved-preview-normalized-0..1000",
    semanticPlanes: {
      version: "semantic-planes/v1",
      owners: [{ id: "owner-face", kind: "face", label: "Face", polygon: rectangle(100, 100, 900, 900) }],
      planes: [{ id: "plane-face", ownerId: "owner-face", label: "Face base", role: "base", polygon: rectangle(100, 100, 900, 900) }],
    },
  };
}

function confirmation() {
  return { fixture: "FT161", confirmation: FT161_CLOUDFLARE_ONE_SHOT.confirmation };
}

function dependencies(overrides = {}) {
  let claimed = false;
  return {
    apiKey: "synthetic-key-never-sent",
    expectedToken: "synthetic-one-shot-token",
    claimOnce: async () => {
      if (claimed) return false;
      claimed = true;
      return true;
    },
    loadAsset: async (path) => path === FT161_CLOUDFLARE_ONE_SHOT.sourceAssetPath
      ? new Uint8Array([255, 216, 255, 217])
      : approvedPng(),
    openAiFetch: async () => new Response(JSON.stringify({
      choices: [{ message: { content: JSON.stringify(validModelResponse()) } }],
      usage: { prompt_tokens: 1000, completion_tokens: 500, total_tokens: 1500 },
    }), { status: 200, headers: { "x-request-id": "synthetic-request" } }),
    now: (() => { let value = 100; return () => value += 25; })(),
    ...overrides,
  };
}

function authorizedInput(overrides = {}) {
  return {
    authorized: true,
    providedToken: "synthetic-one-shot-token",
    requestBody: confirmation(),
    ...overrides,
  };
}

test("X1B Cloudflare route guards refuse before loading assets or calling AI", async () => {
  let assetLoads = 0;
  let apiCalls = 0;
  const deps = dependencies({
    loadAsset: async () => { assetLoads++; return approvedPng(); },
    openAiFetch: async () => { apiCalls++; throw new Error("must not run"); },
  });

  assert.equal((await runFt161CloudflareOneShot(authorizedInput({ authorized: false }), deps)).status, 401);
  assert.equal((await runFt161CloudflareOneShot(authorizedInput({ providedToken: "wrong" }), deps)).status, 403);
  assert.equal((await runFt161CloudflareOneShot(authorizedInput({ requestBody: { fixture: "FT161" } }), deps)).status, 400);
  assert.equal(assetLoads, 0);
  assert.equal(apiCalls, 0);
});

test("X1B Cloudflare route requires both existing API key and disposable execution token", async () => {
  let apiCalls = 0;
  const missingToken = dependencies({ expectedToken: undefined, openAiFetch: async () => { apiCalls++; throw new Error("must not run"); } });
  const missingApiKey = dependencies({ apiKey: undefined, openAiFetch: async () => { apiCalls++; throw new Error("must not run"); } });

  assert.equal((await runFt161CloudflareOneShot(authorizedInput(), missingToken)).status, 503);
  assert.equal((await runFt161CloudflareOneShot(authorizedInput(), missingApiKey)).status, 503);
  assert.equal(apiCalls, 0);
});

test("X1B Cloudflare route loads only fixed FT161 assets in deterministic order", async () => {
  const loaded = [];
  const deps = dependencies({
    loadAsset: async (path) => {
      loaded.push(path);
      return path === FT161_CLOUDFLARE_ONE_SHOT.sourceAssetPath
        ? new Uint8Array([255, 216, 255, 217])
        : approvedPng();
    },
  });
  const result = await runFt161CloudflareOneShot(authorizedInput(), deps);

  assert.equal(result.status, 200);
  assert.deepEqual(loaded, [
    "/reference/history/ft161-source.jpg",
    "/reference/history/ft161-approved.png",
  ]);
});

test("X1B Cloudflare route makes exactly one synthetic OpenAI fetch and returns the full artifact", async () => {
  let apiCalls = 0;
  const deps = dependencies({
    openAiFetch: async (url, init) => {
      apiCalls++;
      assert.equal(url, "https://api.openai.com/v1/chat/completions");
      const request = JSON.parse(init.body);
      assert.equal(request.messages[1].content[1].image_url.url.startsWith("data:image/jpeg;base64,"), true);
      assert.equal(request.messages[1].content[2].image_url.url.startsWith("data:image/png;base64,"), true);
      return new Response(JSON.stringify({
        choices: [{ message: { content: JSON.stringify(validModelResponse()) } }],
        usage: { prompt_tokens: 1000, completion_tokens: 500, total_tokens: 1500 },
      }), { status: 200, headers: { "x-request-id": "synthetic-request" } });
    },
  });
  const result = await runFt161CloudflareOneShot(authorizedInput(), deps);
  const artifact = result.body.artifact;

  assert.equal(apiCalls, 1);
  assert.equal(result.status, 200);
  assert.equal(result.body.ok, true);
  assert.equal(artifact.report.request.requestCount, 1);
  assert.equal(artifact.report.request.retryCount, 0);
  assert.equal(artifact.report.response.requestId, "synthetic-request");
  assert.equal(artifact.report.response.costUsd, 0.008);
  assert.equal(artifact.report.validation.valid, true);
  assert.equal(artifact.semanticPlanes.version, "semantic-planes/v1");
  assert.equal(typeof artifact.rawResponse, "string");
});

test("X1B Cloudflare durable claim blocks a second attempt and upstream failure never retries", async () => {
  let apiCalls = 0;
  const deps = dependencies({
    openAiFetch: async () => {
      apiCalls++;
      return new Response(JSON.stringify({ error: { message: "synthetic upstream failure" } }), { status: 500 });
    },
  });

  const first = await runFt161CloudflareOneShot(authorizedInput(), deps);
  const second = await runFt161CloudflareOneShot(authorizedInput(), deps);

  assert.equal(first.status, 502);
  assert.equal(first.body.artifact.report.validation.valid, false);
  assert.equal(second.status, 409);
  assert.equal(apiCalls, 1);
});

test("X1B Cloudflare malformed semantic output fails closed after one request", async () => {
  let apiCalls = 0;
  const malformed = validModelResponse();
  malformed.semanticPlanes.planes[0].ownerId = "owner-missing";
  const deps = dependencies({
    openAiFetch: async () => {
      apiCalls++;
      return new Response(JSON.stringify({ choices: [{ message: { content: JSON.stringify(malformed) } }] }), { status: 200 });
    },
  });
  const result = await runFt161CloudflareOneShot(authorizedInput(), deps);

  assert.equal(result.status, 422);
  assert.equal(result.body.ok, false);
  assert.equal(result.body.artifact.report.validation.valid, false);
  assert.match(result.body.artifact.report.validation.error, /missing owner/);
  assert.equal(apiCalls, 1);
});
