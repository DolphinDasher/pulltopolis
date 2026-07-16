import fs from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";

import { createClient, type Client } from "@libsql/client";

const DATABASE_VERSION = 1;
const DATABASE_VERSION_KEY = "database_version";
const CREATE_DATABASE_META = `
  CREATE TABLE IF NOT EXISTS pulltopolis_meta (
    key TEXT PRIMARY KEY,
    value INTEGER NOT NULL
  ) STRICT
`;
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

export type AppDatabase = Client;

export interface OpenDatabaseOptions {
  url?: string;
  authToken?: string;
}

export async function openDatabase(
  filename: string,
  options: OpenDatabaseOptions = {},
): Promise<AppDatabase> {
  const databaseUrl = options.url ?? localDatabaseUrl(filename);
  const database = createClient({
    url: databaseUrl,
    ...(options.authToken ? { authToken: options.authToken } : {}),
  });

  try {
    if (!options.url && filename !== ":memory:") {
      await database.execute("PRAGMA journal_mode = WAL");
    }
    await database.execute("PRAGMA foreign_keys = ON");
    await database.execute(CREATE_DATABASE_META);
    const version = options.url
      ? await readHostedDatabaseVersion(database)
      : await readLocalDatabaseVersion(database);
    if (version > DATABASE_VERSION) {
      throw new Error(
        `Database version ${version} is newer than supported version ${DATABASE_VERSION}`,
      );
    }

    const statements = [
      { sql: CREATE_SNAPSHOT_CACHE },
      {
        sql: `INSERT INTO pulltopolis_meta (key, value) VALUES (?, ?)
              ON CONFLICT(key) DO UPDATE SET value = excluded.value`,
        args: [DATABASE_VERSION_KEY, DATABASE_VERSION],
      },
    ];
    if (!options.url && version < DATABASE_VERSION) {
      statements.splice(1, 0, { sql: `PRAGMA user_version = ${DATABASE_VERSION}` });
    }
    await database.batch(statements, "write");
    return database;
  } catch (error) {
    database.close();
    throw error;
  }
}

async function readLocalDatabaseVersion(database: AppDatabase): Promise<number> {
  const result = await database.execute("PRAGMA user_version");
  return Number(result.rows[0]?.user_version ?? 0);
}

async function readHostedDatabaseVersion(database: AppDatabase): Promise<number> {
  const result = await database.execute({
    sql: "SELECT value FROM pulltopolis_meta WHERE key = ?",
    args: [DATABASE_VERSION_KEY],
  });
  return Number(result.rows[0]?.value ?? 0);
}

function localDatabaseUrl(filename: string): string {
  if (filename === ":memory:") return filename;
  fs.mkdirSync(path.dirname(filename), { recursive: true });
  return pathToFileURL(filename).href;
}
