import { expect, test } from "bun:test";
import { splitIntoCues, wrapLines, planCaptions, toSrt } from "../src/captions";
import type { ScriptChunk, VoChunk } from "../src/types";

const chunk = (id: string, text: string): ScriptChunk =>
  ({ id, text, sourceStart: 0, sourceEnd: 1 });
const vo = (id: string, duration: number): VoChunk =>
  ({ id, file: `vo/${id}.mp3`, duration });

const W = "1234567890"; // 10-char word

test("short text → one cue spanning the chunk's VO duration", () => {
  const cues = planCaptions([chunk("c1", "Hello world")], [vo("c1", 4)]);
  expect(cues).toHaveLength(1);
  expect(cues[0]!).toEqual({ startSec: 0, endSec: 4, text: "Hello world" });
});

test("cumulative offsets: chunk 2 starts at chunk 1's VO duration", () => {
  const cues = planCaptions(
    [chunk("c1", "Hello world"), chunk("c2", "Foo bar")],
    [vo("c1", 4), vo("c2", 6)],
  );
  expect(cues).toHaveLength(2);
  expect(cues[1]!.startSec).toBeCloseTo(4);
  expect(cues[1]!.endSec).toBeCloseTo(10);
});

test("proportional split across cues; last cue pinned to chunk end", () => {
  // 10 words × 10 chars → splitIntoCues yields a 76-char cue then a 32-char cue.
  const text = Array(10).fill(W).join(" ");
  const cues = planCaptions([chunk("c1", text)], [vo("c1", 108)]);
  expect(cues).toHaveLength(2);
  expect(cues[0]!.startSec).toBeCloseTo(0);
  expect(cues[0]!.endSec).toBeCloseTo(76);   // 108 * 76/108
  expect(cues[1]!.startSec).toBeCloseTo(76);
  expect(cues[1]!.endSec).toBeCloseTo(108);  // pinned to offset + duration
});

test("splitIntoCues packs words to <= 84 chars at word boundaries", () => {
  const parts = splitIntoCues(Array(10).fill(W).join(" "));
  expect(parts).toEqual([
    Array(7).fill(W).join(" "), // 76 chars
    Array(3).fill(W).join(" "), // 32 chars
  ]);
  for (const p of parts) expect(p.length).toBeLessThanOrEqual(84);
});

test("wrapLines breaks a cue into <= 42-char lines joined by newline", () => {
  const wrapped = wrapLines(Array(7).fill(W).join(" ")); // 76 chars
  const lines = wrapped.split("\n");
  for (const l of lines) expect(l.length).toBeLessThanOrEqual(42);
  expect(lines.length).toBeGreaterThan(1);
  expect(wrapped.replace(/\n/g, " ")).toBe(Array(7).fill(W).join(" "));
});

test("a single word longer than 84 chars becomes its own cue", () => {
  const long = "x".repeat(100);
  expect(splitIntoCues(`${long} short`)).toEqual([long, "short"]);
});

test("toSrt formats index, HH:MM:SS,mmm, and blank-line separation", () => {
  const srt = toSrt([
    { startSec: 0, endSec: 4, text: "Hello world" },
    { startSec: 4, endSec: 10, text: "Foo bar" },
  ]);
  expect(srt).toBe(
    "1\n00:00:00,000 --> 00:00:04,000\nHello world\n\n" +
    "2\n00:00:04,000 --> 00:00:10,000\nFoo bar\n",
  );
});

test("toSrt handles hours and sub-second times", () => {
  const srt = toSrt([{ startSec: 3661.5, endSec: 3662, text: "x" }]);
  expect(srt).toContain("01:01:01,500 --> 01:01:02,000");
});

test("planCaptions throws when a chunk has no matching VO", () => {
  expect(() => planCaptions([chunk("c1", "hi")], [])).toThrow("c1");
});
