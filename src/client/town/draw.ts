import type { TownSnapshot } from "../../shared/town-snapshot.js";
import type { TownBuildingPlacement, TownDistrict, TownLayout } from "./layout.js";
import { TOWN_VIEWPORT } from "./layout.js";
import {
  buildingVisualSpec,
  languageMonogram,
  spriteFrame,
  TOWN_PALETTE,
} from "./visuals.js";

export interface TownRenderState {
  elapsedMs: number;
  reducedMotion: boolean;
  selectedRepositoryId: string | null;
}

export function renderTown(
  context: CanvasRenderingContext2D,
  snapshot: TownSnapshot,
  layout: TownLayout,
  state: TownRenderState,
): void {
  const frame = spriteFrame(state.elapsedMs, state.reducedMotion);
  context.save();
  context.imageSmoothingEnabled = false;
  context.clearRect(0, 0, TOWN_VIEWPORT.width, TOWN_VIEWPORT.height);
  drawBackdrop(context, frame, state.reducedMotion);
  drawIsland(context);
  drawPaths(context);
  drawLandscapeDetails(context, frame);
  drawDistrictSigns(context);
  drawContributionGarden(context, snapshot);
  drawCivicSquare(context, snapshot);
  drawOverflow(context, layout);
  for (const building of layout.buildings) {
    drawBuilding(
      context,
      building,
      frame,
      building.repository.githubId === state.selectedRepositoryId,
    );
  }
  drawVisitors(context, snapshot.profile.visitorTier, frame);
  drawStarterCompanion(context, layout.square.x - 11, layout.square.y + 32, frame);
  context.restore();
}

export function renderEmptyTown(context: CanvasRenderingContext2D): void {
  context.save();
  context.imageSmoothingEnabled = false;
  context.fillStyle = TOWN_PALETTE.sky;
  context.fillRect(0, 0, TOWN_VIEWPORT.width, TOWN_VIEWPORT.height);
  context.fillStyle = TOWN_PALETTE.skyLight;
  context.fillRect(0, 174, TOWN_VIEWPORT.width, 82);
  context.restore();
}

function drawBackdrop(
  context: CanvasRenderingContext2D,
  frame: number,
  reducedMotion: boolean,
): void {
  context.fillStyle = TOWN_PALETTE.sky;
  context.fillRect(0, 0, TOWN_VIEWPORT.width, TOWN_VIEWPORT.height);
  context.fillStyle = TOWN_PALETTE.skyDeep;
  context.fillRect(0, 48, TOWN_VIEWPORT.width, 32);
  context.fillStyle = TOWN_PALETTE.skyHorizon;
  context.fillRect(0, 76, TOWN_VIEWPORT.width, 66);

  const drift = reducedMotion ? 0 : frame;
  drawCloud(context, 26 + drift, 20);
  drawCloud(context, 294 - drift, 31);
  context.fillStyle = TOWN_PALETTE.sun;
  context.fillRect(346, 14, 11, 11);
  context.fillRect(349, 11, 5, 17);
  context.fillRect(343, 17, 17, 5);
  context.fillStyle = "#fff3bf";
  context.fillRect(339, 15, 2, 2);
  context.fillRect(359, 23, 2, 2);
  context.fillStyle = TOWN_PALETTE.cloudShade;
  context.fillRect(0, 130, 64, 3);
  context.fillRect(320, 126, 64, 3);
}

function drawCloud(context: CanvasRenderingContext2D, x: number, y: number): void {
  context.fillStyle = TOWN_PALETTE.cloudShade;
  context.fillRect(x + 2, y + 7, 35, 7);
  context.fillStyle = TOWN_PALETTE.cloud;
  context.fillRect(x, y + 4, 35, 7);
  context.fillRect(x + 7, y, 11, 11);
  context.fillRect(x + 20, y + 2, 9, 9);
}

