import type { ScriptChunk, VoChunk, Segment } from "./types";

const MIN_SPEED = 0.5;
const MAX_SPEED = 2.0;

const clamp = (n: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, n));

export function planSegments(script: ScriptChunk[], vo: VoChunk[]): Segment[] {
  return script.map((c) => {
    const v = vo.find((x) => x.id === c.id);
    if (!v) throw new Error(`planSegments: no voiceover for chunk ${c.id}`);
    const sourceDuration = c.sourceEnd - c.sourceStart;
    if (sourceDuration <= 0) throw new Error(`planSegments: bad source range for ${c.id}`);

    const target = v.duration;
    if (target <= 0) throw new Error(`planSegments: voiceover for chunk ${c.id} has non-positive duration`);
    const speedFactor = clamp(sourceDuration / target, MIN_SPEED, MAX_SPEED);
    const afterSpeed = sourceDuration / speedFactor;

    let sourceUsedDuration = sourceDuration;
    let padDuration = 0;
    if (afterSpeed > target) {
      sourceUsedDuration = target * speedFactor; // trim idle tail
    } else if (afterSpeed < target) {
      padDuration = target - afterSpeed;          // freeze-pad
    }

    return {
      id: c.id,
      sourceStart: c.sourceStart,
      sourceUsedDuration,
      speedFactor,
      padDuration,
      targetDuration: target,
      voFile: v.file,
    };
  });
}
