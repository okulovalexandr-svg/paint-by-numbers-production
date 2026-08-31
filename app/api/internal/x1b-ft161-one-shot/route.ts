import { env } from "cloudflare:workers";

import {
  FT161_CLOUDFLARE_ONE_SHOT,
  isExistingHobrukOwner,
  runFt161CloudflareOneShot,
} from "../../../../lib/semantic-plane-cloudflare-one-shot.ts";
import { getChatGPTUser } from "../../../chatgpt-auth";
import { X1B_BROWSER_CARRIED_ASSETS, sha256Hex } from "../../../../lib/x1b-browser-launcher.ts";

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

export async function POST(request: Request) {
  const identity = await getChatGPTUser();
  const runtime = env as unknown as X1BRuntime;
  let carriedFiles: Record<string, File> | null = null;

  const readRequestBody = async () => {
    if (!request.headers.get("content-type")?.startsWith("multipart/form-data")) {
      try { return await request.json(); } catch { return null; }
    }
    const form = await request.formData();
    const source = form.get(X1B_BROWSER_CARRIED_ASSETS.source.field);
    const approved = form.get(X1B_BROWSER_CARRIED_ASSETS.approved.field);
    carriedFiles = source instanceof File && approved instanceof File ? { source, approved } : null;
    return { fixture: form.get("fixture"), confirmation: form.get("confirmation") };
  };

  const loadCarriedAsset = async (path: string) => {
    const spec = path === X1B_BROWSER_CARRIED_ASSETS.source.path
      ? X1B_BROWSER_CARRIED_ASSETS.source
      : path === X1B_BROWSER_CARRIED_ASSETS.approved.path
        ? X1B_BROWSER_CARRIED_ASSETS.approved
        : null;
    if (!spec || !carriedFiles) throw new Error(`Missing browser-carried FT161 asset ${path}`);
    const file = carriedFiles[spec.field];
    if (!file || file.name !== spec.filename || file.type !== spec.type || file.size !== spec.size) {
      throw new Error(`Invalid browser-carried FT161 asset metadata for ${path}`);
    }
    const buffer = await file.arrayBuffer();
    if (await sha256Hex(buffer) !== spec.sha256) throw new Error(`Invalid browser-carried FT161 asset SHA-256 for ${path}`);
    return new Uint8Array(buffer);
  };

  const result = await runFt161CloudflareOneShot({
    authenticatedEmail: identity?.email,
    readRequestBody,
  }, {
    apiKey: runtime.OPENAI_API_KEY,
    authorizeOwner: (email) => isExistingHobrukOwner(runtime.DB, email),
    claimOnce: () => claimFt161Once(runtime.DB),
    loadAsset: loadCarriedAsset,
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
