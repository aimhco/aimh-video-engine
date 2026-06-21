# Codex Handoff — aimh-video-engine

Continue development here while the Claude Code session limit resets. Point Codex at this file.

## TL;DR
- **Repo:** `/Users/dennywii/Documents/dev/aimh-video-engine` (Bun + TypeScript). **Current branch:** `stage-4-chapter-cards`.
- **In flight:** Stage-4 **chapter cards** on branch `stage-4-chapter-cards`. **Task 1 is done** (commit `7756853`, reviewed). The full plan with **copy-paste code for every task** is committed: `docs/superpowers/plans/2026-06-21-chapter-cards.md`. **Next: do Tasks 2 & 3, then merge to `main`.**
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

## CURRENT TASK: finish chapter cards — Tasks 2 & 3
The full plan with **complete copy-paste code for every task** is committed: `docs/superpowers/plans/2026-06-21-chapter-cards.md`. Follow it task-by-task (TDD: write the failing test → run red → implement → run green → commit). Branch `stage-4-chapter-cards` is already checked out; spec + plan are on it.

- ✅ **Task 1 DONE** (commit `7756853`, reviewed clean): `ScriptChunk.chapter?`; `src/chapters.ts` (`deriveChapters`, `chapterOffsetSec`, `CARD_DURATION_SEC`); `src/cards.ts` (`cardSvg`, `renderCardPng` via `@resvg/resvg-js` — confirmed working under Bun — `renderCardClip`). Suite: 73/73 on the branch.
- ⬜ **Task 2 — `insertChapterCards`** (`src/finish.ts`): cut the already-captioned body at each chapter offset and concat `card+piece+card+piece…` (captions are pre-burned, so cutting doesn't disturb them). Plan has the full function + integration test.
- ⬜ **Task 3 — music + wiring + QA**: `src/music.ts` `pickTrack` (pure, deterministic per slug); wire `scripts/make-video.ts` (derive chapters → pick/persist `videos/<slug>/music.json` → render cards w/ `musicOffsetSec: 0` → `insertChapterCards` → `wrapVideo`; `--no-cards` flag); **add `chapters × CARD_DURATION_SEC` to `runQa`'s expected duration** (else the duration check fails once cards exist). Plan has all the code.

**After Task 3:** `bun test` (all green) → verify on the sample (add `chapter` fields to `videos/sample/script.json`, `bun run make-video sample`, eyeball a card frame, `bun run qa sample` passes) → merge `stage-4-chapter-cards` to `main` with `--no-ff` and re-run the suite on `main`. (Cards need no skill change, so no `aimhco/skills` sync this slice.)

## What Codex should NOT attempt (needs the Claude Code session / Tella MCP)
- **Tella MCP operations** (applying zoom/blur on the original recording, re-export) — only available in the Claude Code session. **Chapter cards do NOT need Tella**, so you can fully build this slice. Leave the **blur** slice (needs Tella MCP) for when Claude Code is back.
- **YouTube upload** — needs Google OAuth creds; deferred regardless.

## Backlog (after cards)
- Layouts (mostly a Tella recording convention — body=screen-only fullscreen [already], intro=camera+background).
- Blur (needs Tella MCP).
- Intro music + spoken-outro redesign (reuse `music.json`; the outro = a Claude-written script synthesized via ElevenLabs + a fixed `Outro_` track on top).
- "AIMH.co" TTS pronunciation fix + word-level captions (pair with the new-mic voice re-clone).
- Stage 7 YouTube publish (upload `private` first; unverified projects are private-only until the API audit).
