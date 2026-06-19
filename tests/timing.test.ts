import { expect, test } from "bun:test";
import { speedFactor, clamp } from "../src/timing";

test("equal durations → speed 1", () => {
  expect(speedFactor(10, 10)).toBeCloseTo(1.0);
});

test("footage mildly longer → ratio", () => {
  expect(speedFactor(12, 10)).toBeCloseTo(1.2);
});

test("footage far longer → clamps to 2x", () => {
  expect(speedFactor(30, 10)).toBeCloseTo(2.0);
});

test("footage far shorter → clamps to 0.5x", () => {
  expect(speedFactor(3, 10)).toBeCloseTo(0.5);
});

test("clamp bounds a value", () => {
  expect(clamp(5, 0, 3)).toBe(3);
  expect(clamp(-1, 0, 3)).toBe(0);
  expect(clamp(2, 0, 3)).toBe(2);
});
