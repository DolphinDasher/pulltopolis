export interface RequestThrottleOptions {
  windowMs: number;
  perIpLimit: number;
  perLoginLimit: number;
  clock?: () => number;
}

export interface RequestThrottleDecision {
  allowed: boolean;
  retryAfterSeconds: number;
}

interface Bucket {
  windowStartedAt: number;
  count: number;
}

export class RequestThrottle {
  private readonly ipBuckets = new Map<string, Bucket>();
  private readonly loginBuckets = new Map<string, Bucket>();
  private readonly clock: () => number;

  constructor(private readonly options: RequestThrottleOptions) {
    if (
      !Number.isFinite(options.windowMs) ||
      options.windowMs <= 0 ||
      !Number.isInteger(options.perIpLimit) ||
      options.perIpLimit < 1 ||
      !Number.isInteger(options.perLoginLimit) ||
      options.perLoginLimit < 1
    ) {
      throw new RangeError("Request throttle limits must be positive and finite");
    }
    this.clock = options.clock ?? Date.now;
  }

  check(ip: string, login: string): RequestThrottleDecision {
    const now = this.clock();
    if (!Number.isFinite(now)) throw new TypeError("Request throttle clock must be finite");
    this.prune(now);

    const ipDecision = consume(
      this.ipBuckets,
      ip,
      this.options.perIpLimit,
      now,
      this.options.windowMs,
    );
    if (!ipDecision.allowed) return ipDecision;
    return consume(
      this.loginBuckets,
      login,
      this.options.perLoginLimit,
      now,
      this.options.windowMs,
    );
  }

  private prune(now: number): void {
    pruneBuckets(this.ipBuckets, now, this.options.windowMs);
    pruneBuckets(this.loginBuckets, now, this.options.windowMs);
  }
}

function consume(
  buckets: Map<string, Bucket>,
  key: string,
  limit: number,
  now: number,
  windowMs: number,
): RequestThrottleDecision {
  const existing = buckets.get(key);
  const bucket =
    existing && now - existing.windowStartedAt < windowMs
      ? existing
      : { windowStartedAt: now, count: 0 };
  bucket.count += 1;
  buckets.set(key, bucket);

  if (bucket.count <= limit) return { allowed: true, retryAfterSeconds: 0 };
  return {
    allowed: false,
    retryAfterSeconds: Math.max(1, Math.ceil((bucket.windowStartedAt + windowMs - now) / 1_000)),
  };
}

function pruneBuckets(buckets: Map<string, Bucket>, now: number, windowMs: number): void {
  for (const [key, bucket] of buckets) {
    if (now - bucket.windowStartedAt >= windowMs) buckets.delete(key);
  }
}
