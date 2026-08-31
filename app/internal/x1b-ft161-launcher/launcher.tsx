"use client";

import { useRef, useState } from "react";

import {
  X1B_BROWSER_CARRIED_ASSETS,
  X1B_BROWSER_LIVE_BODY,
  X1B_BROWSER_PRECHECK_BODY,
  X1B_ONE_SHOT_ROUTE_PATH,
  isX1bBrowserPrecheckPass,
  sha256Hex,
} from "../../../lib/x1b-browser-launcher.ts";

type RouteResult = {
  status: number;
  body: unknown;
  rawBody: string;
};

type LauncherState = "idle" | "running" | "passed" | "failed";

async function postX1b(body: object): Promise<RouteResult> {
  const response = await fetch(X1B_ONE_SHOT_ROUTE_PATH, {
    method: "POST",
    credentials: "same-origin",
    cache: "no-store",
    headers: {
      Accept: "application/json",
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body),
  });
  const rawBody = await response.text();
  let parsedBody: unknown = null;
  try { parsedBody = JSON.parse(rawBody) as unknown; } catch { parsedBody = rawBody; }
  return { status: response.status, body: parsedBody, rawBody };
}

async function loadCarriedAsset(spec: (typeof X1B_BROWSER_CARRIED_ASSETS)[keyof typeof X1B_BROWSER_CARRIED_ASSETS]) {
  const response = await fetch(spec.path, {
    method: "GET",
    credentials: "same-origin",
    cache: "no-store",
    headers: { Accept: spec.type },
  });
  if (!response.ok) throw new Error(`${spec.path} returned HTTP ${response.status}`);
  const bytes = await response.arrayBuffer();
  if (bytes.byteLength !== spec.size) throw new Error(`${spec.filename} size ${bytes.byteLength} != ${spec.size}`);
  const hash = await sha256Hex(bytes);
  if (hash !== spec.sha256) throw new Error(`${spec.filename} SHA-256 mismatch`);
  return new File([bytes], spec.filename, { type: spec.type });
}

async function postX1bLive(source: File, approved: File): Promise<RouteResult> {
  const body = new FormData();
  body.set("fixture", X1B_BROWSER_LIVE_BODY.fixture);
  body.set("confirmation", X1B_BROWSER_LIVE_BODY.confirmation);
  body.set(X1B_BROWSER_CARRIED_ASSETS.source.field, source);
  body.set(X1B_BROWSER_CARRIED_ASSETS.approved.field, approved);
  const response = await fetch(X1B_ONE_SHOT_ROUTE_PATH, {
    method: "POST",
    credentials: "same-origin",
    cache: "no-store",
    headers: { Accept: "application/json" },
    body,
  });
  const rawBody = await response.text();
  let parsedBody: unknown = null;
  try { parsedBody = JSON.parse(rawBody) as unknown; } catch { parsedBody = rawBody; }
  return { status: response.status, body: parsedBody, rawBody };
}

function formattedResult(result: RouteResult | null) {
  if (!result) return "";
  return JSON.stringify({ status: result.status, body: result.body }, null, 2);
}

