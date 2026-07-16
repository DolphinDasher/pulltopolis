import assert from "node:assert/strict";
import test from "node:test";

import { GitHubGraphQLClient } from "./client.js";
import {
  GitHubGraphQLError,
  GitHubRateLimitError,
} from "./errors.js";
import type {
  GitHubProfileActivity,
  GitHubRateLimit,
  GitHubRepository,
} from "./types.js";

const RATE_LIMIT: GitHubRateLimit = {
  cost: 1,
  remaining: 4_999,
  resetAt: "2026-07-16T20:00:00Z",
};

const PROFILE: GitHubProfileActivity = {
  id: "user-1",
  login: "octocat",
  name: "The Octocat",
  avatarUrl: "https://avatars.example/octocat",
  followers: { totalCount: 10 },
  pullRequests: { totalCount: 20 },
  issues: { totalCount: 30 },
  contributionsCollection: {
    totalCommitContributions: 40,
    totalIssueContributions: 5,
    totalPullRequestContributions: 6,
    totalPullRequestReviewContributions: 7,
    restrictedContributionsCount: 0,
    contributionCalendar: {
      totalContributions: 58,
      weeks: [
        {
          contributionDays: [
            {
              date: "2026-07-16",
              contributionCount: 2,
              contributionLevel: "FIRST_QUARTILE",
            },
          ],
        },
      ],
    },
  },
};

test("profile request keeps the token server-side and sends the explicit date window", async () => {
  const calls: FetchCall[] = [];
  const fetch = queueFetch(
    [jsonResponse({ data: { user: PROFILE, rateLimit: RATE_LIMIT } })],
    calls,
  );
  const client = new GitHubGraphQLClient({ token: "secret", fetch });

  const result = await client.fetchProfileActivity(
    " octocat ",
    "2025-07-17T00:00:00Z",
    "2026-07-16T00:00:00Z",
  );

  assert.equal(result.profile.login, "octocat");
  assert.equal(calls.length, 1);
  assert.equal(new Headers(calls[0]!.init?.headers).get("authorization"), "Bearer secret");
  const body = requestBody(calls[0]!);
  assert.deepEqual(body.variables, {
    login: "octocat",
    from: "2025-07-17T00:00:00Z",
    to: "2026-07-16T00:00:00Z",
  });
  assert.match(body.query, /contributionCalendar/);
});

test("owned repositories are paginated serially and duplicate/null nodes are ignored", async () => {
  const calls: FetchCall[] = [];
  const first = repository("repo-1", "octocat");
  const second = repository("repo-2", "octocat");
  const fetch = queueFetch(
    [
      repositoryPage("repositories", [first, null], true, "cursor-1"),
      repositoryPage("repositories", [first, second], false, null),
    ],
    calls,
  );
  const client = new GitHubGraphQLClient({ token: "secret", fetch });

  const result = await client.fetchOwnedRepositories("octocat");

  assert.deepEqual(result.repositories.map(({ id }) => id), ["repo-1", "repo-2"]);
  assert.equal(result.rateLimits.length, 2);
  assert.equal(requestBody(calls[0]!).variables.after, null);
  assert.equal(requestBody(calls[1]!).variables.after, "cursor-1");
  assert.match(requestBody(calls[0]!).query, /\bdescription\b/);
});

test("the aggregate keeps contributed repositories separate and defensively removes owned IDs", async () => {
  const calls: FetchCall[] = [];
  const owned = repository("owned", "octocat");
  const external = repository("external", "hubot");
  const fetch = queueFetch(
    [
      jsonResponse({ data: { user: PROFILE, rateLimit: RATE_LIMIT } }),
      repositoryPage("repositories", [owned], false, null),
      repositoryPage("repositoriesContributedTo", [owned, external], false, null),
    ],
    calls,
  );
  const client = new GitHubGraphQLClient({ token: "secret", fetch });

  const result = await client.fetchUserData(
    "octocat",
    "2025-07-17T00:00:00Z",
    "2026-07-16T00:00:00Z",
  );

  assert.deepEqual(result.ownedRepositories.map(({ id }) => id), ["owned"]);
  assert.deepEqual(result.contributedRepositories.map(({ id }) => id), ["external"]);
  assert.match(requestBody(calls[2]!).query, /includeUserRepositories:\s*false/);
  assert.match(requestBody(calls[2]!).query, /PULL_REQUEST_REVIEW/);
});

