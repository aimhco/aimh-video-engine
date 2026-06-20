import type { ScriptChunk, VoChunk, CaptionCue } from "./types";

const MAX_LINE = 42;
const MAX_LINES = 2;
const MAX_CUE = MAX_LINE * MAX_LINES; // 84

// Greedily pack words into cue-sized strings (<= MAX_CUE chars). A single word
// longer than MAX_CUE becomes its own cue (overflow, e.g. a long URL).
export function splitIntoCues(text: string): string[] {
  const words = text.split(/\s+/).filter(Boolean);
  const cues: string[] = [];
  let cur = "";
  for (const w of words) {
    const candidate = cur ? `${cur} ${w}` : w;
    if (candidate.length > MAX_CUE && cur) {
      cues.push(cur);
      cur = w;
    } else {
      cur = candidate;
    }
  }
  if (cur) cues.push(cur);
  return cues;
}

// Wrap a cue's words into lines of <= MAX_LINE chars, joined with "\n".
export function wrapLines(cueText: string): string {
  const words = cueText.split(/\s+/).filter(Boolean);
  const lines: string[] = [];
  let cur = "";
  for (const w of words) {
    const candidate = cur ? `${cur} ${w}` : w;
    if (candidate.length > MAX_LINE && cur) {
      lines.push(cur);
      cur = w;
    } else {
      cur = candidate;
    }
  }
  if (cur) lines.push(cur);
  return lines.join("\n");
}

// Pure: turn script chunks + VO durations into caption cues on the body timeline.
// Each chunk starts at the cumulative sum of prior VO durations and lasts its own
// VO duration; within a chunk the duration is split across cues proportionally by
// character count, with the last cue pinned exactly to the chunk end.
export function planCaptions(script: ScriptChunk[], vo: VoChunk[]): CaptionCue[] {
  const cues: CaptionCue[] = [];
  let offset = 0;
  for (const c of script) {
    const v = vo.find((x) => x.id === c.id);
    if (!v) throw new Error(`planCaptions: no voiceover for chunk ${c.id}`);
    const duration = v.duration;
    const parts = splitIntoCues(c.text);
    const totalChars = parts.reduce((n, p) => n + p.length, 0);
    let t = offset;
    parts.forEach((p, i) => {
      const isLast = i === parts.length - 1;
      const dur = totalChars > 0 ? duration * (p.length / totalChars) : duration / parts.length;
      const startSec = t;
      const endSec = isLast ? offset + duration : t + dur;
      cues.push({ startSec, endSec, text: wrapLines(p) });
      t = endSec;
    });
    offset += duration;
  }
  return cues;
}

// SRT timestamp: HH:MM:SS,mmm
function srtTime(sec: number): string {
  const ms = Math.round(sec * 1000);
  const pad = (n: number, w = 2) => String(n).padStart(w, "0");
  const h = Math.floor(ms / 3_600_000);
  const m = Math.floor((ms % 3_600_000) / 60_000);
  const s = Math.floor((ms % 60_000) / 1000);
  return `${pad(h)}:${pad(m)}:${pad(s)},${pad(ms % 1000, 3)}`;
}

export function toSrt(cues: CaptionCue[]): string {
  return cues
    .map((c, i) => `${i + 1}\n${srtTime(c.startSec)} --> ${srtTime(c.endSec)}\n${c.text}\n`)
    .join("\n");
}
