import { createApp } from "./app.js";
import type { ServerConfig } from "./config.js";
import { openDatabase } from "./database.js";
import { GitHubGraphQLClient } from "./github/index.js";
import { RequestThrottle } from "./request-throttle.js";
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
): Promise<{
  app: ReturnType<typeof createApp>;
  cache: SnapshotCache;
  github: GitHubGraphQLClient | null;
  townSnapshots: TownSnapshotService<TSnapshot> | null;
  close: () => void;
}> {
  return createInitializedRuntime(config, options);
}

async function createInitializedRuntime<TSnapshot>(
  config: ServerConfig,
  options: RuntimeOptions<TSnapshot>,
) {
  const database = await openDatabase(config.databasePath, {
    ...(config.tursoDatabaseUrl ? { url: config.tursoDatabaseUrl } : {}),
    ...(config.tursoAuthToken ? { authToken: config.tursoAuthToken } : {}),
  });
  const cache = new SnapshotCache(database);
  await cache.purgeExpired();
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
          onBackgroundRefreshError: (error) => {
            console.error(
              JSON.stringify({
                event: "snapshot_refresh_failed",
                error: error instanceof Error ? error.name : "unknown",
              }),
            );
          },
        })
      : null;
  const app = createApp(
    { githubConfigured: github !== null, databaseReady: true },
    {
      townSnapshots,
      requestThrottle: new RequestThrottle({
        windowMs: config.requestWindowMs,
        perIpLimit: config.requestLimitPerIp,
        perLoginLimit: config.requestLimitPerLogin,
      }),
      trustProxy: config.trustProxy,
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