test("GraphQL errors reject partial data", async () => {
  const fetch = queueFetch([
    jsonResponse({
      data: { user: PROFILE, rateLimit: RATE_LIMIT },
      errors: [{ message: "Field failed", path: ["user", "followers"] }],
    }),
  ]);
  const client = new GitHubGraphQLClient({ token: "secret", fetch });

  await assert.rejects(
    client.fetchProfileActivity("octocat", "from", "to"),
    GitHubGraphQLError,
  );
});

test("HTTP rate-limit responses expose retry metadata without retrying", async () => {
  const calls: FetchCall[] = [];
  const fetch = queueFetch(
    [
      jsonResponse(
        { message: "secondary rate limit" },
        {
          status: 429,
          headers: {
            "retry-after": "60",
            "x-ratelimit-remaining": "0",
            "x-ratelimit-reset": "1784232000",
          },
        },
      ),
    ],
    calls,
  );
  const client = new GitHubGraphQLClient({ token: "secret", fetch });

  await assert.rejects(
    client.fetchProfileActivity("octocat", "from", "to"),
    (error: unknown) => {
      assert.ok(error instanceof GitHubRateLimitError);
      assert.equal(error.details.retryAfterSeconds, 60);
      assert.equal(error.details.remaining, 0);
      return true;
    },
  );
  assert.equal(calls.length, 1);
});

test("pagination stops before crossing the configured rate-limit reserve", async () => {
  const calls: FetchCall[] = [];
  const fetch = queueFetch(
    [
      repositoryPage(
        "repositories",
        [repository("repo-1", "octocat")],
        true,
        "cursor-1",
        { ...RATE_LIMIT, remaining: 20 },
      ),
    ],
    calls,
  );
  const client = new GitHubGraphQLClient({
    token: "secret",
    fetch,
    rateLimitReserve: 20,
  });

  await assert.rejects(client.fetchOwnedRepositories("octocat"), GitHubRateLimitError);
  assert.equal(calls.length, 1);
});

interface FetchCall {
  input: string | URL | Request;
  init?: RequestInit;
}

function queueFetch(responses: Response[], calls: FetchCall[] = []): typeof globalThis.fetch {
  return (async (input: string | URL | Request, init?: RequestInit) => {
    calls.push(init === undefined ? { input } : { input, init });
    const response = responses.shift();
    if (!response) throw new Error("Unexpected fetch call");
    return response;
  }) as typeof globalThis.fetch;
}

function jsonResponse(body: unknown, init?: ResponseInit): Response {
  return new Response(JSON.stringify(body), {
    status: 200,
    headers: { "content-type": "application/json" },
    ...init,
  });
}

function repositoryPage(
  field: "repositories" | "repositoriesContributedTo",
  nodes: Array<GitHubRepository | null>,
  hasNextPage: boolean,
  endCursor: string | null,
  rateLimit = RATE_LIMIT,
): Response {
  return jsonResponse({
    data: {
      user: {
        [field]: { pageInfo: { hasNextPage, endCursor }, nodes },
      },
      rateLimit,
    },
  });
}

function repository(id: string, owner: string): GitHubRepository {
  return {
    id,
    name: id,
    nameWithOwner: `${owner}/${id}`,
    description: `${id} description`,
    url: `https://github.com/${owner}/${id}`,
    owner: { login: owner },
    isFork: false,
    isArchived: false,
    createdAt: "2024-01-01T00:00:00Z",
    updatedAt: "2026-07-15T00:00:00Z",
    pushedAt: "2026-07-15T00:00:00Z",
    stargazerCount: 1,
    issues: { totalCount: 2 },
    pullRequests: { totalCount: 3 },
    languages: {
      totalSize: 100,
      edges: [{ size: 100, node: { name: "TypeScript", color: "#3178c6" } }],
    },
  };
}

function requestBody(call: FetchCall): {
  query: string;
  variables: Record<string, string | null>;
} {
  const body = call.init?.body;
  assert.equal(typeof body, "string");
  return JSON.parse(body as string) as {
    query: string;
    variables: Record<string, string | null>;
  };
}
