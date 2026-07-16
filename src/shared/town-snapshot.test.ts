import assert from "node:assert/strict";
import test from "node:test";

import {
  parseTownSnapshot,
  TOWN_SNAPSHOT_MAPPING_VERSION,
  TOWN_SNAPSHOT_SCHEMA_VERSION,
  TownSnapshotValidationError,
  type TownSnapshot,
} from "./town-snapshot.js";

test("parses the versioned owned and recently-contributed district contract", () => {
  const snapshot = fixture();

  assert.equal(parseTownSnapshot(snapshot), snapshot);
  assert.equal(snapshot.schemaVersion, TOWN_SNAPSHOT_SCHEMA_VERSION);
  assert.equal(snapshot.mappingVersion, TOWN_SNAPSHOT_MAPPING_VERSION);
  assert.equal(snapshot.economy.mode, "display_only");
  assert.equal(snapshot.districts.contributed.scope, "github_recently_contributed");
});

test("rejects unsupported schema or mapping versions", () => {
  assert.throws(
    () => parseTownSnapshot({ ...fixture(), schemaVersion: 2 }),
    /\$\.schemaVersion: must be 1/,
  );
  assert.throws(
    () => parseTownSnapshot({ ...fixture(), mappingVersion: 2 }),
    /\$\.mappingVersion: must be 1/,
  );
});

test("rejects duplicate repositories across district boundaries", () => {
  const snapshot = fixture();
  snapshot.districts.contributed.repositories = [
    { ...snapshot.districts.owned.repositories[0]! },
  ];

  assert.throws(
    () => parseTownSnapshot(snapshot),
    (error: unknown) => {
      assert.ok(error instanceof TownSnapshotValidationError);
      assert.match(error.message, /contributed\.repositories\[0\]\.githubId.*unique/);
      return true;
    },
  );
});

test("rejects language weights that exceed GitHub's reported total size", () => {
  const snapshot = fixture();
  snapshot.districts.owned.repositories[0]!.languages = {
    totalBytes: 10,
    weights: [{ name: "TypeScript", bytes: 11, sourceColor: "#3178c6" }],
    primary: null,
    secondary: [],
    otherBytes: 10,
    otherShare: 1,
  };

  assert.throws(() => parseTownSnapshot(snapshot), /represented bytes must not exceed totalBytes/);
});

test("rejects invalid contribution dates, counts, and display-only mode", () => {
  const badDate = fixture() as unknown as Record<string, unknown>;
  const contributions = badDate.contributions as Record<string, unknown>;
  const days = contributions.days as Array<Record<string, unknown>>;
  days[0]!.date = "2026-02-30";
  assert.throws(() => parseTownSnapshot(badDate), /must be a valid ISO date/);

  const badCount = fixture() as unknown as Record<string, unknown>;
  (badCount.profile as Record<string, unknown>).followers = -1;
  assert.throws(() => parseTownSnapshot(badCount), /non-negative safe integer/);

  const wrongMode = fixture() as unknown as Record<string, unknown>;
  (wrongMode.economy as Record<string, unknown>).mode = "spendable";
  assert.throws(() => parseTownSnapshot(wrongMode), /economy\.mode: must be "display_only"/);
});

test("accepts GitHub's nullable repository description and rejects other values", () => {
  const nullable = fixture();
  nullable.districts.owned.repositories[0]!.description = null;
  assert.equal(parseTownSnapshot(nullable), nullable);

  const invalid = fixture();
  (invalid.districts.owned.repositories[0] as unknown as { description: unknown }).description = 7;
  assert.throws(() => parseTownSnapshot(invalid), /description: must be a string or null/);
});

test("rejects derived tiers and district counts that disagree with exact values", () => {
  const visitor = fixture();
  visitor.profile.visitorTier = 4;
  assert.throws(() => parseTownSnapshot(visitor), /visitorTier.*follower bands/);

  const garden = fixture();
  garden.contributions.days[0]!.intensity = 4;
  assert.throws(() => parseTownSnapshot(garden), /intensity.*contribution level/);

  const overflow = fixture();
  overflow.districts.owned.overflowRepositoryCount = 1;
  assert.throws(() => parseTownSnapshot(overflow), /source count.*selected plus overflow/);
});

