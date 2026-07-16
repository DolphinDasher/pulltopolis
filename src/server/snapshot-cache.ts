import type { AppDatabase } from "./database.js";

export interface SnapshotCacheKey {
  login: string;
  schemaVersion: number;
  mappingVersion: number;
}

export interface SnapshotCacheWrite<T> extends SnapshotCacheKey {
  payload: T;
  sourceUpdatedAt: string;
  storedAt: string;
  softExpiresAt: string;
  hardExpiresAt: string;
  rateLimit?: unknown;
}

export interface SnapshotCacheHit<T> extends SnapshotCacheWrite<T> {
  freshness: "fresh" | "stale";
}

interface SnapshotCacheRow {
  login: string;
  schema_version: number;
  mapping_version: number;
  payload_json: string;
  source_updated_at: string;
  stored_at: string;
  soft_expires_at: string;
  hard_expires_at: string;
  rate_limit_json: string | null;
}

export class SnapshotCache {
  constructor(private readonly database: AppDatabase) {}

  get<T>(key: SnapshotCacheKey, now = new Date()): SnapshotCacheHit<T> | null {
    const login = normalizeLogin(key.login);
    const schemaVersion = requireVersion(key.schemaVersion, "schemaVersion");
    const mappingVersion = requireVersion(key.mappingVersion, "mappingVersion");
    const row = this.database
      .prepare(
        `SELECT login, schema_version, mapping_version, payload_json, source_updated_at,
                stored_at, soft_expires_at, hard_expires_at, rate_limit_json
           FROM snapshot_cache
          WHERE login = ? AND schema_version = ? AND mapping_version = ?`,
      )
      .get(login, schemaVersion, mappingVersion) as SnapshotCacheRow | undefined;
    if (!row) return null;

    const nowMs = now.getTime();
    if (!Number.isFinite(nowMs)) throw new TypeError("now must be a valid date");
    if (nowMs >= parseTime(row.hard_expires_at, "hard_expires_at")) return null;

    return {
      login: row.login,
      schemaVersion: row.schema_version,
      mappingVersion: row.mapping_version,
      payload: JSON.parse(row.payload_json) as T,
      sourceUpdatedAt: row.source_updated_at,
      storedAt: row.stored_at,
      softExpiresAt: row.soft_expires_at,
      hardExpiresAt: row.hard_expires_at,
      ...(row.rate_limit_json === null
        ? {}
        : { rateLimit: JSON.parse(row.rate_limit_json) as unknown }),
      freshness: nowMs < parseTime(row.soft_expires_at, "soft_expires_at") ? "fresh" : "stale",
    };
  }

  put<T>(entry: SnapshotCacheWrite<T>): void {
    const storedAt = parseTime(entry.storedAt, "storedAt");
    const softExpiresAt = parseTime(entry.softExpiresAt, "softExpiresAt");
    const hardExpiresAt = parseTime(entry.hardExpiresAt, "hardExpiresAt");
    if (storedAt > softExpiresAt || softExpiresAt > hardExpiresAt) {
      throw new RangeError("Cache times must satisfy storedAt <= softExpiresAt <= hardExpiresAt");
    }

    this.database
      .prepare(
        `INSERT INTO snapshot_cache (
           login, schema_version, mapping_version, payload_json, source_updated_at,
           stored_at, soft_expires_at, hard_expires_at, rate_limit_json
         ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
         ON CONFLICT(login, schema_version, mapping_version) DO UPDATE SET
           payload_json = excluded.payload_json,
           source_updated_at = excluded.source_updated_at,
           stored_at = excluded.stored_at,
           soft_expires_at = excluded.soft_expires_at,
           hard_expires_at = excluded.hard_expires_at,
           rate_limit_json = excluded.rate_limit_json`,
      )
      .run(
        normalizeLogin(entry.login),
        requireVersion(entry.schemaVersion, "schemaVersion"),
        requireVersion(entry.mappingVersion, "mappingVersion"),
        JSON.stringify(entry.payload),
        requireTimestamp(entry.sourceUpdatedAt, "sourceUpdatedAt"),
        entry.storedAt,
        entry.softExpiresAt,
        entry.hardExpiresAt,
        entry.rateLimit === undefined ? null : JSON.stringify(entry.rateLimit),
      );
  }
}

function normalizeLogin(login: string): string {
  const normalized = login.trim().toLowerCase();
  if (!normalized) throw new TypeError("GitHub login is required");
  return normalized;
}

function requireVersion(value: number, name: string): number {
  if (!Number.isInteger(value) || value < 1) throw new RangeError(`${name} must be a positive integer`);
  return value;
}

function requireTimestamp(value: string, name: string): string {
  parseTime(value, name);
  return value;
}

function parseTime(value: string, name: string): number {
  const parsed = Date.parse(value);
  if (!Number.isFinite(parsed)) throw new TypeError(`${name} must be an ISO timestamp`);
  return parsed;
}
