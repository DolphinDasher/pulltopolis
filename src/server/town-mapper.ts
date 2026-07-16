import {
  parseTownSnapshot,
  TOWN_SNAPSHOT_MAPPING_VERSION,
  TOWN_SNAPSHOT_SCHEMA_VERSION,
  type TownRepositoryV1,
  type TownSnapshotV1,
  type TownTier,
} from "../shared/town-snapshot.js";
import type {
  GitHubContributionDay,
  GitHubLanguageEdge,
  GitHubRepository,
  GitHubUserData,
} from "./github/index.js";
import type { TownSnapshotMappingContext } from "./town-snapshot-service.js";

const DAY_MS = 24 * 60 * 60 * 1_000;
const GARDEN_DAYS = 365;
const BUILDING_CAP = 12;
const OWNED_RESERVED_SLOTS = 8;
const CONTRIBUTED_RESERVED_SLOTS = 4;

const CONTRIBUTION_INTENSITY = {
  NONE: 0,
  FIRST_QUARTILE: 1,
  SECOND_QUARTILE: 2,
  THIRD_QUARTILE: 3,
  FOURTH_QUARTILE: 4,
} as const;

export function mapGitHubUserDataToTownSnapshot(
  source: GitHubUserData,
  context: TownSnapshotMappingContext,
): TownSnapshotV1 {
  const profile = source.profile;
  const selected = selectRepositories(source);
  const snapshot: TownSnapshotV1 = {
    schemaVersion: TOWN_SNAPSHOT_SCHEMA_VERSION,
    mappingVersion: TOWN_SNAPSHOT_MAPPING_VERSION,
    asOf: context.generatedAt,
    layoutSeed: `github:${profile.id}:schema:${TOWN_SNAPSHOT_SCHEMA_VERSION}:mapping:${TOWN_SNAPSHOT_MAPPING_VERSION}`,
    profile: {
      githubId: profile.id,
      login: profile.login,
      name: profile.name,
      avatarUrl: profile.avatarUrl,
      followers: profile.followers.totalCount,
      visitorTier: followerTier(profile.followers.totalCount),
      pullRequestsAuthoredLifetime: profile.pullRequests.totalCount,
      issuesAuthoredLifetime: profile.issues.totalCount,
    },
    contributions: {
      window: context.contributionWindow,
      totals: {
        commitContributions: profile.contributionsCollection.totalCommitContributions,
        issueContributions: profile.contributionsCollection.totalIssueContributions,
        pullRequestContributions:
          profile.contributionsCollection.totalPullRequestContributions,
        pullRequestReviewContributions:
          profile.contributionsCollection.totalPullRequestReviewContributions,
        allContributions:
          profile.contributionsCollection.contributionCalendar.totalContributions,
        restrictedContributions: profile.contributionsCollection.restrictedContributionsCount,
      },
      civic: {
        issues: civicMetric(profile.contributionsCollection.totalIssueContributions),
        pullRequests: civicMetric(
          profile.contributionsCollection.totalPullRequestContributions,
        ),
        pullRequestReviews: civicMetric(
          profile.contributionsCollection.totalPullRequestReviewContributions,
        ),
      },
      days: mapGardenDays(
        profile.contributionsCollection.contributionCalendar.weeks.flatMap(
          (week) => week.contributionDays,
        ),
        context.contributionWindow.to,
      ),
    },
    economy: {
      starlightEarned: sumSafeIntegers(
        source.ownedRepositories
          .filter((repository) => !repository.isFork)
          .map((repository) => repository.stargazerCount),
        "Starlight",
      ),
      mode: "display_only",
    },
    languageMix: mapTownLanguageMix(source.ownedRepositories),
    districts: {
      owned: {
        sourceRepositoryCount: source.ownedRepositories.length,
        overflowRepositoryCount:
          source.ownedRepositories.length - selected.owned.length,
        repositories: selected.owned.map((repository) =>
          mapRepository(repository, context.generatedAt),
        ),
      },
      contributed: {
        scope: "github_recently_contributed",
        sourceRepositoryCount: source.contributedRepositories.length,
        overflowRepositoryCount:
          source.contributedRepositories.length - selected.contributed.length,
        repositories: selected.contributed.map((repository) =>
          mapRepository(repository, context.generatedAt),
        ),
      },
    },
  };

  return parseTownSnapshot(snapshot);
}

