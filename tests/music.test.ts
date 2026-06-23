import { expect, test } from "bun:test";
import { pickTrack, resolveMusicSelection } from "../src/music";

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

test("resolveMusicSelection deterministically fills both body and outro tracks", () => {
  const selection = resolveMusicSelection("sample", {}, ["body-a.mp3", "body-b.mp3"], ["outro-a.mp3", "outro-b.mp3"]);

  expect(selection.bodyTrack).toBe(pickTrack("sample", ["body-a.mp3", "body-b.mp3"]));
  expect(selection.outroTrack).toBe(pickTrack("sample", ["outro-a.mp3", "outro-b.mp3"]));
  expect(selection.changed).toBe(true);
  expect(selection.persisted).toEqual({
    bodyTrack: selection.bodyTrack ?? null,
    outroTrack: selection.outroTrack ?? null,
  });
});

test("resolveMusicSelection preserves persisted picks and only backfills missing fields", () => {
  const selection = resolveMusicSelection(
    "sample",
    { bodyTrack: "body-picked.mp3" },
    ["body-a.mp3", "body-b.mp3"],
    ["outro-a.mp3", "outro-b.mp3"],
  );

  expect(selection.bodyTrack).toBe("body-picked.mp3");
  expect(selection.outroTrack).toBe(pickTrack("sample", ["outro-a.mp3", "outro-b.mp3"]));
  expect(selection.changed).toBe(true);
  expect(selection.persisted).toEqual({
    bodyTrack: "body-picked.mp3",
    outroTrack: selection.outroTrack ?? null,
  });
});
