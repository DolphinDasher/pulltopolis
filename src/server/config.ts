import path from "node:path";

export interface ServerConfig {
  host: string;
  port: number;
  databasePath: string;
  githubToken?: string;
  githubRequestTimeoutMs: number;
  githubRateLimitReserve: number;
}

export function loadConfig(env: NodeJS.ProcessEnv = process.env): ServerConfig {
  const githubToken = env.GITHUB_TOKEN?.trim();

  return {
    host: env.HOST?.trim() || "127.0.0.1",
    port: readInteger(env.PORT, "PORT", 3000, 1, 65_535),
    databasePath: path.resolve(env.DATABASE_PATH?.trim() || "data/pulltopolis.sqlite"),
    ...(githubToken ? { githubToken } : {}),
    githubRequestTimeoutMs: readInteger(
      env.GITHUB_REQUEST_TIMEOUT_MS,
      "GITHUB_REQUEST_TIMEOUT_MS",
      10_000,
      1,
    ),
    githubRateLimitReserve: readInteger(
      env.GITHUB_RATE_LIMIT_RESERVE,
      "GITHUB_RATE_LIMIT_RESERVE",
      100,
      0,
    ),
  };
}

function readInteger(
  value: string | undefined,
  name: string,
  fallback: number,
  minimum: number,
  maximum = Number.MAX_SAFE_INTEGER,
): number {
  if (value === undefined || value.trim() === "") return fallback;
  if (!/^\d+$/.test(value)) throw new Error(`${name} must be an integer`);

  const parsed = Number.parseInt(value, 10);
  if (!Number.isSafeInteger(parsed) || parsed < minimum || parsed > maximum) {
    throw new Error(`${name} must be between ${minimum} and ${maximum}`);
  }
  return parsed;
}
