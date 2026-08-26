import { env } from "cloudflare:workers";
import { ensureWorkspaceUser } from "../../../lib/tenant";

const allowedTypes = new Set(["image/jpeg", "image/png"]);

export async function POST(request: Request) {
  const session = await ensureWorkspaceUser();
  if (!session) return Response.json({ error: "authentication required" }, { status: 401 });
  const data = await request.formData();
  const file = data.get("file");
  if (!(file instanceof File)) return Response.json({ error: "file is required" }, { status: 400 });
  if (!allowedTypes.has(file.type)) return Response.json({ error: "only JPG and PNG are supported" }, { status: 415 });
  if (file.size > 25 * 1024 * 1024) return Response.json({ error: "file is larger than 25 MB" }, { status: 413 });
  const safeName = file.name.replace(/[^a-zA-Z0-9._-]+/g, "-").slice(-100);
  const key = `${session.organizationId}/sources/${crypto.randomUUID()}-${safeName}`;
  await env.BUCKET.put(key, file.stream(), { httpMetadata: { contentType: file.type } });
  return Response.json({ key, name: file.name, size: file.size }, { status: 201 });
}
