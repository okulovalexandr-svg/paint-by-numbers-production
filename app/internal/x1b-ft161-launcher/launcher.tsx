"use client";

import { useRef, useState } from "react";

import {
  X1B_BROWSER_LIVE_BODY,
  X1B_BROWSER_PRECHECK_BODY,
  X1B_ONE_SHOT_ROUTE_PATH,
  isX1bBrowserPrecheckPass,
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

function formattedResult(result: RouteResult | null) {
  if (!result) return "";
  return JSON.stringify({ status: result.status, body: result.body }, null, 2);
}

export function X1bFt161Launcher() {
  const [precheckState, setPrecheckState] = useState<LauncherState>("idle");
  const [precheckResult, setPrecheckResult] = useState<RouteResult | null>(null);
  const [liveState, setLiveState] = useState<LauncherState>("idle");
  const [liveResult, setLiveResult] = useState<RouteResult | null>(null);
  const [liveLocked, setLiveLocked] = useState(false);
  const liveDispatched = useRef(false);

  async function runPrecheck() {
    if (precheckState === "running" || liveDispatched.current) return;
    setPrecheckState("running");
    setPrecheckResult(null);
    try {
      const result = await postX1b(X1B_BROWSER_PRECHECK_BODY);
      setPrecheckResult(result);
      setPrecheckState(isX1bBrowserPrecheckPass(result.status, result.body) ? "passed" : "failed");
    } catch (error) {
      setPrecheckResult({
        status: 0,
        body: { error: error instanceof Error ? error.message : String(error) },
        rawBody: "",
      });
      setPrecheckState("failed");
    }
  }

  async function runLiveOnce() {
    if (precheckState !== "passed" || liveDispatched.current) return;
    liveDispatched.current = true;
    setLiveLocked(true);
    setLiveState("running");
    setLiveResult(null);
    try {
      const result = await postX1b(X1B_BROWSER_LIVE_BODY);
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
        <h2 style={{ fontSize: 18 }}>2. One irreversible LIVE dispatch</h2>
        <button
          data-testid="x1b-live-button"
          type="button"
          onClick={runLiveOnce}
          disabled={precheckState !== "passed" || liveLocked}
        >
          {liveState === "running" ? "LIVE dispatched — waiting…" : liveLocked ? "LIVE locked — no retry" : "RUN FT161 X1B ONCE"}
        </button>
        <p data-testid="x1b-live-status" aria-live="polite">{liveState.toUpperCase()}</p>
        {liveResult ? <pre data-testid="x1b-live-result" style={{ overflowWrap: "anywhere", whiteSpace: "pre-wrap" }}>{formattedResult(liveResult)}</pre> : null}
      </section>
    </main>
  );
}
