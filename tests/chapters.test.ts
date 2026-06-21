import { expect, test } from "bun:test";
import { deriveChapters, chapterOffsetSec } from "../src/chapters";
import type { ScriptChunk, VoChunk } from "../src/types";

const chunk = (id: string, chapter?: string): ScriptChunk =>
  ({ id, text: "x", sourceStart: 0, sourceEnd: 1, chapter });
const vo = (id: string, duration: number): VoChunk => ({ id, file: `vo/${id}.mp3`, duration });

test("deriveChapters: chunks with a chapter field become chapters, 1-based", () => {
  const chapters = deriveChapters([chunk("c1", "Intro"), chunk("c2"), chunk("c3", "How It Works")]);
  expect(chapters).toEqual([
    { index: 1, title: "Intro", startChunkIndex: 0 },
    { index: 2, title: "How It Works", startChunkIndex: 2 },
  ]);
});

test("deriveChapters: none → empty", () => {
  expect(deriveChapters([chunk("c1"), chunk("c2")])).toEqual([]);
});

test("chapterOffsetSec: sum of VO durations before the start chunk", () => {
  const v = [vo("c1", 4), vo("c2", 6), vo("c3", 5)];
  expect(chapterOffsetSec(0, v)).toBeCloseTo(0);
  expect(chapterOffsetSec(2, v)).toBeCloseTo(10);
});
