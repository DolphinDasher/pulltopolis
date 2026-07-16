import assert from "node:assert/strict";
import test from "node:test";

import { openDatabase } from "./database.js";
import type { GitHubUserData } from "./github/index.js";
import { SnapshotCache } from "./snapshot-cache.js";
import {
  GitHubTransportError,
  InvalidGitHubLoginError,
  TownSnapshotService,
} from "./town-snapshot-service.js";

const NOW = new Date("2026-07-16T12:00:00.000Z");
const SOURCE = {
  profile: { login: "octocat" },
  ownedRepositories: [{ id: "owned" }],
  contributedRepositories: [{ id: "external" }],
  rateLimits: [
    { cost: 2, remaining: 4_998, resetAt: "2026-07-16T13:00:00.000Z" },
    { cost: 3, remaining: 4_995, resetAt: "2026-07-16T13:00:00.000Z" },
  ],
} as unknown as GitHubUserData;

test("service maps source data, caches only the snapshot, and uses the trailing window", async () => {
  const database = await openDatabase(":memory:");
  const cache = new SnapshotCache(database);
  const calls: Array<{ login: string; from: string; to: string }> = [];
  const service = new TownSnapshotService({
    github: {
      fetchUserData: async (login, from, to) => {
        calls.push({ login, from, to });
        return SOURCE;
      },
    },
    cache,
    map: (source, context) => ({
      contract: "mapped-only",
      login: source.profile.login,
      generatedAt: context.generatedAt,
    }),
    schemaVersion: 1,
    mappingVersion: 1,
    cachePolicy: { softTtlMs: 60_000, hardTtlMs: 120_000 },
    clock: () => NOW,
  });

  try {
    const result = await service.get(" OctoCat ");
    assert.equal(result.cacheStatus, "refreshed");
    assert.deepEqual(calls, [
      {
        login: "octocat",
        from: "2025-07-16T12:00:00.000Z",
        to: "2026-07-16T12:00:00.000Z",
      },
    ]);
    assert.deepEqual(result.snapshot, {
      contract: "mapped-only",
      login: "octocat",
      generatedAt: "2026-07-16T12:00:00.000Z",
    });
    const stored = await cache.get<Record<string, unknown>>(
      { login: "octocat", schemaVersion: 1, mappingVersion: 1 },
      NOW,
    );
    assert.deepEqual(stored?.payload, result.snapshot);
    assert.deepEqual(stored?.rateLimit, {
      cost: 5,
      remaining: 4_995,
      resetAt: "2026-07-16T13:00:00.000Z",
    });
    assert.doesNotMatch(JSON.stringify(stored?.payload), /ownedRepositories|rateLimits/);
  } finally {
    database.close();
  }
});

test("service serves stale immediately and coalesces background refresh", async () => {
  const database = await openDatabase(":memory:");
  const cache = new SnapshotCache(database);
  await cache.put({
    login: "octocat",
    schemaVersion: 1,
    mappingVersion: 1,
    payload: { revision: "stale" },
    sourceUpdatedAt: "2026-07-16T10:00:00.000Z",
    storedAt: "2026-07-16T10:00:00.000Z",
    softExpiresAt: "2026-07-16T11:00:00.000Z",
    hardExpiresAt: "2026-07-17T10:00:00.000Z",
  });
  let calls = 0;
  let release!: () => void;
  const pending = new Promise<void>((resolve) => {
    release = resolve;
  });
  const service = new TownSnapshotService({
    github: {
      fetchUserData: async () => {
        calls += 1;
        await pending;
        return SOURCE;
      },
    },
    cache,
    map: () => ({ revision: "fresh" }),
    schemaVersion: 1,
    mappingVersion: 1,
    cachePolicy: { softTtlMs: 60_000, hardTtlMs: 120_000 },
    clock: () => NOW,
  });

  try {
    const [first, second] = await Promise.all([service.get("octocat"), service.get("OCTOCAT")]);
    assert.equal(first.cacheStatus, "stale");
    assert.equal(second.cacheStatus, "stale");
    assert.deepEqual(first.snapshot, { revision: "stale" });
    assert.equal(calls, 1);
    release();
    await new Promise<void>((resolve) => setImmediate(resolve));
    assert.deepEqual(
      (
        await cache.get<{ revision: string }>(
          { login: "octocat", schemaVersion: 1, mappingVersion: 1 },
          NOW,
        )
      )?.payload,
      { revision: "fresh" },
    );
  } finally {
    database.close();
  }
});

test("service coalesces cold misses and translates transport failures", async () => {
  const database = await openDatabase(":memory:");
  const cache = new SnapshotCache(database);
  let calls = 0;
  const service = new TownSnapshotService({
    github: {
      fetchUserData: async () => {
        calls += 1;
        throw new TypeError("fetch failed");
      },
    },
    cache,
    map: () => ({ unreachable: true }),
    schemaVersion: 1,
    mappingVersion: 1,
    cachePolicy: { softTtlMs: 1, hardTtlMs: 2 },
    clock: () => NOW,
  });

  try {
    const results = await Promise.allSettled([service.get("octocat"), service.get("OCTOCAT")]);
    assert.equal(calls, 1);
    for (const result of results) {
      assert.equal(result.status, "rejected");
      if (result.status === "rejected") assert.ok(result.reason instanceof GitHubTransportError);
    }
    await assert.rejects(service.get("bad--login"), InvalidGitHubLoginError);
  } finally {
    database.close();
  }
});
