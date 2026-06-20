# Design — Burned-in captions (Stage 5)

**Date:** 2026-06-19
**Status:** Approved, ready for implementation plan
**Roadmap slot:** Stage 5 (Mux/Assemble). Adds the "captioned" piece of the /goal ("polished, narrated, **captioned**, branded video"). Music + logo branding follow as separate slices.

## Problem

The final video is narrated but has no captions — one of the four things the /goal explicitly names. Captions were deferred earlier because the obvious source (the Tella `.srt`) does not fit a re-voiced video:

- **Wrong words:** the final audio is the clean, rewritten `script.json` spoken by ElevenLabs, not the original rambling narration the `.srt` transcribes.
- **Wrong timing:** the footage is re-synced to the VO durations (chunks sped/slowed, dead air dropped), so the `.srt`'s original-recording timestamps point at the wrong moments in the final cut.

So captions must be **generated** from `script.json` (the real spoken words) timed to the **VO** (when each chunk plays in the final), not lifted from the Tella `.srt`.

## Goals

- Burn readable captions onto the narrated **body**, timed to the cloned-voice narration.
- Derive timing **without** changing the ElevenLabs synth path or cache (proportional split — see Decisions).
- Keep cue generation pure and unit-testable; keep ffmpeg burn-in in the existing assembler.
- Clean subtitle-bar styling (technical build-log, not punchy short-form), in tweakable constants.
- On by default; easy to skip.

## Non-goals (this slice)

