import type { TownSnapshot } from "../shared/town-snapshot.js";
import {
  TOWN_SNAPSHOT_MAPPING_VERSION,
  TOWN_SNAPSHOT_SCHEMA_VERSION,
} from "../shared/town-snapshot.js";
import { mapGitHubUserDataToTownSnapshot } from "./town-mapper.js";
import type { TownSnapshotRuntimeOptions } from "./runtime.js";

const MINUTE_MS = 60 * 1_000;
const HOUR_MS = 60 * MINUTE_MS;

/** Combined-snapshot starting policy approved from the Phase 0 data design. */
export const TOWN_SNAPSHOT_CACHE_POLICY = Object.freeze({
  softTtlMs: 30 * MINUTE_MS,
  hardTtlMs: 24 * HOUR_MS,
});

export const TOWN_SNAPSHOT_RUNTIME_OPTIONS = Object.freeze({
  map: mapGitHubUserDataToTownSnapshot,
  schemaVersion: TOWN_SNAPSHOT_SCHEMA_VERSION,
  mappingVersion: TOWN_SNAPSHOT_MAPPING_VERSION,
  cachePolicy: TOWN_SNAPSHOT_CACHE_POLICY,
}) satisfies TownSnapshotRuntimeOptions<TownSnapshot>;
