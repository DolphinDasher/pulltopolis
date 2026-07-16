import assert from "node:assert/strict";
import test from "node:test";

import {
  TownApiError,
  cacheStatusLabel,
  fetchTown,
  normalizeTownLogin,
  townErrorMessage,
} from "./town-api.js";
import type { TownSnapshot } from "../shared/town-snapshot.js";

test("fetchTown encodes the login and preserves known cache freshness", async () => {
  const snapshot = fixtureSnapshot();
  let requestedUrl = "";
  const result = await fetchTown(" test-user ", async (url) => {
    requestedUrl = url;
    return Response.json(snapshot, {
      headers: { "X-PullTopolis-Cache": "stale" },
    });
  });

  assert.equal(requestedUrl, "/api/towns/test-user");
  assert.equal(result.snapshot.profile.login, "test-user");
  assert.equal(result.cacheStatus, "stale");
  assert.equal(cacheStatusLabel(result.cacheStatus), "Cached snapshot · refreshing in background");
});

test("public profile input accepts familiar @username notation", async () => {
  let requestedUrl = "";
  await fetchTown(" @test-user ", async (url) => {
    requestedUrl = url;
    return Response.json(fixtureSnapshot());
  });

  assert.equal(normalizeTownLogin(" @test-user "), "test-user");
  assert.equal(normalizeTownLogin("test-user"), "test-user");
  assert.equal(requestedUrl, "/api/towns/test-user");
});

test("fetchTown turns safe server error codes and Retry-After into a typed error", async () => {
  await assert.rejects(
    fetchTown("octocat", async () =>
      Response.json(
        { error: "github_rate_limited" },
        { status: 503, headers: { "Retry-After": "45" } },
      ),
    ),
    (error: unknown) => {
      assert.ok(error instanceof TownApiError);
      assert.equal(error.status, 503);
      assert.equal(error.retryAfterSeconds, 45);
      assert.match(townErrorMessage(error), /45 seconds/);
      return true;
    },
  );
});

test("townErrorMessage does not expose unknown upstream details", () => {
  assert.equal(
    townErrorMessage(new TownApiError("unexpected_secret_detail", 500)),
    "This town could not be built. Please try again.",
  );
});

function fixtureSnapshot(): TownSnapshot {
  const days = Array.from({ length: 365 }, (_, index) => {
    const date = new Date(Date.UTC(2025, 0, 2 + index)).toISOString().slice(0, 10);
    return { date, count: 0, level: "NONE" as const, intensity: 0 as const };
  });
  return {
    schemaVersion: 1,
    mappingVersion: 1,
    asOf: "2026-01-01T00:00:00.000Z",
    layoutSeed: "github-id:v1:1",
    profile: {
      githubId: "github-id",
      login: "test-user",
      name: "Test User",
      avatarUrl: "https://avatars.githubusercontent.com/u/1?v=4",
      followers: 0,
      visitorTier: 0,
      pullRequestsAuthoredLifetime: 0,
      issuesAuthoredLifetime: 0,
    },
    contributions: {
      window: { from: "2025-01-02T00:00:00.000Z", to: "2026-01-01T00:00:00.000Z" },
      totals: {
        commitContributions: 0,
        issueContributions: 0,
        pullRequestContributions: 0,
        pullRequestReviewContributions: 0,
        allContributions: 0,
        restrictedContributions: 0,
      },
      civic: {
        issues: { count: 0, intensityTier: 0 },
        pullRequests: { count: 0, intensityTier: 0 },
        pullRequestReviews: { count: 0, intensityTier: 0 },
      },
      days,
    },
    economy: { starlightEarned: 0, mode: "display_only" },
    districts: {
      owned: { sourceRepositoryCount: 0, overflowRepositoryCount: 0, repositories: [] },
      contributed: {
        scope: "github_recently_contributed",
        sourceRepositoryCount: 0,
        overflowRepositoryCount: 0,
        repositories: [],
      },
    },
    languageMix: { totalBytes: 0, weights: [], otherBytes: 0, otherShare: 0 },
  };
}
