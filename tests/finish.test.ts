import { expect, test } from "bun:test";
import { assembleVideo } from "../src/finish";
import { ffprobeDuration } from "../src/ffprobe";
import type { Segment } from "../src/types";

// Generates a 6s test recording + two 2s tone VO files with ffmpeg, then assembles.
test("assembleVideo produces a file whose duration matches the sum of targets", async () => {
  const dir = `${import.meta.dir}/fixtures/finish`;
  await Bun.$`mkdir -p ${dir}/vo`;
  await Bun.$`ffmpeg -y -f lavfi -i color=c=blue:s=320x240:d=6 -pix_fmt yuv420p ${dir}/recording.mp4`.quiet();
  await Bun.$`ffmpeg -y -f lavfi -i sine=frequency=440:duration=2 ${dir}/vo/c1.mp3`.quiet();
  await Bun.$`ffmpeg -y -f lavfi -i sine=frequency=660:duration=2 ${dir}/vo/c2.mp3`.quiet();

  const segments: Segment[] = [
    { id: "c1", sourceStart: 0, sourceUsedDuration: 3, speedFactor: 1.5, padDuration: 0, targetDuration: 2, voFile: `${dir}/vo/c1.mp3` },
    { id: "c2", sourceStart: 3, sourceUsedDuration: 1, speedFactor: 0.5, padDuration: 0, targetDuration: 2, voFile: `${dir}/vo/c2.mp3` },
  ];

  const out = await assembleVideo({ recording: `${dir}/recording.mp4`, segments, workDir: `${dir}/work`, out: `${dir}/final.mp4` });
  const dur = await ffprobeDuration(out);
  expect(dur).toBeGreaterThan(3.5);
  expect(dur).toBeLessThan(4.5); // ~4s total (2 + 2)
});
