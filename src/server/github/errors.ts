import type { GraphQLErrorShape } from "./types.js";

export class GitHubApiError extends Error {
  constructor(message: string, options?: ErrorOptions) {
    super(message, options);
    this.name = new.target.name;
  }
}

export class GitHubHttpError extends GitHubApiError {
  constructor(
    message: string,
    readonly status: number,
  ) {
    super(message);
  }
}

export class GitHubGraphQLError extends GitHubApiError {
  constructor(readonly errors: GraphQLErrorShape[]) {
    super(`GitHub GraphQL error: ${errors.map(({ message }) => message).join("; ")}`);
  }
}

export class GitHubRateLimitError extends GitHubApiError {
  constructor(
    message: string,
    readonly details: {
      remaining?: number;
      resetAt?: string;
      retryAfterSeconds?: number;
      status?: number;
    },
  ) {
    super(message);
  }
}

export class GitHubUserNotFoundError extends GitHubApiError {
  constructor(readonly login: string) {
    super(`GitHub user not found: ${login}`);
  }
}

export class GitHubProtocolError extends GitHubApiError {}
