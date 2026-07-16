import { createApp } from "./app.js";
import type { ServerConfig } from "./config.js";
import { openDatabase } from "./database.js";
import { GitHubGraphQLClient } from "./github/index.js";
import { SnapshotCache } from "./snapshot-cache.js";
import {
  TownSnapshotService,
  type TownSnapshotCachePolicy,
  type TownSnapshotMapper,
} from "./town-snapshot-service.js";

export interface TownSnapshotRuntimeOptions<TSnapshot> {
  map: TownSnapshotMapper<TSnapshot>;
  schemaVersion: number;
  mappingVersion: number;
  cachePolicy: TownSnapshotCachePolicy;
}

export interface RuntimeOptions<TSnapshot> {
  townSnapshots?: TownSnapshotRuntimeOptions<TSnapshot>;
  staticDirectory?: string;
}

export function createRuntime<TSnapshot = never>(
  config: ServerConfig,
  options: RuntimeOptions<TSnapshot> = {},
) {
  const database = openDatabase(config.databasePath);
  const cache = new SnapshotCache(database);
  const github = config.githubToken
    ? new GitHubGraphQLClient({
        token: config.githubToken,
        timeoutMs: config.githubRequestTimeoutMs,
        rateLimitReserve: config.githubRateLimitReserve,
      })
    : null;
  const townSnapshots =
    github && options.townSnapshots
      ? new TownSnapshotService({
          github,
          cache,
          ...options.townSnapshots,
        })
      : null;
  const app = createApp(
    { githubConfigured: github !== null, databaseReady: true },
    {
      townSnapshots,
      ...(options.staticDirectory ? { staticDirectory: options.staticDirectory } : {}),
    },
  );

  return {
    app,
    cache,
    github,
    townSnapshots,
    close: () => database.close(),
  };
}
