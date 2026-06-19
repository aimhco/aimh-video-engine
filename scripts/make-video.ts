// scripts/make-video.ts — thin Y-slice CLI: script.json + recording.mp4 -> final.mp4
import { synthesizeChunk } from "../src/elevenlabs";
import { planSegments } from "../src/align";
import { assembleVideo } from "../src/finish";
import type { ScriptChunk, VoChunk } from "../src/types";

const slug = process.argv[2];
if (!slug) throw new Error("usage: bun run make-video <slug>");
const dir = `videos/${slug}`;

const script = (await Bun.file(`${dir}/script.json`).json()) as ScriptChunk[];
if (!script.length) throw new Error(`${dir}/script.json is empty`);

await Bun.$`mkdir -p ${dir}/vo`;
const vo: VoChunk[] = [];
for (const chunk of script) {
  console.log(`synthesizing ${chunk.id} (${chunk.text.length} chars)…`);
  vo.push(await synthesizeChunk(chunk, `${dir}/vo`));
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

const out = await assembleVideo({
  recording: `${dir}/recording.mp4`,
  segments,
  workDir: `${dir}/work`,
  out: `${dir}/final.mp4`,
});
console.log(`done → ${out}`);
