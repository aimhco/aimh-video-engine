import { expect, test } from "bun:test";
import { overlayLogo } from "../src/finish";
import { FFMPEG, FFPROBE } from "../src/ffmpeg";

test("overlayLogo watermarks the video and preserves audio", async () => {
  const dir = `${import.meta.dir}/fixtures/logo`;
  await Bun.$`mkdir -p ${dir}`;
  // A 2s clip WITH audio, and a small opaque logo PNG.
  await Bun.$`${FFMPEG} -y -f lavfi -i color=c=blue:s=320x240:d=2 -f lavfi -i sine=frequency=440:duration=2 -pix_fmt yuv420p -c:a aac -shortest ${dir}/in.mp4`.quiet();
  await Bun.$`${FFMPEG} -y -f lavfi -i color=c=purple:s=64x64:d=1 -frames:v 1 ${dir}/logo.png`.quiet();

  const out = await overlayLogo({ video: `${dir}/in.mp4`, logo: `${dir}/logo.png`, out: `${dir}/out.mp4` });

  expect(out).toBe(`${dir}/out.mp4`);
  const streams = await Bun.$`${FFPROBE} -v error -show_entries stream=codec_type -of csv=p=0 ${out}`.text();
  expect(streams).toContain("video");
  expect(streams).toContain("audio");
});
