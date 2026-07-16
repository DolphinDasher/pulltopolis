export const TOWN_SNAPSHOT_SCHEMA_VERSION = 1 as const;
export const TOWN_SNAPSHOT_MAPPING_VERSION = 1 as const;

export type TownContributionLevel =
  | "NONE"
  | "FIRST_QUARTILE"
  | "SECOND_QUARTILE"
  | "THIRD_QUARTILE"
  | "FOURTH_QUARTILE";

export type TownTier = 0 | 1 | 2 | 3 | 4;

export type TownRepositoryRecencyTier = "active" | "warm" | "quiet" | "resting";

export interface TownLanguageWeightV1 {
  name: string;
  bytes: number;
  /** GitHub's language metadata, not a PullTopolis art-direction choice. */
  sourceColor: string | null;
}

export interface TownLanguageShareV1 extends TownLanguageWeightV1 {
  /** Fraction of the containing language total, from 0 through 1. */
  share: number;
}

export interface TownRepositoryV1 {
  githubId: string;
  name: string;
  nameWithOwner: string;
  description: string | null;
  url: string;
  ownerLogin: string;
  isFork: boolean;
  isArchived: boolean;
  createdAt: string;
  updatedAt: string;
  pushedAt: string | null;
  stars: number;
  starProminenceTier: TownTier;
  recencyTier: TownRepositoryRecencyTier;
  issuesLifetime: number;
  pullRequestsLifetime: number;
  languages: {
    totalBytes: number;
    weights: TownLanguageWeightV1[];
    primary: TownLanguageShareV1 | null;
    secondary: TownLanguageShareV1[];
    otherBytes: number;
    otherShare: number;
  };
}

export interface TownContributionDayV1 {
  date: string;
  count: number;
  level: TownContributionLevel;
  intensity: TownTier;
}

export interface TownCivicActivityV1 {
  count: number;
  intensityTier: TownTier;
}

export interface TownLanguageMixV1 {
  /** Owned, public, non-fork, non-archived repository language bytes. */
  totalBytes: number;
  weights: TownLanguageShareV1[];
  otherBytes: number;
  otherShare: number;
}

/**
 * The only JSON contract between GitHub-aware server code and the town UI.
 * It intentionally contains normalized facts, not pixel-art or layout choices.
 */
export interface TownSnapshotV1 {
  schemaVersion: typeof TOWN_SNAPSHOT_SCHEMA_VERSION;
  mappingVersion: typeof TOWN_SNAPSHOT_MAPPING_VERSION;
  /** Time at which the GitHub data represented by this snapshot was fetched. */
  asOf: string;
  /** Stable input for deterministic layout; never a credential. */
  layoutSeed: string;
  profile: {
    githubId: string;
    login: string;
    name: string | null;
    avatarUrl: string;
    followers: number;
    visitorTier: TownTier;
    pullRequestsAuthoredLifetime: number;
    issuesAuthoredLifetime: number;
  };
  contributions: {
    window: {
      from: string;
      to: string;
    };
    totals: {
      commitContributions: number;
      issueContributions: number;
      pullRequestContributions: number;
      pullRequestReviewContributions: number;
      allContributions: number;
      restrictedContributions: number;
    };
    civic: {
      issues: TownCivicActivityV1;
      pullRequests: TownCivicActivityV1;
      pullRequestReviews: TownCivicActivityV1;
    };
    days: TownContributionDayV1[];
  };
  economy: {
    /** Display-only total produced by the versioned mapping rules. */
    starlightEarned: number;
    mode: "display_only";
  };
  districts: {
    owned: {
      sourceRepositoryCount: number;
      overflowRepositoryCount: number;
      repositories: TownRepositoryV1[];
    };
    contributed: {
      /** GitHub exposes recent contribution membership, not lifetime history. */
      scope: "github_recently_contributed";
      sourceRepositoryCount: number;
      overflowRepositoryCount: number;
      repositories: TownRepositoryV1[];
    };
  };
  languageMix: TownLanguageMixV1;
}

export type TownSnapshot = TownSnapshotV1;

export class TownSnapshotValidationError extends TypeError {
  constructor(path: string, expectation: string) {
    super(`Invalid TownSnapshot at ${path}: ${expectation}`);
    this.name = "TownSnapshotValidationError";
  }
}

export function parseTownSnapshot(value: unknown): TownSnapshot {
  assertTownSnapshot(value);
  return value;
}

