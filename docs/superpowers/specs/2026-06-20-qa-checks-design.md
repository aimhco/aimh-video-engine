# Design — Stage 6 QA: deterministic checks (`bun run qa <slug>`)

**Date:** 2026-06-20
**Status:** Approved, ready for implementation plan
**Roadmap slot:** Stage 6 (QA). First slice: deterministic, automatable checks on `final.mp4`. The README's secret-leak frame scan (a Claude-judgment step) and auto-fix loops are deferred to later slices.

## Problem

Nothing validates `final.mp4` before it's considered done/published. A broken render (wrong duration from a mux bug, silent audio, wrong resolution, missing captions) would ship unnoticed. We want a fast, automatable gate that catches these deterministically.

## Goals

- A `bun run qa <slug>` command that checks `videos/<slug>/final.mp4` and **exits nonzero if any check fails** (CI/automation-friendly).
- Pure, unit-tested check logic; thin I/O for probing.
- Clear per-check pass/fail output.

## Non-goals (this slice)

- Secret-leak frame scan (render frames + Claude inspects for visible keys/`.env`/tokens) — a model-judgment step, better as a skill procedure; deferred.
- Auto-fix loops (e.g. loop back to blur) — blur isn't built; deferred.
- `--dry-run`, running QA automatically at the end of `make-video` (QA stays its own command), perceptual/pixel checks.

## Checks (on `videos/<slug>/final.mp4`)

| Check | Pass condition | Why |
|-------|----------------|-----|
| **duration** | `\|final − expected\| ≤ 1.5s`, where `expected = Σ vo durations + intro + outro` | catches mux/timing breakage |
| **resolution** | video stream is exactly **1920×1080** | catches normalization/scaling bugs |
| **audio** | an audio stream exists **and** `volumedetect` mean volume `> −50 dB` | catches missing/silent audio |
| **captions** | if `captions.srt` exists, its cue count `==` `planCaptions(script, vo).length`; if absent, **skipped (pass)** | catches caption/script drift; `--no-captions` is valid |

Thresholds as named constants: `DURATION_TOLERANCE_SEC = 1.5`, `SILENCE_FLOOR_DB = -50`, `TARGET_WIDTH = 1920`, `TARGET_HEIGHT = 1080`.

## Architecture

Pure core + thin I/O, matching the rest of the engine.

### `src/qa.ts`

Types:
```ts
export interface QaCheck { name: string; pass: boolean; detail: string }
export interface QaReport { checks: QaCheck[]; ok: boolean }
export interface QaInputs {
  finalDurationSec: number;
  expectedDurationSec: number;
  width: number;
  height: number;
  hasAudio: boolean;
  meanVolumeDb: number | null;   // null if not measurable
  captionsPresent: boolean;
  srtCueCount: number;           // 0 when absent
  expectedCueCount: number;
}
```

Pure functions (unit-tested):
- `parseSrtCueCount(srt: string): number` — counts cues via `-->` occurrences.
- `parseMeanVolumeDb(ffmpegStderr: string): number | null` — extracts `mean_volume: -X dB` from `volumedetect` output; `null` if not found.
- `evaluateQa(inputs: QaInputs): QaReport` — builds the four `QaCheck`s from already-probed values; `ok = checks.every(c => c.pass)`. The captions check is `pass: true` with a "skipped (no captions.srt)" detail when `captionsPresent` is false.

I/O orchestrator:
- `runQa(dir: string): Promise<QaReport>` — gathers inputs, then calls `evaluateQa`:
  - read `${dir}/script.json`; build `VoChunk[]` by `ffprobeDuration`-ing each `${dir}/vo/<id>.mp3`; `Σ` for the body duration.
  - intro = `${dir}/intro.mp4` (if exists); outro = `${dir}/outro.mp4` else `assets/outro.mp4` (if exists); add their durations to `expectedDurationSec`.
  - `final = ${dir}/final.mp4`: `ffprobeDuration`, `ffprobeVideoSize`, `ffprobeHasAudio`.
  - mean volume: run `FFMPEG -i final -af volumedetect -f null -`, capture **stderr**, `parseMeanVolumeDb`.
  - captions: if `${dir}/captions.srt` exists, read + `parseSrtCueCount`; `expectedCueCount = planCaptions(script, vo).length` (imported from `src/captions.ts`).

### `src/ffprobe.ts` — two small helpers

- `ffprobeVideoSize(path): Promise<{ width: number; height: number }>` — `ffprobe -select_streams v:0 -show_entries stream=width,height -of csv=p=0`.
- `ffprobeHasAudio(path): Promise<boolean>` — `ffprobe -select_streams a -show_entries stream=codec_type -of csv=p=0`, true when non-empty.

Both via `FFPROBE` (configurable binary).

### `scripts/qa.ts` — CLI

`bun run qa <slug>`:
```ts
const report = await runQa(`videos/${slug}`);
console.table(report.checks.map((c) => ({ check: c.name, status: c.pass ? "✓" : "✗", detail: c.detail })));
console.log(report.ok ? "QA passed" : "QA FAILED");
process.exit(report.ok ? 0 : 1);
```
Add a `qa` script alias to `package.json`.

## Data flow

```
videos/<slug>/{final.mp4, script.json, vo/*.mp3, captions.srt, intro.mp4?, outro.mp4?}
   │  runQa: ffprobe (duration/size/audio) · ffmpeg volumedetect · read srt · sum vo+intro+outro · planCaptions
   ▼
QaInputs ──evaluateQa (pure)──▶ QaReport {checks[], ok}
   │  scripts/qa.ts: print table; exit(ok ? 0 : 1)
   ▼
pass/fail + exit code
```

## Error handling & edge cases

- **Missing `final.mp4`:** `runQa` throws a clear error ("run make-video first") — nothing to check.
- **`volumedetect` unparsable:** `meanVolumeDb = null` → audio check fails with a "could not measure volume" detail (don't silently pass).
- **No captions:** captions check skipped (pass) with a clear detail; not a failure.
- **No intro/outro:** those durations contribute 0 to `expected` (consistent with the wrap being a no-op).
- **Exit code:** nonzero on any failure so callers/CI can gate on it.

## Testing

- **`tests/qa.test.ts` (pure, primary):**
  - `parseSrtCueCount`: a 2-cue SRT → 2; empty string → 0.
  - `parseMeanVolumeDb`: sample `volumedetect` stderr (`mean_volume: -18.2 dB`) → `-18.2`; no-match → `null`.
  - `evaluateQa`: all-good inputs → `ok: true`, every check passes; then each failure mode individually → that check fails and `ok: false`: duration Δ > 1.5s; resolution ≠ 1920×1080; `hasAudio: false`; `meanVolumeDb: -60`; `meanVolumeDb: null`; captions present with `srtCueCount ≠ expectedCueCount`; captions absent → captions check passes (skipped).
- **Manual:** `bun run qa sample` should print all-✓ and exit 0 on the current sample.

## Future (out of scope)

- Secret-leak frame scan (skill procedure: render frames → Claude inspects → flag).
- Auto-fix loops (blur secrets, re-render); `--dry-run`; running QA inline at the end of `make-video`.
