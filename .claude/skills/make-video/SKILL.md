---
name: make-video
description: Use when the user wants to turn a Tella screen recording (plus its .srt subtitle export) into a finished, re-voiced video with the aimh-video-engine project. Rewrites the rambling transcript into a clean script, synthesizes it in the user's cloned ElevenLabs voice, and re-times the screen footage to the narration. Triggers on "make a video", "run the video engine", or pointing at a recording in videos/<slug>/.
---

# make-video (aimh-video-engine)

Turn a rough Tella screen recording into a finished, cleanly-narrated video. This is the companion skill for the [aimh-video-engine](https://github.com/aimhco/aimh-video-engine) project — run it from inside that repo.

## What it produces

The screen recording, re-voiced with a clean script in the user's cloned voice, with the footage **re-timed so what's on screen tracks what's being said**. The core engine includes intro/outro wrapping, auto-zoom, highlights/blur planning, captions when requested, music, chapter cards, YouTube publishing, and a retro loop that persists durable lessons in `house-style.md`.

## Operator contract

The user should be able to ask for "make video `<slug>`" and then respond at review checkpoints. The agent owns the lower-level commands (`make-video`, Tella MCP apply/export, `qa`, `publish`, `retro`) and should run, verify, and repeat them as needed. If the user reports a correction in plain language, make the targeted fix, re-render, re-run QA, and ask for review again.

## Prerequisites

- Run from the `aimh-video-engine` repo (Bun + FFmpeg installed). Captions need a **libass-enabled** ffmpeg (`ffmpeg -version | grep libass`); if absent, install `ffmpeg-full` and set `FFMPEG`/`FFPROBE` in `.env` to its binaries.
- `.env` with `ELEVENLABS_API_KEY` + `ELEVENLABS_VOICE_ID` (a cloned voice). Optional `FFMPEG`/`FFPROBE` override the ffmpeg/ffprobe binary paths.
- In `videos/<slug>/`: the recording as `recording.mp4` and the Tella subtitle export as a `.srt` file.
- Read root `house-style.md` before scripting. Its rules are durable guidance from previous videos.

## Steps

1. **Read the inputs.** Read root `house-style.md`. In `videos/<slug>/`, read the `.srt` (cue-level timestamped text — this is your transcript) and `ffprobe` the recording for its duration.

2. **Write a clean, chunked script** to `videos/<slug>/script.json` — an array of `{ id, text, sourceStart, sourceEnd }`:
   - **Ground every chunk in the SRT** — never narrate something that isn't in the recording.
   - **Map `sourceStart`/`sourceEnd`** to the SRT cue times where that content appears; drop dead air between topics by leaving gaps between chunks.
   - **Clean filler and fix transcription errors** (garbled names, URLs, numbers).
   - **Protect tricky TTS terms** — domains, acronyms, and handles get mangled otherwise. The engine rewrites `aimh.co` to `A-I-M-H dot co` only for ElevenLabs, so the visible script can keep the real domain. For other tricky terms, spell them phonetically in the script until a dictionary rule exists; avoid `@` and raw URLs.
   - **Keep chunks small** (one to a few sentences). Don't cram a long paragraph into one chunk — TTS rushes it. Give sign-offs like "Thank you" their own short chunk.
   - Aim for narration whose spoken length is *close* to its footage length. The planner tolerates 0.5×–2×, trimming idle tail or freeze-padding beyond that.

3. **Get the user's approval of the script** (✋ checkpoint) — this is *before* any ElevenLabs spend.

4. **Run the pipeline:** `bun run make-video <slug>`. Long-form content does not have burned-in captions by default. Use `--captions` only when the user explicitly wants captions, such as for Shorts or other short-form variants. The pipeline synthesizes each chunk (cached in `videos/<slug>/vo/`), plans the segments (printing a speed/pad table), and assembles `videos/<slug>/final.mp4`.

5. **QA the output:** `bun run qa <slug>` validates `final.mp4` (duration, 1080p, audio not silent, and captions only if `captions.srt` exists) and exits nonzero if any check fails. It also prints **advisory, non-blocking** OCR-based secret-leak warnings (review them — OCR can be wrong); `--no-secrets` skips that pass.

6. **Review `final.mp4` with the user** (✋ checkpoint). To iterate, edit `script.json` and re-run.
   - ⚠️ The voice cache is keyed by chunk `id`. If you change a chunk's **text**, delete its `videos/<slug>/vo/<id>.mp3` (or the whole `vo/` dir) to force re-synthesis.

7. **Run the retro loop after review/publish.** Use `bun run retro <slug>` to create `videos/<slug>/retro.json` if needed. Add only durable lessons that should apply to future videos, then run `bun run retro <slug> --apply` to merge approved rules into `house-style.md`. The merge is idempotent and skips duplicate rules.

## Notes

- Voice model: ElevenLabs `eleven_multilingual_v2`. The synthesized audio plays at natural pace; only the *footage* is sped/slowed to match it (no audio time-stretch, no lip-sync — there's no face in the body).
- Output is 1080p H.264 + AAC; visual quality is set via libx264 `-crf` in `src/finish.ts` (currently `-crf 18`).
- All inputs/outputs live under `videos/<slug>/`, which is gitignored — the user's recordings stay local.

## Stage 4 — auto-zoom via Tella MCP

Zoom is added on the **original** Tella recording (it needs Tella's cursor data, which a flat `.mp4` lacks), then re-exported before `recording.mp4` enters this pipeline. Zoom is an overlay — it does **not** change clip duration, so re-exporting keeps cached VO and `script.json` timestamps aligned. **Never trim/cut in Tella** — that shifts the timeline.

**Author zoom cues** in `script.json` by adding a `zoom` field to any chunk. The zoom spans that chunk's whole `sourceStart…sourceEnd`:

```json
{ "id": "c09", "text": "Tella is an all-in-one…",
  "sourceStart": 56.86, "sourceEnd": 71.58,
  "zoom": { "scale": 1.25, "focusPct": [50, 40] } }
```

- `scale` — optional, default `1.25`. Keep it light; above `1.5` warns "may feel heavy" (Tella max `4`).
- `focusPct` — optional `[x, y]` (0–100), default `[50, 50]` (center).
- Always applied as `manualZoom` (steady). For finer control than a whole chunk, split the chunk.

**Plan the zooms:** `bun run plan-zooms <slug>` reads `script.json`, writes `videos/<slug>/zoom-plan.json`, and prints a table. If the chunk's VO is already synthesized, it also shows `estFinal` — how long the zoom plays in the final cut (a zoom inside a sped-up segment plays faster).

**Layout convention:** the narrated body is faceless and screen-first. In Tella, set the body clip's base layout to `screen-only` / `fullscreen` and preserve all screen content (`screenFit: "letterbox"` when the option is available). Do not use camera bubble, side-by-side, or presenter layouts in the body; the real face belongs only in `videos/<slug>/intro.mp4`.

**Apply via Tella MCP** (this skill, on the user's confirmation):
1. Resolve the Tella project: read `videos/<slug>/tella.json` `{ videoId, clipId }` if present; otherwise find it with `list_videos` (match by name) + `list_clips`, and write `tella.json` for next time.
2. Apply the layout convention: `list_layouts`; use `update_layout` on `layoutId: "base"` with `{ "kind": "screen-only", "style": "fullscreen", "screenFit": "letterbox" }` when the clip's `layoutSceneType` supports it. If Tella rejects `screenFit`, retry with `{ "kind": "screen-only", "style": "fullscreen" }`.
3. Clear existing zooms so re-applying never stacks: `list_zooms` → `remove_zoom` for each.
4. For each entry in `zoom-plan.json`, call `add_zoom` (`type: manualZoom`, its `startTimeMs`, `durationMs`, `scale`, `focusPoint`).
5. `export_video` (1080p), poll to completion, download, and swap the result in as `videos/<slug>/recording.mp4`.
6. Run `bun run make-video <slug>` — VO is a $0 cache hit; only ffmpeg re-assembly runs.

Lesson from the first manual test (2026-06): `trackingZoom` at scale 1.6 jittered (it amplifies small mouse motion). This workflow uses `manualZoom` with precise, chunk-scoped cues to stay steady.

## Stage 4 — highlights & blur via Tella MCP

Like zoom, highlight and blur masks live on the **original** Tella recording and are baked in at export. They're overlays — they do **not** change clip duration, so cached VO and `script.json` timestamps stay aligned. **Never trim/cut in Tella.**

- **Highlight** spotlights a screen region (dims the rest) to track what the user is selecting/pointing at.
- **Blur** obscures sensitive content (tokens, emails, private data).

**Author overlay specs** in `videos/<slug>/overlays.json` — an array of:

```json
{ "id": "pricing-cards", "kind": "highlight", "chunkId": "c09",
  "pointPct": [6, 35], "sizePct": [88, 58],
  "note": "Track the pricing cards, not the Pricing heading." }
```

- `kind` — `"highlight"` or `"blur"`.
- Timing — either `chunkId` (spans that chunk's `sourceStart…sourceEnd`) **or** explicit `startTimeSec`/`endTimeSec`.
- `pointPct` — top-left corner `[x, y]` (0–100). `sizePct` — `[width, height]` (0–100). Out-of-range values are clamped with a warning.
- `note` — optional human reminder of what the mask tracks; **local-only**, never sent to Tella.

**Plan the overlays:** `bun run plan-overlays <slug>` reads `overlays.json` + `script.json`, writes `videos/<slug>/overlay-plan.json` (Tella mask geometry in ms), and prints a table. Resolve any printed warnings before applying.

**Apply via Tella MCP** (idempotent — clear then re-add so re-runs never stack):
1. Resolve the Tella project from `videos/<slug>/tella.json` `{ videoId, clipId }` (as for zoom).
2. Read `overlay-plan.json`.
3. Clear existing masks: `list_highlights` → `remove_highlight` for each; `list_blurs` → `remove_blur` for each.
4. For each plan entry, add it on the matching layer: `add_highlight` for `kind: "highlight"`, `add_blur` for `kind: "blur"`, passing its `startTimeMs`, `durationMs`, `point`, `dimensions`.
5. Verify: `list_highlights` + `list_blurs` and confirm the count and geometry match `overlay-plan.json`.
6. `export_video` (1080p), poll to completion, download, swap the result in as `videos/<slug>/recording.mp4`, then re-run `bun run make-video <slug>` (VO is a $0 cache hit; only ffmpeg re-assembly runs).

Tip: a highlight should track the *active content* the user is selecting (e.g. the pricing cards), not a page heading above it. If the first placement reads too high or too wide, adjust `pointPct`/`sizePct` in `overlays.json` and re-apply.
