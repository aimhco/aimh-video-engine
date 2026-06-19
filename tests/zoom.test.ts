import { expect, test } from "bun:test";
import { planZooms } from "../src/zoom";
import type { ScriptChunk, VoChunk } from "../src/types";

const chunk = (id: string, start: number, end: number, zoom?: ScriptChunk["zoom"]): ScriptChunk =>
  ({ id, text: "x", sourceStart: start, sourceEnd: end, zoom });
const vo = (id: string, duration: number): VoChunk =>
  ({ id, file: `vo/${id}.mp3`, duration });

test("chunk without a zoom field is not planned", () => {
  const plan = planZooms([chunk("c1", 0, 10)]);
  expect(plan.zooms).toHaveLength(0);
});

test("zoomed chunk gets defaults: manualZoom, scale 1.25, centered focus", () => {
  const [z] = planZooms([chunk("c1", 0, 10, {})]).zooms;
  expect(z!.type).toBe("manualZoom");
  expect(z!.scale).toBeCloseTo(1.25);
  expect(z!.focusPoint).toEqual({ xPct: 50, yPct: 50 });
});

test("maps source seconds to whole-chunk millisecond span", () => {
  const [z] = planZooms([chunk("c9", 56.86, 71.58, {})]).zooms;
  expect(z!.startTimeMs).toBe(56860);
  expect(z!.durationMs).toBe(14720);
});

test("custom scale and focus pass through", () => {
  const [z] = planZooms([chunk("c1", 0, 5, { scale: 1.3, focusPct: [40, 60] })]).zooms;
  expect(z!.scale).toBeCloseTo(1.3);
  expect(z!.focusPoint).toEqual({ xPct: 40, yPct: 60 });
});

test("estFinalSec computed when VO present (trim case)", () => {
  const [z] = planZooms([chunk("c1", 0, 30, {})], [vo("c1", 10)]).zooms;
  expect(z!.estFinalSec).toBeCloseTo(10); // 30/2=15, capped at vo 10
});

test("estFinalSec computed when VO present (pad case)", () => {
  const [z] = planZooms([chunk("c1", 0, 3, {})], [vo("c1", 10)]).zooms;
  expect(z!.estFinalSec).toBeCloseTo(6); // 3/0.5=6 < vo 10
});

test("estFinalSec omitted when no VO", () => {
  const [z] = planZooms([chunk("c1", 0, 30, {})]).zooms;
  expect(z!.estFinalSec).toBeUndefined();
});

test("scale below 1 clamps to 1 with a warning", () => {
  const plan = planZooms([chunk("c1", 0, 5, { scale: 0.8 })]);
  expect(plan.zooms[0]!.scale).toBe(1);
  expect(plan.warnings.some((w) => w.includes("c1") && w.includes("1"))).toBe(true);
});

test("scale above 4 clamps to 4 with a warning", () => {
  const plan = planZooms([chunk("c1", 0, 5, { scale: 9 })]);
  expect(plan.zooms[0]!.scale).toBe(4);
  expect(plan.warnings.some((w) => w.includes("c1"))).toBe(true);
});

test("scale above 1.5 keeps value but warns 'heavy'", () => {
  const plan = planZooms([chunk("c1", 0, 5, { scale: 1.6 })]);
  expect(plan.zooms[0]!.scale).toBeCloseTo(1.6);
  expect(plan.warnings.some((w) => w.toLowerCase().includes("heavy"))).toBe(true);
});

test("focus outside 0-100 clamps with a warning", () => {
  const plan = planZooms([chunk("c1", 0, 5, { focusPct: [120, -5] })]);
  expect(plan.zooms[0]!.focusPoint).toEqual({ xPct: 100, yPct: 0 });
  expect(plan.warnings.filter((w) => w.includes("focus"))).toHaveLength(2);
});

test("non-positive span is skipped with a warning", () => {
  const plan = planZooms([chunk("c1", 5, 5, {})]);
  expect(plan.zooms).toHaveLength(0);
  expect(plan.warnings.some((w) => w.includes("c1"))).toBe(true);
});
