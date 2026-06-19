import type { ScriptChunk, VoChunk, ZoomPlan, ZoomPlanEntry } from "./types";
import { clamp, speedFactor } from "./timing";

const round1 = (n: number) => Math.round(n * 10) / 10;

const clampFocus = (v: number, id: string, axis: string, warnings: string[]): number => {
  const c = clamp(v, 0, 100);
  if (c !== v) warnings.push(`${id}: focus ${axis} ${v} clamped to ${c}`);
  return c;
};

// Pure: turn script chunks that carry a `zoom` cue into Tella add_zoom geometry
// (original-recording milliseconds). No I/O, no Tella coupling.
export function planZooms(script: ScriptChunk[], vo?: VoChunk[]): ZoomPlan {
  const warnings: string[] = [];
  const zooms: ZoomPlanEntry[] = [];

  for (const c of script) {
    if (!c.zoom) continue;

    const span = c.sourceEnd - c.sourceStart;
    if (span <= 0) {
      warnings.push(`${c.id}: skipped — sourceEnd <= sourceStart`);
      continue;
    }

    let scale = c.zoom.scale ?? 1.25;
    if (scale < 1) {
      warnings.push(`${c.id}: scale ${scale} clamped to 1`);
      scale = 1;
    } else if (scale > 4) {
      warnings.push(`${c.id}: scale ${scale} clamped to 4 (Tella max)`);
      scale = 4;
    } else if (scale > 1.5) {
      warnings.push(`${c.id}: scale ${scale} may feel heavy (>1.5)`);
    }

    const [rawX, rawY] = c.zoom.focusPct ?? [50, 50];
    const focusPoint = {
      xPct: clampFocus(rawX, c.id, "x", warnings),
      yPct: clampFocus(rawY, c.id, "y", warnings),
    };

    const entry: ZoomPlanEntry = {
      chunkId: c.id,
      type: "manualZoom",
      startTimeMs: Math.round(c.sourceStart * 1000),
      durationMs: Math.round(span * 1000),
      scale,
      focusPoint,
    };

    const v = vo?.find((x) => x.id === c.id);
    if (v && v.duration > 0) {
      const sf = speedFactor(span, v.duration);
      entry.estFinalSec = round1(Math.min(span / sf, v.duration));
    }

    zooms.push(entry);
  }

  return { zooms, warnings };
}
