import { env } from "cloudflare:workers";

import {
  FT161_CLOUDFLARE_ONE_SHOT,
  isExistingHobrukOwner,
  runFt161CloudflareOneShot,
} from "../../../../lib/semantic-plane-cloudflare-one-shot.ts";
import { getChatGPTUser } from "../../../chatgpt-auth";

type D1ResultLike = { meta?: { changes?: number } };
type D1StatementLike = {
  bind: (...values: unknown[]) => D1StatementLike;
  first: <T>() => Promise<T | null>;
  run: () => Promise<D1ResultLike>;
};
type D1DatabaseLike = {
  prepare: (query: string) => D1StatementLike;
};

type X1BRuntime = {
  DB?: D1DatabaseLike;
  OPENAI_API_KEY?: string;
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
  const identity = await getChatGPTUser();
  const runtime = env as unknown as X1BRuntime;

  const result = await runFt161CloudflareOneShot({
    authenticatedEmail: identity?.email,
    readRequestBody: async () => {
      try { return await request.json(); } catch { return null; }
    },
  }, {
    apiKey: runtime.OPENAI_API_KEY,
    authorizeOwner: (email) => isExistingHobrukOwner(runtime.DB, email),
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
