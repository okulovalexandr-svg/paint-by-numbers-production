import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

import {
  FT161_CLOUDFLARE_ONE_SHOT,
  X1B_EXISTING_OWNER_QUERY,
  X1B_HOBRUK_ORG_ID,
  isExistingHobrukOwner,
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
    authorizeOwner: async () => true,
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
    createClientRequestId: () => "synthetic-client-request",
    now: (() => { let value = 100; return () => value += 25; })(),
    ...overrides,
  };
}

function authorizedInput(overrides = {}) {
  return {
    authenticatedEmail: "owner@hobruk.test",
    readRequestBody: async () => confirmation(),
    ...overrides,
  };
}

function ownerDatabase(row, audit) {
  return {
    prepare(query) {
      audit.queries.push(query);
      const statement = {
        bind(...values) {
          audit.bindings.push(values);
          return statement;
        },
        async first() {
          audit.firstCalls++;
          return row;
        },
        async run() {
          audit.writeCalls++;
          throw new Error("authorization must never write");
        },
      };
      return statement;
    },
  };
}

test("X1B existing-owner authorization is one read-only joined query and ignores other owners", async () => {
  const scenarios = [
    { row: { matching_owner_count: 0 }, expected: false, label: "non-owner" },
    { row: { matching_owner_count: 2 }, expected: false, label: "ambiguous duplicate membership" },
    { row: { owner_count: 2, matching_owner_count: "1" }, expected: true, label: "matching owner with another owner" },
  ];

  for (const scenario of scenarios) {
    const audit = { queries: [], bindings: [], firstCalls: 0, writeCalls: 0 };
    const authorized = await isExistingHobrukOwner(
      ownerDatabase(scenario.row, audit),
      "Owner@Hobruk.Test",
    );
    assert.equal(authorized, scenario.expected, scenario.label);
    assert.deepEqual(audit.queries, [X1B_EXISTING_OWNER_QUERY]);
    assert.deepEqual(audit.bindings, [["Owner@Hobruk.Test", X1B_HOBRUK_ORG_ID]]);
    assert.equal(audit.firstCalls, 1);
    assert.equal(audit.writeCalls, 0);
    assert.match(audit.queries[0], /^SELECT\b/);
    assert.doesNotMatch(audit.queries[0], /\b(?:INSERT|UPDATE|DELETE|REPLACE|CREATE|DROP|ALTER)\b/i);
  }
});

test("X1B route source uses read-only identity authorization and has no workspace/token mutation boundary", async () => {
  const source = await readFile(new URL("../app/api/internal/x1b-ft161-one-shot/route.ts", import.meta.url), "utf8");
  assert.match(source, /getChatGPTUser/);
  assert.match(source, /isExistingHobrukOwner/);
  assert.doesNotMatch(source, /ensureWorkspaceUser/);
  const removedSecretName = ["X1B", "ONE", "SHOT", "TOKEN"].join("_");
  const removedHeaderName = ["x", "x1b", "one", "shot", "token"].join("-");
  assert.equal(source.includes(removedSecretName), false);
  assert.equal(source.includes(removedHeaderName), false);
});

test("X1B unauthenticated and non-owner requests stop before body, assets, claim, or AI", async () => {
  const audit = { auth: 0, body: 0, assets: 0, claims: 0, api: 0 };
  const deps = dependencies({
    authorizeOwner: async () => { audit.auth++; return false; },
    claimOnce: async () => { audit.claims++; return true; },
    loadAsset: async () => { audit.assets++; return approvedPng(); },
    openAiFetch: async () => { audit.api++; throw new Error("must not run"); },
  });
  const input = authorizedInput({
    readRequestBody: async () => { audit.body++; return confirmation(); },
  });

  const unauthenticated = await runFt161CloudflareOneShot({ ...input, authenticatedEmail: undefined }, deps);
  const nonOwner = await runFt161CloudflareOneShot(input, deps);

  assert.equal(unauthenticated.status, 401);
  assert.equal(unauthenticated.body.code, "x1b_unauthorized");
  assert.equal(nonOwner.status, 403);
  assert.equal(nonOwner.body.code, "x1b_owner_required");
  assert.deepEqual(audit, { auth: 1, body: 0, assets: 0, claims: 0, api: 0 });
});

test("X1B authorization DB failure fails closed before body, assets, claim, or AI", async () => {
  const audit = { body: 0, assets: 0, claims: 0, api: 0 };
  const result = await runFt161CloudflareOneShot(authorizedInput({
    readRequestBody: async () => { audit.body++; return confirmation(); },
  }), dependencies({
    authorizeOwner: async () => { throw new Error("synthetic DB failure"); },
    claimOnce: async () => { audit.claims++; return true; },
    loadAsset: async () => { audit.assets++; return approvedPng(); },
    openAiFetch: async () => { audit.api++; throw new Error("must not run"); },
  }));

  assert.equal(result.status, 503);
  assert.equal(result.body.code, "x1b_authorization_unavailable");
  assert.deepEqual(audit, { body: 0, assets: 0, claims: 0, api: 0 });
});

test("X1B exact confirmation and API-key guards both run before assets, claim, or AI", async () => {
  const audit = { assets: 0, claims: 0, api: 0 };
  const guarded = {
    claimOnce: async () => { audit.claims++; return true; },
    loadAsset: async () => { audit.assets++; return approvedPng(); },
    openAiFetch: async () => { audit.api++; throw new Error("must not run"); },
  };

  const badConfirmation = await runFt161CloudflareOneShot(
    authorizedInput({ readRequestBody: async () => ({ fixture: "FT161" }) }),
    dependencies(guarded),
  );
  const missingApiKey = await runFt161CloudflareOneShot(
    authorizedInput(),
    dependencies({ ...guarded, apiKey: undefined }),
  );

  assert.equal(badConfirmation.status, 400);
  assert.equal(badConfirmation.body.code, "x1b_confirmation_required");
  assert.equal(missingApiKey.status, 503);
  assert.equal(missingApiKey.body.code, "x1b_openai_not_configured");
  assert.deepEqual(audit, { assets: 0, claims: 0, api: 0 });
});

