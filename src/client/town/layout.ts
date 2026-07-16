import type { TownRepositoryV1, TownSnapshot } from "../../shared/town-snapshot.js";

export const TOWN_VIEWPORT = Object.freeze({ width: 384, height: 256, tileSize: 16 });

export type TownDistrict = "owned" | "contributed";

export interface Point {
  x: number;
  y: number;
}

export interface Rect extends Point {
  width: number;
  height: number;
}

export interface TownBuildingPlacement {
  district: TownDistrict;
  repository: TownRepositoryV1;
  anchor: Point;
  bounds: Rect;
  architectureVariant: 0 | 1 | 2;
  languageAccent: number;
  secondaryLanguageAccents: number[];
}

export interface TownOverflowPlacement {
  district: TownDistrict;
  count: number;
  bounds: Rect;
}

export interface TownLayout {
  buildings: TownBuildingPlacement[];
  overflow: TownOverflowPlacement[];
  square: Point;
}

const OWNED_SLOTS: readonly Point[] = [
  { x: 44, y: 54 }, { x: 94, y: 54 }, { x: 144, y: 54 },
  { x: 44, y: 108 }, { x: 94, y: 108 }, { x: 144, y: 108 },
  { x: 44, y: 162 }, { x: 94, y: 162 }, { x: 144, y: 162 },
  { x: 44, y: 216 }, { x: 94, y: 216 }, { x: 144, y: 216 },
];

const CONTRIBUTED_SLOTS: readonly Point[] = [
  { x: 240, y: 54 }, { x: 290, y: 54 }, { x: 340, y: 54 },
  { x: 240, y: 108 }, { x: 290, y: 108 }, { x: 340, y: 108 },
  { x: 240, y: 162 }, { x: 290, y: 162 }, { x: 340, y: 162 },
  { x: 240, y: 216 }, { x: 290, y: 216 }, { x: 340, y: 216 },
];

export function buildTownLayout(snapshot: TownSnapshot): TownLayout {
  const buildings = [
    ...placeDistrict(
      snapshot.districts.owned.repositories,
      "owned",
      OWNED_SLOTS,
      snapshot.layoutSeed,
    ),
    ...placeDistrict(
      snapshot.districts.contributed.repositories,
      "contributed",
      CONTRIBUTED_SLOTS,
      snapshot.layoutSeed,
    ),
  ].sort((left, right) => left.anchor.y - right.anchor.y || left.anchor.x - right.anchor.x);

  const overflow: TownOverflowPlacement[] = [];
  if (snapshot.districts.owned.overflowRepositoryCount > 0) {
    overflow.push({
      district: "owned",
      count: snapshot.districts.owned.overflowRepositoryCount,
      bounds: { x: 172, y: 94, width: 40, height: 9 },
    });
  }
  if (snapshot.districts.contributed.overflowRepositoryCount > 0) {
    overflow.push({
      district: "contributed",
      count: snapshot.districts.contributed.overflowRepositoryCount,
      bounds: { x: 172, y: 105, width: 40, height: 9 },
    });
  }

  return { buildings, overflow, square: { x: 192, y: 151 } };
}

export function hitTestRepository(
  layout: Pick<TownLayout, "buildings">,
  point: Point,
): TownBuildingPlacement | null {
  for (let index = layout.buildings.length - 1; index >= 0; index -= 1) {
    const building = layout.buildings[index]!;
    if (containsBuilding(building, point)) return building;
  }
  return null;
}

export function containsBuilding(building: TownBuildingPlacement, point: Point): boolean {
  const { x, width } = building.bounds;
  const tier = building.repository.starProminenceTier;
  const wallHeight = 14 + tier * 2;
  const wallY = building.anchor.y - wallHeight;
  const top = building.bounds.y + 2;

  if (
    point.x >= x && point.x <= x + width &&
    point.y >= wallY && point.y <= building.anchor.y
  ) return true;

  if (building.architectureVariant === 2) {
    if (
      point.x >= x - 2 && point.x <= x + width + 2 &&
      point.y >= top + 2 && point.y <= wallY
    ) return true;
  } else {
    const peakX = building.architectureVariant === 0 ? x + Math.floor(width / 2) : x + Math.floor(width / 2) - 4;
    if (pointInTriangle(point, { x: x - 3, y: wallY }, { x: peakX, y: top }, { x: x + width + 3, y: wallY })) {
      return true;
    }
  }

  const foundationCenterX = x + width / 2;
  return (
    Math.abs(point.x - foundationCenterX) / (width / 2 + 3) +
    Math.abs(point.y - building.anchor.y) / 4 <= 1
  );
}

export function buildingRenderBounds(building: TownBuildingPlacement): Rect {
  return {
    x: building.bounds.x - 4,
    y: building.bounds.y - 4,
    width: building.bounds.width + 8,
    height: building.bounds.height + 8,
  };
}

export function stableHash(value: string): number {
  let hash = 0x811c9dc5;
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 0x01000193);
  }
  return hash >>> 0;
}

function pointInTriangle(point: Point, first: Point, second: Point, third: Point): boolean {
  const cross = (a: Point, b: Point, candidate: Point) =>
    (candidate.x - b.x) * (a.y - b.y) - (a.x - b.x) * (candidate.y - b.y);
  const firstSide = cross(point, first, second);
  const secondSide = cross(point, second, third);
  const thirdSide = cross(point, third, first);
  const hasNegative = firstSide < 0 || secondSide < 0 || thirdSide < 0;
  const hasPositive = firstSide > 0 || secondSide > 0 || thirdSide > 0;
  return !(hasNegative && hasPositive);
}

function placeDistrict(
  repositories: TownRepositoryV1[],
  district: TownDistrict,
  slots: readonly Point[],
  seed: string,
): TownBuildingPlacement[] {
  const ordered = [...repositories].sort((left, right) => {
    const leftHash = stableHash(`${seed}:${district}:${left.githubId}:order`);
    const rightHash = stableHash(`${seed}:${district}:${right.githubId}:order`);
    return leftHash - rightHash || left.githubId.localeCompare(right.githubId);
  });

  return ordered.map((repository, index) => {
    const slot = slots[index];
    if (!slot) throw new RangeError(`No ${district} layout slot for repository ${index + 1}`);

    const anchor = { ...slot };
    const width = 30 + repository.starProminenceTier * 3;
    const height = 31 + repository.starProminenceTier * 3;
    return {
      district,
      repository,
      anchor,
      bounds: {
        x: Math.round(anchor.x - width / 2),
        y: anchor.y - height,
        width,
        height: height + 3,
      },
      architectureVariant: (
        stableHash(`${seed}:${repository.languages.primary?.name ?? "untyped"}:architecture`) % 3
      ) as 0 | 1 | 2,
      languageAccent: stableHash(repository.languages.primary?.name ?? "untyped") % 5,
      secondaryLanguageAccents: repository.languages.secondary.map(
        ({ name }) => stableHash(name) % 5,
      ),
    };
  });
}
