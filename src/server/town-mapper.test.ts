import assert from "node:assert/strict";
import test from "node:test";

import type {
  GitHubContributionDay,
  GitHubRepository,
  GitHubUserData,
} from "./github/index.js";
import { mapGitHubUserDataToTownSnapshot } from "./town-mapper.js";
import type { TownSnapshotMappingContext } from "./town-snapshot-service.js";

const GENERATED_AT = "2026-07-16T12:00:00.000Z";
const CONTEXT: TownSnapshotMappingContext = {
  generatedAt: GENERATED_AT,
  contributionWindow: {
    from: "2025-07-16T12:00:00.000Z",
    to: "2026-07-16T12:00:00.000Z",
  },
};

test("maps approved exact metrics, display-only Starlight, garden, and languages", () => {
  const main = repository("main", {
    stargazerCount: 25,
    pushedAt: "2026-07-16T00:00:00.000Z",
    languages: {
      totalSize: 100,
      edges: [
        language("CSS", 9, "#563d7c"),
        language("TypeScript", 60, "#3178c6"),
        language("HTML", 10, "#e34c26"),
      ],
    },
  });
  const fork = repository("fork", {
    isFork: true,
    stargazerCount: 999,
    languages: { totalSize: 100, edges: [language("Rust", 100, "#dea584")] },
  });
  const archive = repository("archive", {
    isArchived: true,
    stargazerCount: 5,
    pushedAt: "2026-07-15T00:00:00.000Z",
    languages: { totalSize: 100, edges: [language("Python", 100, "#3572A5")] },
  });
  const external = repository("external", {
    owner: { login: "neighbor" },
    nameWithOwner: "neighbor/external",
    url: "https://github.com/neighbor/external",
    stargazerCount: 200,
  });
  const source = userData({
    followers: 25,
    issues: 20,
    pullRequests: 50,
    reviews: 4,
    owned: [fork, archive, main],
    contributed: [external],
    days: [
      contributionDay("2025-07-16", 99, "FOURTH_QUARTILE"),
      contributionDay("2025-07-17", 1, "FIRST_QUARTILE"),
      contributionDay("2026-07-16", 8, "FOURTH_QUARTILE"),
    ],
  });

  const snapshot = mapGitHubUserDataToTownSnapshot(source, CONTEXT);

  assert.equal(snapshot.layoutSeed, "github:user-1:schema:1:mapping:1");
  assert.deepEqual(snapshot.profile, {
    githubId: "user-1",
    login: "octocat",
    name: "The Octocat",
    avatarUrl: "https://avatars.example/octocat",
    followers: 25,
    visitorTier: 3,
    pullRequestsAuthoredLifetime: 60,
    issuesAuthoredLifetime: 30,
  });
  assert.deepEqual(snapshot.contributions.civic, {
    issues: { count: 20, intensityTier: 3 },
    pullRequests: { count: 50, intensityTier: 4 },
    pullRequestReviews: { count: 4, intensityTier: 1 },
  });
  assert.equal(snapshot.economy.starlightEarned, 30);
  assert.equal(snapshot.economy.mode, "display_only");

  assert.equal(snapshot.districts.owned.sourceRepositoryCount, 3);
  assert.equal(snapshot.districts.owned.overflowRepositoryCount, 1);
  assert.deepEqual(
    snapshot.districts.owned.repositories.map((item) => item.githubId),
    ["main", "archive"],
  );
  assert.equal(snapshot.districts.contributed.sourceRepositoryCount, 1);
  assert.equal(snapshot.districts.contributed.repositories[0]?.githubId, "external");

  const mainBuilding = snapshot.districts.owned.repositories[0]!;
  assert.equal(mainBuilding.description, "main description");
  assert.equal(mainBuilding.starProminenceTier, 3);
  assert.equal(mainBuilding.recencyTier, "active");
  assert.deepEqual(mainBuilding.languages.primary, {
    name: "TypeScript",
    bytes: 60,
    sourceColor: "#3178c6",
    share: 0.6,
  });
  assert.deepEqual(mainBuilding.languages.secondary, [
    { name: "HTML", bytes: 10, sourceColor: "#e34c26", share: 0.1 },
  ]);
  assert.equal(mainBuilding.languages.otherBytes, 30);
  assert.equal(mainBuilding.languages.otherShare, 0.3);
  assert.deepEqual(
    mainBuilding.languages.weights.map(({ name, bytes }) => ({ name, bytes })),
    [
      { name: "TypeScript", bytes: 60 },
      { name: "HTML", bytes: 10 },
      { name: "CSS", bytes: 9 },
    ],
  );

  assert.equal(snapshot.languageMix.totalBytes, 100);
  assert.equal(snapshot.languageMix.otherBytes, 21);
  assert.deepEqual(
    snapshot.languageMix.weights.map(({ name, bytes, share }) => ({ name, bytes, share })),
    [
      { name: "TypeScript", bytes: 60, share: 0.6 },
      { name: "HTML", bytes: 10, share: 0.1 },
      { name: "CSS", bytes: 9, share: 0.09 },
    ],
  );

  assert.equal(snapshot.contributions.days.length, 365);
  assert.deepEqual(snapshot.contributions.days[0], {
    date: "2025-07-17",
    count: 1,
    level: "FIRST_QUARTILE",
    intensity: 1,
  });
  assert.deepEqual(snapshot.contributions.days[1], {
    date: "2025-07-18",
    count: 0,
    level: "NONE",
    intensity: 0,
  });
  assert.deepEqual(snapshot.contributions.days.at(-1), {
    date: "2026-07-16",
    count: 8,
    level: "FOURTH_QUARTILE",
    intensity: 4,
  });
});

