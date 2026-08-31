import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

import { FT161_CLOUDFLARE_ONE_SHOT } from "../lib/semantic-plane-cloudflare-one-shot.ts";
import {
  X1B_BROWSER_CARRIED_ASSETS,
  X1B_BROWSER_LAUNCHER_PATH,
  X1B_BROWSER_LIVE_BODY,
  X1B_BROWSER_PRECHECK_BODY,
  X1B_ONE_SHOT_ROUTE_PATH,
  isX1bBrowserPrecheckPass,
  sha256Hex,
} from "../lib/x1b-browser-launcher.ts";

test("X1B browser launcher requires the exact safe 400 confirmation precheck", () => {
  assert.deepEqual(X1B_BROWSER_PRECHECK_BODY, { fixture: "FT161" });
  assert.equal(isX1bBrowserPrecheckPass(400, { code: "x1b_confirmation_required" }), true);
  assert.equal(isX1bBrowserPrecheckPass(401, { code: "x1b_unauthorized" }), false);
  assert.equal(isX1bBrowserPrecheckPass(400, { code: "anything_else" }), false);
});

test("X1B browser-carried assets use the committed exact metadata", async () => {
  assert.deepEqual(X1B_BROWSER_CARRIED_ASSETS.source, {
    field: "source",
    path: "/reference/history/ft161-source.jpg",
    filename: "ft161-source.jpg",
    type: "image/jpeg",
    size: 505976,
    sha256: "54dd6f95dc3497f251b6d2425a308e73a4499ccb19dc5ece112ec1150bfc78e1",
  });
  assert.equal(await sha256Hex(new TextEncoder().encode("abc").buffer), "ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad");
});

test("X1B browser launcher exposes only the exact existing one-shot contract", () => {
  assert.equal(X1B_BROWSER_LAUNCHER_PATH, "/internal/x1b-ft161-launcher");
  assert.equal(X1B_ONE_SHOT_ROUTE_PATH, "/api/internal/x1b-ft161-one-shot");
  assert.deepEqual(X1B_BROWSER_LIVE_BODY, {
    confirmation: FT161_CLOUDFLARE_ONE_SHOT.confirmation,
    fixture: "FT161",
  });
});

test("X1B browser launcher locks before dispatch and contains no retry path", async () => {
  const source = await readFile(new URL("../app/internal/x1b-ft161-launcher/launcher.tsx", import.meta.url), "utf8");
  assert.match(source, /credentials: "same-origin"/);
  assert.match(source, /liveDispatched\.current = true;\s*setLiveLocked\(true\);\s*setLiveState\("running"\);/);
  assert.equal(source.match(/postX1bLive\(carriedAssets\.current\.source, carriedAssets\.current\.approved\)/g)?.length, 1);
  assert.match(source, /new FormData\(\)/);
  assert.match(source, /Promise\.all/);
  assert.doesNotMatch(source, /setTimeout|setInterval/);
});

test("X1B route consumes carried files and never self-fetches fixed assets", async () => {
  const source = await readFile(new URL("../app/api/internal/x1b-ft161-one-shot/route.ts", import.meta.url), "utf8");
  assert.match(source, /request\.formData\(\)/);
  assert.match(source, /loadAsset: loadCarriedAsset/);
  assert.match(source, /spec\.sha256/);
  assert.doesNotMatch(source, /fetch\(new URL/);
});