function selectRepositories(source: GitHubUserData): {
  owned: GitHubRepository[];
  contributed: GitHubRepository[];
} {
  const ownedIds = new Set(source.ownedRepositories.map((repository) => repository.id));
  const owned = source.ownedRepositories.filter((repository) => !repository.isFork).sort(compareRepositories);
  const contributed = source.contributedRepositories
    .filter((repository) => !ownedIds.has(repository.id))
    .sort(compareRepositories);

  const selectedOwned = owned.slice(0, OWNED_RESERVED_SLOTS);
  const selectedContributed = contributed.slice(0, CONTRIBUTED_RESERVED_SLOTS);
  let remaining = BUILDING_CAP - selectedOwned.length - selectedContributed.length;

  if (remaining > 0) {
    const ownedOverflow = owned.slice(OWNED_RESERVED_SLOTS, OWNED_RESERVED_SLOTS + remaining);
    selectedOwned.push(...ownedOverflow);
    remaining -= ownedOverflow.length;
  }
  if (remaining > 0) {
    selectedContributed.push(
      ...contributed.slice(
        CONTRIBUTED_RESERVED_SLOTS,
        CONTRIBUTED_RESERVED_SLOTS + remaining,
      ),
    );
  }

  return { owned: selectedOwned, contributed: selectedContributed };
}

function compareRepositories(left: GitHubRepository, right: GitHubRepository): number {
  if (left.isArchived !== right.isArchived) return left.isArchived ? 1 : -1;

  const leftPushed = timestampOrOldest(left.pushedAt);
  const rightPushed = timestampOrOldest(right.pushedAt);
  if (leftPushed !== rightPushed) return rightPushed > leftPushed ? 1 : -1;

  if (left.stargazerCount !== right.stargazerCount) {
    return right.stargazerCount - left.stargazerCount;
  }

  const name = compareText(left.nameWithOwner, right.nameWithOwner);
  return name === 0 ? compareText(left.id, right.id) : name;
}

function mapRepository(repository: GitHubRepository, asOf: string): TownRepositoryV1 {
  return {
    githubId: repository.id,
    name: repository.name,
    nameWithOwner: repository.nameWithOwner,
    description: repository.description,
    url: repository.url,
    ownerLogin: repository.owner.login,
    isFork: repository.isFork,
    isArchived: repository.isArchived,
    createdAt: repository.createdAt,
    updatedAt: repository.updatedAt,
    pushedAt: repository.pushedAt,
    stars: repository.stargazerCount,
    starProminenceTier: starTier(repository.stargazerCount),
    recencyTier: repositoryRecencyTier(repository.pushedAt, asOf),
    issuesLifetime: repository.issues.totalCount,
    pullRequestsLifetime: repository.pullRequests.totalCount,
    languages: mapRepositoryLanguages(repository.languages.totalSize, repository.languages.edges),
  };
}

function starTier(stars: number): TownTier {
  if (stars >= 100) return 4;
  if (stars >= 25) return 3;
  if (stars >= 5) return 2;
  if (stars >= 1) return 1;
  return 0;
}

function followerTier(followers: number): TownTier {
  if (followers >= 100) return 4;
  if (followers >= 25) return 3;
  if (followers >= 5) return 2;
  if (followers >= 1) return 1;
  return 0;
}

function civicMetric(count: number): { count: number; intensityTier: TownTier } {
  let intensityTier: TownTier = 0;
  if (count >= 50) intensityTier = 4;
  else if (count >= 20) intensityTier = 3;
  else if (count >= 5) intensityTier = 2;
  else if (count >= 1) intensityTier = 1;
  return { count, intensityTier };
}

function repositoryRecencyTier(
  pushedAt: string | null,
  asOf: string,
): TownRepositoryV1["recencyTier"] {
  if (pushedAt === null) return "resting";
  const pushedDay = utcDayTimestamp(pushedAt);
  const asOfDay = utcDayTimestamp(asOf);
  if (pushedDay === null || asOfDay === null) return "resting";

  const days = Math.max(0, Math.floor((asOfDay - pushedDay) / DAY_MS));
  if (days <= 30) return "active";
  if (days <= 180) return "warm";
  if (days <= 365) return "quiet";
  return "resting";
}

function mapGardenDays(
  days: GitHubContributionDay[],
  windowTo: string,
): TownSnapshotV1["contributions"]["days"] {
  const end = utcDayTimestamp(windowTo);
  if (end === null) throw new TypeError("Contribution window end must be a valid timestamp");

  const byDate = new Map<string, GitHubContributionDay>();
  for (const day of days) {
    if (byDate.has(day.date)) throw new TypeError(`Duplicate contribution date: ${day.date}`);
    byDate.set(day.date, day);
  }

  return Array.from({ length: GARDEN_DAYS }, (_, index) => {
    const time = end - (GARDEN_DAYS - 1 - index) * DAY_MS;
    const date = new Date(time).toISOString().slice(0, 10);
    const source = byDate.get(date);
    if (!source) return { date, count: 0, level: "NONE", intensity: 0 };
    return {
      date,
      count: source.contributionCount,
      level: source.contributionLevel,
      intensity: CONTRIBUTION_INTENSITY[source.contributionLevel],
    };
  });
}

