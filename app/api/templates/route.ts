import { and, asc, eq } from "drizzle-orm";
import { getDb } from "../../../db";
import { productionTemplates } from "../../../db/schema";
import { ensureWorkspaceUser } from "../../../lib/tenant";

type TemplateRow = typeof productionTemplates.$inferSelect;

function parseElements(value: string) {
  try {
    const parsed = JSON.parse(value);
    return Array.isArray(parsed) ? parsed.filter((item): item is string => typeof item === "string") : [];
  } catch {
    return [];
  }
}

function present(row: TemplateRow) {
  return {
    id: row.id,
    name: row.name,
    kind: row.kind,
    widthMm: row.widthMm,
    heightMm: row.heightMm,
    version: row.version,
    isDefault: row.isDefault,
    fileName: row.fileName ?? undefined,
    updated: row.updatedAt,
    elements: parseElements(row.definitionJson),
  };
}

export async function GET() {
  const session = await ensureWorkspaceUser();
  if (!session) return Response.json({ error: "authentication required" }, { status: 401 });
  const rows = await getDb().select().from(productionTemplates)
    .where(eq(productionTemplates.organizationId, session.organizationId))
    .orderBy(asc(productionTemplates.kind), asc(productionTemplates.name));
  return Response.json({ templates: rows.map(present) });
}

export async function POST(request: Request) {
  const session = await ensureWorkspaceUser();
  if (!session) return Response.json({ error: "authentication required" }, { status: 401 });
  const payload = await request.json() as {
    id?: string;
    name?: string;
    kind?: "canvas" | "sticker";
    widthMm?: number;
    heightMm?: number;
    version?: number;
    isDefault?: boolean;
    fileKey?: string;
    fileName?: string;
    elements?: string[];
  };
  const name = payload.name?.trim();
  if (!name || !["canvas", "sticker"].includes(payload.kind ?? "")) {
    return Response.json({ error: "name and valid kind are required" }, { status: 400 });
  }
  const widthMm = Math.round(Number(payload.widthMm));
  const heightMm = Math.round(Number(payload.heightMm));
  if (!Number.isFinite(widthMm) || !Number.isFinite(heightMm) || widthMm < 10 || heightMm < 10 || widthMm > 5000 || heightMm > 5000) {
    return Response.json({ error: "template dimensions must be between 10 and 5000 mm" }, { status: 400 });
  }
  const id = payload.id && /^[0-9a-f-]{36}$/i.test(payload.id) ? payload.id : crypto.randomUUID();
  const elements = (payload.elements ?? []).filter((item): item is string => typeof item === "string").slice(0, 30).map((item) => item.slice(0, 100));
  const db = getDb();
  if (payload.isDefault) {
    await db.update(productionTemplates).set({ isDefault: false })
      .where(and(eq(productionTemplates.organizationId, session.organizationId), eq(productionTemplates.kind, payload.kind!)));
  }
  const [row] = await db.insert(productionTemplates).values({
    id,
    organizationId: session.organizationId,
    name: name.slice(0, 160),
    kind: payload.kind!,
    widthMm,
    heightMm,
    version: Math.max(1, Math.round(payload.version ?? 1)),
    isDefault: Boolean(payload.isDefault),
    fileKey: payload.fileKey?.slice(0, 500),
    fileName: payload.fileName?.slice(0, 180),
    definitionJson: JSON.stringify(elements),
  }).returning();
  return Response.json({ template: present(row) }, { status: 201 });
}

export async function PATCH(request: Request) {
  const session = await ensureWorkspaceUser();
  if (!session) return Response.json({ error: "authentication required" }, { status: 401 });
  const payload = await request.json() as { id?: string; isDefault?: boolean };
  if (!payload.id) return Response.json({ error: "template id is required" }, { status: 400 });
  const db = getDb();
  const [existing] = await db.select().from(productionTemplates)
    .where(and(eq(productionTemplates.id, payload.id), eq(productionTemplates.organizationId, session.organizationId))).limit(1);
  if (!existing) return Response.json({ error: "template not found" }, { status: 404 });
  if (payload.isDefault) {
    await db.update(productionTemplates).set({ isDefault: false, updatedAt: new Date().toISOString() })
      .where(and(eq(productionTemplates.organizationId, session.organizationId), eq(productionTemplates.kind, existing.kind)));
  }
  const [row] = await db.update(productionTemplates).set({
    isDefault: Boolean(payload.isDefault),
    updatedAt: new Date().toISOString(),
  }).where(and(eq(productionTemplates.id, existing.id), eq(productionTemplates.organizationId, session.organizationId))).returning();
  return Response.json({ template: present(row) });
}
