import assert from "node:assert/strict";
import test from "node:test";

import type { TownSnapshot } from "../../shared/town-snapshot.js";
import { mountTownRenderer } from "./index.js";

test("reduced-motion redraws remain schedulable and normal animation restarts", () => {
  const callbacks = new Map<number, FrameRequestCallback>();
  let nextId = 1;
  const originalRequest = globalThis.requestAnimationFrame;
  const originalCancel = globalThis.cancelAnimationFrame;
  globalThis.requestAnimationFrame = (callback) => {
    const id = nextId++;
    callbacks.set(id, callback);
    return id;
  };
  globalThis.cancelAnimationFrame = (id) => {
    callbacks.delete(id);
  };

  try {
    const canvas = fakeCanvas();
    const controller = mountTownRenderer(canvas, { reducedMotion: true });
    assert.equal(callbacks.size, 1);
    runNext(callbacks, 0);
    assert.equal(callbacks.size, 0);

    controller.setSelectedRepository(null);
    assert.equal(callbacks.size, 1);
    runNext(callbacks, 125);
    assert.equal(callbacks.size, 0);

    controller.setReducedMotion(false);
    assert.equal(callbacks.size, 1);
    runNext(callbacks, 250);
    assert.equal(callbacks.size, 1);

    controller.destroy();
    assert.equal(callbacks.size, 0);
  } finally {
    globalThis.requestAnimationFrame = originalRequest;
    globalThis.cancelAnimationFrame = originalCancel;
  }
});

test("Canvas failures leave a usable no-op renderer", () => {
  for (const getContext of [
    () => null,
    () => {
      throw new Error("Canvas is disabled");
    },
  ]) {
    const attributes = new Map<string, string>();
    const canvas = {
      width: 0,
      height: 0,
      style: { imageRendering: "" },
      getContext,
      setAttribute(name: string, value: string) {
        attributes.set(name, value);
      },
    } as unknown as HTMLCanvasElement;

    const controller = mountTownRenderer(canvas);
    assert.equal(canvas.width, 384);
    assert.equal(canvas.height, 256);
    assert.equal(attributes.get("role"), "img");
    assert.match(attributes.get("aria-label") ?? "", /repository details remain below/);
    controller.setSnapshot({
      profile: { login: "octocat" },
      districts: {
        owned: { repositories: [{}] },
        contributed: { repositories: [{}, {}] },
      },
    } as unknown as TownSnapshot);
    assert.match(attributes.get("aria-label") ?? "", /octocat; 3 repository buildings/);
    controller.setSelectedRepository("repo-1");
    controller.setReducedMotion(true);
    controller.destroy();
  }
});

function runNext(callbacks: Map<number, FrameRequestCallback>, now: number): void {
  const entry = callbacks.entries().next().value as [number, FrameRequestCallback] | undefined;
  assert.ok(entry);
  callbacks.delete(entry[0]);
  entry[1](now);
}

function fakeCanvas(): HTMLCanvasElement {
  const context = {
    save() {},
    restore() {},
    fillRect() {},
    clearRect() {},
    imageSmoothingEnabled: false,
    fillStyle: "",
  } as unknown as CanvasRenderingContext2D;
  return {
    width: 0,
    height: 0,
    style: { imageRendering: "", cursor: "" },
    getContext: () => context,
    setAttribute() {},
    addEventListener() {},
    removeEventListener() {},
  } as unknown as HTMLCanvasElement;
}
