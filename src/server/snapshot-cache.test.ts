import assert from "node:assert/strict";
import test from "node:test";

import { openDatabase } from "./database.js";
import { SnapshotCache } from "./snapshot-cache.js";

const KEY = { login: "OctoCat", schemaVersion: 1, mappingVersion: 1 };

test("snapshot cache distinguishes fresh, stale, and hard-expired entries", () => {
  const database = openDatabase(":memory:");
  const cache = new SnapshotCache(database);

  try {
    cache.put({
      ...KEY,
      payload: { schemaVersion: 1, profile: "octocat" },
      sourceUpdatedAt: "2026-07-16T10:00:00Z",
      storedAt: "2026-07-16T10:00:00Z",
      softExpiresAt: "2026-07-16T10:15:00Z",
      hardExpiresAt: "2026-07-17T10:00:00Z",
      rateLimit: { remaining: 4999 },
    });

    const fresh = cache.get<{ profile: string }>(KEY, new Date("2026-07-16T10:10:00Z"));
    assert.equal(fresh?.freshness, "fresh");
    assert.equal(fresh?.payload.profile, "octocat");
    assert.deepEqual(fresh?.rateLimit, { remaining: 4999 });

    const stale = cache.get(KEY, new Date("2026-07-16T11:00:00Z"));
    assert.equal(stale?.freshness, "stale");
    assert.equal(cache.get(KEY, new Date("2026-07-17T10:00:00Z")), null);
  } finally {
    database.close();
  }
});

test("snapshot cache replaces a versioned key atomically", () => {
  const database = openDatabase(":memory:");
  const cache = new SnapshotCache(database);

  try {
    const base = {
      ...KEY,
      sourceUpdatedAt: "2026-07-16T10:00:00Z",
      storedAt: "2026-07-16T10:00:00Z",
      softExpiresAt: "2026-07-16T10:15:00Z",
      hardExpiresAt: "2026-07-17T10:00:00Z",
    };
    cache.put({ ...base, payload: { revision: 1 } });
    cache.put({ ...base, payload: { revision: 2 } });

    assert.deepEqual(cache.get(KEY, new Date("2026-07-16T10:01:00Z"))?.payload, {
      revision: 2,
    });
  } finally {
    database.close();
  }
});
