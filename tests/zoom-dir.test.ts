import { expect, test } from "bun:test";
import { planZoomsForDir } from "../src/zoom";

test("reads script.json from a dir and plans only zoomed chunks", async () => {
  const plan = await planZoomsForDir("tests/fixtures/zoom");
  expect(plan.zooms).toHaveLength(1);
  const z = plan.zooms[0]!;
  expect(z.chunkId).toBe("c1");
  expect(z.startTimeMs).toBe(0);
  expect(z.durationMs).toBe(10000);
  expect(z.scale).toBeCloseTo(1.25);
  expect(z.estFinalSec).toBeUndefined(); // no vo/ dir in the fixture
});
