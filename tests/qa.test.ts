import { expect, test } from "bun:test";
import { parseSrtCueCount, parseMeanVolumeDb, evaluateQa, runQa } from "../src/qa";
import type { QaInputs } from "../src/qa";
import { FFMPEG } from "../src/ffmpeg";

const goodInputs = (): QaInputs => ({
  finalDurationSec: 110.5,
  expectedDurationSec: 110.0,
  width: 1920,
  height: 1080,
  hasAudio: true,
  meanVolumeDb: -18.2,
  captionsPresent: true,
  srtCueCount: 12,
  expectedCueCount: 12,
});

const check = (r: { checks: { name: string; pass: boolean; detail: string }[] }, name: string) =>
  r.checks.find((c) => c.name === name)!;

test("parseSrtCueCount counts cues", () => {
  const srt = "1\n00:00:00,000 --> 00:00:04,000\nHello\n\n2\n00:00:04,000 --> 00:00:10,000\nWorld\n";
  expect(parseSrtCueCount(srt)).toBe(2);
  expect(parseSrtCueCount("")).toBe(0);
});

test("parseMeanVolumeDb extracts dB or null", () => {
  expect(parseMeanVolumeDb("[Parsed_volumedetect_0] mean_volume: -18.2 dB")).toBeCloseTo(-18.2);
  expect(parseMeanVolumeDb("no volume info here")).toBeNull();
});

test("evaluateQa: all-good inputs pass", () => {
  const r = evaluateQa(goodInputs());
  expect(r.ok).toBe(true);
  expect(r.checks.every((c) => c.pass)).toBe(true);
});

test("evaluateQa: duration outside tolerance fails", () => {
  const r = evaluateQa({ ...goodInputs(), finalDurationSec: 95 }); // Δ15s > 1.5
  expect(check(r, "duration").pass).toBe(false);
  expect(r.ok).toBe(false);
});

test("evaluateQa: wrong resolution fails", () => {
  const r = evaluateQa({ ...goodInputs(), width: 1280, height: 720 });
  expect(check(r, "resolution").pass).toBe(false);
  expect(r.ok).toBe(false);
});

test("evaluateQa: missing audio fails", () => {
  const r = evaluateQa({ ...goodInputs(), hasAudio: false });
  expect(check(r, "audio").pass).toBe(false);
});

test("evaluateQa: silent audio fails", () => {
  const r = evaluateQa({ ...goodInputs(), meanVolumeDb: -60 });
  expect(check(r, "audio").pass).toBe(false);
});

test("evaluateQa: unmeasurable volume fails (not silently passed)", () => {
  const r = evaluateQa({ ...goodInputs(), meanVolumeDb: null });
  expect(check(r, "audio").pass).toBe(false);
});

test("evaluateQa: caption count mismatch fails", () => {
  const r = evaluateQa({ ...goodInputs(), srtCueCount: 10, expectedCueCount: 12 });
  expect(check(r, "captions").pass).toBe(false);
});

test("evaluateQa: captions absent is skipped (passes)", () => {
  const r = evaluateQa({ ...goodInputs(), captionsPresent: false, srtCueCount: 0 });
  expect(check(r, "captions").pass).toBe(true);
  expect(check(r, "captions").detail.toLowerCase()).toContain("skip");
  expect(r.ok).toBe(true);
});

test("runQa passes on a well-formed fixture", async () => {
  const dir = `${import.meta.dir}/fixtures/qa`;
  await Bun.$`mkdir -p ${dir}/vo`;
  // script with one chunk; a matching 2s VO; a 1080p final with audio; matching captions.
  await Bun.write(`${dir}/script.json`, JSON.stringify([{ id: "c1", text: "hello world", sourceStart: 0, sourceEnd: 2 }]));
  await Bun.$`${FFMPEG} -y -f lavfi -i sine=frequency=440:duration=2 ${dir}/vo/c1.mp3`.quiet();
  await Bun.$`${FFMPEG} -y -f lavfi -i color=c=blue:s=1920x1080:d=2 -f lavfi -i sine=frequency=440:duration=2 -pix_fmt yuv420p -c:v libx264 -c:a aac -shortest ${dir}/final.mp4`.quiet();
  // one caption cue (planCaptions yields 1 for this short chunk)
  await Bun.write(`${dir}/captions.srt`, "1\n00:00:00,000 --> 00:00:02,000\nhello world\n");

  const report = await runQa(dir);
  expect(report.ok).toBe(true);
});
