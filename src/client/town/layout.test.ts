import assert from "node:assert/strict";
import test from "node:test";

import type { TownRepositoryV1, TownSnapshot } from "../../shared/town-snapshot.js";
import {
  buildTownLayout,
  buildingRenderBounds,
  hitTestRepository,
  TOWN_VIEWPORT,
} from "./layout.js";

test("layout is invariant to incidental repository array order", () => {
  const first = snapshot([repository("alpha", 0), repository("beta", 2)]);
  const second = snapshot([...first.districts.owned.repositories].reverse());

  assert.deepEqual(repositoryPositions(buildTownLayout(first)), repositoryPositions(buildTownLayout(second)));
});

test("keeps owned and contributed repositories in separate districts", () => {
  const value = snapshot([repository("home", 1)]);
  value.districts.contributed.sourceRepositoryCount = 1;
  value.districts.contributed.repositories = [repository("visit", 1, "neighbor")];

  const layout = buildTownLayout(value);
  const home = layout.buildings.find(({ repository: item }) => item.githubId === "home")!;
  const visit = layout.buildings.find(({ repository: item }) => item.githubId === "visit")!;
  assert.ok(home.anchor.x < layout.square.x);
  assert.ok(visit.anchor.x > layout.square.x);
  assert.equal(home.district, "owned");
  assert.equal(visit.district, "contributed");
});

test("star prominence changes footprint without changing snapshot game math", () => {
  const layout = buildTownLayout(snapshot([repository("small", 0), repository("large", 4)]));
  const small = layout.buildings.find(({ repository: item }) => item.githubId === "small")!;
  const large = layout.buildings.find(({ repository: item }) => item.githubId === "large")!;
  assert.ok(large.bounds.width > small.bounds.width);
  assert.ok(large.bounds.height > small.bounds.height);
});

test("hit testing returns the topmost building and ignores empty ground", () => {
  const layout = buildTownLayout(snapshot([repository("back", 1), repository("front", 1)]));
  const back = layout.buildings[0]!;
  const front = { ...layout.buildings[1]!, anchor: { ...back.anchor }, bounds: { ...back.bounds } };
  const overlapping = { buildings: [back, front] };
  const point = { x: back.anchor.x, y: back.anchor.y - 5 };

  assert.equal(hitTestRepository(overlapping, point)?.repository.githubId, front.repository.githubId);
  assert.equal(hitTestRepository(overlapping, { x: 383, y: 255 }), null);
  assert.equal(hitTestRepository({ buildings: [back] }, { x: back.bounds.x, y: back.bounds.y }), null);
});

test("places truthful overflow counters for both districts", () => {
  const value = snapshot([repository("home", 0)]);
  value.districts.owned.sourceRepositoryCount = 4;
  value.districts.owned.overflowRepositoryCount = 3;
  value.districts.contributed.sourceRepositoryCount = 2;
  value.districts.contributed.overflowRepositoryCount = 2;

  assert.deepEqual(
    buildTownLayout(value).overflow.map(({ district, count }) => ({ district, count })),
    [{ district: "owned", count: 3 }, { district: "contributed", count: 2 }],
  );
});

test("supports the mapper's full twelve-building flow into either district", () => {
  const allOwned = snapshot(Array.from({ length: 12 }, (_, index) => repository(`home-${index}`, 4)));
  const ownedLayout = buildTownLayout(allOwned);
  assert.equal(ownedLayout.buildings.length, 12);
  assert.equal(overlappingPairs(ownedLayout.buildings), 0);
  assertBuildingsFit(ownedLayout.buildings, "owned");

  const allContributed = snapshot([]);
  allContributed.districts.contributed.sourceRepositoryCount = 12;
  allContributed.districts.contributed.repositories = Array.from(
    { length: 12 },
    (_, index) => repository(`visit-${index}`, 4, "neighbor"),
  );
  const contributedLayout = buildTownLayout(allContributed);
  assert.equal(contributedLayout.buildings.length, 12);
  assert.equal(overlappingPairs(contributedLayout.buildings), 0);
  assertBuildingsFit(contributedLayout.buildings, "contributed");
});

