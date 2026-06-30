import { expect, test } from "bun:test";
import { adjustmentRows, buildAdjustmentsSummary } from "../src/adjustments";
import type { ScriptChunk, VoChunk } from "../src/types";

const script: ScriptChunk[] = [
  { id: "c1", text: "Intro", sourceStart: 0, sourceEnd: 2, chapter: "Setup" },
  { id: "c2", text: "Body", sourceStart: 2, sourceEnd: 5 },
  { id: "c3", text: "Finish", sourceStart: 5, sourceEnd: 8, chapter: "Ship It" },
];

const vo: VoChunk[] = [
  { id: "c1", file: "videos/demo/vo/c1.mp3", duration: 2, cached: false },
  { id: "c2", file: "videos/demo/vo/c2.mp3", duration: 3, cached: true },
  { id: "c3", file: "videos/demo/vo/c3.mp3", duration: 4, cached: false },
];

test("buildAdjustmentsSummary records render choices and flat-input overlay limitations", () => {
  const summary = buildAdjustmentsSummary({
    slug: "demo",
    script,
    vo,
    captionsFile: "videos/demo/captions.srt",
    captionsCueCount: 3,
    tellaProjectPresent: false,
    zoomCount: 2,
    highlightCount: 1,
    blurCount: 1,
    bodyTrack: "/music/Body_A.mp3",
    outroTrack: "/music/Outro_B.mp3",
    logoFile: "assets/logo.png",
    introFile: "videos/demo/intro.mp4",
    outroFile: undefined,
    finalFile: "videos/demo/final.mp4",
    finalDurationSec: 12.3456,
    finalResolution: { width: 1920, height: 1080 },
    generatedAt: "2026-06-30T00:00:00.000Z",
  });

  expect(summary.voiceover).toEqual({
    chunks: 3,
    synthesizedChunks: 2,
    cachedChunks: 1,
    totalDurationSec: 9,
  });
  expect(summary.captions).toEqual({ enabled: true, file: "videos/demo/captions.srt", cueCount: 3 });
  expect(summary.chapters.cards).toEqual([
    { index: 1, title: "Setup", timestampSec: 0, timestamp: "0:00" },
    { index: 2, title: "Ship It", timestampSec: 5, timestamp: "0:05" },
  ]);
  expect(summary.zooms).toEqual({ status: "not_applicable", count: 0, reason: "none — no Tella project" });
  expect(summary.highlights).toEqual({ status: "not_applicable", count: 0, reason: "none — no Tella project" });
  expect(summary.blurs).toEqual({ status: "not_applicable", count: 0, reason: "none — no Tella project" });
  expect(summary.music).toEqual({ bodyTrack: "Body_A.mp3", outroTrack: "Outro_B.mp3" });
  expect(summary.logo).toEqual({ enabled: true, file: "assets/logo.png" });
  expect(summary.intro).toEqual({ present: true, file: "videos/demo/intro.mp4" });
  expect(summary.outro).toEqual({ present: false });
  expect(summary.final).toEqual({
    file: "videos/demo/final.mp4",
    durationSec: 12.35,
    resolution: { width: 1920, height: 1080 },
  });
});

test("adjustmentRows makes a human-readable checkpoint table", () => {
  const summary = buildAdjustmentsSummary({
    slug: "demo",
    script,
    vo,
    captionsFile: undefined,
    captionsCueCount: 0,
    tellaProjectPresent: true,
    zoomCount: 2,
    highlightCount: 0,
    blurCount: 1,
    bodyTrack: undefined,
    outroTrack: undefined,
    logoFile: undefined,
    introFile: undefined,
    outroFile: "videos/demo/outro.mp4",
    finalFile: "videos/demo/final.mp4",
    finalDurationSec: 12,
    finalResolution: { width: 1920, height: 1080 },
    generatedAt: "2026-06-30T00:00:00.000Z",
  });

  expect(adjustmentRows(summary)).toContainEqual({
    item: "zooms",
    status: "applied",
    detail: "2",
  });
  expect(adjustmentRows(summary)).toContainEqual({
    item: "captions",
    status: "off",
    detail: "not requested",
  });
  expect(adjustmentRows(summary)).toContainEqual({
    item: "final",
    status: "ready",
    detail: "12.00s, 1920x1080",
  });
});