function drawIsland(context: CanvasRenderingContext2D): void {
  polygon(context, [
    [0, 24], [30, 3], [192, 0], [354, 3], [384, 24], [384, 232],
    [360, 246], [273, 256], [111, 256], [24, 246], [0, 232],
  ], TOWN_PALETTE.outline);
  polygon(context, [
    [3, 25], [32, 6], [192, 3], [352, 6], [381, 25], [381, 230],
    [358, 243], [272, 253], [112, 253], [26, 243], [3, 230],
  ], TOWN_PALETTE.grass);

  context.fillStyle = TOWN_PALETTE.grassLight;
  for (let y = 22; y < 230; y += TOWN_VIEWPORT.tileSize) {
    for (let x = 14 + ((y / TOWN_VIEWPORT.tileSize) % 2) * 8; x < 374; x += 32) {
      context.fillRect(Math.round(x), y, 2, 1);
    }
  }

  context.fillStyle = TOWN_PALETTE.grassShadow;
  context.fillRect(8, 232, 52, 2);
  context.fillRect(326, 232, 50, 2);
  context.fillStyle = TOWN_PALETTE.pathShade;
  context.fillRect(26, 243, 70, 2);
  context.fillRect(288, 243, 70, 2);
  context.fillStyle = TOWN_PALETTE.water;
  context.fillRect(4, 238, 20, 2);
  context.fillRect(360, 238, 20, 2);
  context.fillRect(64, 250, 38, 2);
  context.fillRect(282, 250, 38, 2);
  context.fillStyle = TOWN_PALETTE.waterLight;
  context.fillRect(7, 237, 14, 1);
  context.fillRect(363, 237, 14, 1);
  context.fillRect(69, 249, 28, 1);
  context.fillRect(287, 249, 28, 1);
}

function drawPaths(context: CanvasRenderingContext2D): void {
  polygon(context, [[180, 20], [204, 20], [206, 226], [178, 226]], TOWN_PALETTE.outline);
  polygon(context, [[183, 20], [201, 20], [203, 226], [181, 226]], TOWN_PALETTE.path);
  for (const y of [58, 112, 166, 220]) {
    polygon(context, [[14, y - 5], [370, y - 5], [374, y + 5], [10, y + 5]], TOWN_PALETTE.outline);
    polygon(context, [[16, y - 3], [368, y - 3], [371, y + 3], [13, y + 3]], TOWN_PALETTE.path);
    context.fillStyle = TOWN_PALETTE.pathLight;
    context.fillRect(20, y - 1, 344, 2);
    context.fillStyle = TOWN_PALETTE.pathShade;
    for (let x = 28; x < 360; x += 32) context.fillRect(x, y + 2, 8, 1);
    context.fillStyle = TOWN_PALETTE.pathMark;
    for (let x = 36; x < 350; x += 48) context.fillRect(x, y - 2, 10, 1);
  }
  context.fillStyle = TOWN_PALETTE.pathLight;
  context.fillRect(190, 24, 4, 200);
  context.fillStyle = TOWN_PALETTE.pathShade;
  for (let y = 32; y < 218; y += 16) context.fillRect(183, y, 3, 5);
  polygon(context, [[159, 147], [192, 133], [225, 147], [192, 168]], TOWN_PALETTE.outline);
  polygon(context, [[162, 147], [192, 136], [222, 147], [192, 165]], TOWN_PALETTE.plaza);
  drawPlazaFountain(context);
}

function drawLandscapeDetails(context: CanvasRenderingContext2D, frame: number): void {
  const treePositions = [
    [15, 42], [15, 96], [15, 151], [15, 205],
    [369, 42], [369, 96], [369, 151], [369, 205],
  ] as const;
  treePositions.forEach(([x, y], index) => drawTree(context, x, y, index % 2));

  const flowerPatches = [
    [28, 74, TOWN_PALETTE.flower], [30, 183, TOWN_PALETTE.flowerCool],
    [349, 74, TOWN_PALETTE.flowerCool], [347, 183, TOWN_PALETTE.flower],
    [151, 188, TOWN_PALETTE.flower], [232, 188, TOWN_PALETTE.flowerCool],
  ] as const;
  flowerPatches.forEach(([x, y, color], index) => drawFlowerPatch(context, x, y, color, index % 2));

  drawLamp(context, 157, 177, frame);
  drawLamp(context, 227, 177, frame + 1);
  drawBench(context, 157, 199);
  drawBench(context, 217, 199);
}

