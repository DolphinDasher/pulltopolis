import type {
  TownRepositoryRecencyTier,
  TownRepositoryV1,
  TownTier,
} from "../../shared/town-snapshot.js";

export const TOWN_PALETTE = Object.freeze({
  sky: "#94d4e4",
  skyLight: "#d9f1ee",
  skyDeep: "#71b6d1",
  cloud: "#fff7e7",
  cloudShade: "#c7e4e7",
  water: "#63b3cc",
  outline: "#24304a",
  grass: "#8fca79",
  grassLight: "#b7df8c",
  grassDark: "#5d9b6a",
  grassShadow: "#75b56f",
  path: "#e8c98f",
  pathLight: "#f5dda9",
  pathShade: "#c79772",
  wall: "#f4d5ae",
  wallShade: "#d99f86",
  roof: "#df6f78",
  roofShade: "#ae5268",
  windowLit: "#ffe391",
  windowCool: "#8ecad5",
  gold: "#f4bd55",
  heritage: "#8e9a91",
  garden: ["#d8e7c4", "#a8d67f", "#69bd72", "#3d9568", "#246b59"],
  accents: ["#ef7d8e", "#65a9d8", "#9a83c9", "#e5ad55", "#59bfa4"],
});

export interface BuildingVisualSpec {
  wallColor: string;
  roofColor: string;
  litWindows: number;
  showSmoke: boolean;
  showHeritageIvy: boolean;
  ornamentTier: TownTier;
}

export function buildingVisualSpec(repository: TownRepositoryV1): BuildingVisualSpec {
  const ambience = recencyAmbience(repository.recencyTier);
  return {
    wallColor: repository.isArchived ? TOWN_PALETTE.heritage : TOWN_PALETTE.wall,
    roofColor: repository.isArchived ? TOWN_PALETTE.grassDark : TOWN_PALETTE.roof,
    ...ambience,
    showHeritageIvy: repository.isArchived || repository.recencyTier === "resting",
    ornamentTier: repository.starProminenceTier,
  };
}

export function recencyAmbience(recency: TownRepositoryRecencyTier): Pick<
  BuildingVisualSpec,
  "litWindows" | "showSmoke"
> {
  switch (recency) {
    case "active": return { litWindows: 2, showSmoke: true };
    case "warm": return { litWindows: 1, showSmoke: false };
    case "quiet":
    case "resting": return { litWindows: 0, showSmoke: false };
  }
}

export function spriteFrame(elapsedMs: number, reducedMotion: boolean): number {
  if (reducedMotion || !Number.isFinite(elapsedMs) || elapsedMs < 0) return 0;
  return Math.floor(elapsedMs / 125) % 8;
}

export function languageMonogram(language: string | null): string {
  if (!language) return "·";
  const letters = [...language].filter((character) => /[\p{L}\p{N}]/u.test(character));
  return (letters[0] ?? "·").toLocaleUpperCase();
}
