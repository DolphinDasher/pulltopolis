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
});

test("configuration rejects invalid ports", () => {
  assert.throws(() => loadConfig({ PORT: "70000" }), /PORT must be between/);
});