function drawTree(context: CanvasRenderingContext2D, x: number, y: number, variant: number): void {
  context.fillStyle = TOWN_PALETTE.outline;
  context.fillRect(x - 2, y + 9, 5, 8);
  context.fillStyle = TOWN_PALETTE.treeDark;
  context.fillRect(x - 7, y + 4, 15, 9);
  context.fillRect(x - 4, y, 9, 6);
  context.fillStyle = variant === 0 ? TOWN_PALETTE.tree : TOWN_PALETTE.treeLight;
  context.fillRect(x - 5, y + 3, 11, 7);
  context.fillRect(x - 2, y - 1, 6, 5);
  context.fillStyle = TOWN_PALETTE.grassLight;
  context.fillRect(x - 3, y + 1, 3, 2);
  context.fillRect(x + 4, y + 6, 2, 2);
  context.fillStyle = TOWN_PALETTE.grassShadow;
  context.fillRect(x - 8, y + 16, 16, 2);
}

function drawFlowerPatch(
  context: CanvasRenderingContext2D,
  x: number,
  y: number,
  color: string,
  variant: number,
): void {
  context.fillStyle = TOWN_PALETTE.grassDark;
  context.fillRect(x + 2, y + 4, 1, 5);
  context.fillRect(x + 8, y + 2, 1, 7);
  context.fillRect(x + 13, y + 4, 1, 5);
  context.fillStyle = color;
  context.fillRect(x, y + (variant ? 2 : 3), 5, 3);
  context.fillRect(x + 6, y, 5, 3);
  context.fillRect(x + 11, y + (variant ? 3 : 2), 5, 3);
  context.fillStyle = TOWN_PALETTE.sun;
  context.fillRect(x + 2, y + 4, 1, 1);
  context.fillRect(x + 8, y + 2, 1, 1);
  context.fillRect(x + 13, y + 4, 1, 1);
}

function drawLamp(context: CanvasRenderingContext2D, x: number, y: number, frame: number): void {
  context.fillStyle = TOWN_PALETTE.outline;
  context.fillRect(x, y, 2, 12);
  context.fillRect(x - 3, y + 11, 8, 2);
  context.fillRect(x - 1, y - 4, 4, 4);
  context.fillStyle = frame % 4 === 0 ? TOWN_PALETTE.sun : TOWN_PALETTE.gold;
  context.fillRect(x, y - 3, 2, 2);
}

function drawBench(context: CanvasRenderingContext2D, x: number, y: number): void {
  context.fillStyle = TOWN_PALETTE.outline;
  context.fillRect(x, y, 17, 3);
  context.fillRect(x + 2, y + 3, 2, 5);
  context.fillRect(x + 13, y + 3, 2, 5);
  context.fillStyle = TOWN_PALETTE.wallShade;
  context.fillRect(x + 1, y + 1, 15, 1);
}

function drawDistrictSigns(context: CanvasRenderingContext2D): void {
  drawSign(context, 173, 68, "OWNED", "owned");
  drawSign(context, 171, 82, "RECENT", "contributed");
}

