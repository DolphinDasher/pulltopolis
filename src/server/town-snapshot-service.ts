import {
  GitHubApiError,
  type GitHubGraphQLClient,
  type GitHubRateLimit,
  type GitHubUserData,
} from "./github/index.js";
import { SingleFlight } from "./single-flight.js";
import type { SnapshotCache } from "./snapshot-cache.js";
import { trailingUtcWindow, type UtcWindow } from "./time-window.js";

export type TownSnapshotCacheStatus = "fresh" | "stale" | "refreshed";

export interface TownSnapshotResult<TSnapshot> {
  snapshot: TSnapshot;
  cacheStatus: TownSnapshotCacheStatus;
}

export interface TownSnapshotReader<TSnapshot = unknown> {
  get(login: string): Promise<TownSnapshotResult<TSnapshot>>;
}

export interface TownSnapshotMappingContext {
  generatedAt: string;
  contributionWindow: UtcWindow;
}

export type TownSnapshotMapper<TSnapshot> = (
  source: GitHubUserData,
  context: TownSnapshotMappingContext,
) => TSnapshot;

export interface TownSnapshotCachePolicy {
  softTtlMs: number;
  hardTtlMs: number;
}

export interface TownSnapshotServiceOptions<TSnapshot> {
  github: Pick<GitHubGraphQLClient, "fetchUserData">;
  cache: SnapshotCache;
  map: TownSnapshotMapper<TSnapshot>;
  schemaVersion: number;
  mappingVersion: number;
  cachePolicy: TownSnapshotCachePolicy;
  clock?: () => Date;
  onBackgroundRefreshError?: (error: unknown) => void;
}

export class GitHubTransportError extends Error {
  constructor(options: ErrorOptions) {
    super("GitHub is temporarily unavailable", options);
    this.name = new.target.name;
  }
}

export class TownSnapshotService<TSnapshot> implements TownSnapshotReader<TSnapshot> {
  private readonly flights = new SingleFlight<string, TSnapshot>();
  private readonly clock: () => Date;
  private readonly onBackgroundRefreshError: (error: unknown) => void;

  constructor(private readonly options: TownSnapshotServiceOptions<TSnapshot>) {
    requireVersion(options.schemaVersion, "schemaVersion");
    requireVersion(options.mappingVersion, "mappingVersion");
    requireCachePolicy(options.cachePolicy);
    this.clock = options.clock ?? (() => new Date());
    this.onBackgroundRefreshError = options.onBackgroundRefreshError ?? (() => undefined);
  }

  async get(login: string): Promise<TownSnapshotResult<TSnapshot>> {
    const normalizedLogin = normalizeGitHubLogin(login);
    const now = this.clock();
    const key = {
      login: normalizedLogin,
      schemaVersion: this.options.schemaVersion,
      mappingVersion: this.options.mappingVersion,
    };
    const cached = this.options.cache.get<TSnapshot>(key, now);

    if (cached?.freshness === "fresh") {
      return { snapshot: cached.payload, cacheStatus: "fresh" };
    }

    if (cached?.freshness === "stale") {
      void this.flights
        .run(normalizedLogin, () => this.refresh(normalizedLogin, now))
        .catch(this.onBackgroundRefreshError);
      return { snapshot: cached.payload, cacheStatus: "stale" };
    }

    const snapshot = await this.flights.run(normalizedLogin, () =>
      this.refresh(normalizedLogin, now),
    );
    return { snapshot, cacheStatus: "refreshed" };
  }

  private async refresh(login: string, now: Date): Promise<TSnapshot> {
    const contributionWindow = trailingUtcWindow(now);
    let source: GitHubUserData;

    try {
      source = await this.options.github.fetchUserData(
        login,
        contributionWindow.from,
        contributionWindow.to,
      );
    } catch (error) {
      if (error instanceof GitHubApiError) throw error;
      throw new GitHubTransportError({ cause: error });
    }

    const generatedAt = now.toISOString();
    const snapshot = this.options.map(source, { generatedAt, contributionWindow });
    const softExpiresAt = addMilliseconds(now, this.options.cachePolicy.softTtlMs);
    const hardExpiresAt = addMilliseconds(now, this.options.cachePolicy.hardTtlMs);

    this.options.cache.put({
      login,
      schemaVersion: this.options.schemaVersion,
      mappingVersion: this.options.mappingVersion,
      payload: snapshot,
      sourceUpdatedAt: generatedAt,
      storedAt: generatedAt,
      softExpiresAt,
      hardExpiresAt,
      rateLimit: summarizeRateLimits(source.rateLimits),
    });
    return snapshot;
  }
}

export function normalizeGitHubLogin(login: string): string {
  const normalized = login.trim();
  if (
    normalized.length > 39 ||
    !/^[a-z\d](?:[a-z\d-]{0,37}[a-z\d])?$/i.test(normalized) ||
    normalized.includes("--")
  ) {
    throw new InvalidGitHubLoginError();
  }
  return normalized.toLowerCase();
}

export class InvalidGitHubLoginError extends Error {
  constructor() {
    super("Invalid GitHub login");
    this.name = new.target.name;
  }
}

function summarizeRateLimits(rateLimits: GitHubRateLimit[]): GitHubRateLimit | undefined {
  const last = rateLimits.at(-1);
  if (!last) return undefined;
  return {
    cost: rateLimits.reduce((total, item) => total + item.cost, 0),
    remaining: last.remaining,
    resetAt: last.resetAt,
  };
}

function requireVersion(value: number, name: string): void {
  if (!Number.isInteger(value) || value < 1) {
    throw new RangeError(`${name} must be a positive integer`);
  }
}

function requireCachePolicy(policy: TownSnapshotCachePolicy): void {
  if (
    !Number.isFinite(policy.softTtlMs) ||
    !Number.isFinite(policy.hardTtlMs) ||
    policy.softTtlMs < 0 ||
    policy.hardTtlMs < policy.softTtlMs
  ) {
    throw new RangeError("Cache policy must satisfy 0 <= softTtlMs <= hardTtlMs");
  }
}

function addMilliseconds(date: Date, milliseconds: number): string {
  return new Date(date.getTime() + milliseconds).toISOString();
}
