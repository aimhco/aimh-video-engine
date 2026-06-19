# Design — Zoom cues (Stage 4: Visual Edit, first slice)

**Date:** 2026-06-19
**Status:** Approved, ready for implementation plan
**Roadmap slot:** Stage 4 (Visual Edit). First slice of the Tella-MCP visual polish; blur, layouts, highlights, and chapter cards follow later.

## Problem

The thin slice + Stage 5 (intro/outro) work end-to-end, but the screen footage is flat — no zoom. A manual Tella zoom test (2026-06-18/19, video `vid_cmqjyi3we025c04kybhqu8giq`) proved zoom *survives* our re-timing (zoom is an overlay baked into the export before the engine re-times it, so cached VO + `script.json` stay aligned), but surfaced two problems:

1. **Jitter** — `trackingZoom` (auto cursor-follow) at scale 1.6 amplified small mouse movement into visible left-right shake.
2. **Loose placement** — zoom windows were eyeballed from chapters/transcript rather than placed precisely.

We want a **repeatable, steady** way to place zooms at chosen moments, without doubling cost or breaking the timeline.

## Goals

- Author zoom intent declaratively, per script chunk, in `script.json`.
- Produce **steady** zooms (`manualZoom`, fixed focus) with light defaults.
- Keep the engine a pure, offline, testable pipeline; isolate all Tella-MCP mutation in the skill.
- Zero additional ElevenLabs cost (VO cache is keyed on chunk text, untouched by zoom).
- Structure the work so it can later be promoted to full automation (skill auto-applies every run) without redesign.

## Non-goals (this slice)

- Full walk-away automation (engine run auto-drives Tella + export). That is the documented upgrade path, not this slice.
- Sub-chunk zoom ranges. A zoom spans the **whole chunk**; for finer control the author splits the chunk (they already own chunk boundaries).
- `trackingZoom`, blur, layouts, highlights, chapter cards — later Stage-4 slices.
- Multi-clip Tella projects. The engine's flat-recording model assumes a single clip whose timeline matches the `.srt`. Single-clip only; note as a limitation.

## Decisions (settled in brainstorming)

| Decision | Choice | Why |
|----------|--------|-----|
| Automation level | **Option 2** — engine computes the cue plan; skill applies on confirm | Captures the hard/valuable part (coordinate math + steadiness defaults) while keeping stateful Tella mutation/export explicit and decoupled. Strict subset of full automation, so it upgrades cleanly. |
| Cue format | **By script chunk** | Author already thinks in chunks tied to source ranges; engine already knows each chunk's speed factor. No coordinate confusion. |
| Zoom span | **Whole chunk** | Simple; steady zoom over a long chunk is fine (not jittery). Split the chunk for finer control. |
| Zoom type | **`manualZoom`** (fixed focus) | Eliminates the tracking jitter that was the core complaint. |

## Schema

Add an optional `zoom` field to a script chunk in `script.json`:

```json
{ "id": "c09", "text": "Tella is an all-in-one…",
  "sourceStart": 56.86, "sourceEnd": 71.58,
  "zoom": { "scale": 1.25, "focusPct": [50, 40] } }
```

- Presence of `zoom` = zoom this chunk across its full `sourceStart…sourceEnd` span.
- `scale` — optional, default **1.25**. Light by design. Values above ~1.5 emit a "may feel heavy" warning (Tella hard max is 4).
- `focusPct` — optional `[xPct, yPct]`, default **[50, 50]** (center). Percentages 0–100 of the screen.
- Zoom type is always `manualZoom` in this slice (not exposed in the schema).

Extend `ScriptChunk` in `src/types.ts`:

```ts
export interface ZoomCue { scale?: number; focusPct?: [number, number] }
export interface ScriptChunk {
  id: string; text: string; sourceStart: number; sourceEnd: number;
  zoom?: ZoomCue;
}
```

## Architecture

Two cleanly separated units, mirroring the project's "Claude does judgment, scripts do determinism" principle — except here the *geometry* is deterministic (engine) and the *Tella mutation* is the skill's job.

### 1. Engine — pure planner (`src/zoom.ts`)

`planZooms(script: ScriptChunk[], vo?: VoChunk[]): ZoomPlan` — a pure function, no I/O, no Tella coupling.

For each chunk with a `zoom`:
- `startTimeMs = round(sourceStart * 1000)`
- `durationMs  = round((sourceEnd - sourceStart) * 1000)`
- `type = "manualZoom"`, `scale = zoom.scale ?? 1.25`, `focusPoint = { xPct, yPct }` from `focusPct ?? [50,50]`
- If `vo` is provided (cache present), also compute `estFinalSec` = the on-screen duration after re-timing, reusing the **same** speed-factor math as `src/align.ts` (`speedFactor = clamp(sourceDur/voDur, 0.5, 2)`; `estFinalSec = min(sourceDur/speedFactor, voDur)`). To avoid drift, factor the clamp + `MIN_SPEED`/`MAX_SPEED` constants out of `align.ts` into a shared spot both modules import.