function drawSign(
  context: CanvasRenderingContext2D,
  x: number,
  y: number,
  label: string,
  district: TownDistrict,
): void {
  const width = label.length * 4 + 8;
  context.fillStyle = TOWN_PALETTE.outline;
  context.fillRect(x + 4, y + 10, 2, 6);
  context.fillRect(x + width - 6, y + 10, 2, 6);
  context.fillStyle = TOWN_PALETTE.outline;
  context.fillRect(x - 1, y - 1, width + 2, 11);
  context.fillStyle = district === "owned" ? TOWN_PALETTE.roof : TOWN_PALETTE.accents[1]!;
  context.fillRect(x + 1, y + 1, width - 2, 8);
  context.fillStyle = "#fff7e7";
  context.font = "bold 5px monospace";
  context.textBaseline = "top";
  context.fillText(label, x + 4, y + 2);
}

function drawContributionGarden(
  context: CanvasRenderingContext2D,
  snapshot: TownSnapshot,
): void {
  context.fillStyle = TOWN_PALETTE.outline;
  context.fillRect(109, 225, 165, 27);
  context.fillStyle = "#eef0c2";
  context.fillRect(111, 227, 161, 23);
  context.fillStyle = TOWN_PALETTE.pathShade;
  context.fillRect(111, 227, 161, 2);
  snapshot.contributions.days.forEach((day, index) => {
    const week = Math.floor(index / 7);
    const weekday = index % 7;
    context.fillStyle = TOWN_PALETTE.garden[day.intensity]!;
    context.fillRect(112 + week * 3, 230 + weekday * 3, 2, 2);
    if (day.intensity > 0) {
      context.fillStyle = TOWN_PALETTE.grassLight;
      context.fillRect(112 + week * 3, 230 + weekday * 3, 1, 1);
    }
  });
}

function drawCivicSquare(context: CanvasRenderingContext2D, snapshot: TownSnapshot): void {
  drawCivicStand(context, 169, 137, "PR", snapshot.contributions.civic.pullRequests.intensityTier);
  drawCivicStand(context, 204, 137, "IS", snapshot.contributions.civic.issues.intensityTier);
  drawCivicStand(
    context,
    187,
    126,
    "RV",
    snapshot.contributions.civic.pullRequestReviews.intensityTier,
  );
}

function drawPlazaFountain(context: CanvasRenderingContext2D): void {
  context.fillStyle = TOWN_PALETTE.outline;
  context.fillRect(188, 145, 8, 7);
  context.fillStyle = TOWN_PALETTE.water;
  context.fillRect(189, 146, 6, 5);
  context.fillStyle = TOWN_PALETTE.cloud;
  context.fillRect(190, 142, 2, 3);
  context.fillRect(194, 140, 2, 5);
  context.fillStyle = TOWN_PALETTE.gold;
  context.fillRect(191, 138, 1, 2);
}

function drawCivicStand(
  context: CanvasRenderingContext2D,
  x: number,
  y: number,
  label: string,
  tier: number,
): void {
  context.fillStyle = TOWN_PALETTE.outline;
  context.fillRect(x, y, 14, 11);
  context.fillStyle = TOWN_PALETTE.pathLight;
  context.fillRect(x + 1, y + 1, 12, 9);
  context.fillStyle = TOWN_PALETTE.pathShade;
  context.fillRect(x + 1, y + 8, 12, 2);
  context.fillStyle = TOWN_PALETTE.outline;
  context.font = "bold 5px monospace";
  context.textBaseline = "top";
  context.fillText(label, x + 2, y + 2);
  context.fillStyle = TOWN_PALETTE.gold;
  for (let index = 0; index < tier; index += 1) {
    context.fillRect(x + 2 + index * 3, y + 8, 2, 2);
  }
}

function drawOverflow(context: CanvasRenderingContext2D, layout: TownLayout): void {
  for (const marker of layout.overflow) {
    const { x, y, width, height } = marker.bounds;
    context.fillStyle = TOWN_PALETTE.outline;
    context.fillRect(x, y, width, height);
    context.fillStyle = marker.district === "owned" ? "#f0b2a7" : "#a8cae5";
    context.fillRect(x + 1, y + 1, width - 2, height - 2);
    context.fillStyle = TOWN_PALETTE.outline;
    context.font = "bold 5px monospace";
    context.textBaseline = "top";
    context.fillText(`+${marker.count} ${marker.district === "owned" ? "H" : "V"}`, x + 3, y + 2);
  }
}

