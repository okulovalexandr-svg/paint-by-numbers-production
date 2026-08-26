import { desc, eq } from "drizzle-orm";
import { getDb } from "../../../db";
import { projects } from "../../../db/schema";
import { ensureWorkspaceUser } from "../../../lib/tenant";

export async function GET() {
  const session = await ensureWorkspaceUser();
  if (!session) return Response.json({ error: "authentication required" }, { status: 401 });
  const rows = await getDb().select().from(projects)
    .where(eq(projects.organizationId, session.organizationId))
    .orderBy(desc(projects.updatedAt)).limit(100);
  return Response.json({ projects: rows });
}

export async function POST(request: Request) {
  const session = await ensureWorkspaceUser();
  if (!session) return Response.json({ error: "authentication required" }, { status: 401 });
  const payload = await request.json() as { title?: string; article?: string; colorCount?: number; paletteId?: string };
  const title = payload.title?.trim();
  const article = payload.article?.trim();
  if (!title || !article) return Response.json({ error: "title and article are required" }, { status: 400 });
  const [project] = await getDb().insert(projects).values({
    id: crypto.randomUUID(),
    organizationId: session.organizationId,
    ownerId: session.user.id,
    paletteId: payload.paletteId,
    title,
    article,
    colorCount: Math.max(8, Math.min(60, payload.colorCount ?? 30)),
  }).returning();
  return Response.json({ project }, { status: 201 });
}
