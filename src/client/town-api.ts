import { parseTownSnapshot, type TownSnapshot } from "../shared/town-snapshot.js";

export type TownCacheStatus = "fresh" | "stale" | "refreshed";

export interface TownApiResult {
  snapshot: TownSnapshot;
  cacheStatus: TownCacheStatus | null;
}

export class TownApiError extends Error {
  constructor(
    public readonly code: string,
    public readonly status: number,
    public readonly retryAfterSeconds?: number,
  ) {
    super(code);
    this.name = "TownApiError";
  }
}

type TownRequest = (input: string, init?: RequestInit) => Promise<Response>;

export async function fetchTown(
  login: string,
  request: TownRequest = fetch,
  signal?: AbortSignal,
): Promise<TownApiResult> {
  const response = await request(`/api/towns/${encodeURIComponent(normalizeTownLogin(login))}`, {
    headers: { Accept: "application/json" },
    ...(signal ? { signal } : {}),
  });

  if (!response.ok) {
    const error = await readErrorCode(response);
    const retryAfter = Number.parseInt(response.headers.get("retry-after") ?? "", 10);
    throw new TownApiError(
      error,
      response.status,
      Number.isFinite(retryAfter) ? retryAfter : undefined,
    );
  }

  const snapshot = parseTownSnapshot(await response.json());
  const cacheHeader = response.headers.get("x-pulltopolis-cache");
  return {
    snapshot,
    cacheStatus: isCacheStatus(cacheHeader) ? cacheHeader : null,
  };
}

export function normalizeTownLogin(value: string): string {
  const login = value.trim();
  return login.startsWith("@") ? login.slice(1) : login;
}

export function townErrorMessage(error: unknown): string {
  if (error instanceof TownApiError) {
    switch (error.code) {
      case "invalid_login":
        return "That is not a valid GitHub username.";
      case "user_not_found":
        return "GitHub could not find that public profile.";
      case "github_rate_limited":
        return error.retryAfterSeconds
          ? `GitHub's rate limit is resting. Try again in about ${error.retryAfterSeconds} seconds.`
          : "GitHub's rate limit is resting. Please try again later.";
      case "snapshot_service_unavailable":
        return "Town data is unavailable. Check that the server has its GitHub token.";
      case "github_unavailable":
        return "GitHub is temporarily unavailable. Please try again.";
    }
  }
  if (error instanceof TypeError && /fetch/i.test(error.message)) {
    return "The PullTopolis server could not be reached.";
  }
  return "This town could not be built. Please try again.";
}

export function cacheStatusLabel(status: TownCacheStatus | null): string {
  switch (status) {
    case "refreshed":
      return "New snapshot";
    case "fresh":
      return "Fresh cached snapshot";
    case "stale":
      return "Cached snapshot · refreshing in background";
    default:
      return "Town snapshot";
  }
}

async function readErrorCode(response: Response): Promise<string> {
  try {
    const body: unknown = await response.json();
    if (
      typeof body === "object" &&
      body !== null &&
      "error" in body &&
      typeof body.error === "string"
    ) {
      return body.error;
    }
  } catch {
    // A non-JSON upstream response is still presented as a safe generic error.
  }
  return "request_failed";
}

function isCacheStatus(value: string | null): value is TownCacheStatus {
  return value === "fresh" || value === "stale" || value === "refreshed";
}
