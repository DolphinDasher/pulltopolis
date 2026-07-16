import assert from "node:assert/strict";
import test from "node:test";

import type { TownRepositoryV1, TownSnapshot } from "../shared/town-snapshot.js";
import {
  README_CARD_HEIGHT,
  README_CARD_WIDTH,
  generateReadmeTownCard,
  readmeTownCardFilename,
  readmeTownCardMarkdown,
} from "./readme-card.js";

test("README town card is deterministic and canonical across repository source ordering", () => {
  const town = fixtureTown();
  const reordered = structuredClone(town);
  reordered.districts.owned.repositories.reverse();

  const card = generateReadmeTownCard(town);
  assert.equal(card, generateReadmeTownCard(town));
  assert.equal(card, generateReadmeTownCard(reordered));
  assert.match(card, new RegExp(`viewBox="0 0 ${README_CARD_WIDTH} ${README_CARD_HEIGHT}"`));
  assert.equal(card.match(/data-repository-building=/g)?.length, 3);
});

test("README town card escapes GitHub text and contains no active or remote content", () => {
  const town = fixtureTown();
  town.profile.name = `Cat & Co </text><script>alert("x")</script>`;
  town.districts.owned.repositories[0]!.githubId = `id" onload="alert('x')`;
  town.districts.owned.repositories[0]!.languages.primary!.name = `</text><image href="https://bad.example/x"/>`;
  town.languageMix.weights[0]!.name = `</text><image href="https://bad.example/x"/>`;

  const card = generateReadmeTownCard(town);
  assert.match(card, /Cat &amp; Co &lt;\/text&gt;&lt;scrip/);
  assert.doesNotMatch(card, /<script\b/i);
  assert.doesNotMatch(card, /<image\b/i);
  assert.doesNotMatch(card, /<foreignObject\b/i);
  assert.doesNotMatch(card, /\b(?:href|src)=/i);
  assert.doesNotMatch(card, /url\(/i);
});

test("README town card is accessible and truthful about the contributed district", () => {
  const card = generateReadmeTownCard(fixtureTown());

  assert.match(card, /role="img"/);
  assert.match(card, /<title id="pulltopolis-title">/);
  assert.match(card, /<desc id="pulltopolis-description">/);
  assert.match(card, /GitHub-reported recently contributed-to repositories/);
  assert.match(card, /Identity over leaderboard/);
  assert.doesNotMatch(card, /better than|inactive|decay|failure/i);
});

test("README card filename and Markdown reference are repository-ready", () => {
  const town = fixtureTown();
  assert.equal(readmeTownCardFilename(town), "pulltopolis-test-user.svg");
  assert.equal(
    readmeTownCardMarkdown(town),
    "![PullTopolis town for @test-user](./pulltopolis-test-user.svg)",
  );
});

function fixtureTown(): TownSnapshot {
  const owned = [
    repository("owned-b", "Borough", 3, "TypeScript", "active"),
    repository("owned-a", "Archive", 1, "HTML", "resting", true),
  ];
  const contributed = [repository("contributed-a", "Commons", 2, "Python", "warm")];
  const days = Array.from({ length: 365 }, (_, index) => {
    const date = new Date(Date.UTC(2025, 0, 2 + index)).toISOString().slice(0, 10);
    const intensity = (index % 5) as 0 | 1 | 2 | 3 | 4;
    const levels = ["NONE", "FIRST_QUARTILE", "SECOND_QUARTILE", "THIRD_QUARTILE", "FOURTH_QUARTILE"] as const;
    return { date, count: intensity, level: levels[intensity], intensity };
  });

  return {
    schemaVersion: 1,
    mappingVersion: 1,
    asOf: "2026-01-01T00:00:00.000Z",
    layoutSeed: "profile-id:v1:1",
    profile: {
      githubId: "profile-id",
      login: "test-user",
      name: "Test User",
      avatarUrl: "https://avatars.githubusercontent.com/u/1?v=4",
      followers: 4,
      visitorTier: 1,
      pullRequestsAuthoredLifetime: 2,
      issuesAuthoredLifetime: 3,
    },
    contributions: {
      window: { from: "2025-01-02T00:00:00.000Z", to: "2026-01-01T00:00:00.000Z" },
      totals: {
        commitContributions: 10,
        issueContributions: 2,
        pullRequestContributions: 3,
        pullRequestReviewContributions: 4,
        allContributions: 19,
        restrictedContributions: 0,
      },
      civic: {
        issues: { count: 2, intensityTier: 1 },
        pullRequests: { count: 3, intensityTier: 1 },
        pullRequestReviews: { count: 4, intensityTier: 1 },
      },
      days,
    },
    economy: { starlightEarned: 9, mode: "display_only" },
    districts: {
      owned: { sourceRepositoryCount: 2, overflowRepositoryCount: 0, repositories: owned },
      contributed: {
        scope: "github_recently_contributed",
        sourceRepositoryCount: 1,
        overflowRepositoryCount: 0,
        repositories: contributed,
      },
    },
    languageMix: {
      totalBytes: 100,
      weights: [
        { name: "TypeScript", bytes: 60, sourceColor: null, share: 0.6 },
        { name: "Python", bytes: 30, sourceColor: null, share: 0.3 },
      ],
      otherBytes: 10,
      otherShare: 0.1,
    },
  };
}

function repository(
  githubId: string,
  name: string,
  starProminenceTier: 0 | 1 | 2 | 3 | 4,
  language: string,
  recencyTier: "active" | "warm" | "quiet" | "resting",
  isArchived = false,
): TownRepositoryV1 {
  return {
    githubId,
    name,
    nameWithOwner: `test-user/${name}`,
    description: null,
    url: `https://github.com/test-user/${name}`,
    ownerLogin: "test-user",
    isFork: false,
    isArchived,
    createdAt: "2020-01-01T00:00:00.000Z",
    updatedAt: "2025-12-31T00:00:00.000Z",
    pushedAt: recencyTier === "resting" ? null : "2025-12-31T00:00:00.000Z",
    stars: starProminenceTier,
    starProminenceTier,
    recencyTier,
    issuesLifetime: 0,
    pullRequestsLifetime: 0,
    languages: {
      totalBytes: 10,
      weights: [{ name: language, bytes: 10, sourceColor: null }],
      primary: { name: language, bytes: 10, sourceColor: null, share: 1 },
      secondary: [],
      otherBytes: 0,
      otherShare: 0,
    },
  };
}