function drawBuilding(
  context: CanvasRenderingContext2D,
  building: TownBuildingPlacement,
  frame: number,
  selected: boolean,
): void {
  const spec = buildingVisualSpec(building.repository);
  const { bounds, anchor, repository } = building;
  const x = bounds.x;
  const width = bounds.width;
  const wallHeight = 14 + repository.starProminenceTier * 2;
  const wallY = anchor.y - wallHeight;
  const top = bounds.y + 2;
  const accent = TOWN_PALETTE.accents[building.languageAccent]!;

  polygon(context, [
    [x - 3, anchor.y], [x + width / 2, anchor.y + 4], [x + width + 3, anchor.y],
    [x + width / 2, anchor.y - 4],
  ], TOWN_PALETTE.outline);
  polygon(context, [
    [x + 1, anchor.y], [x + width / 2, anchor.y + 2], [x + width - 1, anchor.y],
    [x + width / 2, anchor.y - 2],
  ], TOWN_PALETTE.pathLight);
  context.fillStyle = spec.wallColor;
  context.fillRect(x + 1, wallY, width - 2, wallHeight);
  context.fillStyle = TOWN_PALETTE.wallHighlight;
  context.fillRect(x + 2, wallY + 1, 2, wallHeight - 2);
  context.fillStyle = "#f8e3c1";
  context.fillRect(x + 5, wallY + 2, width - 11, 2);
  context.fillStyle = TOWN_PALETTE.wallShade;
  context.fillRect(x + width - 6, wallY + 1, 5, wallHeight - 1);
  context.fillStyle = TOWN_PALETTE.pathShade;
  context.fillRect(x + 2, anchor.y - 3, width - 4, 2);
  context.strokeStyle = TOWN_PALETTE.outline;
  context.lineWidth = 1;
  context.strokeRect(x + 0.5, wallY - 0.5, width - 1, wallHeight + 0.5);

  drawRoof(context, building, top, wallY, spec.roofColor);
  drawRoofDetails(context, x, wallY, width);
  context.fillStyle = TOWN_PALETTE.outline;
  context.fillRect(x - 2, wallY - 2, width + 4, 2);
  drawDoorAndWindows(context, x, wallY, width, wallHeight, spec.litWindows);
  drawFacadeDetails(context, x, wallY, width, wallHeight, building.architectureVariant, accent);
  drawLanguageSign(
    context,
    x + Math.floor(width / 2) - 4,
    top + 5,
    accent,
    repository.languages.primary?.name ?? null,
  );
  drawSecondaryLanguageAccents(
    context,
    x + width - 11,
    wallY - 5,
    building.secondaryLanguageAccents,
  );
  drawDistrictBadge(context, x + 2, top + 7, building.district);

  if (spec.showSmoke) drawSmoke(context, x + width - 4, top + 3, frame);
  if (spec.showHeritageIvy) drawIvy(context, x + width - 5, wallY + 5);
  if (spec.ornamentTier > 0) drawStarOrnament(context, x + Math.floor(width / 2), top - 3, spec.ornamentTier);

  if (selected) {
    context.strokeStyle = TOWN_PALETTE.gold;
    context.lineWidth = 2;
    context.strokeRect(bounds.x - 3, bounds.y - 3, bounds.width + 6, bounds.height + 6);
    context.fillStyle = TOWN_PALETTE.gold;
    context.fillRect(bounds.x - 3, bounds.y - 3, 5, 2);
    context.fillRect(bounds.x + bounds.width - 2, bounds.y - 3, 5, 2);
    context.lineWidth = 1;
  }
}

