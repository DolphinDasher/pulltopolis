import assert from "node:assert/strict";
import test from "node:test";

import { SingleFlight } from "./single-flight.js";

test("single flight shares concurrent work for one key", async () => {
  const flights = new SingleFlight<string, number>();
  let calls = 0;
  let release!: (value: number) => void;
  const deferred = new Promise<number>((resolve) => {
    release = resolve;
  });

  const first = flights.run("octocat", () => {
    calls += 1;
    return deferred;
  });
  const second = flights.run("octocat", () => {
    calls += 1;
    return Promise.resolve(2);
  });

  release(1);
  assert.equal(await first, 1);
  assert.equal(await second, 1);
  assert.equal(calls, 1);
});

test("single flight allows retry after rejection", async () => {
  const flights = new SingleFlight<string, number>();
  await assert.rejects(flights.run("octocat", () => Promise.reject(new Error("failed"))));
  assert.equal(await flights.run("octocat", () => Promise.resolve(2)), 2);
});
