import {
  CONTRIBUTED_REPOSITORIES_QUERY,
  OWNED_REPOSITORIES_QUERY,
  PROFILE_ACTIVITY_QUERY,
} from "./queries.js";
import {
  GitHubGraphQLError,
  GitHubHttpError,
  GitHubProtocolError,
  GitHubRateLimitError,
  GitHubUserNotFoundError,
} from "./errors.js";
import type {
  ContributedRepositoriesQueryData,
  GitHubProfileResult,
  GitHubRateLimit,
  GitHubRepository,
  GitHubRepositoryResult,
  GitHubUserData,
  GraphQLErrorShape,
  GraphQLResponse,
  OwnedRepositoriesQueryData,
  ProfileActivityQueryData,
  RepositoryConnection,
} from "./types.js";

const DEFAULT_ENDPOINT = "https://api.github.com/graphql";

export interface GitHubGraphQLClientOptions {
  token: string;
  endpoint?: string;
  fetch?: typeof globalThis.fetch;
  timeoutMs?: number;
  /** Do not begin another request at or below this remaining-point threshold. */
  rateLimitReserve?: number;
  /** Safety guard only: exceeding it throws and never returns truncated data. */
  maxRepositoryPages?: number;
  userAgent?: string;
}

type Variables = Record<string, string | null>;

export class GitHubGraphQLClient {
  private readonly endpoint: string;
  private readonly fetchImplementation: typeof globalThis.fetch;
  private readonly timeoutMs: number;
  private readonly rateLimitReserve: number;
  private readonly maxRepositoryPages: number;
  private readonly userAgent: string;
  private readonly token: string;

  constructor(options: GitHubGraphQLClientOptions) {
    if (!options.token.trim()) throw new TypeError("A server-side GitHub token is required");
    if (options.timeoutMs !== undefined && options.timeoutMs <= 0) {
      throw new RangeError("timeoutMs must be positive");
    }
    if (options.rateLimitReserve !== undefined && options.rateLimitReserve < 0) {
      throw new RangeError("rateLimitReserve cannot be negative");
    }
    if (options.maxRepositoryPages !== undefined && options.maxRepositoryPages <= 0) {
      throw new RangeError("maxRepositoryPages must be positive");
    }

    this.token = options.token.trim();
    this.endpoint = options.endpoint ?? DEFAULT_ENDPOINT;
    this.fetchImplementation = options.fetch ?? globalThis.fetch;
    this.timeoutMs = options.timeoutMs ?? 10_000;
    this.rateLimitReserve = options.rateLimitReserve ?? 0;
    this.maxRepositoryPages = options.maxRepositoryPages ?? 100;
    this.userAgent = options.userAgent ?? "PullTopolis-MVP";
  }

  async fetchProfileActivity(
    login: string,
    from: string,
    to: string,
  ): Promise<GitHubProfileResult> {
    const data = await this.request<ProfileActivityQueryData>(PROFILE_ACTIVITY_QUERY, {
      login: requireLogin(login),
      from,
      to,
    });
    assertRateLimit(data.rateLimit);
    if (!data.user) throw new GitHubUserNotFoundError(login);
    return { profile: data.user, rateLimit: data.rateLimit };
  }

  fetchOwnedRepositories(login: string): Promise<GitHubRepositoryResult> {
    return this.fetchRepositoryConnection(
      requireLogin(login),
      OWNED_REPOSITORIES_QUERY,
      (data: OwnedRepositoriesQueryData) => data.user?.repositories,
    );
  }

  fetchContributedRepositories(login: string): Promise<GitHubRepositoryResult> {
    return this.fetchRepositoryConnection(
      requireLogin(login),
      CONTRIBUTED_REPOSITORIES_QUERY,
      (data: ContributedRepositoriesQueryData) => data.user?.repositoriesContributedTo,
    );
  }

  async fetchUserData(login: string, from: string, to: string): Promise<GitHubUserData> {
    const profile = await this.fetchProfileActivity(login, from, to);
    this.assertRequestBudget(profile.rateLimit, "owned repositories");

    const owned = await this.fetchOwnedRepositories(login);
    this.assertRequestBudget(last(owned.rateLimits), "contributed repositories");

    const contributed = await this.fetchContributedRepositories(login);
    const ownedIds = new Set(owned.repositories.map(({ id }) => id));

    return {
      profile: profile.profile,
      ownedRepositories: owned.repositories,
      contributedRepositories: contributed.repositories.filter(({ id }) => !ownedIds.has(id)),
      rateLimits: [profile.rateLimit, ...owned.rateLimits, ...contributed.rateLimits],
    };
  }

  private async fetchRepositoryConnection<TData>(
    login: string,
    query: string,
    selectConnection: (data: TData) => RepositoryConnection | null | undefined,
  ): Promise<GitHubRepositoryResult> {
    const repositories = new Map<string, GitHubRepository>();
    const rateLimits: GitHubRateLimit[] = [];
    const cursors = new Set<string>();
    let after: string | null = null;

    for (let page = 1; page <= this.maxRepositoryPages; page += 1) {
      const data = await this.request<TData>(query, { login, after });
      const connection = selectConnection(data);
      const rateLimit = readRateLimit(data);
      rateLimits.push(rateLimit);
      if (!connection) throw new GitHubUserNotFoundError(login);
      assertConnection(connection);

      for (const repository of connection.nodes ?? []) {
        if (repository) repositories.set(repository.id, repository);
      }

      if (!connection.pageInfo.hasNextPage) {
        return { repositories: [...repositories.values()], rateLimits };
      }

      this.assertRequestBudget(rateLimit, "next repository page");
      const cursor = connection.pageInfo.endCursor;
      if (!cursor || cursors.has(cursor)) {
        throw new GitHubProtocolError("GitHub returned an invalid repository pagination cursor");
      }
      cursors.add(cursor);
      after = cursor;
    }

    throw new GitHubProtocolError(
      `GitHub repository pagination exceeded ${this.maxRepositoryPages} pages`,
    );
  }

