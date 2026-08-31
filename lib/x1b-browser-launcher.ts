export const X1B_BROWSER_LAUNCHER_PATH = "/internal/x1b-ft161-launcher";
export const X1B_ONE_SHOT_ROUTE_PATH = "/api/internal/x1b-ft161-one-shot";

export const X1B_BROWSER_PRECHECK_BODY = Object.freeze({
  fixture: "FT161",
});

export const X1B_BROWSER_LIVE_BODY = Object.freeze({
  confirmation: "RUN_FT161_X1B_ONCE",
  fixture: "FT161",
});

export function isX1bBrowserPrecheckPass(status: number, body: unknown) {
  if (status !== 400 || !body || typeof body !== "object" || Array.isArray(body)) return false;
  return (body as Record<string, unknown>).code === "x1b_confirmation_required";
}
