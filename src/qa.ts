import { ffprobeDuration, ffprobeVideoSize, ffprobeHasAudio } from "./ffprobe";
import { FFMPEG } from "./ffmpeg";
import { planCaptions } from "./captions";
import { scanSecretsInVideo } from "./secrets";
import type { ScriptChunk, VoChunk } from "./types";

export interface QaCheck { name: string; pass: boolean; detail: string }
export interface QaReport { checks: QaCheck[]; warnings: string[]; ok: boolean }
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

// Pure: build the QA checks (and `ok`) from already-probed values. Warnings
// (e.g. secret-scan findings) are added by runQa and never affect `ok`.
export function evaluateQa(i: QaInputs): { checks: QaCheck[]; ok: boolean } {
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

// Format seconds as M:SS.
function fmtTime(sec: number): string {
  const m = Math.floor(sec / 60);
  const s = Math.floor(sec % 60);
  return `${m}:${String(s).padStart(2, "0")}`;
}

// I/O: probe videos/<slug>/final.mp4 and surrounding files, evaluate the gating
// checks, then (unless disabled) run a warn-only secret scan.
export async function runQa(dir: string, opts?: { scanSecrets?: boolean }): Promise<QaReport> {
  const final = `${dir}/final.mp4`;
  if (!(await Bun.file(final).exists())) throw new Error(`runQa: ${final} not found — run make-video first`);

  const script = (await Bun.file(`${dir}/script.json`).json()) as ScriptChunk[];

  const vo: VoChunk[] = [];
  for (const c of script) {
    const f = `${dir}/vo/${c.id}.mp3`;
    vo.push({ id: c.id, file: f, duration: await ffprobeDuration(f) });
  }
  let expectedDurationSec = vo.reduce((n, v) => n + v.duration, 0);

  const intro = `${dir}/intro.mp4`;
  if (await Bun.file(intro).exists()) expectedDurationSec += await ffprobeDuration(intro);
  const outroLocal = `${dir}/outro.mp4`;
  const outroAsset = "assets/outro.mp4";
  if (await Bun.file(outroLocal).exists()) expectedDurationSec += await ffprobeDuration(outroLocal);
  else if (await Bun.file(outroAsset).exists()) expectedDurationSec += await ffprobeDuration(outroAsset);

  const finalDurationSec = await ffprobeDuration(final);
  const { width, height } = await ffprobeVideoSize(final);
  const hasAudio = await ffprobeHasAudio(final);

  const vd = await Bun.$`${FFMPEG} -i ${final} -af volumedetect -f null -`.quiet().nothrow();
  const meanVolumeDb = parseMeanVolumeDb(vd.stderr.toString());

  const srtPath = `${dir}/captions.srt`;
  const captionsPresent = await Bun.file(srtPath).exists();
  const srtCueCount = captionsPresent ? parseSrtCueCount(await Bun.file(srtPath).text()) : 0;
  const expectedCueCount = planCaptions(script, vo).length;

  const base = evaluateQa({
    finalDurationSec, expectedDurationSec, width, height, hasAudio,
    meanVolumeDb, captionsPresent, srtCueCount, expectedCueCount,
  });

  // Warn-only secret scan (advisory; never affects `ok`/exit).
  let warnings: string[] = [];
  if (opts?.scanSecrets !== false) {
    try {
      const findings = await scanSecretsInVideo(final, `${dir}/work`);
      warnings = findings.map(
        (f) => `possible secret at ${fmtTime(f.timeSec)} — ${f.pattern}: "${f.snippet}"`,
      );
    } catch (err) {
      warnings = [`secret scan could not run: ${(err as Error).message}`];
    }
  }

  return { checks: base.checks, ok: base.ok, warnings };
}