  private async request<TData>(query: string, variables: Variables): Promise<TData> {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), this.timeoutMs);

    try {
      const response = await this.fetchImplementation(this.endpoint, {
        method: "POST",
        headers: {
          Accept: "application/vnd.github+json",
          Authorization: `Bearer ${this.token}`,
          "Content-Type": "application/json",
          "User-Agent": this.userAgent,
        },
        body: JSON.stringify({ query, variables }),
        signal: controller.signal,
      });
      const payload = await readResponse(response);

      if (!response.ok) throwHttpError(response, payload);
      if (!isObject(payload)) {
        throw new GitHubProtocolError("GitHub returned a non-object GraphQL response");
      }

      const envelope = payload as GraphQLResponse<TData>;
      if (Array.isArray(envelope.errors) && envelope.errors.length > 0) {
        throwGraphQLErrors(envelope.errors, response);
      }
      if (!isObject(envelope.data)) {
        throw new GitHubProtocolError("GitHub GraphQL response did not include data");
      }
      return envelope.data as TData;
    } finally {
      clearTimeout(timeout);
    }
  }

  private assertRequestBudget(rateLimit: GitHubRateLimit, nextOperation: string): void {
    if (rateLimit.remaining <= this.rateLimitReserve) {
      throw new GitHubRateLimitError(
        `GitHub rate-limit reserve reached before ${nextOperation}`,
        { remaining: rateLimit.remaining, resetAt: rateLimit.resetAt },
      );
    }
  }
}

async function readResponse(response: Response): Promise<unknown> {
  const text = await response.text();
  if (!text) return null;
  try {
    return JSON.parse(text) as unknown;
  } catch {
    throw new GitHubProtocolError(`GitHub returned an invalid JSON response (${response.status})`);
  }
}

function throwHttpError(response: Response, payload: unknown): never {
  const remaining = optionalInteger(response.headers.get("x-ratelimit-remaining"));
  const resetAt = epochToIso(response.headers.get("x-ratelimit-reset"));
  const retryAfterSeconds = optionalInteger(response.headers.get("retry-after"));
  const message = readMessage(payload) ?? `GitHub request failed with HTTP ${response.status}`;

  if (response.status === 429 || retryAfterSeconds !== undefined || remaining === 0) {
    throw new GitHubRateLimitError(message, {
      status: response.status,
      ...(remaining === undefined ? {} : { remaining }),
      ...(resetAt === undefined ? {} : { resetAt }),
      ...(retryAfterSeconds === undefined ? {} : { retryAfterSeconds }),
    });
  }
  throw new GitHubHttpError(message, response.status);
}

function throwGraphQLErrors(errors: GraphQLErrorShape[], response: Response): never {
  const rateLimited = errors.some(
    ({ type, extensions }) =>
      type === "RATE_LIMITED" || extensions?.type === "RATE_LIMITED",
  );
  if (rateLimited) {
    throw new GitHubRateLimitError(errors.map(({ message }) => message).join("; "), {
      ...optionalRateLimitDetails(response),
    });
  }
  throw new GitHubGraphQLError(errors);
}

function optionalRateLimitDetails(response: Response): {
  remaining?: number;
  resetAt?: string;
} {
  const remaining = optionalInteger(response.headers.get("x-ratelimit-remaining"));
  const resetAt = epochToIso(response.headers.get("x-ratelimit-reset"));
  return {
    ...(remaining === undefined ? {} : { remaining }),
    ...(resetAt === undefined ? {} : { resetAt }),
  };
}

function assertRateLimit(value: unknown): asserts value is GitHubRateLimit {
  if (
    !isObject(value) ||
    !Number.isInteger(value.cost) ||
    !Number.isInteger(value.remaining) ||
    typeof value.resetAt !== "string"
  ) {
    throw new GitHubProtocolError("GitHub response contained invalid rate-limit metadata");
  }
}

function readRateLimit(data: unknown): GitHubRateLimit {
  if (!isObject(data)) throw new GitHubProtocolError("GitHub returned invalid query data");
  const rateLimit = data.rateLimit;
  assertRateLimit(rateLimit);
  return rateLimit;
}

function assertConnection(value: unknown): asserts value is RepositoryConnection {
  if (!isObject(value) || !isObject(value.pageInfo)) {
    throw new GitHubProtocolError("GitHub returned an invalid repository connection");
  }
  const { hasNextPage, endCursor } = value.pageInfo;
  if (
    typeof hasNextPage !== "boolean" ||
    (endCursor !== null && typeof endCursor !== "string") ||
    (value.nodes !== null && !Array.isArray(value.nodes))
  ) {
    throw new GitHubProtocolError("GitHub returned invalid repository pagination data");
  }
}

function requireLogin(login: string): string {
  const normalized = login.trim();
  if (!normalized) throw new TypeError("GitHub login is required");
  return normalized;
}

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function readMessage(payload: unknown): string | undefined {
  return isObject(payload) && typeof payload.message === "string" ? payload.message : undefined;
}

function optionalInteger(value: string | null): number | undefined {
  if (value === null || !/^\d+$/.test(value)) return undefined;
  return Number.parseInt(value, 10);
}

function epochToIso(value: string | null): string | undefined {
  const seconds = optionalInteger(value);
  return seconds === undefined ? undefined : new Date(seconds * 1_000).toISOString();
}

function last<T>(values: T[]): T {
  const value = values.at(-1);
  if (value === undefined) throw new GitHubProtocolError("Expected GitHub rate-limit metadata");
  return value;
}
