import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import fs from "node:fs";
import test from "node:test";
import os from "node:os";
import path from "node:path";
import { pathToFileURL } from "node:url";

import { openDatabase } from "./database.js";
import { SnapshotCache } from "./snapshot-cache.js";

const KEY = { login: "OctoCat", schemaVersion: 1, mappingVersion: 1 };

test("snapshot cache distinguishes fresh, stale, and hard-expired entries", async () => {
  const database = await openDatabase(":memory:");
  const cache = new SnapshotCache(database);

  try {
    await cache.put({
      ...KEY,
      payload: { schemaVersion: 1, profile: "octocat" },
      sourceUpdatedAt: "2026-07-16T10:00:00Z",
      storedAt: "2026-07-16T10:00:00Z",
      softExpiresAt: "2026-07-16T10:15:00Z",
      hardExpiresAt: "2026-07-17T10:00:00Z",
      rateLimit: { remaining: 4999 },
    });

    const fresh = await cache.get<{ profile: string }>(KEY, new Date("2026-07-16T10:10:00Z"));
    assert.equal(fresh?.freshness, "fresh");
    assert.equal(fresh?.payload.profile, "octocat");
    assert.deepEqual(fresh?.rateLimit, { remaining: 4999 });

    const stale = await cache.get(KEY, new Date("2026-07-16T11:00:00Z"));
    assert.equal(stale?.freshness, "stale");
    assert.equal(await cache.get(KEY, new Date("2026-07-17T10:00:00Z")), null);
  } finally {
    database.close();
  }
});

test("snapshot cache replaces a versioned key atomically", async () => {
  const database = await openDatabase(":memory:");
  const cache = new SnapshotCache(database);

  try {
    const base = {
      ...KEY,
      sourceUpdatedAt: "2026-07-16T10:00:00Z",
      storedAt: "2026-07-16T10:00:00Z",
      softExpiresAt: "2026-07-16T10:15:00Z",
      hardExpiresAt: "2026-07-17T10:00:00Z",
    };
    await cache.put({ ...base, payload: { revision: 1 } });
    await cache.put({ ...base, payload: { revision: 2 } });

    assert.deepEqual((await cache.get(KEY, new Date("2026-07-16T10:01:00Z")))?.payload, {
      revision: 2,
    });
  } finally {
    database.close();
  }
});

test("hard-expired reads delete the exact stored row", async () => {
  const database = await openDatabase(":memory:");
  const cache = new SnapshotCache(database);

  try {
    await cache.put({
      ...KEY,
      payload: { revision: "expired" },
      sourceUpdatedAt: "2026-07-16T10:00:00Z",
      storedAt: "2026-07-16T10:00:00Z",
      softExpiresAt: "2026-07-16T10:15:00Z",
      hardExpiresAt: "2026-07-17T10:00:00Z",
    });

    assert.equal(await cache.get(KEY, new Date("2026-07-17T10:00:00Z")), null);
    const count = await database.execute("SELECT COUNT(*) AS count FROM snapshot_cache");
    assert.equal(Number(count.rows[0]?.count), 0);
  } finally {
    database.close();
  }
});

test("startup cleanup removes expired rows and preserves live rows", async () => {
  const database = await openDatabase(":memory:");
  const cache = new SnapshotCache(database);

  try {
    await cache.put({
      ...KEY,
      payload: { revision: "expired" },
      sourceUpdatedAt: "2026-07-15T10:00:00Z",
      storedAt: "2026-07-15T10:00:00Z",
      softExpiresAt: "2026-07-15T10:15:00Z",
      hardExpiresAt: "2026-07-16T10:00:00Z",
    });
    await cache.put({
      ...KEY,
      schemaVersion: 1,
      mappingVersion: 2,
      payload: { revision: "live" },
      sourceUpdatedAt: "2026-07-16T10:00:00Z",
      storedAt: "2026-07-16T10:00:00Z",
      softExpiresAt: "2026-07-16T10:15:00Z",
      hardExpiresAt: "2026-07-17T10:00:00Z",
    });

    assert.equal(await cache.purgeExpired(new Date("2026-07-16T10:00:00Z")), 1);
    assert.deepEqual(
      (await cache.get({ ...KEY, mappingVersion: 2 }, new Date("2026-07-16T10:01:00Z")))?.payload,
      { revision: "live" },
    );
  } finally {
    database.close();
  }
});

test("local file-backed SQLite survives closing and reopening the client", async () => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), "pulltopolis-"));
  const filename = path.join(directory, "cache.sqlite");
  const databaseModule = pathToFileURL(path.resolve("src/server/database.ts")).href;
  const cacheModule = pathToFileURL(path.resolve("src/server/snapshot-cache.ts")).href;

  try {
    const writeScript = `
      import { openDatabase } from ${JSON.stringify(databaseModule)};
      import { SnapshotCache } from ${JSON.stringify(cacheModule)};
      const database = await openDatabase(process.argv[1]);
      await new SnapshotCache(database).put(${JSON.stringify({
        ...KEY,
        payload: { revision: "persisted" },
        sourceUpdatedAt: "2026-07-16T10:00:00Z",
        storedAt: "2026-07-16T10:00:00Z",
        softExpiresAt: "2026-07-16T10:15:00Z",
        hardExpiresAt: "2026-07-17T10:00:00Z",
      })});
      database.close();
    `;
    execFileSync(process.execPath, ["--import", "tsx", "--eval", writeScript, filename], {
      cwd: path.resolve("."),
      stdio: "pipe",
    });

    const readScript = `
      import { openDatabase } from ${JSON.stringify(databaseModule)};
      import { SnapshotCache } from ${JSON.stringify(cacheModule)};
      const database = await openDatabase(process.argv[1]);
      const row = await new SnapshotCache(database).get(${JSON.stringify(KEY)}, new Date("2026-07-16T10:01:00Z"));
      console.log(JSON.stringify(row?.payload));
      database.close();
    `;
    const output = execFileSync(process.execPath, ["--import", "tsx", "--eval", readScript, filename], {
      cwd: path.resolve("."),
      encoding: "utf8",
    });
    assert.equal(output.trim(), JSON.stringify({ revision: "persisted" }));
  } finally {
    fs.rmSync(directory, { recursive: true, force: true });
  }
});