test("requires derived language metadata to match its exact raw weight", () => {
  const snapshot = fixture();
  snapshot.districts.owned.repositories[0]!.languages.primary!.sourceColor = "#ffffff";

  assert.throws(
    () => parseTownSnapshot(snapshot),
    /primary and secondary languages must match an exact raw weight/,
  );
});

function fixture(): TownSnapshot {
  return {
    schemaVersion: 1,
    mappingVersion: 1,
    asOf: "2026-07-16T18:00:00Z",
    layoutSeed: "user-1",
    profile: {
      githubId: "user-1",
      login: "octocat",
      name: "The Octocat",
      avatarUrl: "https://avatars.example/octocat",
      followers: 10,
      visitorTier: 2,
      pullRequestsAuthoredLifetime: 20,
      issuesAuthoredLifetime: 30,
    },
    contributions: {
      window: {
        from: "2025-07-17T00:00:00Z",
        to: "2026-07-16T00:00:00Z",
      },
      totals: {
        commitContributions: 40,
        issueContributions: 5,
        pullRequestContributions: 6,
        pullRequestReviewContributions: 7,
        allContributions: 58,
        restrictedContributions: 0,
      },
      civic: {
        issues: { count: 5, intensityTier: 2 },
        pullRequests: { count: 6, intensityTier: 2 },
        pullRequestReviews: { count: 7, intensityTier: 2 },
      },
      days: contributionDays(),
    },
    economy: {
      starlightEarned: 3,
      mode: "display_only",
    },
    districts: {
      owned: {
        sourceRepositoryCount: 1,
        overflowRepositoryCount: 0,
        repositories: [repository("repo-1", "octocat")],
      },
      contributed: {
        scope: "github_recently_contributed",
        sourceRepositoryCount: 1,
        overflowRepositoryCount: 0,
        repositories: [repository("repo-2", "hubot")],
      },
    },
    languageMix: {
      totalBytes: 100,
      weights: [
        { name: "TypeScript", bytes: 80, share: 0.8, sourceColor: "#3178c6" },
      ],
      otherBytes: 20,
      otherShare: 0.2,
    },
  };
}

function repository(githubId: string, ownerLogin: string): TownSnapshot["districts"]["owned"]["repositories"][number] {
  return {
    githubId,
    name: githubId,
    nameWithOwner: `${ownerLogin}/${githubId}`,
    description: `${githubId} description`,
    url: `https://github.com/${ownerLogin}/${githubId}`,
    ownerLogin,
    isFork: false,
    isArchived: false,
    createdAt: "2024-01-01T00:00:00Z",
    updatedAt: "2026-07-15T00:00:00Z",
    pushedAt: "2026-07-15T00:00:00Z",
    stars: 3,
    starProminenceTier: 1,
    recencyTier: "active",
    issuesLifetime: 2,
    pullRequestsLifetime: 1,
    languages: {
      totalBytes: 100,
      weights: [{ name: "TypeScript", bytes: 80, sourceColor: "#3178c6" }],
      primary: {
        name: "TypeScript",
        bytes: 80,
        share: 0.8,
        sourceColor: "#3178c6",
      },
      secondary: [],
      otherBytes: 20,
      otherShare: 0.2,
    },
  };
}

function contributionDays(): TownSnapshot["contributions"]["days"] {
  const start = Date.parse("2025-07-17T00:00:00.000Z");
  return Array.from({ length: 365 }, (_, index) => {
    const date = new Date(start + index * 86_400_000).toISOString().slice(0, 10);
    return index === 364
      ? { date, count: 2, level: "FIRST_QUARTILE" as const, intensity: 1 as const }
      : { date, count: 0, level: "NONE" as const, intensity: 0 as const };
  });
}
