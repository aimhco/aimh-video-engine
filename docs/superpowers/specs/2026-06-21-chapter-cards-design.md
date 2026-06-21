# Design — Transition slides / chapter cards (Stage 4)

**Date:** 2026-06-21
**Status:** Approved (design), ready for implementation plan
**Roadmap slot:** Stage 4 (Visual Edit). First of the remaining Stage-4 slices (then layouts, then blur). Carries the **transition-slide music**. Intro music and the spoken-outro redesign are separate later slices.

## Problem

The video jumps straight from intro into screen content with no sectioning. We want branded **chapter title cards** between sections — short transition slides that name each chapter, with music — to structure the video (and feed YouTube description chapters later).

## Goals

- Auto-derive chapters from the script (Claude proposes, user approves); render a branded title card per chapter.
- Insert a card at the **start of each chapter** (including chapter 1, right after the intro) **without disturbing the burned captions**.
- Play music on the cards (they have no narration).
- Keep card generation pure/testable; lightweight rendering (no headless browser).

## Non-goals (this slice)

- Animated/motion-graphics cards (static card + fade; animation is a future upgrade).
- Intro music and the spoken-outro redesign (separate slices — though this slice establishes the `music.json` sidecar they'll reuse).
- Embedding the logo image on the card (color-branding only for v1; logo overlay can come later).
- Layouts and blur (later Stage-4 slices).

## Decisions (from brainstorming)

| Decision | Choice |
|----------|--------|
| Chapter source | Claude **auto-proposes** chapter titles+boundaries from `script.json` at a ✋ checkpoint; user edits. |
| Card renderer | **`@resvg/resvg-js`** (SVG→PNG) — lightweight, deterministic, no Chromium. |
| Card style | Static: brand **purple bg + cream text**, `CHAPTER N` + title, centered, ~2.5s, fade in/out. |
| Card placement | A card at the **start of every chapter**, including chapter 1 (right after the intro). |
| Caption safety | Cut the **already-captioned** body at chapter offsets and splice cards between pieces — captions are pre-burned, so timing is untouched. |
| Card music | A short, faded segment of a `Body_` track, deterministically chosen per slug, persisted to `music.json`. |

## Architecture

### Data: chapters in `script.json`

Add an optional `chapter?: string` to `ScriptChunk` (in `src/types.ts`). The first chunk of each section carries its chapter title. A chapter **starts** at any chunk with a `chapter` field.

```json
{ "id": "c01", "text": "…", "sourceStart": 0.95, "sourceEnd": 7.19, "chapter": "Introduction" }
```

### `src/chapters.ts` — pure derivation

```ts
export interface Chapter { index: number; title: string; startChunkIndex: number }

// Pure: chapters are chunks carrying a `chapter` field, in order (index 1-based).
export function deriveChapters(script: ScriptChunk[]): Chapter[];

// Pure: a chapter's start offset on the body timeline = Σ VO durations of chunks before it.
export function chapterOffsetSec(startChunkIndex: number, vo: VoChunk[]): number;
```

### `src/cards.ts` — card rendering

- **Pure:** `cardSvg(opts: { number: number; title: string }): string` → a 1920×1080 SVG (brand constants: `CARD_BG = "#6B5FA8"` purple, `CARD_FG = "#F5EFE3"` cream; `CHAPTER N` in small letter-spaced caps, title large, both centered; a thin cream accent rule). Unit-tested (title injected + XML-escaped; valid structure).
- **I/O:** `renderCardPng(svg: string, outPath: string): Promise<void>` — `@resvg/resvg-js` with `font: { loadSystemFonts: true, defaultFontFamily: "Helvetica" }`, fitTo width 1920 → PNG.
- **I/O:** `renderCardClip(opts: { png; musicFile?; musicOffsetSec; durationSec; workDir; out }): Promise<string>` — ffmpeg loops the PNG for `durationSec` at 1920×1080/30fps with a video fade in/out; if `musicFile`, mixes a faded segment (from `musicOffsetSec`) at a moderate level; else a silent audio track (so concat stays uniform). Via `FFMPEG`.

Constants: `CARD_DURATION_SEC = 2.5`, `CARD_FADE_SEC = 0.4`, `CARD_MUSIC_DB = -10`.

### `src/music.ts` — deterministic track pick

- **Pure:** `pickTrack(slug: string, tracks: string[]): string | undefined` — stable hash of `slug` → index (so reruns pick the same track; different slugs vary). Unit-tested.
- I/O lives in make-video: list `assets/music/Body_*.mp3`, pick one, persist `{ bodyTrack }` to `videos/<slug>/music.json` (reused if present, so reruns are stable; delete/edit to re-roll). Intro/outro music slices will extend this file.
- **v1: every card uses `musicOffsetSec = 0`** (each card starts from the track's beginning). Per-card progressing offsets are a future nicety.

### `src/finish.ts` — insertion (`insertChapterCards`)

```ts
export async function insertChapterCards(opts: {
  body: string; cards: { clip: string; atSec: number }[]; workDir: string; out: string;
}): Promise<string>;
```
Cuts `body` at each card's `atSec` (re-encoded pieces, frame-accurate) and concatenates `card[0] + piece[0] + card[1] + piece[1] + …` (reusing the existing concat-list helper). The body pieces keep their burned captions; cards sit between them. Returns `out`.

### `scripts/make-video.ts` — wiring

After `assembleVideo` (captioned body) and before `wrapVideo`:
1. `deriveChapters(script)`. If none → skip cards (today's behavior).
2. Pick/persist the body music track (`music.json`).
3. For each chapter: `cardSvg` → `renderCardPng` → `renderCardClip` (with music); `atSec = chapterOffsetSec(startChunkIndex, vo)`.
4. `insertChapterCards(body, cards, …)` → cards-body. Then `wrapVideo(intro, cards-body, outro)`.
A `--no-cards` flag skips the whole step.

## Data flow

```
script.json (chunks, some with `chapter`)  +  vo/*.mp3 durations
   │  deriveChapters → [{index,title,startChunkIndex}]
   │  per chapter: cardSvg → resvg PNG → renderCardClip (png + faded Body_ music)
   │  chapterOffsetSec → atSec for each card
   ▼
captioned body.mp4  ──insertChapterCards (cut at atSec, splice cards)──▶  body+cards.mp4
   │  wrapVideo(intro, body+cards, outro)
   ▼
final.mp4  (intro → [Ch1 card] → ch1 → [Ch2 card] → ch2 → … → outro)
```

## Error handling & edge cases

- **No chapters / `--no-cards`:** skip entirely; pipeline is exactly as today.
- **Chapter 1 not on chunk 0:** content before the first `chapter` chunk simply has no preceding card (acceptable); Claude's proposal should put a chapter on chunk 0.
- **resvg font issues:** use `loadSystemFonts` + a defaultFontFamily that exists on the box; the integration test renders a real card to catch font failures early.
- **`atSec = 0` (chapter 1):** card goes before the whole body (piece[0] starts at 0) — no zero-length cut.
- **Music absent (`assets/music/Body_*` empty):** cards render with silent audio (still valid); no failure.
- **Determinism:** `music.json` persists the chosen track so reruns don't change it; QA's duration check tolerance already accommodates the added card seconds (expected duration must now include card durations — **update `runQa`'s expected-duration to add `cards × CARD_DURATION_SEC` when chapters exist**, so QA stays green).

## Testing

- **Pure:** `deriveChapters` (chunks with/without `chapter`; indices; none→[]); `chapterOffsetSec` (cumulative VO sums); `cardSvg` (title injected, XML-escaped, `CHAPTER N` present); `pickTrack` (deterministic, stable across calls, varies by slug, []→undefined).
- **Integration:** `renderCardPng` produces a valid 1920×1080 PNG (ffprobe); `insertChapterCards` on a tiny generated body + one card yields a valid video whose duration ≈ body + card.
- **Manual:** add chapters to `videos/sample/script.json`, run `make-video sample`, eyeball a card frame (brand colors, centered title) and confirm cards land at section starts; `bun run qa sample` still passes (expected duration includes cards).

## Future (out of scope)

- Animated cards; logo on cards; intro music; spoken-outro redesign; layouts; blur; highlights.
