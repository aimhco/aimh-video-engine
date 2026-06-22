import { expect, test } from "bun:test";
import { planOverlays } from "../src/overlays";
import type { OverlaySpec, ScriptChunk } from "../src/types";

const chunk = (id: string, start: number, end: number): ScriptChunk =>
  ({ id, text: "x", sourceStart: start, sourceEnd: end });

test("plans a chunk-scoped highlight with a review note", () => {
  const specs: OverlaySpec[] = [{
    id: "pricing-cards",
    kind: "highlight",
    chunkId: "c09",
    pointPct: [6, 35],
    sizePct: [88, 58],
    note: "Track the pricing cards, not the page heading.",
  }];

  const plan = planOverlays(specs, [chunk("c09", 56.86, 71.58)]);

  expect(plan.warnings).toEqual([]);
  expect(plan.overlays).toEqual([{
    id: "pricing-cards",
    kind: "highlight",
    startTimeMs: 56860,
    durationMs: 14720,
    point: { xPct: 6, yPct: 35 },
    dimensions: { widthPct: 88, heightPct: 58 },
    note: "Track the pricing cards, not the page heading.",
  }]);
});

test("plans an explicit-time blur and clamps rectangle values", () => {
  const specs: OverlaySpec[] = [{
    id: "token",
    kind: "blur",
    startTimeSec: 10,
    endTimeSec: 12.25,
    pointPct: [-4, 98],
    sizePct: [120, 10],
  }];

  const plan = planOverlays(specs, []);

  expect(plan.overlays[0]).toMatchObject({
    id: "token",
    kind: "blur",
    startTimeMs: 10000,
    durationMs: 2250,
    point: { xPct: 0, yPct: 98 },
    dimensions: { widthPct: 100, heightPct: 10 },
  });
  expect(plan.warnings.some((w) => w.includes("token") && w.includes("clamped"))).toBe(true);
});

test("skips overlays when neither valid chunk timing nor explicit timing is available", () => {
  const specs: OverlaySpec[] = [{
    id: "missing",
    kind: "highlight",
    chunkId: "c404",
    pointPct: [10, 10],
    sizePct: [20, 20],
  }];

  const plan = planOverlays(specs, [chunk("c01", 0, 5)]);

  expect(plan.overlays).toEqual([]);
  expect(plan.warnings).toEqual(["missing: skipped — chunkId c404 not found"]);
});
