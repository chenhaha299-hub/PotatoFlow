const CREATE_SNAPSHOTS = `
CREATE TABLE IF NOT EXISTS user_snapshots (
  user_id TEXT PRIMARY KEY NOT NULL,
  payload TEXT NOT NULL,
  revision INTEGER NOT NULL DEFAULT 1,
  updated_at TEXT NOT NULL
)`;

const CREATE_VERSIONS = `
CREATE TABLE IF NOT EXISTS user_snapshot_versions (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id TEXT NOT NULL,
  payload TEXT NOT NULL,
  revision INTEGER NOT NULL,
  archived_at TEXT NOT NULL
)`;

const CREATE_VERSIONS_INDEX = `
CREATE INDEX IF NOT EXISTS idx_user_snapshot_versions_user_revision
ON user_snapshot_versions(user_id, revision)
`;

export type CloudSnapshot = {
  payload: string;
  revision: number;
  updatedAt: string;
};

async function database() {
  const { env } = await import("cloudflare:workers");
  if (!env.DB) throw new Error("Cloud sync database is unavailable.");
  return env.DB;
}

export async function ensureSyncSchema() {
  const db = await database();
  await db.batch([
    db.prepare(CREATE_SNAPSHOTS),
    db.prepare(CREATE_VERSIONS),
    db.prepare(CREATE_VERSIONS_INDEX),
  ]);
}

export async function readCloudSnapshot(
  userId: string,
): Promise<CloudSnapshot | null> {
  const db = await database();
  const row = await db
    .prepare(
      "SELECT payload, revision, updated_at AS updatedAt FROM user_snapshots WHERE user_id = ?1",
    )
    .bind(userId)
    .first<CloudSnapshot>();
  return row || null;
}

export async function createCloudSnapshot(
  userId: string,
  payload: string,
): Promise<CloudSnapshot | null> {
  const now = new Date().toISOString();
  const db = await database();
  const result = await db
    .prepare(
      "INSERT INTO user_snapshots (user_id, payload, revision, updated_at) VALUES (?1, ?2, 1, ?3) ON CONFLICT(user_id) DO NOTHING",
    )
    .bind(userId, payload, now)
    .run();
  return result.meta.changes === 1
    ? { payload, revision: 1, updatedAt: now }
    : null;
}

export async function updateCloudSnapshot(
  userId: string,
  payload: string,
  baseRevision: number,
): Promise<CloudSnapshot | null> {
  const current = await readCloudSnapshot(userId);
  if (!current || current.revision !== baseRevision) return null;

  const now = new Date().toISOString();
  const nextRevision = baseRevision + 1;
  const db = await database();
  const result = await db
    .prepare(
      "UPDATE user_snapshots SET payload = ?1, revision = ?2, updated_at = ?3 WHERE user_id = ?4 AND revision = ?5",
    )
    .bind(payload, nextRevision, now, userId, baseRevision)
    .run();
  if (result.meta.changes !== 1) return null;

  await db.batch([
    db
      .prepare(
        "INSERT INTO user_snapshot_versions (user_id, payload, revision, archived_at) VALUES (?1, ?2, ?3, ?4)",
      )
      .bind(userId, current.payload, current.revision, now),
    db
      .prepare(
        "DELETE FROM user_snapshot_versions WHERE user_id = ?1 AND id NOT IN (SELECT id FROM user_snapshot_versions WHERE user_id = ?1 ORDER BY revision DESC LIMIT 10)",
      )
      .bind(userId),
  ]);

  return { payload, revision: nextRevision, updatedAt: now };
}