interface AggregatedLanguage {
  name: string;
  bytes: number;
  sourceColor: string | null;
}

function mapRepositoryLanguages(
  totalBytes: number,
  edges: Array<GitHubLanguageEdge | null> | null,
): TownRepositoryV1["languages"] {
  const weights = aggregateLanguages(edges ?? []);
  requireRepresentedBytes(totalBytes, weights);

  const primaryWeight = weights[0];
  const primary = primaryWeight ? withShare(primaryWeight, totalBytes) : null;
  const secondary = weights
    .slice(1)
    .filter((weight) => totalBytes > 0 && weight.bytes / totalBytes >= 0.1)
    .slice(0, 2)
    .map((weight) => withShare(weight, totalBytes));
  const selectedBytes = (primary?.bytes ?? 0) + secondary.reduce((sum, item) => sum + item.bytes, 0);
  const otherBytes = totalBytes - selectedBytes;

  return {
    totalBytes,
    weights,
    primary,
    secondary,
    otherBytes,
    otherShare: share(otherBytes, totalBytes),
  };
}

function mapTownLanguageMix(repositories: GitHubRepository[]): TownSnapshotV1["languageMix"] {
  const included = repositories.filter(
    (repository) => !repository.isFork && !repository.isArchived,
  );
  const totalBytes = sumSafeIntegers(
    included.map((repository) => repository.languages.totalSize),
    "Town language bytes",
  );
  const weights = aggregateLanguages(
    included.flatMap((repository) => repository.languages.edges ?? []),
  );
  const representedBytes = requireRepresentedBytes(totalBytes, weights);
  const otherBytes = totalBytes - representedBytes;

  return {
    totalBytes,
    weights: weights.map((weight) => withShare(weight, totalBytes)),
    otherBytes,
    otherShare: share(otherBytes, totalBytes),
  };
}

function aggregateLanguages(edges: Array<GitHubLanguageEdge | null>): AggregatedLanguage[] {
  const totals = new Map<string, AggregatedLanguage>();
  for (const edge of edges) {
    if (!edge || edge.size <= 0) continue;
    const name = edge.node.name.trim();
    if (!name) continue;
    const key = name.toLocaleLowerCase("en-US");
    const existing = totals.get(key);
    if (!existing) {
      totals.set(key, { name, bytes: edge.size, sourceColor: edge.node.color });
      continue;
    }
    existing.bytes = checkedAdd(existing.bytes, edge.size, `Language ${name}`);
    if (compareText(name, existing.name) < 0) existing.name = name;
    existing.sourceColor = preferredColor(existing.sourceColor, edge.node.color);
  }

  return [...totals.values()].sort(
    (left, right) => right.bytes - left.bytes || compareText(left.name, right.name),
  );
}

function withShare(
  language: AggregatedLanguage,
  totalBytes: number,
): AggregatedLanguage & { share: number } {
  return { ...language, share: share(language.bytes, totalBytes) };
}

function share(bytes: number, totalBytes: number): number {
  return totalBytes === 0 ? 0 : bytes / totalBytes;
}

function requireRepresentedBytes(totalBytes: number, weights: AggregatedLanguage[]): number {
  const represented = sumSafeIntegers(
    weights.map((weight) => weight.bytes),
    "Represented language bytes",
  );
  if (represented > totalBytes) {
    throw new RangeError("Represented language bytes cannot exceed GitHub totalSize");
  }
  return represented;
}

function preferredColor(left: string | null, right: string | null): string | null {
  if (left === null) return right;
  if (right === null) return left;
  return compareText(left, right) <= 0 ? left : right;
}

function sumSafeIntegers(values: number[], label: string): number {
  return values.reduce((sum, value) => checkedAdd(sum, value, label), 0);
}

function checkedAdd(left: number, right: number, label: string): number {
  const sum = left + right;
  if (!Number.isSafeInteger(sum) || sum < 0) throw new RangeError(`${label} must be a safe count`);
  return sum;
}

function utcDayTimestamp(value: string): number | null {
  const parsed = new Date(value);
  if (!Number.isFinite(parsed.getTime())) return null;
  return Date.UTC(parsed.getUTCFullYear(), parsed.getUTCMonth(), parsed.getUTCDate());
}

function timestampOrOldest(value: string | null): number {
  if (value === null) return Number.NEGATIVE_INFINITY;
  const parsed = Date.parse(value);
  return Number.isFinite(parsed) ? parsed : Number.NEGATIVE_INFINITY;
}

function compareText(left: string, right: string): number {
  const normalizedLeft = left.toLowerCase();
  const normalizedRight = right.toLowerCase();
  if (normalizedLeft < normalizedRight) return -1;
  if (normalizedLeft > normalizedRight) return 1;
  if (left < right) return -1;
  if (left > right) return 1;
  return 0;
}
