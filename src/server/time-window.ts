const DAY_MS = 24 * 60 * 60 * 1_000;

export interface UtcWindow {
  from: string;
  to: string;
}

/** Returns an exact trailing-day window as UTC ISO timestamps. */
export function trailingUtcWindow(to: Date, days = 365): UtcWindow {
  const end = to.getTime();
  if (!Number.isFinite(end)) throw new TypeError("Window end must be a valid date");
  if (!Number.isInteger(days) || days < 1) {
    throw new RangeError("Window days must be a positive integer");
  }

  return {
    from: new Date(end - days * DAY_MS).toISOString(),
    to: new Date(end).toISOString(),
  };
}