export function assertTownSnapshot(value: unknown): asserts value is TownSnapshot {
  const snapshot = requireRecord(value, "$", "must be an object");
  requireLiteral(snapshot.schemaVersion, TOWN_SNAPSHOT_SCHEMA_VERSION, "$.schemaVersion");
  requireLiteral(snapshot.mappingVersion, TOWN_SNAPSHOT_MAPPING_VERSION, "$.mappingVersion");
  const asOf = requireTimestamp(snapshot.asOf, "$.asOf");
  requireNonEmptyString(snapshot.layoutSeed, "$.layoutSeed");

  validateProfile(snapshot.profile);
  validateContributions(snapshot.contributions);
  validateEconomy(snapshot.economy);
  validateDistricts(snapshot.districts, asOf);
  validateLanguageMix(snapshot.languageMix);
}

function validateProfile(value: unknown): void {
  const profile = requireRecord(value, "$.profile");
  requireNonEmptyString(profile.githubId, "$.profile.githubId");
  requireNonEmptyString(profile.login, "$.profile.login");
  if (profile.name !== null && typeof profile.name !== "string") {
    invalid("$.profile.name", "must be a string or null");
  }
  requireHttpUrl(profile.avatarUrl, "$.profile.avatarUrl");
  const followers = requireCount(profile.followers, "$.profile.followers");
  const visitorTier = requireTier(profile.visitorTier, "$.profile.visitorTier");
  if (visitorTier !== broadTier(followers)) {
    invalid("$.profile.visitorTier", "must match the approved follower bands");
  }
  requireCount(profile.pullRequestsAuthoredLifetime, "$.profile.pullRequestsAuthoredLifetime");
  requireCount(profile.issuesAuthoredLifetime, "$.profile.issuesAuthoredLifetime");
}

function validateContributions(value: unknown): void {
  const contributions = requireRecord(value, "$.contributions");
  const window = requireRecord(contributions.window, "$.contributions.window");
  const from = requireTimestamp(window.from, "$.contributions.window.from");
  const to = requireTimestamp(window.to, "$.contributions.window.to");
  if (Date.parse(from) > Date.parse(to)) {
    invalid("$.contributions.window", "from must not be later than to");
  }

  const totals = requireRecord(contributions.totals, "$.contributions.totals");
  for (const field of [
    "commitContributions",
    "issueContributions",
    "pullRequestContributions",
    "pullRequestReviewContributions",
    "allContributions",
    "restrictedContributions",
  ] as const) {
    requireCount(totals[field], `$.contributions.totals.${field}`);
  }

  const civic = requireRecord(contributions.civic, "$.contributions.civic");
  validateCivicActivity(
    civic.issues,
    "$.contributions.civic.issues",
    totals.issueContributions,
  );
  validateCivicActivity(
    civic.pullRequests,
    "$.contributions.civic.pullRequests",
    totals.pullRequestContributions,
  );
  validateCivicActivity(
    civic.pullRequestReviews,
    "$.contributions.civic.pullRequestReviews",
    totals.pullRequestReviewContributions,
  );

  const days = requireArray(contributions.days, "$.contributions.days");
  if (days.length !== 365) invalid("$.contributions.days", "must contain exactly 365 days");
  const endDate = new Date(to).toISOString().slice(0, 10);
  days.forEach((day, index) => {
    const path = `$.contributions.days[${index}]`;
    const item = requireRecord(day, path);
    const date = requireDate(item.date, `${path}.date`);
    const expectedDate = offsetDate(endDate, index - 364);
    if (date !== expectedDate) {
      invalid(`${path}.date`, "must be in the ordered 365-day window ending on window.to");
    }
    requireCount(item.count, `${path}.count`);
    const level = requireOneOf(
      item.level,
      ["NONE", "FIRST_QUARTILE", "SECOND_QUARTILE", "THIRD_QUARTILE", "FOURTH_QUARTILE"],
      `${path}.level`,
    );
    const intensity = requireTier(item.intensity, `${path}.intensity`);
    if (intensity !== contributionIntensity(level)) {
      invalid(`${path}.intensity`, "must match the GitHub contribution level");
    }
  });
}

function validateCivicActivity(value: unknown, path: string, expectedCount: unknown): void {
  const activity = requireRecord(value, path);
  const count = requireCount(activity.count, `${path}.count`);
  if (count !== expectedCount) invalid(`${path}.count`, "must match the exact contribution total");
  const intensityTier = requireTier(activity.intensityTier, `${path}.intensityTier`);
  if (intensityTier !== civicTier(count)) {
    invalid(`${path}.intensityTier`, "must match the approved civic-activity bands");
  }
}

function validateEconomy(value: unknown): void {
  const economy = requireRecord(value, "$.economy");
  requireCount(economy.starlightEarned, "$.economy.starlightEarned");
  requireLiteral(economy.mode, "display_only", "$.economy.mode");
}