function drawRoofDetails(
  context: CanvasRenderingContext2D,
  x: number,
  wallY: number,
  width: number,
): void {
  context.fillStyle = TOWN_PALETTE.roofShade;
  for (let tileX = x + 4; tileX < x + width - 3; tileX += 7) {
    context.fillRect(tileX, wallY - 5, 4, 1);
    context.fillRect(tileX + 2, wallY - 3, 4, 1);
  }
}

function drawRoof(
  context: CanvasRenderingContext2D,
  building: TownBuildingPlacement,
  top: number,
  wallY: number,
  roofColor: string,
): void {
  const { x, width } = building.bounds;
  const center = x + Math.floor(width / 2);
  if (building.architectureVariant === 2) {
    context.fillStyle = TOWN_PALETTE.outline;
    context.fillRect(x - 2, top + 2, width + 4, wallY - top + 1);
    context.fillStyle = roofColor;
    context.fillRect(x, top + 3, width, Math.max(4, wallY - top - 2));
    context.fillStyle = TOWN_PALETTE.roofHighlight;
    context.fillRect(x + 2, top + 4, Math.max(4, width - 9), 2);
    context.fillStyle = TOWN_PALETTE.roofShade;
    context.fillRect(x + width - 5, top + 4, 4, Math.max(3, wallY - top - 4));
    context.fillStyle = TOWN_PALETTE.gold;
    context.fillRect(x + 4, wallY - 2, width - 8, 2);
    return;
  }

  const peakX = building.architectureVariant === 0 ? center : center - 4;
  polygon(context, [[x - 3, wallY], [peakX, top], [x + width + 3, wallY]], TOWN_PALETTE.outline);
  polygon(context, [[x - 1, wallY - 1], [peakX, top + 2], [center, wallY - 1]], roofColor);
  polygon(context, [[center, wallY - 1], [peakX, top + 2], [x + width + 1, wallY - 1]], TOWN_PALETTE.roofShade);
  context.fillStyle = TOWN_PALETTE.roofHighlight;
  context.fillRect(Math.min(peakX, center - 2), top + 3, 4, 2);
}

function drawFacadeDetails(
  context: CanvasRenderingContext2D,
  x: number,
  wallY: number,
  width: number,
  wallHeight: number,
  variant: 0 | 1 | 2,
  accent: string,
): void {
  context.fillStyle = TOWN_PALETTE.wallShade;
  context.fillRect(x + width - 4, wallY + 4, 2, Math.max(4, wallHeight - 8));
  context.fillStyle = TOWN_PALETTE.wallHighlight;
  context.fillRect(x + 4, wallY + 4, 2, Math.max(4, wallHeight - 8));

  const boxY = wallY + wallHeight - 2;
  const boxXs = [x + 4, x + width - 12];
  boxXs.forEach((boxX, index) => {
    context.fillStyle = TOWN_PALETTE.outline;
    context.fillRect(boxX, boxY, 8, 3);
    context.fillStyle = index === 0 ? accent : TOWN_PALETTE.grassDark;
    context.fillRect(boxX + 1, boxY - 1, 6, 2);
    context.fillStyle = TOWN_PALETTE.grassLight;
    context.fillRect(boxX + 2, boxY - 2, 2, 2);
    context.fillRect(boxX + 5, boxY - 2, 2, 2);
  });

  if (variant === 1) {
    context.fillStyle = accent;
    context.fillRect(x + 3, wallY + 3, width - 7, 1);
    context.fillStyle = TOWN_PALETTE.gold;
    context.fillRect(x + Math.floor(width / 2) - 3, wallY + wallHeight - 6, 6, 1);
  }
}

