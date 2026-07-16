import assert from "node:assert/strict";
import test from "node:test";

import { createApp } from "./app.js";
import { GitHubRateLimitError, GitHubUserNotFoundError } from "./github/index.js";

test("health endpoint reports capability state without secrets", async () => {
  const app = createApp({ githubConfigured: true, databaseReady: true });
  const server = app.listen(0, "127.0.0.1");

  try {
    await new Promise<void>((resolve) => server.once("listening", resolve));
    const address = server.address();
    assert.ok(address && typeof address === "object");
    const response = await fetch(`http://127.0.0.1:${address.port}/api/health`);
    const body = (await response.json()) as Record<string, unknown>;

    assert.equal(response.status, 200);
    assert.deepEqual(body, { status: "ok", github: "configured", database: "ready" });
    assert.doesNotMatch(JSON.stringify(body), /token/i);
  } finally {
    await new Promise<void>((resolve, reject) =>
      server.close((error) => (error ? reject(error) : resolve())),
    );
  }
});

test("town endpoint returns only the mapped snapshot contract", async () => {
  const snapshot = { schemaVersion: 1, profile: { login: "octocat" } };
  const app = createApp(
    { githubConfigured: true, databaseReady: true },
    {
      townSnapshots: {
        get: async (login) => {
          assert.equal(login, "octocat");
          return { snapshot, cacheStatus: "stale" };
        },
      },
    },
  );
  const response = await request(app, "/api/towns/OctoCat");

  assert.equal(response.status, 200);
  assert.equal(response.headers.get("x-pulltopolis-cache"), "stale");
  assert.deepEqual(await response.json(), snapshot);
});

test("town endpoint validates logins and safely reports missing service", async () => {
  const app = createApp({ githubConfigured: false, databaseReady: true });
  const invalid = await request(app, "/api/towns/bad--login");
  const unavailable = await request(app, "/api/towns/octocat");

  assert.equal(invalid.status, 400);
  assert.deepEqual(await invalid.json(), { error: "invalid_login" });
  assert.equal(unavailable.status, 503);
  assert.deepEqual(await unavailable.json(), { error: "snapshot_service_unavailable" });
});

test("town endpoint maps upstream errors without leaking their messages", async () => {
  const cases = [
    {
      error: new GitHubUserNotFoundError("secret-detail"),
      status: 404,
      body: { error: "user_not_found" },
    },
    {
      error: new GitHubRateLimitError("secret-detail", { retryAfterSeconds: 60 }),
      status: 503,
      body: { error: "github_rate_limited" },
    },
  ];

  for (const item of cases) {
    const app = createApp(
      { githubConfigured: true, databaseReady: true },
      { townSnapshots: { get: async () => Promise.reject(item.error) } },
    );
    const response = await request(app, "/api/towns/octocat");
    const body = await response.json();
    assert.equal(response.status, item.status);
    assert.deepEqual(body, item.body);
    assert.doesNotMatch(JSON.stringify(body), /secret-detail/);
  }
});

async function request(app: ReturnType<typeof createApp>, path: string): Promise<Response> {
  const server = app.listen(0, "127.0.0.1");
  try {
    await new Promise<void>((resolve) => server.once("listening", resolve));
    const address = server.address();
    assert.ok(address && typeof address === "object");
    return await fetch(`http://127.0.0.1:${address.port}${path}`);
  } finally {
    await new Promise<void>((resolve, reject) =>
      server.close((error) => (error ? reject(error) : resolve())),
    );
  }
}