function validateDistricts(value: unknown, asOf: string): void {
  const districts = requireRecord(value, "$.districts");
  const owned = requireRecord(districts.owned, "$.districts.owned");
  const contributed = requireRecord(districts.contributed, "$.districts.contributed");
  requireLiteral(
    contributed.scope,
    "github_recently_contributed",
    "$.districts.contributed.scope",
  );

  const ownedSourceCount = requireCount(
    owned.sourceRepositoryCount,
    "$.districts.owned.sourceRepositoryCount",
  );
  const ownedOverflowCount = requireCount(
    owned.overflowRepositoryCount,
    "$.districts.owned.overflowRepositoryCount",
  );
  const contributedSourceCount = requireCount(
    contributed.sourceRepositoryCount,
    "$.districts.contributed.sourceRepositoryCount",
  );
  const contributedOverflowCount = requireCount(
    contributed.overflowRepositoryCount,
    "$.districts.contributed.overflowRepositoryCount",
  );

  const ids = new Set<string>();
  const ownedSelectedCount = validateRepositories(
    owned.repositories,
    "$.districts.owned.repositories",
    ids,
    asOf,
  );
  const contributedSelectedCount = validateRepositories(
    contributed.repositories,
    "$.districts.contributed.repositories",
    ids,
    asOf,
  );
  if (ownedSourceCount !== ownedSelectedCount + ownedOverflowCount) {
    invalid("$.districts.owned", "source count must equal selected plus overflow counts");
  }
  if (contributedSourceCount !== contributedSelectedCount + contributedOverflowCount) {
    invalid("$.districts.contributed", "source count must equal selected plus overflow counts");
  }
  if (ownedSelectedCount + contributedSelectedCount > 12) {
    invalid("$.districts", "must select at most 12 repository buildings");
  }
}

function validateRepositories(
  value: unknown,
  path: string,
  ids: Set<string>,
  asOf: string,
): number {
  const repositories = requireArray(value, path);
  repositories.forEach((repository, index) => {
    const itemPath = `${path}[${index}]`;
    const item = requireRecord(repository, itemPath);
    const githubId = requireNonEmptyString(item.githubId, `${itemPath}.githubId`);
    if (ids.has(githubId)) invalid(`${itemPath}.githubId`, "must be unique across districts");
    ids.add(githubId);

    requireNonEmptyString(item.name, `${itemPath}.name`);
    requireNonEmptyString(item.nameWithOwner, `${itemPath}.nameWithOwner`);
    if (item.description !== null && typeof item.description !== "string") {
      invalid(`${itemPath}.description`, "must be a string or null");
    }
    requireHttpUrl(item.url, `${itemPath}.url`);
    requireNonEmptyString(item.ownerLogin, `${itemPath}.ownerLogin`);
    requireBoolean(item.isFork, `${itemPath}.isFork`);
    requireBoolean(item.isArchived, `${itemPath}.isArchived`);
    requireTimestamp(item.createdAt, `${itemPath}.createdAt`);
    requireTimestamp(item.updatedAt, `${itemPath}.updatedAt`);
    const pushedAt =
      item.pushedAt === null ? null : requireTimestamp(item.pushedAt, `${itemPath}.pushedAt`);
    const stars = requireCount(item.stars, `${itemPath}.stars`);
    const starTier = requireTier(item.starProminenceTier, `${itemPath}.starProminenceTier`);
    if (starTier !== broadTier(stars)) {
      invalid(`${itemPath}.starProminenceTier`, "must match the approved star bands");
    }
    const recencyTier = requireOneOf(
      item.recencyTier,
      ["active", "warm", "quiet", "resting"],
      `${itemPath}.recencyTier`,
    );
    if (recencyTier !== repositoryRecencyTier(pushedAt, asOf)) {
      invalid(`${itemPath}.recencyTier`, "must match the approved repository-recency bands");
    }
    requireCount(item.issuesLifetime, `${itemPath}.issuesLifetime`);
    requireCount(item.pullRequestsLifetime, `${itemPath}.pullRequestsLifetime`);
    validateLanguages(item.languages, `${itemPath}.languages`);
  });
  return repositories.length;
}

