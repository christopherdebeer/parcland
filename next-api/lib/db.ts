import { createClient } from "@libsql/client";

// Create a singleton client instance
let client: ReturnType<typeof createClient> | null = null;

export function getDbClient() {
  if (!client) {
    const url = process.env.SQLITE_DB_TURSO_DATABASE_URL;
    const authToken = process.env.SQLITE_DB_TURSO_AUTH_TOKEN;

    if (!url || !authToken) {
      throw new Error(
        "Missing required environment variables: SQLITE_DB_TURSO_DATABASE_URL and SQLITE_DB_TURSO_AUTH_TOKEN"
      );
    }

    client = createClient({
      url,
      authToken,
    });
  }

  return client;
}

// Initialize database schema
export async function initializeDatabase() {
  const db = getDbClient();

  await db.execute(`
    CREATE TABLE IF NOT EXISTS canvas_data (
      namespace TEXT NOT NULL,
      id TEXT NOT NULL,
      data TEXT NOT NULL,
      created_at INTEGER DEFAULT (unixepoch()),
      updated_at INTEGER DEFAULT (unixepoch()),
      PRIMARY KEY (namespace, id)
    )
  `);

  await db.execute(`
    CREATE INDEX IF NOT EXISTS idx_canvas_updated
    ON canvas_data(updated_at)
  `);
}
