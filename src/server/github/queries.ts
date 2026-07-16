const REPOSITORY_FIELDS = `
  id
  name
  nameWithOwner
  description
  url
  owner { login }
  isFork
  isArchived
  createdAt
  updatedAt
  pushedAt
  stargazerCount
  issues { totalCount }
  pullRequests { totalCount }
  languages(first: 20, orderBy: { field: SIZE, direction: DESC }) {
    totalSize
    edges { size node { name color } }
  }
`;

export const PROFILE_ACTIVITY_QUERY = `
  query ProfileActivity($login: String!, $from: DateTime!, $to: DateTime!) {
    user(login: $login) {
      id
      login
      name
      avatarUrl
      followers { totalCount }
      pullRequests { totalCount }
      issues { totalCount }
      contributionsCollection(from: $from, to: $to) {
        totalCommitContributions
        totalIssueContributions
        totalPullRequestContributions
        totalPullRequestReviewContributions
        restrictedContributionsCount
        contributionCalendar {
          totalContributions
          weeks {
            contributionDays {
              date
              contributionCount
              contributionLevel
            }
          }
        }
      }
    }
    rateLimit { cost remaining resetAt }
  }
`;

export const OWNED_REPOSITORIES_QUERY = `
  query OwnedRepositoryPage($login: String!, $after: String) {
    user(login: $login) {
      repositories(
        first: 100
        after: $after
        ownerAffiliations: OWNER
        orderBy: { field: UPDATED_AT, direction: DESC }
        privacy: PUBLIC
      ) {
        pageInfo { hasNextPage endCursor }
        nodes { ${REPOSITORY_FIELDS} }
      }
    }
    rateLimit { cost remaining resetAt }
  }
`;

export const CONTRIBUTED_REPOSITORIES_QUERY = `
  query ContributedRepositoryPage($login: String!, $after: String) {
    user(login: $login) {
      repositoriesContributedTo(
        first: 100
        after: $after
        contributionTypes: [COMMIT, ISSUE, PULL_REQUEST, PULL_REQUEST_REVIEW]
        includeUserRepositories: false
        orderBy: { field: UPDATED_AT, direction: DESC }
        privacy: PUBLIC
      ) {
        pageInfo { hasNextPage endCursor }
        nodes { ${REPOSITORY_FIELDS} }
      }
    }
    rateLimit { cost remaining resetAt }
  }
`;
