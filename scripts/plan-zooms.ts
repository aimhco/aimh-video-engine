// scripts/plan-zooms.ts — read videos/<slug>/script.json, write a Tella zoom plan.
import { planZoomsForDir } from "../src/zoom";

const slug = process.argv[2];
if (!slug) throw new Error("usage: bun run plan-zooms <slug>");
const dir = `videos/${slug}`;

const plan = await planZoomsForDir(dir);
for (const w of plan.warnings) console.warn(`⚠ ${w}`);

if (!plan.zooms.length) {
  console.log(`no zoom cues in ${dir}/script.json — add a "zoom" field to a chunk to enable one`);
} else {
  console.table(
    plan.zooms.map((z) => ({
      chunk: z.chunkId,
      start: `${(z.startTimeMs / 1000).toFixed(2)}s`,
      dur: `${(z.durationMs / 1000).toFixed(2)}s`,
      scale: z.scale,
      focus: `${z.focusPoint.xPct},${z.focusPoint.yPct}`,
      estFinal: z.estFinalSec != null ? `${z.estFinalSec}s` : "—",
    })),
  );
}

await Bun.write(`${dir}/zoom-plan.json`, JSON.stringify({ zooms: plan.zooms }, null, 2));
console.log(`wrote ${dir}/zoom-plan.json`);
