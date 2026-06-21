import { expect, test } from "bun:test";
import { assembleVideo, insertChapterCards } from "../src/finish";
import { ffprobeDuration } from "../src/ffprobe";
import { FFMPEG, FFPROBE } from "../src/ffmpeg";
import type { Segment } from "../src/types";

// Generates a 6s test recording + two 2s tone VO files with ffmpeg, then assembles.
test("assembleVideo produces a file whose duration matches the sum of targets", async () => {
  const dir = `${import.meta.dir}/fixtures/finish`;
  await Bun.$`mkdir -p ${dir}/vo`;
  await Bun.$`${FFMPEG} -y -f lavfi -i color=c=blue:s=320x240:d=6 -pix_fmt yuv420p ${dir}/recording.mp4`.quiet();
  await Bun.$`${FFMPEG} -y -f lavfi -i sine=frequency=440:duration=2 ${dir}/vo/c1.mp3`.quiet();
  await Bun.$`${FFMPEG} -y -f lavfi -i sine=frequency=660:duration=2 ${dir}/vo/c2.mp3`.quiet();

  const segments: Segment[] = [
    { id: "c1", sourceStart: 0, sourceUsedDuration: 3, speedFactor: 1.5, padDuration: 0, targetDuration: 2, voFile: `${dir}/vo/c1.mp3` },
    { id: "c2", sourceStart: 3, sourceUsedDuration: 1, speedFactor: 0.5, padDuration: 0, targetDuration: 2, voFile: `${dir}/vo/c2.mp3` },
  ];

  const out = await assembleVideo({ recording: `${dir}/recording.mp4`, segments, workDir: `${dir}/work`, out: `${dir}/final.mp4` });
  const dur = await ffprobeDuration(out);
  expect(dur).toBeGreaterThan(3.5);
  expect(dur).toBeLessThan(4.5); // ~4s total (2 + 2)

  const streams = await Bun.$`${FFPROBE} -v error -show_entries stream=codec_type -of csv=p=0 ${dir}/final.mp4`.text();
  expect(streams).toContain("video");
  expect(streams).toContain("audio");
});

test("assembleVideo throws on empty segments", async () => {
  await expect(
    assembleVideo({ recording: "nonexistent.mp4", segments: [], workDir: "/tmp/aimh-none", out: "/tmp/aimh-none/out.mp4" })
  ).rejects.toThrow("no segments");
});

test("assembleVideo burns captions when a captionsFile is given", async () => {
  const dir = `${import.meta.dir}/fixtures/finish-cap`;
  await Bun.$`mkdir -p ${dir}/vo`;
  await Bun.$`${FFMPEG} -y -f lavfi -i color=c=blue:s=320x240:d=6 -pix_fmt yuv420p ${dir}/recording.mp4`.quiet();
  await Bun.$`${FFMPEG} -y -f lavfi -i sine=frequency=440:duration=2 ${dir}/vo/c1.mp3`.quiet();
  await Bun.write(`${dir}/captions.srt`, "1\n00:00:00,000 --> 00:00:02,000\nHello captions\n");

  const segments: Segment[] = [
    { id: "c1", sourceStart: 0, sourceUsedDuration: 3, speedFactor: 1.5, padDuration: 0, targetDuration: 2, voFile: `${dir}/vo/c1.mp3` },
  ];

  const out = await assembleVideo({
    recording: `${dir}/recording.mp4`, segments, workDir: `${dir}/work`,
    out: `${dir}/final.mp4`, captionsFile: `${dir}/captions.srt`,
  });
  const streams = await Bun.$`${FFPROBE} -v error -show_entries stream=codec_type -of csv=p=0 ${out}`.text();
  expect(streams).toContain("video");
  expect(streams).toContain("audio");
});

test("insertChapterCards splices a card into the body and extends duration", async () => {
  const dir = `${import.meta.dir}/fixtures/cards-insert`;
  await Bun.$`mkdir -p ${dir}`;
  // 6s body (color+audio) and a 2.5s "card" (color+audio).
  await Bun.$`${FFMPEG} -y -f lavfi -i color=c=blue:s=1920x1080:d=6 -f lavfi -i sine=frequency=440:duration=6 -pix_fmt yuv420p -r 30 -c:v libx264 -c:a aac -shortest ${dir}/body.mp4`.quiet();
  await Bun.$`${FFMPEG} -y -f lavfi -i color=c=purple:s=1920x1080:d=2.5 -f lavfi -i sine=frequency=330:duration=2.5 -pix_fmt yuv420p -r 30 -c:v libx264 -c:a aac -shortest ${dir}/card.mp4`.quiet();

  const out = await insertChapterCards({
    body: `${dir}/body.mp4`,
    cards: [{ clip: `${dir}/card.mp4`, atSec: 3 }],
    workDir: `${dir}/work`,
    out: `${dir}/out.mp4`,
  });
  const dur = parseFloat((await Bun.$`${FFPROBE} -v error -show_entries format=duration -of default=noprint_wrappers=1:nokey=1 ${out}`.text()).trim());
  expect(dur).toBeGreaterThan(8.0);  // 6 + 2.5 ~= 8.5
  expect(dur).toBeLessThan(9.0);
});
