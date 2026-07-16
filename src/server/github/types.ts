export type ContributionLevel =
  | "NONE"
  | "FIRST_QUARTILE"
  | "SECOND_QUARTILE"
  | "THIRD_QUARTILE"
  | "FOURTH_QUARTILE";

export interface GitHubRateLimit {
  cost: number;
  remaining: number;
  resetAt: string;
}

export interface GitHubContributionDay {
  date: string;
  contributionCount: number;
  contributionLevel: ContributionLevel;
}

export interface GitHubProfileActivity {
  id: string;
  login: string;
  name: string | null;
  avatarUrl: string;
  followers: { totalCount: number };
  pullRequests: { totalCount: number };
  issues: { totalCount: number };
  contributionsCollection: {
    totalCommitContributions: number;
    totalIssueContributions: number;
    totalPullRequestContributions: number;
    totalPullRequestReviewContributions: number;
    restrictedContributionsCount: number;
    contributionCalendar: {
      totalContributions: number;
      weeks: Array<{
        contributionDays: GitHubContributionDay[];
      }>;
    };
  };
}

export interface GitHubLanguageEdge {
  size: number;
  node: {
    name: string;
    color: string | null;
  };
}

export interface GitHubRepository {
  id: string;
  name: string;
  nameWithOwner: string;
  description: string | null;
  url: string;
  owner: { login: string };
  isFork: boolean;
  isArchived: boolean;
  createdAt: string;
  updatedAt: string;
  pushedAt: string | null;
  stargazerCount: number;
  issues: { totalCount: number };
  pullRequests: { totalCount: number };
  languages: {
    totalSize: number;
    edges: Array<GitHubLanguageEdge | null> | null;
  };
}

export interface GitHubProfileResult {
  profile: GitHubProfileActivity;
  rateLimit: GitHubRateLimit;
}

export interface GitHubRepositoryResult {
  repositories: GitHubRepository[];
  rateLimits: GitHubRateLimit[];
}

/**
 * Raw, game-agnostic source data. The mapper owns all TownSnapshot decisions.
 */
export interface GitHubUserData {
  profile: GitHubProfileActivity;
  ownedRepositories: GitHubRepository[];
  /** GitHub describes this connection as recently contributed-to repositories. */
  contributedRepositories: GitHubRepository[];
  rateLimits: GitHubRateLimit[];
}

export interface GraphQLErrorShape {
  message: string;
  path?: Array<string | number>;
  type?: string;
  extensions?: Record<string, unknown>;
}

export interface GraphQLResponse<TData> {
  data?: TData | null;
  errors?: GraphQLErrorShape[];
  message?: string;
}

export interface RepositoryPageInfo {
  hasNextPage: boolean;
  endCursor: string | null;
}

export interface RepositoryConnection {
  pageInfo: RepositoryPageInfo;
  nodes: Array<GitHubRepository | null> | null;
}

export interface ProfileActivityQueryData {
  user: GitHubProfileActivity | null;
  rateLimit: GitHubRateLimit;
}

export interface OwnedRepositoriesQueryData {
  user: { repositories: RepositoryConnection } | null;
  rateLimit: GitHubRateLimit;
}

export interface ContributedRepositoriesQueryData {
  user: { repositoriesContributedTo: RepositoryConnection } | null;
  rateLimit: GitHubRateLimit;
}