- Word-level / frame-accurate caption timing via ElevenLabs `with-timestamps` (deferred — best paired with the upcoming new-mic voice re-clone, which re-synths everything anyway).
- Captioning the intro (real face, real speech) or outro — they keep their own audio and are not captioned by us.
- A final-timeline sidecar `.srt` for YouTube upload (that needs the intro offset; it's a Stage-7 concern). We do emit a **body-relative** `captions.srt` as a byproduct.
- Music bed and logo overlay (separate Stage-5 slices).

## Decisions (settled in brainstorming)

| Decision | Choice | Why |
|----------|--------|-----|
| Caption source | **Generated from `script.json` + VO timing** | The Tella `.srt` has the wrong words and the wrong (original) timeline. |
| Timing granularity | **Proportional split** | Works with today's cached audio, no synth/cache change, no re-synth. Chunks are short so drift is small. Upgrade to word-level later with the re-clone. |
| Style | **Clean subtitle bar** (bottom-center, white text on a semi-transparent box) | Suits a technical build-log; readable, not distracting. |
| Where burned | **Body only, before the intro/outro wrap** | Intro/outro keep their own audio; body-relative timing needs no intro offset. |
| Default | **On**, with `--no-captions` to skip | The /goal says "captioned". |

## Architecture

### 1. `src/captions.ts` — pure cue generation

```ts
export interface CaptionCue { startSec: number; endSec: number; text: string }

// Pure. Each chunk starts at the cumulative sum of prior VO durations (the body
// timeline: every segment plays for exactly its VO length) and lasts its own VO
// duration. Within a chunk, words are packed into cues and the chunk's duration
// is distributed across them proportionally by character count.
export function planCaptions(script: ScriptChunk[], vo: VoChunk[]): CaptionCue[];

// Format cues as SRT (HH:MM:SS,mmm). Pure.
export function toSrt(cues: CaptionCue[]): string;
```

**Constants:** `MAX_LINE = 42` (chars/line), `MAX_LINES = 2` ⇒ `MAX_CUE = 84` (chars/cue).

**Cue splitting (within one chunk):**
1. `splitIntoCues(text)` — greedily pack whitespace-split words into cues, starting a new cue when adding the next word would exceed `MAX_CUE`. A single word longer than `MAX_CUE` becomes its own cue (overflow, e.g. a URL).
2. `wrapLines(cueText)` — greedily wrap a cue's words into lines of ≤ `MAX_LINE`, joined with `\n` (libass renders `\n` as a line break). Used as the cue's display text.

**Timing (within one chunk of VO duration `D`, starting at body offset `S`):**
- `totalChars = Σ len(cue)` over the chunk's cues (length of the space-joined cue text).
- Each cue gets `cueDur = D * len(cue) / totalChars`; advance a running cursor `t` from `S`.
- The chunk's **last** cue's `endSec` is set exactly to `S + D` to avoid float drift / gaps between chunks.

`planCaptions` iterates chunks in order, matching each `vo` entry by `id` (throws if a chunk has no VO, mirroring `planSegments`), accumulating `S`.

### 2. `src/finish.ts` — burn during the existing body re-encode

`assembleVideo` gains an optional `captionsFile?: string`. When present, the **videoConcat** step (which already re-encodes the concatenated body) appends a `subtitles` filter to its `-vf` — so there is **no extra encode pass**:

```
tpad=stop_mode=clone:stop_duration=0.5,subtitles='<abs path>':force_style='<STYLE>'
```

- Build the whole `-vf` as a single interpolated string (like `wrapVideo` already does) so Bun's shell doesn't mis-parse commas/parens.
- The srt path is absolute; escape filtergraph-special chars (`\ : '`) in the path. (On macOS slug paths this is usually a no-op, but escape defensively.)
- When `captionsFile` is absent, behavior is exactly as today.

`STYLE` (libass `force_style`, ASS colours are `&HAABBGGRR`, alpha `00`=opaque):
```
FontName=Arial,FontSize=18,PrimaryColour=&H00FFFFFF,BorderStyle=3,
BackColour=&H80000000,Outline=1,Shadow=0,Alignment=2,MarginV=40
```
(bottom-center white text on a ~50%-opacity black box). `FontSize`/`MarginV` are starting values — eyeball one burned frame in the integration test and adjust if needed.

### 3. `scripts/make-video.ts` — wire it up

After synthesizing `vo`, before `assembleVideo`:
```ts
const captionsEnabled = !process.argv.includes("--no-captions");
const cues = planCaptions(script, vo);
let captionsFile: string | undefined;
if (captionsEnabled && cues.length) {
  captionsFile = `${dir}/captions.srt`;
  await Bun.write(captionsFile, toSrt(cues));
  console.log(`+ captions: ${cues.length} cues → ${captionsFile}`);
}
// …pass captionsFile into assembleVideo({ …, captionsFile })
```
The `captions.srt` (body-relative) lands in `videos/<slug>/` as a reusable byproduct. Captions burn onto the body; `wrapVideo` then adds the un-captioned intro/outro.

## Data flow

```
script.json (text) + vo/*.mp3 (durations)
   │  planCaptions  (pure)
   ▼
CaptionCue[]  ──toSrt──▶  videos/<slug>/captions.srt   (body-relative)
   │
   ▼  assembleVideo(captionsFile)  — subtitles filter on the body re-encode
captioned body.mp4
   │  wrapVideo (intro + body + outro; intro/outro uncaptioned)
   ▼
final.mp4  (narrated + captioned)
```

## Error handling & edge cases

- **No captions / empty script:** `--no-captions` or zero cues → `captionsFile` undefined → assembler unchanged.
- **Chunk with no VO:** `planCaptions` throws naming the chunk id (mirrors `planSegments`).
- **Very long single word (URL):** becomes its own cue/line (overflow) rather than being dropped.
- **Float drift:** last cue per chunk is pinned to `S + D`; chunks are contiguous so the caption track has no gaps between chunks (intra-chunk silence is rare since chunks are spoken text).
- **Path escaping:** the srt path is escaped for the ffmpeg filtergraph; a failing subtitles filter surfaces via the existing `runStage("concat video", …)` error wrapper.
- **Re-runs:** captions regenerate from `script.json` + cached VO every run — cheap, deterministic, no extra ElevenLabs cost.

## Testing

- **`tests/captions.test.ts` (pure, primary):**
  - cumulative offsets: chunk 2 starts at vo[0]+vo[1] durations; first cue of a chunk starts at the chunk offset.
  - proportional split: a two-cue chunk splits its duration ~by char ratio; last cue ends exactly at `offset + duration`; no overlaps.
  - splitter: cues ≤ `MAX_CUE`; lines ≤ `MAX_LINE`; word boundaries preserved; a >84-char word survives as its own cue.
  - `toSrt`: index numbering, `HH:MM:SS,mmm` formatting (incl. an hour-plus and sub-second case), blank line between cues, `\n` line breaks inside a cue.
  - throws when a chunk has no matching VO.
- **`tests/finish.test.ts` (extend, integration):** call `assembleVideo` with a small generated `captions.srt`; assert it still produces a valid file with video+audio streams (proves the subtitles filter wired in without breaking the encode). Generate the srt in the test (own fixture), consistent with the repo's "tests generate their own media" convention.

## Future (out of scope here)

- Word-level timing via ElevenLabs `with-timestamps` (with the new-mic re-clone).
- Final-timeline sidecar `.srt` (intro-offset) for YouTube caption upload (Stage 7).
- Music bed + logo overlay (separate Stage-5 slices); Stage 6 QA can later assert captions are present/legible.
