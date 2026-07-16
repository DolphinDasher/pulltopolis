import fs from "node:fs";
import path from "node:path";

import Database from "better-sqlite3";

const DATABASE_VERSION = 1;
const CREATE_SNAPSHOT_CACHE = `
  CREATE TABLE IF NOT EXISTS snapshot_cache (
    login TEXT NOT NULL COLLATE NOCASE,
    schema_version INTEGER NOT NULL,
    mapping_version INTEGER NOT NULL,
    payload_json TEXT NOT NULL CHECK (json_valid(payload_json)),
    source_updated_at TEXT NOT NULL,
    stored_at TEXT NOT NULL,
    soft_expires_at TEXT NOT NULL,
    hard_expires_at TEXT NOT NULL,
    rate_limit_json TEXT CHECK (rate_limit_json IS NULL OR json_valid(rate_limit_json)),
    PRIMARY KEY (login, schema_version, mapping_version)
  ) STRICT
`;

export type AppDatabase = Database.Database;

export function openDatabase(filename: string): AppDatabase {
  if (filename !== ":memory:") fs.mkdirSync(path.dirname(filename), { recursive: true });
  const database = new Database(filename);

  try {
    database.pragma("journal_mode = WAL");
    database.pragma("foreign_keys = ON");
    const version = database.pragma("user_version", { simple: true }) as number;
    if (version > DATABASE_VERSION) {
      throw new Error(
        `Database version ${version} is newer than supported version ${DATABASE_VERSION}`,
      );
    }

    database.transaction(() => {
      database.exec(CREATE_SNAPSHOT_CACHE);
      if (version < DATABASE_VERSION) database.pragma(`user_version = ${DATABASE_VERSION}`);
    })();
    return database;
  } catch (error) {
    database.close();
    throw error;
  }
}
