// scripts/make-video.ts — thin Y-slice CLI: script.json + recording.mp4 -> final.mp4
import { synthesizeChunk } from "../src/elevenlabs";
import { planSegments } from "../src/align";
import { assembleVideo, wrapVideo } from "../src/finish";
import { planCaptions, toSrt } from "../src/captions";
import type { ScriptChunk, VoChunk } from "../src/types";

const slug = process.argv[2];
if (!slug) throw new Error("usage: bun run make-video <slug>");
const dir = `videos/${slug}`;

const script = (await Bun.file(`${dir}/script.json`).json()) as ScriptChunk[];
if (!script.length) throw new Error(`${dir}/script.json is empty`);

await Bun.$`mkdir -p ${dir}/vo`;
const vo: VoChunk[] = [];
for (const chunk of script) {
  const v = await synthesizeChunk(chunk, `${dir}/vo`);
  console.log(
    v.cached
      ? `voiceover ${chunk.id} (cached)`
      : `synthesized ${chunk.id} (${chunk.text.length} chars)`,
  );
  vo.push(v);
}

// Captions: burn the script narration onto the body, timed to the VO. On by default; --no-captions skips.
const captionsEnabled = !process.argv.includes("--no-captions");
let captionsFile: string | undefined;
if (captionsEnabled) {
  const cues = planCaptions(script, vo);
  if (cues.length) {
    captionsFile = `${dir}/captions.srt`;
    await Bun.write(captionsFile, toSrt(cues));
    console.log(`+ captions: ${cues.length} cues → ${captionsFile}`);
  }
}

const segments = planSegments(script, vo);
console.table(
  segments.map((s) => ({
    id: s.id,
    src: `${s.sourceStart.toFixed(1)}-${(s.sourceStart + s.sourceUsedDuration).toFixed(1)}`,
    speed: s.speedFactor.toFixed(2),
    pad: s.padDuration.toFixed(2),
    target: s.targetDuration.toFixed(2),
  })),
);

const body = await assembleVideo({
  recording: `${dir}/recording.mp4`,
  segments,
  workDir: `${dir}/work`,
  out: `${dir}/body.mp4`,
  captionsFile,
});

// Optional: wrap with a per-video real-face intro and a reusable faceless outro (each keeps its own audio).
const intro = (await Bun.file(`${dir}/intro.mp4`).exists()) ? `${dir}/intro.mp4` : undefined;
const outro = (await Bun.file(`${dir}/outro.mp4`).exists())
  ? `${dir}/outro.mp4`
  : (await Bun.file(`assets/outro.mp4`).exists())
    ? `assets/outro.mp4`
    : undefined;
if (intro) console.log(`+ intro: ${intro}`);
if (outro) console.log(`+ outro: ${outro}`);

const out = await wrapVideo({ body, intro, outro, workDir: `${dir}/work`, out: `${dir}/final.mp4` });
console.log(`done → ${out}`);