function validateLanguages(value: unknown, path: string): void {
  const languages = requireRecord(value, path);
  const totalBytes = requireCount(languages.totalBytes, `${path}.totalBytes`);
  const weights = requireArray(languages.weights, `${path}.weights`);
  const names = new Set<string>();
  let representedBytes = 0;

  weights.forEach((weight, index) => {
    const itemPath = `${path}.weights[${index}]`;
    const item = validateLanguageWeight(weight, itemPath);
    const name = item.name;
    if (names.has(name)) invalid(`${itemPath}.name`, "must be unique within the repository");
    names.add(name);
    representedBytes += item.bytes;
  });

  if (representedBytes > totalBytes) {
    invalid(`${path}.weights`, "represented bytes must not exceed totalBytes");
  }

  const primary =
    languages.primary === null
      ? null
      : validateLanguageShare(languages.primary, `${path}.primary`, totalBytes);
  const secondary = requireArray(languages.secondary, `${path}.secondary`);
  if (secondary.length > 2) invalid(`${path}.secondary`, "must contain at most two languages");
  const selected = [
    ...(primary === null ? [] : [primary]),
    ...secondary.map((item, index) =>
      validateLanguageShare(item, `${path}.secondary[${index}]`, totalBytes),
    ),
  ];
  const selectedNames = new Set<string>();
  for (const language of selected) {
    if (selectedNames.has(language.name)) {
      invalid(path, "primary and secondary language names must be unique");
    }
    selectedNames.add(language.name);
    const raw = weights.find((item) => {
      const candidate = item as Record<string, unknown>;
      return (
        candidate.name === language.name &&
        candidate.bytes === language.bytes &&
        candidate.sourceColor === language.sourceColor
      );
    });
    if (!raw) invalid(path, "primary and secondary languages must match an exact raw weight");
  }
  for (const language of selected.slice(primary === null ? 0 : 1)) {
    if (language.share < 0.1) {
      invalid(`${path}.secondary`, "secondary language shares must be at least 0.1");
    }
  }

  const otherBytes = requireCount(languages.otherBytes, `${path}.otherBytes`);
  if (selected.reduce((total, language) => total + language.bytes, 0) + otherBytes !== totalBytes) {
    invalid(path, "selected language bytes plus otherBytes must equal totalBytes");
  }
  const otherShare = requireShare(languages.otherShare, `${path}.otherShare`);
  requireCalculatedShare(otherShare, otherBytes, totalBytes, `${path}.otherShare`);
}

function validateLanguageMix(value: unknown): void {
  const path = "$.languageMix";
  const mix = requireRecord(value, path);
  const totalBytes = requireCount(mix.totalBytes, `${path}.totalBytes`);
  const weights = requireArray(mix.weights, `${path}.weights`);
  const names = new Set<string>();
  let representedBytes = 0;
  weights.forEach((weight, index) => {
    const itemPath = `${path}.weights[${index}]`;
    const item = validateLanguageShare(weight, itemPath, totalBytes);
    if (names.has(item.name)) invalid(`${itemPath}.name`, "must be unique in the town mix");
    names.add(item.name);
    representedBytes += item.bytes;
  });
  const otherBytes = requireCount(mix.otherBytes, `${path}.otherBytes`);
  if (representedBytes + otherBytes !== totalBytes) {
    invalid(path, "represented language bytes plus otherBytes must equal totalBytes");
  }
  const otherShare = requireShare(mix.otherShare, `${path}.otherShare`);
  requireCalculatedShare(otherShare, otherBytes, totalBytes, `${path}.otherShare`);
}

function validateLanguageWeight(
  value: unknown,
  path: string,
): { name: string; bytes: number; sourceColor: string | null } {
  const item = requireRecord(value, path);
  const name = requireNonEmptyString(item.name, `${path}.name`);
  const bytes = requireCount(item.bytes, `${path}.bytes`);
  if (item.sourceColor !== null && typeof item.sourceColor !== "string") {
    invalid(`${path}.sourceColor`, "must be a string or null");
  }
  return { name, bytes, sourceColor: item.sourceColor as string | null };
}

function validateLanguageShare(
  value: unknown,
  path: string,
  totalBytes: number,
): { name: string; bytes: number; sourceColor: string | null; share: number } {
  const item = requireRecord(value, path);
  const weight = validateLanguageWeight(item, path);
  const share = requireShare(item.share, `${path}.share`);
  requireCalculatedShare(share, weight.bytes, totalBytes, `${path}.share`);
  return { ...weight, share };
}

function requireRecord(
  value: unknown,
  path: string,
  expectation = "must be an object",
): Record<string, unknown> {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    invalid(path, expectation);
  }
  return value as Record<string, unknown>;
}

function requireArray(value: unknown, path: string): unknown[] {
  if (!Array.isArray(value)) invalid(path, "must be an array");
  return value as unknown[];
}

function requireNonEmptyString(value: unknown, path: string): string {
  if (typeof value !== "string" || value.trim() === "") {
    invalid(path, "must be a non-empty string");
  }
  return value as string;
}

