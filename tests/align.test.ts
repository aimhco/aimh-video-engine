import { expect, test } from "bun:test";
import { planSegments } from "../src/align";
import type { ScriptChunk, VoChunk } from "../src/types";

const chunk = (id: string, start: number, end: number): ScriptChunk =>
  ({ id, text: "x", sourceStart: start, sourceEnd: end });
const vo = (id: string, duration: number): VoChunk =>
  ({ id, file: `vo/${id}.mp3`, duration });

test("equal lengths → speed 1, no trim, no pad", () => {
  const [s] = planSegments([chunk("c1", 0, 10)], [vo("c1", 10)]);
  expect(s!.speedFactor).toBeCloseTo(1.0);
  expect(s!.sourceUsedDuration).toBeCloseTo(10);
  expect(s!.padDuration).toBeCloseTo(0);
});

test("footage mildly longer → speed up, use all source", () => {
  const [s] = planSegments([chunk("c1", 0, 12)], [vo("c1", 10)]);
  expect(s!.speedFactor).toBeCloseTo(1.2);
  expect(s!.sourceUsedDuration).toBeCloseTo(12);
  expect(s!.padDuration).toBeCloseTo(0);
});

test("footage far longer → clamp to 2x and trim idle tail", () => {
  const [s] = planSegments([chunk("c1", 0, 30)], [vo("c1", 10)]);
  expect(s!.speedFactor).toBeCloseTo(2.0);
  expect(s!.sourceUsedDuration).toBeCloseTo(20); // 20s @2x = 10s
  expect(s!.padDuration).toBeCloseTo(0);
});

test("footage far shorter → clamp to 0.5x and freeze-pad", () => {
  const [s] = planSegments([chunk("c1", 0, 3)], [vo("c1", 10)]);
  expect(s!.speedFactor).toBeCloseTo(0.5);
  expect(s!.sourceUsedDuration).toBeCloseTo(3); // 3 / 0.5 = 6s
  expect(s!.padDuration).toBeCloseTo(4);        // + 4s freeze = 10s
});

test("throws when a chunk has no matching VO", () => {
  expect(() => planSegments([chunk("c1", 0, 5)], [])).toThrow("c1");
});

test("throws when a chunk's VO has non-positive duration", () => {
  expect(() => planSegments([chunk("c1", 0, 5)], [vo("c1", 0)])).toThrow("c1");
});
