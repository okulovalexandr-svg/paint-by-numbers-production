import { sql } from "drizzle-orm";
import { integer, primaryKey, sqliteTable, text } from "drizzle-orm/sqlite-core";

const timestamps = {
  createdAt: text("created_at").notNull().default(sql`CURRENT_TIMESTAMP`),
  updatedAt: text("updated_at").notNull().default(sql`CURRENT_TIMESTAMP`),
};

export const organizations = sqliteTable("organizations", {
  id: text("id").primaryKey(),
  name: text("name").notNull(),
  slug: text("slug").notNull().unique(),
  status: text("status", { enum: ["active", "paused"] }).notNull().default("active"),
  quotaTotal: integer("quota_total").notNull().default(0),
  quotaUsed: integer("quota_used").notNull().default(0),
  ...timestamps,
});

export const users = sqliteTable("users", {
  id: text("id").primaryKey(),
  email: text("email").notNull().unique(),
  fullName: text("full_name"),
  ...timestamps,
});

export const memberships = sqliteTable("memberships", {
  userId: text("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  organizationId: text("organization_id").notNull().references(() => organizations.id, { onDelete: "cascade" }),
  role: text("role", { enum: ["owner", "admin", "designer", "reviewer"] }).notNull().default("designer"),
  createdAt: text("created_at").notNull().default(sql`CURRENT_TIMESTAMP`),
}, (table) => [primaryKey({ columns: [table.userId, table.organizationId] })]);

export const palettes = sqliteTable("palettes", {
  id: text("id").primaryKey(),
  organizationId: text("organization_id").notNull().references(() => organizations.id, { onDelete: "cascade" }),
  name: text("name").notNull(),
  version: integer("version").notNull().default(1),
  isDefault: integer("is_default", { mode: "boolean" }).notNull().default(false),
  ...timestamps,
});

export const paletteColors = sqliteTable("palette_colors", {
  id: text("id").primaryKey(),
  paletteId: text("palette_id").notNull().references(() => palettes.id, { onDelete: "cascade" }),
  code: text("code").notNull(),
  name: text("name").notNull(),
  hex: text("hex").notNull(),
  labL: integer("lab_l"),
  labA: integer("lab_a"),
  labB: integer("lab_b"),
  sortOrder: integer("sort_order").notNull().default(0),
  ...timestamps,
});

export const productionTemplates = sqliteTable("production_templates", {
  id: text("id").primaryKey(),
  organizationId: text("organization_id").notNull().references(() => organizations.id, { onDelete: "cascade" }),
  name: text("name").notNull(),
  kind: text("kind", { enum: ["canvas", "sticker"] }).notNull(),
  widthMm: integer("width_mm").notNull(),
  heightMm: integer("height_mm").notNull(),
  version: integer("version").notNull().default(1),
  isDefault: integer("is_default", { mode: "boolean" }).notNull().default(false),
  fileKey: text("file_key"),
  fileName: text("file_name"),
  definitionJson: text("definition_json").notNull().default("[]"),
  ...timestamps,
});

export const projects = sqliteTable("projects", {
  id: text("id").primaryKey(),
  organizationId: text("organization_id").notNull().references(() => organizations.id, { onDelete: "cascade" }),
  ownerId: text("owner_id").notNull().references(() => users.id),
  paletteId: text("palette_id").references(() => palettes.id),
  title: text("title").notNull(),
  article: text("article").notNull(),
  status: text("status", { enum: ["draft", "processing", "review", "ready"] }).notNull().default("draft"),
  colorCount: integer("color_count").notNull().default(30),
  widthMm: integer("width_mm").notNull().default(475),
  heightMm: integer("height_mm").notNull().default(575),
  sourceKey: text("source_key"),
  previewKey: text("preview_key"),
  schemeKey: text("scheme_key"),
  ...timestamps,
});

export const projectVersions = sqliteTable("project_versions", {
  id: text("id").primaryKey(),
  projectId: text("project_id").notNull().references(() => projects.id, { onDelete: "cascade" }),
  version: integer("version").notNull(),
  stateJson: text("state_json").notNull(),
  createdBy: text("created_by").notNull().references(() => users.id),
  createdAt: text("created_at").notNull().default(sql`CURRENT_TIMESTAMP`),
});

export const comments = sqliteTable("comments", {
  id: text("id").primaryKey(),
  projectId: text("project_id").notNull().references(() => projects.id, { onDelete: "cascade" }),
  authorId: text("author_id").notNull().references(() => users.id),
  body: text("body").notNull(),
  anchorX: integer("anchor_x"),
  anchorY: integer("anchor_y"),
  status: text("status", { enum: ["open", "resolved"] }).notNull().default("open"),
  ...timestamps,
});

export const quotaLedger = sqliteTable("quota_ledger", {
  id: text("id").primaryKey(),
  organizationId: text("organization_id").notNull().references(() => organizations.id, { onDelete: "cascade" }),
  projectId: text("project_id").references(() => projects.id),
  delta: integer("delta").notNull(),
  reason: text("reason").notNull(),
  createdBy: text("created_by").notNull().references(() => users.id),
  createdAt: text("created_at").notNull().default(sql`CURRENT_TIMESTAMP`),
});
