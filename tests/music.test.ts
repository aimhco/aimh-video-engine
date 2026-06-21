import { expect, test } from "bun:test";
import { pickTrack } from "../src/music";

const tracks = ["a.mp3", "b.mp3", "c.mp3"];

test("pickTrack is deterministic for a slug", () => {
  expect(pickTrack("sample", tracks)).toBe(pickTrack("sample", tracks));
});

test("pickTrack varies by slug (not all the same)", () => {
  const picks = new Set(["sample", "demo", "intro-x", "video42"].map((s) => pickTrack(s, tracks)));
  expect(picks.size).toBeGreaterThan(1);
});

test("pickTrack returns a member of the list, undefined when empty", () => {
  expect(tracks).toContain(pickTrack("sample", tracks)!);
  expect(pickTrack("sample", [])).toBeUndefined();
});
