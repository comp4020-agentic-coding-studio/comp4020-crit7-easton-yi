import { sql } from "drizzle-orm";
import { int, sqliteTable, text, unique } from "drizzle-orm/sqlite-core";

// The schema is the ground truth for the database. To change it: edit here,
// run `pnpm db:generate` to turn the diff into a migration under drizzle/,
// and commit both — the migration applies automatically when the server
// boots (see src/lib/db.ts), locally and deployed. Never edit the database
// by hand: state on the deployed volume outlives every deploy, and the
// migration trail is what keeps old state and new code compatible.

export const sessions = sqliteTable("sessions", {
  id: text().primaryKey(),
  tokenHash: text("token_hash").notNull(),
  createdAt: text("created_at")
    .notNull()
    .default(sql`(datetime('now'))`),
}, (table) => [unique().on(table.tokenHash)]);

export const plans = sqliteTable("plans", {
  id: text().primaryKey(),
  sessionId: text("session_id")
    .notNull()
    .references(() => sessions.id, { onDelete: "cascade" }),
  name: text().notNull(),
  datasetVersion: text("dataset_version").notNull(),
  preference: text().notNull(),
  revision: int().notNull().default(1),
  createdAt: text("created_at")
    .notNull()
    .default(sql`(datetime('now'))`),
  updatedAt: text("updated_at")
    .notNull()
    .default(sql`(datetime('now'))`),
});

export const planCourses = sqliteTable("plan_courses", {
  id: int().primaryKey({ autoIncrement: true }),
  planId: text("plan_id")
    .notNull()
    .references(() => plans.id, { onDelete: "cascade" }),
  courseId: text("course_id").notNull(),
});

export const planSelections = sqliteTable("plan_selections", {
  id: int().primaryKey({ autoIncrement: true }),
  planId: text("plan_id")
    .notNull()
    .references(() => plans.id, { onDelete: "cascade" }),
  groupId: text("group_id").notNull(),
  optionId: text("option_id").notNull(),
  isLocked: int("is_locked").notNull().default(0),
});

export const unavailableBlocks = sqliteTable("unavailable_blocks", {
  id: text().primaryKey(),
  planId: text("plan_id")
    .notNull()
    .references(() => plans.id, { onDelete: "cascade" }),
  label: text().notNull(),
  weekday: int().notNull(),
  startMinute: int("start_minute").notNull(),
  endMinute: int("end_minute").notNull(),
});

export type Session = typeof sessions.$inferSelect;
export type Plan = typeof plans.$inferSelect;
export type PlanCourse = typeof planCourses.$inferSelect;
export type PlanSelection = typeof planSelections.$inferSelect;
export type UnavailableBlock = typeof unavailableBlocks.$inferSelect;
