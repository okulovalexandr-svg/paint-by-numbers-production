import { env } from "cloudflare:workers";

import {
  FT161_CLOUDFLARE_ONE_SHOT,
  runFt161CloudflareOneShot,
} from "../../../../lib/semantic-plane-cloudflare-one-shot.ts";
import { ensureWorkspaceUser } from "../../../../lib/tenant";

type D1ResultLike = { meta?: { changes?: number } };
type D1StatementLike = {
  bind: (...values: unknown[]) => D1StatementLike;
  run: () => Promise<D1ResultLike>;
};
type D1DatabaseLike = {
  prepare: (query: string) => D1StatementLike;
};

type X1BRuntime = {
  DB?: D1DatabaseLike;
  OPENAI_API_KEY?: string;
  X1B_ONE_SHOT_TOKEN?: string;
};

async function claimFt161Once(database: D1DatabaseLike | undefined) {
  if (!database) throw new Error("Cloudflare D1 binding DB is unavailable");
  await database.prepare([
    "CREATE TABLE IF NOT EXISTS x1b_one_shot_claims (",
    "claim_id TEXT PRIMARY KEY NOT NULL,",
    "claimed_at TEXT NOT NULL",
    ")",
  ].join(" ")).run();
  const result = await database.prepare(
    "INSERT OR IGNORE INTO x1b_one_shot_claims (claim_id, claimed_at) VALUES (?, ?)",
  ).bind(FT161_CLOUDFLARE_ONE_SHOT.claimId, new Date().toISOString()).run();
  return result.meta?.changes === 1;
}

async function loadFixedAsset(request: Request, path: string) {
  const headers = new Headers({ Accept: "image/*" });
  for (const name of ["cookie", "authorization", "oai-sites-authorization"]) {
    const value = request.headers.get(name);
    if (value) headers.set(name, value);
  }
  const response = await fetch(new URL(path, request.url), {
    method: "GET",
    headers,
  });
  if (!response.ok) throw new Error(`Fixed FT161 asset ${path} returned HTTP ${response.status}`);
  return new Uint8Array(await response.arrayBuffer());
}

export async function POST(request: Request) {
  const session = await ensureWorkspaceUser();
  const runtime = env as unknown as X1BRuntime;
  let requestBody: unknown = null;
  try { requestBody = await request.json(); } catch { /* Exact confirmation validation returns 400. */ }

  const result = await runFt161CloudflareOneShot({
    authorized: Boolean(session),
    providedToken: request.headers.get(FT161_CLOUDFLARE_ONE_SHOT.tokenHeader) || undefined,
    requestBody,
  }, {
    apiKey: runtime.OPENAI_API_KEY,
    expectedToken: runtime.X1B_ONE_SHOT_TOKEN,
    claimOnce: () => claimFt161Once(runtime.DB),
    loadAsset: (path) => loadFixedAsset(request, path),
    openAiFetch: fetch,
  });

  return Response.json(result.body, {
    status: result.status,
    headers: {
      "Cache-Control": "no-store, max-age=0",
      "X-Content-Type-Options": "nosniff",
    },
  });
}