function drawDoorAndWindows(
  context: CanvasRenderingContext2D,
  x: number,
  wallY: number,
  width: number,
  wallHeight: number,
  litWindows: number,
): void {
  const baseY = wallY + wallHeight;
  context.fillStyle = TOWN_PALETTE.outline;
  const doorX = x + Math.floor(width / 2) - 4;
  context.fillRect(doorX, baseY - 10, 8, 10);
  context.fillStyle = TOWN_PALETTE.roofShade;
  context.fillRect(doorX + 1, baseY - 9, 6, 9);
  context.fillStyle = TOWN_PALETTE.gold;
  context.fillRect(doorX + 5, baseY - 5, 1, 1);
  const windowXs = [x + 5, x + width - 11];
  windowXs.forEach((windowX, index) => {
    context.fillStyle = TOWN_PALETTE.outline;
    context.fillRect(windowX, wallY + 6, 7, 7);
    context.fillStyle = index < litWindows ? TOWN_PALETTE.windowLit : TOWN_PALETTE.windowCool;
    context.fillRect(windowX + 1, wallY + 7, 5, 5);
    context.fillStyle = TOWN_PALETTE.outline;
    context.fillRect(windowX + 3, wallY + 7, 1, 5);
    context.fillRect(windowX + 1, wallY + 9, 5, 1);
    context.fillStyle = TOWN_PALETTE.pathShade;
    context.fillRect(windowX, wallY + 13, 8, 2);
  });
}

function drawLanguageSign(
  context: CanvasRenderingContext2D,
  x: number,
  y: number,
  accent: string,
  language: string | null,
): void {
  context.fillStyle = TOWN_PALETTE.outline;
  context.fillRect(x, y, 9, 9);
  context.fillStyle = accent;
  context.fillRect(x + 1, y + 1, 7, 7);
  context.fillStyle = "#fff7e7";
  context.font = "bold 5px monospace";
  context.textBaseline = "top";
  context.fillText(languageMonogram(language), x + 2, y + 2);
}

function drawSecondaryLanguageAccents(
  context: CanvasRenderingContext2D,
  x: number,
  y: number,
  accents: number[],
): void {
  accents.forEach((accent, index) => {
    context.fillStyle = TOWN_PALETTE.outline;
    context.fillRect(x + index * 4, y, 4, 4);
    context.fillStyle = TOWN_PALETTE.accents[accent]!;
    context.fillRect(x + 1 + index * 4, y + 1, 2, 2);
  });
}

function drawDistrictBadge(
  context: CanvasRenderingContext2D,
  x: number,
  y: number,
  district: TownDistrict,
): void {
  context.fillStyle = TOWN_PALETTE.outline;
  if (district === "owned") {
    context.fillRect(x + 2, y, 3, 2);
    context.fillRect(x + 1, y + 2, 5, 4);
  } else {
    context.fillRect(x, y + 1, 3, 3);
    context.fillRect(x + 4, y + 3, 3, 3);
    context.fillRect(x + 2, y + 3, 3, 1);
  }
}

function drawSmoke(context: CanvasRenderingContext2D, x: number, y: number, frame: number): void {
  context.fillStyle = TOWN_PALETTE.outline;
  context.fillRect(x, y + 5, 4, 6);
  context.fillStyle = "#eaf2e9";
  context.fillRect(x + (frame % 2), y + 1, 3, 3);
  context.fillRect(x + 2 - (frame % 2), y - 3, 2, 2);
}

function drawIvy(context: CanvasRenderingContext2D, x: number, y: number): void {
  context.fillStyle = TOWN_PALETTE.grassDark;
  context.fillRect(x, y, 2, 2);
  context.fillRect(x - 2, y + 3, 2, 3);
  context.fillRect(x, y + 7, 2, 2);
}

function drawStarOrnament(
  context: CanvasRenderingContext2D,
  x: number,
  y: number,
  tier: number,
): void {
  context.fillStyle = TOWN_PALETTE.outline;
  context.fillRect(x - 1, y - 1, 3, 7);
  context.fillRect(x - 3, y + 1, 7, 3);
  context.fillStyle = TOWN_PALETTE.gold;
  context.fillRect(x, y, 1, 5);
  context.fillRect(x - 2, y + 2, 5, 1);
  if (tier >= 3) {
    context.fillRect(x - 4, y + 4, 2, 2);
    context.fillRect(x + 3, y + 4, 2, 2);
  }
  if (tier === 4) context.fillRect(x - 1, y - 3, 3, 2);
}

