import assert from "node:assert/strict";
import test from "node:test";

import type { TownRepositoryV1 } from "../../shared/town-snapshot.js";
import { buildingVisualSpec, languageMonogram, recencyAmbience, spriteFrame } from "./visuals.js";

test("repository recency selects only approved ambience states", () => {
  assert.deepEqual(recencyAmbience("active"), { litWindows: 2, showSmoke: true });
  assert.deepEqual(recencyAmbience("warm"), { litWindows: 1, showSmoke: false });
  assert.deepEqual(recencyAmbience("quiet"), { litWindows: 0, showSmoke: false });
  assert.deepEqual(recencyAmbience("resting"), { litWindows: 0, showSmoke: false });
});

test("archived repositories remain complete heritage buildings", () => {
  const spec = buildingVisualSpec(repository({ isArchived: true, recencyTier: "resting" }));
  assert.equal(spec.showHeritageIvy, true);
  assert.equal(spec.showSmoke, false);
  assert.equal(spec.ornamentTier, 2);
});

test("sprite animation advances at eight frames per second and respects reduced motion", () => {
  assert.equal(spriteFrame(0, false), 0);
  assert.equal(spriteFrame(124, false), 0);
  assert.equal(spriteFrame(125, false), 1);
  assert.equal(spriteFrame(1_000, false), 0);
  assert.equal(spriteFrame(999, true), 0);
});

test("language monograms provide a redundant visible language cue", () => {
  assert.equal(languageMonogram("TypeScript"), "T");
  assert.equal(languageMonogram("C++"), "C");
  assert.equal(languageMonogram(null), "·");
});

function repository(overrides: Partial<TownRepositoryV1>): TownRepositoryV1 {
  return {
    githubId: "repo", name: "repo", nameWithOwner: "octocat/repo", description: null,
    url: "https://github.com/octocat/repo", ownerLogin: "octocat", isFork: false,
    isArchived: false, createdAt: "2024-01-01T00:00:00Z",
    updatedAt: "2026-07-15T00:00:00Z", pushedAt: "2026-07-15T00:00:00Z",
    stars: 5, starProminenceTier: 2, recencyTier: "active", issuesLifetime: 0,
    pullRequestsLifetime: 0,
    languages: {
      totalBytes: 0, weights: [], primary: null, secondary: [], otherBytes: 0, otherShare: 0,
    },
    ...overrides,
  };
}