Output:

```ts
export interface ZoomPlanEntry {
  chunkId: string;
  type: "manualZoom";
  startTimeMs: number;
  durationMs: number;
  scale: number;
  focusPoint: { xPct: number; yPct: number };
  estFinalSec?: number; // present only when VO cache exists
}
export interface ZoomPlan { zooms: ZoomPlanEntry[] }
```

Note: the plan carries **no** Tella video/clip id — it is pure geometry. Identity is resolved by the skill at apply time.

### 2. Engine — CLI (`scripts/plan-zooms.ts`)

`bun run plan-zooms <slug>`:
1. Reads `videos/<slug>/script.json`.
2. Loads `vo/*.mp3` durations if present (best-effort, for `estFinalSec`).
3. Calls `planZooms`, writes `videos/<slug>/zoom-plan.json`, and prints a readable table (chunk, start, duration, scale, focus, est. final secs).
4. Exits cleanly with "no zoom cues found" if no chunk has a `zoom` field.

Add a `plan-zooms` script alias to `package.json` alongside `make-video`.

### 3. Skill — applier (Claude + Tella MCP, on user confirm)

Documented in `.claude/skills/make-video/SKILL.md` as the Stage-4 zoom step. On the user's confirmation:
1. Resolve Tella identity: read `videos/<slug>/tella.json` `{ videoId, clipId }` if present; otherwise discover via `list_videos` (match by name) + `list_clips`, and **write** `tella.json` for reuse.
2. **Clear existing zooms** on the clip: `list_zooms` → `remove_zoom` for each. Makes re-applying idempotent (cues never stack).
3. For each entry in `zoom-plan.json`, call `add_zoom` with its params.
4. `export_video` (1080p), poll to completion, download, and swap in as `videos/<slug>/recording.mp4` (repoint the symlink or drop the file).
5. Run `bun run make-video <slug>` — a $0 cache hit on VO; only ffmpeg re-assembly runs.

### Identity hint file (`videos/<slug>/tella.json`)

```json
{ "videoId": "vid_cmqjyi3we025c04kybhqu8giq", "clipId": "cl_cmqjyi40u025d04ky48pe89fc" }
```

Skill-managed convenience. The engine never reads it; gitignored with the rest of `videos/`.

## Cost-clarity fix (folded in)

`scripts/make-video.ts:17` logs `synthesizing <id>…` *before* the cache check in `src/elevenlabs.ts`, so it prints even on a cache hit and looks like a re-charge. Fix: have `synthesizeChunk` return whether it served from cache (e.g. add `cached: boolean` to `VoChunk` or a sibling return), and log `synthesizing <id> (cached)` vs `synthesizing <id> (<n> chars)…` accordingly. No behavior change — clarity only.

## Data flow

```
script.json (with zoom cues)
   │  bun run plan-zooms <slug>   (engine, pure, offline)
   ▼
zoom-plan.json  +  printed table
   │  skill (Tella MCP), on confirm:
   │    resolve ids → clear zooms → add_zoom×N → export → download → swap recording.mp4
   ▼
recording.mp4 (zoom baked in, same duration)
   │  bun run make-video <slug>   ($0 VO cache hit)
   ▼
final.mp4 (zoom survives re-timing)
```

## Error handling & edge cases

- **No zoom cues:** `plan-zooms` prints "no zoom cues" and writes an empty plan; nothing else changes.
- **Bad cue:** `scale` outside [1, 4] → clamp + warn; `focusPct` outside [0,100] → clamp + warn; `sourceEnd <= sourceStart` already rejected by existing planning, mirror that guard.
- **Zoom inside a sped-up segment:** plays faster in the final; `estFinalSec` surfaces this so the author isn't surprised (a 14.7s cue in a 1.47× chunk ≈ 10s on screen).
- **VO not yet synthesized:** `estFinalSec` omitted; the plan is still valid (it needs only `script.json`).
- **Re-applying after editing cues:** the skill's clear-then-add step keeps Tella from accumulating stale zooms.
- **Timeline invariant:** never trim/cut in Tella — zoom is an overlay; trimming shifts the timeline and breaks the VO/`script.json` mapping.

## Testing

- Unit tests for `planZooms` (pure → easy): chunk with/without `zoom`; default scale/focus; `startTimeMs`/`durationMs` rounding from float seconds; `estFinalSec` with and without VO; clamp/warn on out-of-range scale and focus.
- A fixture `script.json` with one zoomed chunk and one plain chunk; assert the emitted `ZoomPlan`.
- The skill apply path is exercised manually against the sample project (not unit-tested — it touches live Tella MCP).

## Future (explicitly out of scope here)

- **Upgrade to Option 1:** wrap the skill applier so `make-video` auto-applies the plan, exports, and continues without a confirm gate. This slice is a strict subset.
- Sub-chunk zoom ranges; `trackingZoom` opt-in.
- The rest of Stage 4: `add_blur` (incl. the Stage-6 secret-leak gate's auto-blur loop), layouts, highlights, animated chapter cards.