function drawVisitors(context: CanvasRenderingContext2D, count: number, frame: number): void {
  const positions = [[172, 171], [203, 171], [172, 204], [203, 204]] as const;
  for (let index = 0; index < count; index += 1) {
    const position = positions[index];
    if (!position) break;
    const bob = (frame + index) % 2;
    const x = position[0];
    const y = position[1] - bob;
    context.fillStyle = TOWN_PALETTE.outline;
    context.fillRect(x + 1, y, 8, 8);
    context.fillRect(x + 2, y - 1, 6, 2);
    context.fillStyle = "#f1c6a8";
    context.fillRect(x + 2, y + 3, 6, 4);
    context.fillStyle = TOWN_PALETTE.accents[(index + 2) % TOWN_PALETTE.accents.length]!;
    context.fillRect(x + 2, y + 1, 6, 3);
    context.fillStyle = TOWN_PALETTE.outline;
    context.fillRect(x + 3, y + 4, 1, 1);
    context.fillRect(x + 6, y + 4, 1, 1);
    context.fillStyle = TOWN_PALETTE.windowLit;
    context.fillRect(x + 4, y + 6, 2, 1);
    context.fillRect(x, y + 8, 10, 7);
    context.fillRect(x + 1, y + 15, 3, 3);
    context.fillRect(x + 6, y + 15, 3, 3);
    context.fillStyle = TOWN_PALETTE.accents[(index + 1) % TOWN_PALETTE.accents.length]!;
    context.fillRect(x + 1, y + 9, 8, 5);
    context.fillStyle = "#fff7e7";
    context.fillRect(x + 4, y + 10, 2, 2);
  }
}

function drawStarterCompanion(
  context: CanvasRenderingContext2D,
  x: number,
  y: number,
  frame: number,
): void {
  const tailLength = frame % 2 === 0 ? 7 : 9;
  context.fillStyle = TOWN_PALETTE.outline;
  context.fillRect(x + 3, y + 3, 17, 12);
  context.fillRect(x + 2, y, 6, 7);
  context.fillRect(x + 15, y, 6, 7);
  context.fillRect(x + 5, y + 14, 14, 10);
  context.fillRect(x + 16, y + 17, tailLength, 3);
  context.fillRect(x + 20 + (frame % 2) * 2, y + 14, 3, 6);

  context.fillStyle = "#f5ead8";
  context.fillRect(x + 4, y + 4, 15, 10);
  context.fillRect(x + 4, y + 2, 3, 4);
  context.fillRect(x + 16, y + 2, 3, 4);
  context.fillRect(x + 6, y + 15, 12, 8);
  context.fillStyle = "#d8b99f";
  context.fillRect(x + 6, y + 16, 2, 6);
  context.fillRect(x + 14, y + 16, 2, 6);
  context.fillRect(x + 5, y + 5, 2, 2);
  context.fillRect(x + 16, y + 5, 2, 2);
  context.fillStyle = TOWN_PALETTE.windowLit;
  context.fillRect(x + 7, y + 7, 2, 2);
  context.fillRect(x + 13, y + 7, 2, 2);
  context.fillStyle = TOWN_PALETTE.accents[0]!;
  context.fillRect(x + 10, y + 10, 2, 1);
  context.fillRect(x + 7, y + 13, 9, 2);
  context.fillStyle = TOWN_PALETTE.gold;
  context.fillRect(x + 10, y + 14, 2, 2);
}

function polygon(
  context: CanvasRenderingContext2D,
  points: ReadonlyArray<readonly [number, number]>,
  fill: string,
): void {
  const first = points[0];
  if (!first) return;
  context.beginPath();
  context.moveTo(first[0], first[1]);
  for (const point of points.slice(1)) context.lineTo(point[0], point[1]);
  context.closePath();
  context.fillStyle = fill;
  context.fill();
}