function repository(id: string, tier: 0 | 1 | 2 | 3 | 4, owner = "octocat"): TownRepositoryV1 {
  const stars = [0, 1, 5, 25, 100][tier]!;
  return {
    githubId: id,
    name: id,
    nameWithOwner: `${owner}/${id}`,
    description: null,
    url: `https://github.com/${owner}/${id}`,
    ownerLogin: owner,
    isFork: false,
    isArchived: false,
    createdAt: "2024-01-01T00:00:00Z",
    updatedAt: "2026-07-15T00:00:00Z",
    pushedAt: "2026-07-15T00:00:00Z",
    stars,
    starProminenceTier: tier,
    recencyTier: "active",
    issuesLifetime: 0,
    pullRequestsLifetime: 0,
    languages: {
      totalBytes: 100,
      weights: [{ name: "TypeScript", bytes: 100, sourceColor: "#3178c6" }],
      primary: { name: "TypeScript", bytes: 100, sourceColor: "#3178c6", share: 1 },
      secondary: [],
      otherBytes: 0,
      otherShare: 0,
    },
  };
}

function snapshot(owned: TownRepositoryV1[]): TownSnapshot {
  const start = Date.parse("2025-07-17T00:00:00Z");
  return {
    schemaVersion: 1,
    mappingVersion: 1,
    asOf: "2026-07-16T00:00:00Z",
    layoutSeed: "github:user-1:schema:1:mapping:1",
    profile: {
      githubId: "user-1", login: "octocat", name: null,
      avatarUrl: "https://avatars.example/octocat", followers: 0, visitorTier: 0,
      pullRequestsAuthoredLifetime: 0, issuesAuthoredLifetime: 0,
    },
    contributions: {
      window: { from: "2025-07-17T00:00:00Z", to: "2026-07-16T00:00:00Z" },
      totals: {
        commitContributions: 0, issueContributions: 0, pullRequestContributions: 0,
        pullRequestReviewContributions: 0, allContributions: 0, restrictedContributions: 0,
      },
      civic: {
        issues: { count: 0, intensityTier: 0 },
        pullRequests: { count: 0, intensityTier: 0 },
        pullRequestReviews: { count: 0, intensityTier: 0 },
      },
      days: Array.from({ length: 365 }, (_, index) => ({
        date: new Date(start + index * 86_400_000).toISOString().slice(0, 10),
        count: 0, level: "NONE" as const, intensity: 0 as const,
      })),
    },
    economy: { starlightEarned: 0, mode: "display_only" },
    districts: {
      owned: { sourceRepositoryCount: owned.length, overflowRepositoryCount: 0, repositories: owned },
      contributed: {
        scope: "github_recently_contributed", sourceRepositoryCount: 0,
        overflowRepositoryCount: 0, repositories: [],
      },
    },
    languageMix: { totalBytes: 0, weights: [], otherBytes: 0, otherShare: 0 },
  };
}

function repositoryPositions(layout: ReturnType<typeof buildTownLayout>) {
  return [...layout.buildings]
    .map(({ repository: item, anchor, bounds }) => ({ id: item.githubId, anchor, bounds }))
    .sort((left, right) => left.id.localeCompare(right.id));
}

function overlappingPairs(buildings: ReturnType<typeof buildTownLayout>["buildings"]): number {
  let overlaps = 0;
  for (let left = 0; left < buildings.length; left += 1) {
    for (let right = left + 1; right < buildings.length; right += 1) {
      const a = buildings[left]!.bounds;
      const b = buildings[right]!.bounds;
      if (
        a.x < b.x + b.width && a.x + a.width > b.x &&
        a.y < b.y + b.height && a.y + a.height > b.y
      ) overlaps += 1;
    }
  }
  return overlaps;
}

function assertBuildingsFit(
  buildings: ReturnType<typeof buildTownLayout>["buildings"],
  district: "owned" | "contributed",
): void {
  const envelopes = buildings.map(buildingRenderBounds);
  for (const bounds of envelopes) {
    assert.ok(bounds.x >= 0);
    assert.ok(bounds.y >= 0);
    assert.ok(bounds.x + bounds.width <= TOWN_VIEWPORT.width);
    assert.ok(bounds.y + bounds.height <= 223, "buildings must clear the contribution garden");
    if (district === "owned") assert.ok(bounds.x + bounds.width <= 169);
    else assert.ok(bounds.x >= 215);
  }

  for (let left = 0; left < envelopes.length; left += 1) {
    for (let right = left + 1; right < envelopes.length; right += 1) {
      const a = envelopes[left]!;
      const b = envelopes[right]!;
      assert.ok(
        a.x + a.width <= b.x || b.x + b.width <= a.x ||
        a.y + a.height <= b.y || b.y + b.height <= a.y,
        "painted building envelopes must not overlap",
      );
    }
  }
}