test("X1B successful ordering is identity owner, confirmation, key, fixed assets, claim, then one fetch", async () => {
  const order = [];
  const deps = dependencies({
    authorizeOwner: async (email) => { order.push(`owner:${email}`); return true; },
    loadAsset: async (path) => {
      order.push(`asset:${path}`);
      return path === FT161_CLOUDFLARE_ONE_SHOT.sourceAssetPath
        ? new Uint8Array([255, 216, 255, 217])
        : approvedPng();
    },
    claimOnce: async () => { order.push("claim"); return true; },
    openAiFetch: async () => {
      order.push("fetch");
      return new Response(JSON.stringify({
        choices: [{ message: { content: JSON.stringify(validModelResponse()) } }],
      }), { status: 200 });
    },
  });
  Object.defineProperty(deps, "apiKey", {
    configurable: true,
    get() { order.push("api-key"); return "synthetic-key-never-sent"; },
  });

  const result = await runFt161CloudflareOneShot(authorizedInput({
    readRequestBody: async () => { order.push("confirmation"); return confirmation(); },
  }), deps);

  assert.equal(result.status, 200);
  assert.deepEqual(order, [
    "owner:owner@hobruk.test",
    "confirmation",
    "api-key",
    `asset:${FT161_CLOUDFLARE_ONE_SHOT.sourceAssetPath}`,
    `asset:${FT161_CLOUDFLARE_ONE_SHOT.approvedAssetPath}`,
    "claim",
    "fetch",
  ]);
});

test("X1B already-claimed returns 409 after fixed validation with zero OpenAI fetches", async () => {
  let assetLoads = 0;
  let claims = 0;
  let apiCalls = 0;
  const result = await runFt161CloudflareOneShot(authorizedInput(), dependencies({
    loadAsset: async (path) => {
      assetLoads++;
      return path === FT161_CLOUDFLARE_ONE_SHOT.sourceAssetPath
        ? new Uint8Array([255, 216, 255, 217])
        : approvedPng();
    },
    claimOnce: async () => { claims++; return false; },
    openAiFetch: async () => { apiCalls++; throw new Error("must not run"); },
  }));

  assert.equal(result.status, 409);
  assert.equal(result.body.code, "x1b_already_claimed");
  assert.equal(assetLoads, 2);
  assert.equal(claims, 1);
  assert.equal(apiCalls, 0);
});

test("X1B successful path makes exactly one synthetic OpenAI fetch and returns the full artifact", async () => {
  let apiCalls = 0;
  const deps = dependencies({
    openAiFetch: async (url, init) => {
      apiCalls++;
      assert.equal(url, "https://api.openai.com/v1/chat/completions");
      assert.equal(init.headers.Authorization, "Bearer synthetic-key-never-sent");
      assert.equal(init.headers["X-Client-Request-Id"], "synthetic-client-request");
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
  assert.equal(artifact.report.request.clientRequestId, "synthetic-client-request");
  assert.equal(artifact.report.response.requestId, "synthetic-request");
  assert.equal(artifact.report.response.costUsd, 0.008);
  assert.equal(artifact.report.validation.valid, true);
  assert.equal(artifact.semanticPlanes.version, "semantic-planes/v1");
  assert.equal(typeof artifact.rawResponse, "string");
});

test("X1B transport failure consumes one claim, makes one fetch, and never retries", async () => {
  let claims = 0;
  let apiCalls = 0;
  const result = await runFt161CloudflareOneShot(authorizedInput(), dependencies({
    claimOnce: async () => { claims++; return true; },
    openAiFetch: async () => { apiCalls++; throw new Error("synthetic transport failure"); },
  }));

  assert.equal(result.status, 502);
  assert.equal(result.body.code, "x1b_transport_failed");
  assert.equal(result.body.clientRequestId, "synthetic-client-request");
  assert.equal(result.body.requestCount, 1);
  assert.equal(result.body.retryCount, 0);
  assert.equal(claims, 1);
  assert.equal(apiCalls, 1);
});

test("X1B upstream and malformed semantic failures each make one request with zero retry path", async () => {
  let upstreamCalls = 0;
  const upstream = await runFt161CloudflareOneShot(authorizedInput(), dependencies({
    openAiFetch: async () => {
      upstreamCalls++;
      return new Response(JSON.stringify({ error: { message: "synthetic upstream failure" } }), { status: 500 });
    },
  }));

  let malformedCalls = 0;
  const malformed = validModelResponse();
  malformed.semanticPlanes.planes[0].ownerId = "owner-missing";
  const invalidContract = await runFt161CloudflareOneShot(authorizedInput(), dependencies({
    openAiFetch: async () => {
      malformedCalls++;
      return new Response(JSON.stringify({ choices: [{ message: { content: JSON.stringify(malformed) } }] }), { status: 200 });
    },
  }));

  assert.equal(upstream.status, 502);
  assert.equal(upstream.body.artifact.report.request.retryCount, 0);
  assert.equal(upstreamCalls, 1);
  assert.equal(invalidContract.status, 422);
  assert.equal(invalidContract.body.artifact.report.request.retryCount, 0);
  assert.match(invalidContract.body.artifact.report.validation.error, /missing owner/);
  assert.equal(malformedCalls, 1);
});