function requireBoolean(value: unknown, path: string): boolean {
  if (typeof value !== "boolean") invalid(path, "must be a boolean");
  return value as boolean;
}

function requireCount(value: unknown, path: string): number {
  if (!Number.isSafeInteger(value) || (value as number) < 0) {
    invalid(path, "must be a non-negative safe integer");
  }
  return value as number;
}

function requireTier(value: unknown, path: string): TownTier {
  if (!Number.isInteger(value) || (value as number) < 0 || (value as number) > 4) {
    invalid(path, "must be an integer tier from 0 through 4");
  }
  return value as TownTier;
}

function requireShare(value: unknown, path: string): number {
  if (typeof value !== "number" || !Number.isFinite(value) || value < 0 || value > 1) {
    invalid(path, "must be a finite share from 0 through 1");
  }
  return value;
}

function requireCalculatedShare(
  share: number,
  bytes: number,
  totalBytes: number,
  path: string,
): void {
  const expected = totalBytes === 0 ? 0 : bytes / totalBytes;
  if (Math.abs(share - expected) > 1e-9) {
    invalid(path, "must equal bytes divided by totalBytes");
  }
}

function requireTimestamp(value: unknown, path: string): string {
  if (
    typeof value !== "string" ||
    !/^\d{4}-\d{2}-\d{2}T.+(?:Z|[+-]\d{2}:\d{2})$/.test(value) ||
    !Number.isFinite(Date.parse(value))
  ) {
    invalid(path, "must be an ISO 8601 timestamp with a timezone");
  }
  return value as string;
}

function requireDate(value: unknown, path: string): string {
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    invalid(path, "must be an ISO date");
  }
  const date = value as string;
  const parsed = new Date(`${date}T00:00:00.000Z`);
  if (!Number.isFinite(parsed.getTime()) || parsed.toISOString().slice(0, 10) !== date) {
    invalid(path, "must be a valid ISO date");
  }
  return date;
}

function offsetDate(date: string, days: number): string {
  const value = new Date(`${date}T00:00:00.000Z`);
  value.setUTCDate(value.getUTCDate() + days);
  return value.toISOString().slice(0, 10);
}

function broadTier(count: number): TownTier {
  if (count >= 100) return 4;
  if (count >= 25) return 3;
  if (count >= 5) return 2;
  if (count >= 1) return 1;
  return 0;
}

function civicTier(count: number): TownTier {
  if (count >= 50) return 4;
  if (count >= 20) return 3;
  if (count >= 5) return 2;
  if (count >= 1) return 1;
  return 0;
}

function contributionIntensity(level: string): TownTier {
  switch (level) {
    case "NONE":
      return 0;
    case "FIRST_QUARTILE":
      return 1;
    case "SECOND_QUARTILE":
      return 2;
    case "THIRD_QUARTILE":
      return 3;
    case "FOURTH_QUARTILE":
      return 4;
    default:
      throw new TypeError(`Unsupported contribution level: ${level}`);
  }
}

function repositoryRecencyTier(
  pushedAt: string | null,
  asOf: string,
): TownRepositoryRecencyTier {
  if (pushedAt === null) return "resting";
  const asOfDate = new Date(asOf).toISOString().slice(0, 10);
  const pushedDate = new Date(pushedAt).toISOString().slice(0, 10);
  const ageDays =
    (Date.parse(`${asOfDate}T00:00:00.000Z`) - Date.parse(`${pushedDate}T00:00:00.000Z`)) /
    86_400_000;
  if (ageDays <= 30) return "active";
  if (ageDays <= 180) return "warm";
  if (ageDays <= 365) return "quiet";
  return "resting";
}

function requireHttpUrl(value: unknown, path: string): string {
  if (typeof value !== "string") invalid(path, "must be an HTTP(S) URL");
  try {
    const url = new URL(value as string);
    if (url.protocol !== "http:" && url.protocol !== "https:") {
      invalid(path, "must be an HTTP(S) URL");
    }
  } catch {
    invalid(path, "must be an HTTP(S) URL");
  }
  return value as string;
}

function requireLiteral<T extends string | number>(value: unknown, literal: T, path: string): T {
  if (value !== literal) invalid(path, `must be ${JSON.stringify(literal)}`);
  return literal;
}

function requireOneOf<T extends string>(value: unknown, allowed: readonly T[], path: string): T {
  if (typeof value !== "string" || !allowed.includes(value as T)) {
    invalid(path, `must be one of ${allowed.join(", ")}`);
  }
  return value as T;
}

function invalid(path: string, expectation: string): never {
  throw new TownSnapshotValidationError(path, expectation);
}
