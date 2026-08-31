import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

import { FT161_CLOUDFLARE_ONE_SHOT } from "../lib/semantic-plane-cloudflare-one-shot.ts";
import {
  X1B_BROWSER_LAUNCHER_PATH,
  X1B_BROWSER_LIVE_BODY,
  X1B_BROWSER_PRECHECK_BODY,
  X1B_ONE_SHOT_ROUTE_PATH,
  isX1bBrowserPrecheckPass,
} from "../lib/x1b-browser-launcher.ts";

test("X1B browser launcher requires the exact safe 400 confirmation precheck", () => {
  assert.deepEqual(X1B_BROWSER_PRECHECK_BODY, { fixture: "FT161" });
  assert.equal(isX1bBrowserPrecheckPass(400, { code: "x1b_confirmation_required" }), true);
  assert.equal(isX1bBrowserPrecheckPass(401, { code: "x1b_unauthorized" }), false);
  assert.equal(isX1bBrowserPrecheckPass(400, { code: "anything_else" }), false);
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
  assert.equal(source.match(/postX1b\(X1B_BROWSER_LIVE_BODY\)/g)?.length, 1);
  assert.doesNotMatch(source, /setTimeout|setInterval/);
});
