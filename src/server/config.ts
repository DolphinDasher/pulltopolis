import path from "node:path";

export interface ServerConfig {
  host: string;
  port: number;
  databasePath: string;
  tursoDatabaseUrl?: string;
  tursoAuthToken?: string;
  githubToken?: string;
  trustProxy: number;
  requestWindowMs: number;
  requestLimitPerIp: number;
  requestLimitPerLogin: number;
  githubRequestTimeoutMs: number;
  githubRateLimitReserve: number;
}

export function loadConfig(env: NodeJS.ProcessEnv = process.env): ServerConfig {
  const githubToken = env.GITHUB_TOKEN?.trim();
  const tursoDatabaseUrl = env.TURSO_DATABASE_URL?.trim();
  const tursoAuthToken = env.TURSO_AUTH_TOKEN?.trim();
  if (Boolean(tursoDatabaseUrl) !== Boolean(tursoAuthToken)) {
    throw new Error("TURSO_DATABASE_URL and TURSO_AUTH_TOKEN must be configured together");
  }
  const hostedDatabase =
    tursoDatabaseUrl && tursoAuthToken ? { tursoDatabaseUrl, tursoAuthToken } : {};

  return {
    host: env.HOST?.trim() || "127.0.0.1",
    port: readInteger(env.PORT, "PORT", 3000, 1, 65_535),
    databasePath: path.resolve(env.DATABASE_PATH?.trim() || "data/pulltopolis.sqlite"),
    ...hostedDatabase,
    ...(githubToken ? { githubToken } : {}),
    trustProxy: readInteger(env.TRUST_PROXY, "TRUST_PROXY", 0, 0, 10),
    requestWindowMs: readInteger(env.REQUEST_WINDOW_MS, "REQUEST_WINDOW_MS", 60_000, 1),
    requestLimitPerIp: readInteger(env.REQUEST_LIMIT_PER_IP, "REQUEST_LIMIT_PER_IP", 60, 1),
    requestLimitPerLogin: readInteger(
      env.REQUEST_LIMIT_PER_LOGIN,
      "REQUEST_LIMIT_PER_LOGIN",
      20,
      1,
    ),
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