test("applies the elastic 8/4 allocation in both directions", () => {
  const threeOwned = Array.from({ length: 3 }, (_, index) =>
    repository(`owned-${index}`, { pushedAt: daysAgo(index) }),
  );
  const tenContributed = Array.from({ length: 10 }, (_, index) =>
    repository(`external-${index}`, {
      owner: { login: "neighbor" },
      nameWithOwner: `neighbor/external-${index}`,
      url: `https://github.com/neighbor/external-${index}`,
      pushedAt: daysAgo(index),
    }),
  );
  const collaborationHeavy = mapGitHubUserDataToTownSnapshot(
    userData({ owned: threeOwned, contributed: tenContributed }),
    CONTEXT,
  );

  assert.equal(collaborationHeavy.districts.owned.repositories.length, 3);
  assert.equal(collaborationHeavy.districts.contributed.repositories.length, 9);
  assert.equal(collaborationHeavy.districts.contributed.overflowRepositoryCount, 1);

  const tenOwned = Array.from({ length: 10 }, (_, index) =>
    repository(`owned-${index}`, { pushedAt: daysAgo(index) }),
  );
  const twoContributed = tenContributed.slice(0, 2);
  const ownershipHeavy = mapGitHubUserDataToTownSnapshot(
    userData({ owned: tenOwned, contributed: twoContributed }),
    CONTEXT,
  );

  assert.equal(ownershipHeavy.districts.owned.repositories.length, 10);
  assert.equal(ownershipHeavy.districts.contributed.repositories.length, 2);
  assert.equal(ownershipHeavy.districts.owned.overflowRepositoryCount, 0);
});

test("ranks active repositories before archives and uses stable tie breakers", () => {
  const repositories = [
    repository("archive", {
      isArchived: true,
      pushedAt: "2026-07-16T00:00:00.000Z",
      stargazerCount: 500,
    }),
    repository("zeta", { pushedAt: daysAgo(2), stargazerCount: 100 }),
    repository("alpha", { pushedAt: daysAgo(1), stargazerCount: 0 }),
    repository("bravo", { pushedAt: daysAgo(2), stargazerCount: 100 }),
    repository("id-b", {
      nameWithOwner: "octocat/tied",
      pushedAt: daysAgo(3),
      stargazerCount: 0,
    }),
    repository("id-a", {
      nameWithOwner: "octocat/tied",
      pushedAt: daysAgo(3),
      stargazerCount: 0,
    }),
  ];

  const snapshot = mapGitHubUserDataToTownSnapshot(
    userData({ owned: repositories.reverse() }),
    CONTEXT,
  );

  assert.deepEqual(
    snapshot.districts.owned.repositories.map((item) => item.githubId),
    ["alpha", "bravo", "zeta", "id-a", "id-b", "archive"],
  );
});

