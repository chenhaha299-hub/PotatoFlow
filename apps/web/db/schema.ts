import { index, integer, sqliteTable, text } from "drizzle-orm/sqlite-core";

export const userSnapshots = sqliteTable("user_snapshots", {
  userId: text("user_id").primaryKey(),
  payload: text("payload").notNull(),
  revision: integer("revision").notNull().default(1),
  updatedAt: text("updated_at").notNull(),
});

export const userSnapshotVersions = sqliteTable(
  "user_snapshot_versions",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    userId: text("user_id").notNull(),
    payload: text("payload").notNull(),
    revision: integer("revision").notNull(),
    archivedAt: text("archived_at").notNull(),
  },
  (table) => [
    index("idx_user_snapshot_versions_user_revision").on(
      table.userId,
      table.revision,
    ),
  ],
);
