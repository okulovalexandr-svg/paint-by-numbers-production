import { eq } from "drizzle-orm";
import { getChatGPTUser } from "../app/chatgpt-auth";
import { getDb } from "../db";
import { memberships, organizations, palettes, productionTemplates, users } from "../db/schema";

const HOBRUK_ORG_ID = "org_hobruk";
const HOBRUK_PALETTE_ID = "palette_hobruk_v1";

export async function ensureWorkspaceUser() {
  const identity = await getChatGPTUser();
  if (!identity) return null;

  const db = getDb();
  const userId = `user_${identity.email.toLowerCase()}`;
  await db.insert(users).values({
    id: userId,
    email: identity.email.toLowerCase(),
    fullName: identity.fullName,
  }).onConflictDoUpdate({
    target: users.email,
    set: { fullName: identity.fullName, updatedAt: new Date().toISOString() },
  });

  await db.insert(organizations).values({
    id: HOBRUK_ORG_ID,
    name: "Hobruk",
    slug: "hobruk",
    quotaTotal: 50,
    quotaUsed: 18,
  }).onConflictDoNothing();

  await db.insert(memberships).values({
    userId,
    organizationId: HOBRUK_ORG_ID,
    role: "owner",
  }).onConflictDoNothing();

  await db.insert(palettes).values({
    id: HOBRUK_PALETTE_ID,
    organizationId: HOBRUK_ORG_ID,
    name: "Hobruk Production",
    version: 1,
    isDefault: true,
  }).onConflictDoNothing();

  await db.insert(productionTemplates).values([
    {
      id: "tpl-canvas-main",
      organizationId: HOBRUK_ORG_ID,
      name: "Холст 40×50 · основной",
      kind: "canvas",
      widthMm: 475,
      heightMm: 575,
      version: 3,
      isDefault: true,
      definitionJson: JSON.stringify(["Артикул", "QR контрольного листа", "QR инструкции", "Техническая рамка"]),
    },
    {
      id: "tpl-canvas-oem",
      organizationId: HOBRUK_ORG_ID,
      name: "Холст OEM · 2 QR",
      kind: "canvas",
      widthMm: 475,
      heightMm: 575,
      version: 2,
      definitionJson: JSON.stringify(["Логотип производителя", "Артикул", "QR контрольного листа", "QR сборки", "Номер партии"]),
    },
    {
      id: "tpl-sticker-box",
      organizationId: HOBRUK_ORG_ID,
      name: "Стикер на коробку 90×120",
      kind: "sticker",
      widthMm: 90,
      heightMm: 120,
      version: 5,
      isDefault: true,
      definitionJson: JSON.stringify(["Превью", "Артикул", "Штрихкод", "Количество цветов"]),
    },
  ]).onConflictDoNothing();

  const [user] = await db.select().from(users).where(eq(users.id, userId)).limit(1);
  return { user, organizationId: HOBRUK_ORG_ID, paletteId: HOBRUK_PALETTE_ID };
}
