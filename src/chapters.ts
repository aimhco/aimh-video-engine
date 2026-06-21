import type { ScriptChunk, VoChunk } from "./types";

// Card timing lives here (not cards.ts) so light consumers (qa.ts) can import it
// without pulling in the resvg native module.
export const CARD_DURATION_SEC = 3.5;

export interface Chapter { index: number; title: string; startChunkIndex: number }

// Pure: chapters are chunks carrying a non-empty `chapter` field, in order (1-based index).
export function deriveChapters(script: ScriptChunk[]): Chapter[] {
  const chapters: Chapter[] = [];
  script.forEach((c, i) => {
    const title = c.chapter?.trim();
    if (title) chapters.push({ index: chapters.length + 1, title, startChunkIndex: i });
  });
  return chapters;
}

// Pure: a chapter's start offset on the body timeline = Σ VO durations of chunks before it.
// `vo` must be in the same order as `script`.
export function chapterOffsetSec(startChunkIndex: number, vo: VoChunk[]): number {
  return vo.slice(0, startChunkIndex).reduce((n, v) => n + v.duration, 0);
}
