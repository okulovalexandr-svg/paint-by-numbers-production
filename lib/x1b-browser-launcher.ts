export const X1B_BROWSER_LAUNCHER_PATH = "/internal/x1b-ft161-launcher";
export const X1B_ONE_SHOT_ROUTE_PATH = "/api/internal/x1b-ft161-one-shot";

export const X1B_BROWSER_CARRIED_ASSETS = Object.freeze({
  source: Object.freeze({
    field: "source",
    path: "/reference/history/ft161-source.jpg",
    filename: "ft161-source.jpg",
    type: "image/jpeg",
    size: 505_976,
    sha256: "54dd6f95dc3497f251b6d2425a308e73a4499ccb19dc5ece112ec1150bfc78e1",
  }),
  approved: Object.freeze({
    field: "approved",
    path: "/reference/history/ft161-approved.png",
    filename: "ft161-approved.png",
    type: "image/png",
    size: 211_938,
    sha256: "c6b04afb12dd38197127d575a70c20b2da633af7317b71b54e912196078e21c2",
  }),
});

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

export function bytesToHex(bytes: Uint8Array) {
  return Array.from(bytes, (value) => value.toString(16).padStart(2, "0")).join("");
}

export async function sha256Hex(bytes: ArrayBuffer) {
  return bytesToHex(new Uint8Array(await crypto.subtle.digest("SHA-256", bytes)));
}
