---
name: make-video
description: Use when the user wants to turn a Tella screen recording (plus its .srt subtitle export) into a finished, re-voiced video with the aimh-video-engine project. Rewrites the rambling transcript into a clean script, synthesizes it in the user's cloned ElevenLabs voice, and re-times the screen footage to the narration. Triggers on "make a video", "run the video engine", or pointing at a recording in videos/<slug>/.
---

# make-video (aimh-video-engine)

Turn a rough Tella screen recording into a finished, cleanly-narrated video. This is the companion skill for the [aimh-video-engine](https://github.com/aimhco/aimh-video-engine) project — run it from inside that repo.

## What it produces

The screen recording, re-voiced with a clean script in the user's cloned voice, with the footage **re-timed so what's on screen tracks what's being said**. This is the core "thin slice"; intro/outro, auto-zoom, captions, music, chapter cards, and YouTube publishing are later stages.

## Prerequisites

- Run from the `aimh-video-engine` repo (Bun + FFmpeg installed). Captions need a **libass-enabled** ffmpeg (`ffmpeg -version | grep libass`); if absent, install `ffmpeg-full` and set `FFMPEG`/`FFPROBE` in `.env` to its binaries.
- `.env` with `ELEVENLABS_API_KEY` + `ELEVENLABS_VOICE_ID` (a cloned voice). Optional `FFMPEG`/`FFPROBE` override the ffmpeg/ffprobe binary paths.
- In `videos/<slug>/`: the recording as `recording.mp4` and the Tella subtitle export as a `.srt` file.

## Steps

1. **Read the inputs.** In `videos/<slug>/`, read the `.srt` (cue-level timestamped text — this is your transcript) and `ffprobe` the recording for its duration.

2. **Write a clean, chunked script** to `videos/<slug>/script.json` — an array of `{ id, text, sourceStart, sourceEnd }`:
   - **Ground every chunk in the SRT** — never narrate something that isn't in the recording.
   - **Map `sourceStart`/`sourceEnd`** to the SRT cue times where that content appears; drop dead air between topics by leaving gaps between chunks.
   - **Clean filler and fix transcription errors** (garbled names, URLs, numbers).
   - **Spell tricky terms phonetically for TTS** — domains, acronyms, and handles get mangled otherwise. Write `A-I-M-H dot co`, not `aimh.co`; avoid `@` and raw URLs.
   - **Keep chunks small** (one to a few sentences). Don't cram a long paragraph into one chunk — TTS rushes it. Give sign-offs like "Thank you" their own short chunk.
   - Aim for narration whose spoken length is *close* to its footage length. The planner tolerates 0.5×–2×, trimming idle tail or freeze-padding beyond that.

3. **Get the user's approval of the script** (✋ checkpoint) — this is *before* any ElevenLabs spend.

4. **Run the pipeline:** `bun run make-video <slug>`. It synthesizes each chunk (cached in `videos/<slug>/vo/`), plans the segments (printing a speed/pad table), and assembles `videos/<slug>/final.mp4`.

5. **Review `final.mp4` with the user** (✋ checkpoint). To iterate, edit `script.json` and re-run.
   - ⚠️ The voice cache is keyed by chunk `id`. If you change a chunk's **text**, delete its `videos/<slug>/vo/<id>.mp3` (or the whole `vo/` dir) to force re-synthesis.

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

**Apply via Tella MCP** (this skill, on the user's confirmation):
1. Resolve the Tella project: read `videos/<slug>/tella.json` `{ videoId, clipId }` if present; otherwise find it with `list_videos` (match by name) + `list_clips`, and write `tella.json` for next time.
2. Clear existing zooms so re-applying never stacks: `list_zooms` → `remove_zoom` for each.
3. For each entry in `zoom-plan.json`, call `add_zoom` (`type: manualZoom`, its `startTimeMs`, `durationMs`, `scale`, `focusPoint`).
4. `export_video` (1080p), poll to completion, download, and swap the result in as `videos/<slug>/recording.mp4`.
5. Run `bun run make-video <slug>` — VO is a $0 cache hit; only ffmpeg re-assembly runs.

Lesson from the first manual test (2026-06): `trackingZoom` at scale 1.6 jittered (it amplifies small mouse motion). This workflow uses `manualZoom` with precise, chunk-scoped cues to stay steady.
