import assert from "node:assert/strict";
import test from "node:test";

import { trailingUtcWindow } from "./time-window.js";

test("trailing UTC window is exactly 365 days and crosses leap day safely", () => {
  assert.deepEqual(trailingUtcWindow(new Date("2025-03-01T12:30:00.000Z")), {
    from: "2024-03-01T12:30:00.000Z",
    to: "2025-03-01T12:30:00.000Z",
  });
});

test("trailing UTC window rejects invalid inputs", () => {
  assert.throws(() => trailingUtcWindow(new Date(Number.NaN)), TypeError);
  assert.throws(() => trailingUtcWindow(new Date(), 0), RangeError);
});
