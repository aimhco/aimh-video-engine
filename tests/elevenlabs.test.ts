import { expect, test } from "bun:test";
import { synthesizeChunk } from "../src/elevenlabs";

test("returns cached:true without calling the API when the mp3 already exists", async () => {
  const dir = "tests/fixtures/finish/vo"; // contains c1.mp3
  const v = await synthesizeChunk(
    { id: "c1", text: "irrelevant", sourceStart: 0, sourceEnd: 1 },
    dir,
  );
  expect(v.cached).toBe(true);
  expect(v.file).toBe(`${dir}/c1.mp3`);
  expect(v.duration).toBeGreaterThan(0);
});
