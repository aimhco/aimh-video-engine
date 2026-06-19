// tests/wrap.test.ts
import { expect, test } from "bun:test";
import { wrapVideo } from "../src/finish";
import { ffprobeDuration } from "../src/ffprobe";

// Intro/body/outro deliberately have different resolutions to exercise normalization + padding.
test("wrapVideo concatenates intro + body + outro (durations add up)", async () => {
  const dir = `${import.meta.dir}/fixtures/wrap`;
  await Bun.$`mkdir -p ${dir}/work`;
  await Bun.$`ffmpeg -y -f lavfi -i color=c=blue:s=640x360:d=2 -f lavfi -i sine=frequency=440:duration=2 -pix_fmt yuv420p -c:a aac -shortest ${dir}/body.mp4`.quiet();
  await Bun.$`ffmpeg -y -f lavfi -i color=c=red:s=1280x720:d=1 -f lavfi -i sine=frequency=330:duration=1 -pix_fmt yuv420p -c:a aac -shortest ${dir}/intro.mp4`.quiet();
  await Bun.$`ffmpeg -y -f lavfi -i color=c=green:s=1920x1080:d=1 -f lavfi -i sine=frequency=550:duration=1 -pix_fmt yuv420p -c:a aac -shortest ${dir}/outro.mp4`.quiet();

  const out = await wrapVideo({
    body: `${dir}/body.mp4`,
    intro: `${dir}/intro.mp4`,
    outro: `${dir}/outro.mp4`,
    workDir: `${dir}/work`,
    out: `${dir}/final.mp4`,
  });
  const dur = await ffprobeDuration(out);
  expect(dur).toBeGreaterThan(3.5);
  expect(dur).toBeLessThan(4.5); // 1 + 2 + 1 = ~4s
});

test("wrapVideo with no intro/outro is a no-op copy", async () => {
  const dir = `${import.meta.dir}/fixtures/wrap`;
  const out = await wrapVideo({ body: `${dir}/body.mp4`, workDir: `${dir}/work`, out: `${dir}/nowrap.mp4` });
  const dur = await ffprobeDuration(out);
  expect(dur).toBeGreaterThan(1.5);
  expect(dur).toBeLessThan(2.5); // body only = ~2s
});