export function X1bFt161Launcher() {
  const [precheckState, setPrecheckState] = useState<LauncherState>("idle");
  const [precheckResult, setPrecheckResult] = useState<RouteResult | null>(null);
  const [assetState, setAssetState] = useState<LauncherState>("idle");
  const [assetResult, setAssetResult] = useState<string>("");
  const [liveState, setLiveState] = useState<LauncherState>("idle");
  const [liveResult, setLiveResult] = useState<RouteResult | null>(null);
  const [liveLocked, setLiveLocked] = useState(false);
  const liveDispatched = useRef(false);
  const carriedAssets = useRef<{ source: File; approved: File } | null>(null);

  async function runPrecheck() {
    if (precheckState === "running" || liveDispatched.current) return;
    setPrecheckState("running");
    setPrecheckResult(null);
    try {
      const result = await postX1b(X1B_BROWSER_PRECHECK_BODY);
      setPrecheckResult(result);
      if (!isX1bBrowserPrecheckPass(result.status, result.body)) {
        setPrecheckState("failed");
        return;
      }
      setPrecheckState("passed");
      setAssetState("running");
      const [source, approved] = await Promise.all([
        loadCarriedAsset(X1B_BROWSER_CARRIED_ASSETS.source),
        loadCarriedAsset(X1B_BROWSER_CARRIED_ASSETS.approved),
      ]);
      carriedAssets.current = { source, approved };
      setAssetResult(`PASS — ${source.name} ${source.size} bytes; ${approved.name} ${approved.size} bytes`);
      setAssetState("passed");
    } catch (error) {
      setPrecheckResult({
        status: 0,
        body: { error: error instanceof Error ? error.message : String(error) },
        rawBody: "",
      });
      setPrecheckState("failed");
      setAssetState("failed");
    }
  }

  async function runLiveOnce() {
    if (precheckState !== "passed" || assetState !== "passed" || !carriedAssets.current || liveDispatched.current) return;
    liveDispatched.current = true;
    setLiveLocked(true);
    setLiveState("running");
    setLiveResult(null);
    try {
      const result = await postX1bLive(carriedAssets.current.source, carriedAssets.current.approved);
      setLiveResult(result);
      setLiveState(result.status === 200 || result.status === 422 ? "passed" : "failed");
    } catch (error) {
      setLiveResult({
        status: 0,
        body: {
          error: error instanceof Error ? error.message : String(error),
          warning: "LIVE dispatch may have reached the Worker; this launcher will never retry it.",
        },
        rawBody: "",
      });
      setLiveState("failed");
    }
  }

  return (
    <main style={{ margin: "0 auto", maxWidth: 920, padding: "48px 24px", fontFamily: "ui-monospace, SFMono-Regular, Menlo, monospace" }}>
      <h1 style={{ fontSize: 24 }}>FT161 X1B same-origin launcher</h1>
      <p>Temporary authenticated launcher. PRECHECK cannot create a claim or call OpenAI.</p>

      <section style={{ marginTop: 32 }}>
        <h2 style={{ fontSize: 18 }}>1. Authentication and route PRECHECK</h2>
        <button
          data-testid="x1b-precheck-button"
          type="button"
          onClick={runPrecheck}
          disabled={precheckState === "running" || liveLocked}
        >
          {precheckState === "running" ? "Running PRECHECK…" : "Run safe PRECHECK"}
        </button>
        <p data-testid="x1b-precheck-status" aria-live="polite">
          {precheckState === "passed" ? "PASS — HTTP 400 x1b_confirmation_required" : precheckState.toUpperCase()}
        </p>
        {precheckResult ? <pre data-testid="x1b-precheck-result" style={{ overflowWrap: "anywhere", whiteSpace: "pre-wrap" }}>{formattedResult(precheckResult)}</pre> : null}
      </section>

      <section style={{ marginTop: 32 }}>
        <h2 style={{ fontSize: 18 }}>2. Browser-carried asset validation</h2>
        <p data-testid="x1b-asset-status" aria-live="polite">{assetState.toUpperCase()}</p>
        {assetResult ? <pre data-testid="x1b-asset-result">{assetResult}</pre> : null}
      </section>

      <section style={{ marginTop: 32 }}>
        <h2 style={{ fontSize: 18 }}>3. One irreversible LIVE dispatch</h2>
        <button
          data-testid="x1b-live-button"
          type="button"
          onClick={runLiveOnce}
          disabled={precheckState !== "passed" || assetState !== "passed" || liveLocked}
        >
          {liveState === "running" ? "LIVE dispatched — waiting…" : liveLocked ? "LIVE locked — no retry" : "RUN FT161 X1B ONCE"}
        </button>
        <p data-testid="x1b-live-status" aria-live="polite">{liveState.toUpperCase()}</p>
        {liveResult ? <pre data-testid="x1b-live-result" style={{ overflowWrap: "anywhere", whiteSpace: "pre-wrap" }}>{formattedResult(liveResult)}</pre> : null}
      </section>
    </main>
  );
}
