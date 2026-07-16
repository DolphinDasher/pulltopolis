import assert from "node:assert/strict";
import test from "node:test";

import { loadConfig } from "./config.js";

test("configuration trims the optional token without exposing it elsewhere", () => {
  const config = loadConfig({
    GITHUB_TOKEN: " secret ",
    PORT: "4321",
    DATABASE_PATH: "data/test.sqlite",
  });

  assert.equal(config.githubToken, "secret");
  assert.equal(config.port, 4321);
  assert.match(config.databasePath, /data[\\/]test\.sqlite$/);
  assert.equal(config.trustProxy, 0);
  assert.equal(config.requestLimitPerIp, 60);
  assert.equal(config.requestLimitPerLogin, 20);
});

test("configuration rejects invalid ports", () => {
  assert.throws(() => loadConfig({ PORT: "70000" }), /PORT must be between/);
});

test("configuration accepts a paired hosted database without changing local defaults", () => {
  const config = loadConfig({
    TURSO_DATABASE_URL: " libsql://pulltopolis-example.turso.io ",
    TURSO_AUTH_TOKEN: " hosted-secret ",
  });

  assert.equal(config.tursoDatabaseUrl, "libsql://pulltopolis-example.turso.io");
  assert.equal(config.tursoAuthToken, "hosted-secret");
});

test("configuration rejects a partially configured hosted database", () => {
  assert.throws(
    () => loadConfig({ TURSO_DATABASE_URL: "libsql://pulltopolis-example.turso.io" }),
    /must be configured together/,
  );
  assert.throws(
    () => loadConfig({ TURSO_AUTH_TOKEN: "hosted-secret" }),
    /must be configured together/,
  );
});

test("configuration parses hosted proxy hops and request limits", () => {
  const config = loadConfig({
    TRUST_PROXY: "1",
    REQUEST_WINDOW_MS: "120000",
    REQUEST_LIMIT_PER_IP: "12",
    REQUEST_LIMIT_PER_LOGIN: "4",
  });

  assert.equal(config.trustProxy, 1);
  assert.equal(config.requestWindowMs, 120_000);
  assert.equal(config.requestLimitPerIp, 12);
  assert.equal(config.requestLimitPerLogin, 4);
});

test("configuration rejects invalid proxy hop values", () => {
  assert.throws(
    () => loadConfig({ TRUST_PROXY: "11" }),
    /TRUST_PROXY must be between 0 and 10/,
  );
});
