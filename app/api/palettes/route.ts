import { and, asc, eq } from "drizzle-orm";
import { getDb } from "../../../db";
import { paletteColors, palettes } from "../../../db/schema";
import { ensureWorkspaceUser } from "../../../lib/tenant";

export async function GET() {
  const session = await ensureWorkspaceUser();
  if (!session) return Response.json({ error: "authentication required" }, { status: 401 });
  const db = getDb();
  const rows = await db.select().from(palettes)
    .where(eq(palettes.organizationId, session.organizationId))
    .orderBy(asc(palettes.name));
  const colors = rows.length
    ? await db.select().from(paletteColors).where(eq(paletteColors.paletteId, rows[0].id)).orderBy(asc(paletteColors.sortOrder))
    : [];
  return Response.json({ palettes: rows, colors });
}

export async function POST(request: Request) {
  const session = await ensureWorkspaceUser();
  if (!session) return Response.json({ error: "authentication required" }, { status: 401 });
  const payload = await request.json() as { paletteId?: string; code?: string; name?: string; hex?: string; sortOrder?: number };
  if (!payload.paletteId || !payload.code?.trim() || !payload.name?.trim() || !/^#[0-9a-f]{6}$/i.test(payload.hex ?? "")) {
    return Response.json({ error: "valid paletteId, code, name and hex are required" }, { status: 400 });
  }
  const db = getDb();
  const [ownedPalette] = await db.select().from(palettes).where(and(
    eq(palettes.id, payload.paletteId), eq(palettes.organizationId, session.organizationId),
  )).limit(1);
  if (!ownedPalette) return Response.json({ error: "palette not found" }, { status: 404 });
  const [color] = await db.insert(paletteColors).values({
    id: crypto.randomUUID(), paletteId: ownedPalette.id, code: payload.code.trim(),
    name: payload.name.trim(), hex: payload.hex!.toUpperCase(), sortOrder: payload.sortOrder ?? 0,
  }).returning();
  return Response.json({ color }, { status: 201 });
}
