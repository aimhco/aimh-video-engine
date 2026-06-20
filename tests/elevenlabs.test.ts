import { beforeAll, expect, test } from "bun:test";
import { synthesizeChunk } from "../src/elevenlabs";
import { FFMPEG } from "../src/ffmpeg";

const dir = `${import.meta.dir}/fixtures/elevenlabs`;

beforeAll(async () => {
  await Bun.$`mkdir -p ${dir}`;
  await Bun.$`${FFMPEG} -y -f lavfi -i sine=frequency=440:duration=1 ${dir}/c1.mp3`.quiet();
});

test("returns cached:true without calling the API when the mp3 already exists", async () => {
  const v = await synthesizeChunk(
    { id: "c1", text: "irrelevant", sourceStart: 0, sourceEnd: 1 },
    dir,
  );
  expect(v.cached).toBe(true);
  expect(v.file).toBe(`${dir}/c1.mp3`);
  expect(v.duration).toBeGreaterThan(0);
});
