import type { Express, NextFunction, Request, Response } from "express";

import type { RequestThrottle } from "./request-throttle.js";
import {
  GitHubApiError,
  GitHubRateLimitError,
  GitHubUserNotFoundError,
} from "./github/index.js";
import {
  GitHubTransportError,
  InvalidGitHubLoginError,
  normalizeGitHubLogin,
  type TownSnapshotReader,
} from "./town-snapshot-service.js";

export class TownSnapshotUnavailableError extends Error {
  constructor() {
    super("Town snapshot service is unavailable");
    this.name = new.target.name;
  }
}

export function registerTownSnapshotRoute(
  app: Express,
  reader: TownSnapshotReader | null,
  requestThrottle?: RequestThrottle,
): void {
  app.get(
    "/api/towns/:login",
    async (request: Request, response: Response, next: NextFunction) => {
      try {
        const login = normalizeGitHubLogin(
          typeof request.params.login === "string" ? request.params.login : "",
        );
        if (requestThrottle) {
          const decision = requestThrottle.check(request.ip ?? "unknown", login);
          if (!decision.allowed) {
            response.set("Retry-After", String(decision.retryAfterSeconds));
            response.status(429).json({ error: "rate_limited" });
            return;
          }
        }
        if (!reader) throw new TownSnapshotUnavailableError();
        const result = await reader.get(login);
        response.set("X-PullTopolis-Cache", result.cacheStatus).json(result.snapshot);
      } catch (error) {
        next(error);
      }
    },
  );
}

export function townApiErrorHandler(
  error: unknown,
  _request: Request,
  response: Response,
  _next: NextFunction,
): void {
  if (error instanceof InvalidGitHubLoginError) {
    response.status(400).json({ error: "invalid_login" });
    return;
  }
  if (error instanceof GitHubUserNotFoundError) {
    response.status(404).json({ error: "user_not_found" });
    return;
  }
  if (error instanceof GitHubRateLimitError) {
    const retryAfter = retryAfterSeconds(error, Date.now());
    if (retryAfter !== undefined) response.set("Retry-After", String(retryAfter));
    response.status(503).json({ error: "github_rate_limited" });
    return;
  }
  if (error instanceof TownSnapshotUnavailableError) {
    response.status(503).json({ error: "snapshot_service_unavailable" });
    return;
  }
  if (error instanceof GitHubApiError || error instanceof GitHubTransportError) {
    response.status(502).json({ error: "github_unavailable" });
    return;
  }
  console.error(
    JSON.stringify({
      event: "api_error",
      error: error instanceof Error ? error.name : "unknown",
    }),
  );
  response.status(500).json({ error: "internal_error" });
}

function retryAfterSeconds(error: GitHubRateLimitError, now: number): number | undefined {
  if (error.details.retryAfterSeconds !== undefined) return error.details.retryAfterSeconds;
  if (error.details.resetAt === undefined) return undefined;
  const resetAt = Date.parse(error.details.resetAt);
  return Number.isFinite(resetAt) ? Math.max(1, Math.ceil((resetAt - now) / 1_000)) : undefined;
}
