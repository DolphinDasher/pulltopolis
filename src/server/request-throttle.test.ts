import assert from "node:assert/strict";
import test from "node:test";

import { RequestThrottle } from "./request-throttle.js";

test("request throttle enforces per-login and per-IP windows", () => {
  let now = 1_000;
  const throttle = new RequestThrottle({
    windowMs: 60_000,
    perIpLimit: 2,
    perLoginLimit: 1,
    clock: () => now,
  });

  assert.equal(throttle.check("198.51.100.10", "octocat").allowed, true);
  assert.equal(throttle.check("198.51.100.10", "octocat").allowed, false);
  assert.equal(throttle.check("198.51.100.11", "octocat").allowed, false);
  now += 60_000;
  assert.equal(throttle.check("198.51.100.10", "octocat").allowed, true);
});

test("request throttle supplies a bounded retry duration", () => {
  const throttle = new RequestThrottle({
    windowMs: 5_000,
    perIpLimit: 1,
    perLoginLimit: 10,
    clock: () => 1_500,
  });

  throttle.check("198.51.100.10", "octocat");
  const decision = throttle.check("198.51.100.10", "other");
  assert.deepEqual(decision, { allowed: false, retryAfterSeconds: 5 });
});
