import assert from "node:assert/strict";
import test from "node:test";

import type { ServerConfig } from "./config.js";
import { createRuntime } from "./runtime.js";
import {
  TOWN_SNAPSHOT_CACHE_POLICY,
  TOWN_SNAPSHOT_RUNTIME_OPTIONS,
} from "./town-runtime.js";

const CONFIG: ServerConfig = {
  host: "127.0.0.1",
  port: 3_000,
  databasePath: ":memory:",
  trustProxy: 0,
  requestWindowMs: 60_000,
  requestLimitPerIp: 60,
  requestLimitPerLogin: 20,
  githubRequestTimeoutMs: 10_000,
  githubRateLimitReserve: 100,
};

test("runtime activates town snapshots only when its server-side token exists", async () => {
  const withoutToken = await createRuntime(CONFIG, { townSnapshots: TOWN_SNAPSHOT_RUNTIME_OPTIONS });
  const withToken = await createRuntime(
    { ...CONFIG, githubToken: "server-only-test-token" },
    { townSnapshots: TOWN_SNAPSHOT_RUNTIME_OPTIONS },
  );

  try {
    assert.equal(withoutToken.townSnapshots, null);
    assert.ok(withToken.townSnapshots);
  } finally {
    withoutToken.close();
    withToken.close();
  }
});

test("production runtime uses versioned contract and the approved combined cache policy", () => {
  assert.equal(TOWN_SNAPSHOT_RUNTIME_OPTIONS.schemaVersion, 1);
  assert.equal(TOWN_SNAPSHOT_RUNTIME_OPTIONS.mappingVersion, 1);
  assert.deepEqual(TOWN_SNAPSHOT_CACHE_POLICY, {
    softTtlMs: 30 * 60 * 1_000,
    hardTtlMs: 24 * 60 * 60 * 1_000,
  });
});
