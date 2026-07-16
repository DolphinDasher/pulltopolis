import type { TownSnapshot } from "../../shared/town-snapshot.js";
import { renderEmptyTown, renderTown } from "./draw.js";
import { buildTownLayout, hitTestRepository, TOWN_VIEWPORT, type TownLayout } from "./layout.js";

export {
  buildTownLayout,
  buildingRenderBounds,
  containsBuilding,
  hitTestRepository,
  TOWN_VIEWPORT,
} from "./layout.js";
export type { Point, Rect, TownBuildingPlacement, TownDistrict, TownLayout } from "./layout.js";
export { buildingVisualSpec, languageMonogram, recencyAmbience, spriteFrame } from "./visuals.js";

export interface TownRendererOptions {
  onRepositorySelect?: (githubId: string | null) => void;
  reducedMotion?: boolean;
}

export interface TownRendererController {
  setSnapshot(snapshot: TownSnapshot): void;
  setSelectedRepository(githubId: string | null): void;
  setReducedMotion(reduced: boolean): void;
  destroy(): void;
}

export function mountTownRenderer(
  canvas: HTMLCanvasElement,
  options: TownRendererOptions = {},
): TownRendererController {
  canvas.width = TOWN_VIEWPORT.width;
  canvas.height = TOWN_VIEWPORT.height;
  canvas.style.imageRendering = "pixelated";
  canvas.setAttribute("role", "img");

  let context: CanvasRenderingContext2D | null = null;
  try {
    context = canvas.getContext("2d");
  } catch {
    // Semantic town details remain usable when a browser blocks Canvas.
  }
  if (!context) return mountCanvasFallback(canvas);

  let snapshot: TownSnapshot | null = null;
  let layout: TownLayout | null = null;
  let selectedRepositoryId: string | null = null;
  let reducedMotion = options.reducedMotion ?? false;
  let animationRequest: number | null = null;
  let destroyed = false;
  let dirty = true;
  let lastFrame = -1;
  const startedAt = performance.now();

  const draw = (now: number): void => {
    if (destroyed) return;
    animationRequest = null;
    const elapsedMs = now - startedAt;
    const frame = reducedMotion ? 0 : Math.floor(elapsedMs / 125);
    if (dirty || frame !== lastFrame) {
      if (snapshot && layout) {
        renderTown(context, snapshot, layout, {
          elapsedMs,
          reducedMotion,
          selectedRepositoryId,
        });
      } else {
        renderEmptyTown(context);
      }
      dirty = false;
      lastFrame = frame;
    }
    if (!reducedMotion && !isDocumentHidden()) animationRequest = requestAnimationFrame(draw);
  };

  const requestDraw = (): void => {
    dirty = true;
    if (animationRequest === null && !isDocumentHidden()) {
      animationRequest = requestAnimationFrame(draw);
    }
  };

  const onVisibilityChange = (): void => {
    if (isDocumentHidden()) {
      if (animationRequest !== null) cancelAnimationFrame(animationRequest);
      animationRequest = null;
      return;
    }
    requestDraw();
  };

  const pointFromEvent = (event: PointerEvent) => {
    const rect = canvas.getBoundingClientRect();
    if (rect.width <= 0 || rect.height <= 0) return null;
    return {
      x: ((event.clientX - rect.left) / rect.width) * canvas.width,
      y: ((event.clientY - rect.top) / rect.height) * canvas.height,
    };
  };

  const onPointerMove = (event: PointerEvent): void => {
    const point = pointFromEvent(event);
    canvas.style.cursor = point && layout && hitTestRepository(layout, point) ? "pointer" : "default";
  };

  const onPointerDown = (event: PointerEvent): void => {
    const point = pointFromEvent(event);
    const githubId = point && layout ? hitTestRepository(layout, point)?.repository.githubId ?? null : null;
    selectedRepositoryId = githubId;
    options.onRepositorySelect?.(githubId);
    requestDraw();
  };

  canvas.addEventListener("pointermove", onPointerMove);
  canvas.addEventListener("pointerdown", onPointerDown);
  if (typeof document !== "undefined") document.addEventListener("visibilitychange", onVisibilityChange);
  requestDraw();

  return {
    setSnapshot(nextSnapshot) {
      snapshot = nextSnapshot;
      layout = buildTownLayout(nextSnapshot);
      if (
        selectedRepositoryId !== null &&
        !layout.buildings.some(({ repository }) => repository.githubId === selectedRepositoryId)
      ) {
        selectedRepositoryId = null;
      }
      canvas.setAttribute(
        "aria-label",
        `Pixel-art repository town for ${nextSnapshot.profile.login}, with ${layout.buildings.length} repository buildings`,
      );
      requestDraw();
    },
    setSelectedRepository(githubId) {
      selectedRepositoryId = githubId;
      requestDraw();
    },
    setReducedMotion(reduced) {
      if (reducedMotion === reduced) return;
      reducedMotion = reduced;
      if (reducedMotion && animationRequest !== null) {
        cancelAnimationFrame(animationRequest);
        animationRequest = null;
      }
      requestDraw();
    },
    destroy() {
      if (destroyed) return;
      destroyed = true;
      canvas.removeEventListener("pointermove", onPointerMove);
      canvas.removeEventListener("pointerdown", onPointerDown);
      if (typeof document !== "undefined") {
        document.removeEventListener("visibilitychange", onVisibilityChange);
      }
      if (animationRequest !== null) cancelAnimationFrame(animationRequest);
      animationRequest = null;
    },
  };
}

function mountCanvasFallback(canvas: HTMLCanvasElement): TownRendererController {
  canvas.setAttribute("aria-label", "Town illustration unavailable; repository details remain below");

  return {
    setSnapshot(snapshot) {
      const repositoryCount =
        snapshot.districts.owned.repositories.length +
        snapshot.districts.contributed.repositories.length;
      canvas.setAttribute(
        "aria-label",
        `Town illustration unavailable for ${snapshot.profile.login}; ${repositoryCount} repository buildings are described below`,
      );
    },
    setSelectedRepository() {},
    setReducedMotion() {},
    destroy() {},
  };
}

function isDocumentHidden(): boolean {
  return typeof document !== "undefined" && document.hidden;
}