test("uses every approved star, recency, follower, and civic boundary", () => {
  const counts = [0, 1, 4, 5, 24, 25, 99, 100];
  const broadTiers = [0, 1, 1, 2, 2, 3, 3, 4];
  const civicCounts = [0, 1, 4, 5, 19, 20, 49, 50];
  const civicTiers = [0, 1, 1, 2, 2, 3, 3, 4];
  const recencyDays = [0, 30, 31, 180, 181, 365, 366];
  const recencyTiers = ["active", "active", "warm", "warm", "quiet", "quiet", "resting"];
  const owned = counts.map((stars, index) =>
    repository(`tier-${index}`, {
      stargazerCount: stars,
      pushedAt: index < recencyDays.length ? daysAgo(recencyDays[index]!) : null,
    }),
  );
  const snapshot = mapGitHubUserDataToTownSnapshot(
    userData({ followers: 0, issues: 0, pullRequests: 0, reviews: 0, owned }),
    CONTEXT,
  );
  const buildings = new Map(
    snapshot.districts.owned.repositories.map((repository) => [repository.githubId, repository]),
  );

  counts.forEach((_, index) => {
    assert.equal(buildings.get(`tier-${index}`)?.starProminenceTier, broadTiers[index]);
    assert.equal(
      buildings.get(`tier-${index}`)?.recencyTier,
      index < recencyTiers.length ? recencyTiers[index] : "resting",
    );
  });

  counts.forEach((followers, index) => {
    const tierSnapshot = mapGitHubUserDataToTownSnapshot(userData({ followers }), CONTEXT);
    assert.equal(tierSnapshot.profile.visitorTier, broadTiers[index]);
  });
  civicCounts.forEach((count, index) => {
    const tierSnapshot = mapGitHubUserDataToTownSnapshot(
      userData({ issues: count, pullRequests: count, reviews: count }),
      CONTEXT,
    );
    assert.equal(tierSnapshot.contributions.civic.issues.intensityTier, civicTiers[index]);
    assert.equal(tierSnapshot.contributions.civic.pullRequests.intensityTier, civicTiers[index]);
    assert.equal(
      tierSnapshot.contributions.civic.pullRequestReviews.intensityTier,
      civicTiers[index],
    );
  });
});

test("is deterministic across source ordering and keeps a stable seed across login renames", () => {
  const first = repository("first", {
    pushedAt: daysAgo(1),
    languages: {
      totalSize: 100,
      edges: [language("HTML", 20, "#e34c26"), language("TypeScript", 80, "#3178c6")],
    },
  });
  const second = repository("second", {
    pushedAt: daysAgo(2),
    languages: { totalSize: 50, edges: [language("TypeScript", 50, "#3178c6")] },
  });
  const days = [
    contributionDay("2026-07-15", 2, "SECOND_QUARTILE"),
    contributionDay("2026-07-16", 3, "THIRD_QUARTILE"),
  ];
  const source = userData({ owned: [second, first], days });
  const reordered = userData({ owned: [first, second], days: [...days].reverse() });

  assert.deepEqual(
    mapGitHubUserDataToTownSnapshot(source, CONTEXT),
    mapGitHubUserDataToTownSnapshot(reordered, CONTEXT),
  );

  const renamed = userData({ owned: [first, second], days });
  renamed.profile.login = "renamed-octocat";
  assert.equal(
    mapGitHubUserDataToTownSnapshot(source, CONTEXT).layoutSeed,
    mapGitHubUserDataToTownSnapshot(renamed, CONTEXT).layoutSeed,
  );
});

function userData(options: {
  followers?: number;
  issues?: number;
  pullRequests?: number;
  reviews?: number;
  owned?: GitHubRepository[];
  contributed?: GitHubRepository[];
  days?: GitHubContributionDay[];
} = {}): GitHubUserData {
  return {
    profile: {
      id: "user-1",
      login: "octocat",
      name: "The Octocat",
      avatarUrl: "https://avatars.example/octocat",
      followers: { totalCount: options.followers ?? 10 },
      pullRequests: { totalCount: 60 },
      issues: { totalCount: 30 },
      contributionsCollection: {
        totalCommitContributions: 40,
        totalIssueContributions: options.issues ?? 5,
        totalPullRequestContributions: options.pullRequests ?? 6,
        totalPullRequestReviewContributions: options.reviews ?? 7,
        restrictedContributionsCount: 2,
        contributionCalendar: {
          totalContributions: 58,
          weeks: [{ contributionDays: options.days ?? [] }],
        },
      },
    },
    ownedRepositories: options.owned ?? [],
    contributedRepositories: options.contributed ?? [],
    rateLimits: [],
  };
}

function repository(
  id: string,
  overrides: Partial<GitHubRepository> = {},
): GitHubRepository {
  return {
    id,
    name: id,
    nameWithOwner: `octocat/${id}`,
    description: `${id} description`,
    url: `https://github.com/octocat/${id}`,
    owner: { login: "octocat" },
    isFork: false,
    isArchived: false,
    createdAt: "2024-01-01T00:00:00.000Z",
    updatedAt: "2026-07-16T00:00:00.000Z",
    pushedAt: "2026-07-16T00:00:00.000Z",
    stargazerCount: 0,
    issues: { totalCount: 2 },
    pullRequests: { totalCount: 1 },
    languages: { totalSize: 0, edges: [] },
    ...overrides,
  };
}

function language(name: string, size: number, color: string | null) {
  return { size, node: { name, color } };
}

function contributionDay(
  date: string,
  contributionCount: number,
  contributionLevel: GitHubContributionDay["contributionLevel"],
): GitHubContributionDay {
  return { date, contributionCount, contributionLevel };
}

function daysAgo(days: number): string {
  return new Date(Date.parse(GENERATED_AT) - days * 86_400_000).toISOString();
}
