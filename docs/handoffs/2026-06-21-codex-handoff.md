# Codex Handoff — aimh-video-engine

Continue development here while the Claude Code session limit resets. Point Codex at this file.

## TL;DR
- **Repo:** `/Users/dennywii/Documents/dev/aimh-video-engine` (Bun + TypeScript). **Current branch:** `stage-4-chapter-cards`.
- **In flight:** Stage-4 **chapter cards**. Spec is committed and complete: `docs/superpowers/specs/2026-06-21-chapter-cards-design.md`. Next step: write the plan + build it (TDD), then merge to `main`.
- **Already on `main` (done):** auto-zoom, burned captions, logo watermark, QA checks, warn-only secret scan. Full suite = 68 tests.

## ⚠️ Critical environment gotchas (this machine's Homebrew is non-standard — these WILL bite you)
1. **Stock ffmpeg lacks libass AND drawtext.** Use the libass build `ffmpeg-full` at `/usr/local/opt/ffmpeg-full/bin/{ffmpeg,ffprobe}`. The engine resolves binaries via `FFMPEG`/`FFPROBE` env (set in `.env`, which Bun auto-loads). **Never call bare `ffmpeg`/`ffprobe`** — import `FFMPEG`/`FFPROBE`/`TESSERACT` from `src/ffmpeg.ts`. **`drawtext` does NOT work** → render any text as images. (Chapter cards use `@resvg/resvg-js`, never ffmpeg drawtext.)
2. **tesseract cannot open files in `/tmp`** (returns "image file not found"). Always write frames/images under the project or slug workdir (`videos/<slug>/work/...`), never `/tmp`. `TESSERACT` env configurable (default `"tesseract"`).
3. **Don't commit `.env`** (gitignored; holds `FFMPEG`/`FFPROBE`/`TESSERACT`/`ELEVENLABS_*`/`YOUTUBE_*`). **`tests/fixtures/` is gitignored** — tests generate their own media via ffmpeg; intentional committed fixtures use `git add -f`.

## How to run
- `bun install`
- `bun test` — full suite (reads `.env` for the ffmpeg paths).
- `bun run make-video <slug>` · `bun run plan-zooms <slug>` · `bun run qa <slug>`
- Sample project: `videos/sample/` (gitignored): `recording.mp4` + `script.json` + cached `vo/`.

## Workflow conventions (please follow)
- Per feature slice: **spec → plan → TDD → full suite green → merge** (`--no-ff` to `main`, re-run suite on `main`). Specs/plans live in `docs/superpowers/{specs,plans}/`.
- **Pure core + thin I/O:** detection/planning logic is pure and unit-tested (`bun:test`, `tests/*.test.ts`); ffmpeg/OCR is the thin I/O layer. Mirror this.
- Branch per slice (current: `stage-4-chapter-cards`).
- Use your own commit attribution (don't claim Claude co-authorship).
- The skill `.claude/skills/make-video/SKILL.md` is mirrored to `/Users/dennywii/Documents/dev/Skills` (clone of GitHub `aimhco/skills`). If you change SKILL.md, copy it there + commit/push.

## Architecture map (`src/`)
- `types.ts` — shared types (`ScriptChunk` has `zoom?`; **add `chapter?`**; `VoChunk.cached?`; `CaptionCue`; `Zoom*`; `Qa*`; `Secret*`).
- `timing.ts` — `speedFactor` (shared re-timing math).
- `align.ts` — `planSegments` (sizes footage to VO).
- `elevenlabs.ts` — `synthesizeChunk` (caches `vo/<id>.mp3`).
- `ffprobe.ts` — `ffprobeDuration` / `ffprobeVideoSize` / `ffprobeHasAudio`.
- `ffmpeg.ts` — `FFMPEG` / `FFPROBE` / `TESSERACT` binary resolution.
- `finish.ts` — `assembleVideo` (segments → captioned body), `wrapVideo` (intro/body/outro), `overlayLogo`, `CAPTION_STYLE`. **Chapter-card insertion goes here.**
- `captions.ts` — `planCaptions` / `toSrt` (script + VO → SRT, burned by `assembleVideo`).
- `zoom.ts` — `planZooms` / `planZoomsForDir`.
- `qa.ts` — `evaluateQa` / `runQa` (deterministic checks + warn-only secret warnings).
- `secrets.ts` — `scanTextForSecrets` / `scanSecretsInVideo`.
- `scripts/` — `make-video.ts`, `plan-zooms.ts`, `qa.ts` (CLIs).

## CURRENT TASK: build chapter cards per the committed spec
Read `docs/superpowers/specs/2026-06-21-chapter-cards-design.md` first — it's complete. Suggested task split (TDD each, commit per task):
1. **Chapters + card render.** Add `ScriptChunk.chapter?: string`. `src/chapters.ts`: `deriveChapters` + `chapterOffsetSec` (pure). `src/cards.ts`: `cardSvg` (pure), `renderCardPng` (`@resvg/resvg-js`, `loadSystemFonts`), `renderCardClip` (ffmpeg: loop PNG 2.5s + fades + faded `Body_` music). `bun add @resvg/resvg-js`. Pure tests + a render integration test (valid 1920×1080 PNG).
2. **Insertion.** `finish.ts` `insertChapterCards` — cut the already-captioned body at chapter offsets, splice `card+piece+card+piece…`. Integration test (duration ≈ body + cards). Captions stay correct because the body is pre-captioned.
3. **Music + wiring.** `src/music.ts` `pickTrack` (pure, deterministic per slug). `scripts/make-video.ts`: derive chapters → pick/persist `videos/<slug>/music.json` → render cards (music offset 0) → `insertChapterCards` → `wrapVideo`; add `--no-cards`. **Update `runQa` expected-duration to add `cards × 2.5s` when chapters exist** (else the duration check fails). Verify: add `chapter` fields to `videos/sample/script.json`, run `make-video sample`, eyeball a card frame, confirm `qa sample` still passes.

## What Codex should NOT attempt (needs the Claude Code session / Tella MCP)
- **Tella MCP operations** (applying zoom/blur on the original recording, re-export) — only available in the Claude Code session. **Chapter cards do NOT need Tella**, so you can fully build this slice. Leave the **blur** slice (needs Tella MCP) for when Claude Code is back.
- **YouTube upload** — needs Google OAuth creds; deferred regardless.

## Backlog (after cards)
- Layouts (mostly a Tella recording convention — body=screen-only fullscreen [already], intro=camera+background).
- Blur (needs Tella MCP).
- Intro music + spoken-outro redesign (reuse `music.json`; the outro = a Claude-written script synthesized via ElevenLabs + a fixed `Outro_` track on top).
- "AIMH.co" TTS pronunciation fix + word-level captions (pair with the new-mic voice re-clone).
- Stage 7 YouTube publish (upload `private` first; unverified projects are private-only until the API audit).
