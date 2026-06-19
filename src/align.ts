import type { ScriptChunk, VoChunk, Segment } from "./types";
import { speedFactor } from "./timing";

export function planSegments(script: ScriptChunk[], vo: VoChunk[]): Segment[] {
  return script.map((c) => {
    const v = vo.find((x) => x.id === c.id);
    if (!v) throw new Error(`planSegments: no voiceover for chunk ${c.id}`);
    const sourceDuration = c.sourceEnd - c.sourceStart;
    if (sourceDuration <= 0) throw new Error(`planSegments: bad source range for ${c.id}`);

    const target = v.duration;
    if (target <= 0) throw new Error(`planSegments: voiceover for chunk ${c.id} has non-positive duration`);
    const sf = speedFactor(sourceDuration, target);
    const afterSpeed = sourceDuration / sf;

    let sourceUsedDuration = sourceDuration;
    let padDuration = 0;
    if (afterSpeed > target) {
      sourceUsedDuration = target * sf; // trim idle tail
    } else if (afterSpeed < target) {
      padDuration = target - afterSpeed;          // freeze-pad
    }

    return {
      id: c.id,
      sourceStart: c.sourceStart,
      sourceUsedDuration,
      speedFactor: sf,
      padDuration,
      targetDuration: target,
      voFile: v.file,
    };
  });
}
