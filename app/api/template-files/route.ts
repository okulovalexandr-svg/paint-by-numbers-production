import { env } from "cloudflare:workers";
import { ensureWorkspaceUser } from "../../../lib/tenant";

const allowedTypes = new Set([
  "image/svg+xml",
  "application/pdf",
  "image/png",
  "image/jpeg",
]);

export async function POST(request: Request) {
  const session = await ensureWorkspaceUser();
  if (!session) return Response.json({ error: "authentication required" }, { status: 401 });
  const data = await request.formData();
  const file = data.get("file");
  if (!(file instanceof File)) return Response.json({ error: "file is required" }, { status: 400 });
  if (!allowedTypes.has(file.type)) return Response.json({ error: "only SVG, PDF, PNG and JPG are supported" }, { status: 415 });
  if (file.size > 25 * 1024 * 1024) return Response.json({ error: "file is larger than 25 MB" }, { status: 413 });
  const safeName = file.name.replace(/[^a-zA-Z0-9._-]+/g, "-").slice(-120) || "template";
  const key = `${session.organizationId}/templates/${crypto.randomUUID()}-${safeName}`;
  await env.BUCKET.put(key, file.stream(), { httpMetadata: { contentType: file.type } });
  return Response.json({ key, name: file.name, size: file.size, type: file.type }, { status: 201 });
}
