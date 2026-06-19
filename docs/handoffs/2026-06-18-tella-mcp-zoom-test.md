# Handoff — Tella MCP zoom test (next session)

**Date:** 2026-06-18
**Goal:** Use the Tella MCP (now configured) to add **auto-zoom (and blur)** to the sample recording, prove the effect survives our voice-driven re-timing, then decide how to automate it.

## Why a new session is needed

MCP servers load at session start. Start a **fresh Claude Code session in `aimh-video-engine`** so the Tella MCP tools are available (`list_videos`, `add_zoom`, `add_blur`, `add_layout`, `add_highlight`, `export_video`, `get_cut_transcript`, …). The session where this was written did not have the Tella MCP loaded.

## Project state (as of this handoff)

- `main` has the working **thin slice + Stage 5** (intro/outro wrap). End-to-end: Tella recording + `.srt` → clean chunked script → cloned-voice VO → footage re-timed to voice → optional intro/outro → `final.mp4` (1080p, `crf 18`, 160k AAC).
- Sample (`videos/sample/`, gitignored): `recording.mp4` (a symlink to the Tella export `AIMH-video-engine-sample.mp4`), `intro.mp4`, `outro.mp4`, `script.json` (11 chunks), cached `vo/`, last `final.mp4` (~111s with intro+outro).
- Original Tella project id: **`vid_cmqjyi3we025c04kybhqu8giq`**.

## The decision already made (Decision A)

Tella does the **visual editing** (zoom/blur/layouts) on the **original** recording — auto-zoom needs Tella's cursor/click data, which only exists inside the Tella project (a flat `.mp4` has none). FFmpeg (our engine) does re-voice + re-sync + assembly. Captions come from our script later (NOT Tella) — **defer captions**.

**Key invariant:** zoom/blur are overlays that do **NOT** change the timeline. Re-exporting after adding them keeps the same duration, so our cached VO and `script.json` timestamps (which map to the original `.srt` times) still align. **Do NOT trim/cut in Tella** — that shifts the timeline and breaks the mapping.

## Step-by-step plan

1. **Verify MCP:** `list_videos` — confirm tools are loaded and locate `vid_cmqjyi3we025c04kybhqu8giq`.
2. **Add zoom:** `add_zoom` with `type: trackingZoom` (auto-follows the cursor) at the key click/action moments. Optionally a few `manualZoom` for emphasis. Use `get_cut_transcript` / `get_video --includeChapters` to find timestamps.
3. **(Optional) blur:** `add_blur` over anything sensitive on screen.
4. **Do NOT trim** — preserve the original duration/timeline.
5. **Export:** `export_video` (1080p) → replace `videos/sample/recording.mp4` with the zoomed export. (It's a symlink today; `ln -sf <zoomed-export>.mp4 videos/sample/recording.mp4`, or drop the real file as `recording.mp4`.)
6. **Re-run:** `bun run make-video sample` (VO cached, `script.json` unchanged) → new `final.mp4`.
7. **Evaluate:** does the zoom land at the right moments and survive the re-timing? Note segments c01, c07, c09, c10, c11 are sped 1.3–1.5×, so zooms there play a touch faster.

## Then: automation decision

If it works, choose how to make it repeatable:

- **(A) Manual Tella pre-step** — you add zoom in Tella, export, run the engine. Zero new code.
- **(B) Automated** — the `make-video` skill drives the Tella MCP to add zooms from the script's click cues, then exports. Fully hands-off, more build.

Recommendation: prove it manually (this plan) first, then choose.

## Gotchas

- Tella MCP can't replace audio or add music — that stays in ffmpeg.
- A zoom inside a sped-up segment plays faster — usually fine.
- `make-video` looks for `videos/<slug>/intro.mp4` and `outro.mp4` (lowercase) and `assets/outro.mp4` for a reusable outro.
