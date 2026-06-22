import type { OverlayPlan, OverlayPlanEntry, OverlaySpec, ScriptChunk } from "./types";
import { clamp } from "./timing";

function clampRectValue(v: number, id: string, field: string, warnings: string[]): number {
  const c = clamp(v, 0, 100);
  if (c !== v) warnings.push(`${id}: ${field} ${v} clamped to ${c}`);
  return c;
}

function timingForSpec(spec: OverlaySpec, script: ScriptChunk[], warnings: string[]): { start: number; end: number } | undefined {
  if (spec.chunkId) {
    const chunk = script.find((c) => c.id === spec.chunkId);
    if (!chunk) {
      warnings.push(`${spec.id}: skipped — chunkId ${spec.chunkId} not found`);
      return undefined;
    }
    return { start: chunk.sourceStart, end: chunk.sourceEnd };
  }

  if (spec.startTimeSec == null || spec.endTimeSec == null) {
    warnings.push(`${spec.id}: skipped — provide chunkId or startTimeSec/endTimeSec`);
    return undefined;
  }

  return { start: spec.startTimeSec, end: spec.endTimeSec };
}

// Pure: turn reviewable overlay specs into Tella mask geometry on the original
// recording timeline. This keeps visual feedback such as "highlight what I
// selected" explicit and re-runnable instead of stranded in the Tella UI.
export function planOverlays(specs: OverlaySpec[], script: ScriptChunk[]): OverlayPlan {
  const warnings: string[] = [];
  const overlays: OverlayPlanEntry[] = [];

  for (const spec of specs) {
    const timing = timingForSpec(spec, script, warnings);
    if (!timing) continue;

    const span = timing.end - timing.start;
    if (span <= 0) {
      warnings.push(`${spec.id}: skipped — end must be after start`);
      continue;
    }

    const [x, y] = spec.pointPct;
    const [width, height] = spec.sizePct;
    overlays.push({
      id: spec.id,
      kind: spec.kind,
      startTimeMs: Math.round(timing.start * 1000),
      durationMs: Math.round(span * 1000),
      point: {
        xPct: clampRectValue(x, spec.id, "point x", warnings),
        yPct: clampRectValue(y, spec.id, "point y", warnings),
      },
      dimensions: {
        widthPct: clampRectValue(width, spec.id, "width", warnings),
        heightPct: clampRectValue(height, spec.id, "height", warnings),
      },
      note: spec.note,
    });
  }

  return { overlays, warnings };
}

export async function planOverlaysForDir(dir: string): Promise<OverlayPlan> {
  const script = (await Bun.file(`${dir}/script.json`).json()) as ScriptChunk[];
  const specs = (await Bun.file(`${dir}/overlays.json`).json()) as OverlaySpec[];
  return planOverlays(specs, script);
}
