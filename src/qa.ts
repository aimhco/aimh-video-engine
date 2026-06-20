export interface QaCheck { name: string; pass: boolean; detail: string }
export interface QaReport { checks: QaCheck[]; ok: boolean }
export interface QaInputs {
  finalDurationSec: number;
  expectedDurationSec: number;
  width: number;
  height: number;
  hasAudio: boolean;
  meanVolumeDb: number | null;
  captionsPresent: boolean;
  srtCueCount: number;
  expectedCueCount: number;
}

const DURATION_TOLERANCE_SEC = 1.5;
const SILENCE_FLOOR_DB = -50;
const TARGET_WIDTH = 1920;
const TARGET_HEIGHT = 1080;

// Count SRT cues by their `-->` time lines.
export function parseSrtCueCount(srt: string): number {
  return (srt.match(/-->/g) ?? []).length;
}

// Extract `mean_volume: -X dB` from ffmpeg volumedetect stderr; null if absent.
export function parseMeanVolumeDb(ffmpegStderr: string): number | null {
  const m = ffmpegStderr.match(/mean_volume:\s*(-?\d+(?:\.\d+)?) dB/);
  return m ? parseFloat(m[1]!) : null;
}

// Pure: build the QA report from already-probed values.
export function evaluateQa(i: QaInputs): QaReport {
  const checks: QaCheck[] = [];

  const dDelta = Math.abs(i.finalDurationSec - i.expectedDurationSec);
  checks.push({
    name: "duration",
    pass: dDelta <= DURATION_TOLERANCE_SEC,
    detail: `final ${i.finalDurationSec.toFixed(2)}s vs expected ${i.expectedDurationSec.toFixed(2)}s (Δ${dDelta.toFixed(2)}s, tol ${DURATION_TOLERANCE_SEC}s)`,
  });

  checks.push({
    name: "resolution",
    pass: i.width === TARGET_WIDTH && i.height === TARGET_HEIGHT,
    detail: `${i.width}x${i.height} (want ${TARGET_WIDTH}x${TARGET_HEIGHT})`,
  });

  const audioPass = i.hasAudio && i.meanVolumeDb !== null && i.meanVolumeDb > SILENCE_FLOOR_DB;
  const audioDetail = !i.hasAudio
    ? "no audio stream"
    : i.meanVolumeDb === null
      ? "could not measure mean volume"
      : `mean ${i.meanVolumeDb.toFixed(1)} dB (floor ${SILENCE_FLOOR_DB} dB)`;
  checks.push({ name: "audio", pass: audioPass, detail: audioDetail });

  if (!i.captionsPresent) {
    checks.push({ name: "captions", pass: true, detail: "skipped (no captions.srt)" });
  } else {
    checks.push({
      name: "captions",
      pass: i.srtCueCount === i.expectedCueCount,
      detail: `${i.srtCueCount} cues (expected ${i.expectedCueCount})`,
    });
  }

  return { checks, ok: checks.every((c) => c.pass) };
}
