// scripts/plan-overlays.ts — read videos/<slug>/overlays.json, write a Tella mask plan.
import { planOverlaysForDir } from "../src/overlays";

const slug = process.argv[2];
if (!slug) throw new Error("usage: bun run plan-overlays <slug>");
const dir = `videos/${slug}`;

const plan = await planOverlaysForDir(dir);
for (const w of plan.warnings) console.warn(`⚠ ${w}`);

if (!plan.overlays.length) {
  console.log(`no valid overlay specs in ${dir}/overlays.json`);
} else {
  console.table(
    plan.overlays.map((o) => ({
      id: o.id,
      kind: o.kind,
      start: `${(o.startTimeMs / 1000).toFixed(2)}s`,
      dur: `${(o.durationMs / 1000).toFixed(2)}s`,
      point: `${o.point.xPct},${o.point.yPct}`,
      size: `${o.dimensions.widthPct}x${o.dimensions.heightPct}`,
      note: o.note ?? "",
    })),
  );
}

await Bun.write(`${dir}/overlay-plan.json`, JSON.stringify(plan, null, 2));
console.log(`wrote ${dir}/overlay-plan.json`);
