# Chapter Cards Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Insert branded chapter title cards (with music) at each chapter's start, without disturbing the burned captions.

**Architecture:** Pure chapter derivation + SVG card template in `src/chapters.ts`/`src/cards.ts`; `@resvg/resvg-js` rasterizes cards (ffmpeg `drawtext` is unusable here); ffmpeg renders each card to a 2.5s clip with a faded `Body_` music bed; `insertChapterCards` cuts the already-captioned body at chapter offsets and splices cards between the pieces; `make-video` wires it in before the wrap.

**Tech Stack:** Bun + TypeScript, `bun test`, `@resvg/resvg-js` (SVG→PNG), ffmpeg via `FFMPEG`.

## Global Constraints

- Package manager **bun**, never npm. ffmpeg/ffprobe via `FFMPEG`/`FFPROBE` from `src/ffmpeg.ts` (never bare). **No `drawtext`** — text is rendered via `@resvg/resvg-js`.
- All generated frames/PNGs live under `videos/<slug>/work/` (never `/tmp` — tesseract/other tools can't read `/tmp` here; and it keeps artifacts gitignored).
- Card constants: `CARD_DURATION_SEC = 2.5` (defined in `src/chapters.ts` so light consumers like `qa.ts` can import it without pulling in resvg), `CARD_FADE_SEC = 0.4`, `CARD_MUSIC_DB = -10`, `CARD_BG = "#6B5FA8"`, `CARD_FG = "#F5EFE3"`.
- A card is inserted at the **start of each chapter** (including chapter 1). Captions are **pre-burned** on the body, so cutting+splicing the body never affects caption timing.
- Music: deterministic `Body_` track per slug, persisted to `videos/<slug>/music.json`; **every card uses `musicOffsetSec = 0`**.
- `--no-cards` skips the whole step; no chapters defined ⇒ skip (today's behavior).
- **`runQa` expected duration must add `chapters × CARD_DURATION_SEC`** when chapters exist, or the duration check fails.
- Match existing test style (`tests/align.test.ts`): `import { expect, test } from "bun:test"`; integration tests generate their own media; route ffmpeg/ffprobe through the configurable binaries.

## File Structure

- **Modify** `src/types.ts` — `ScriptChunk.chapter?: string`.
- **Create** `src/chapters.ts` — `Chapter`, `deriveChapters`, `chapterOffsetSec`, `CARD_DURATION_SEC`.
- **Create** `src/cards.ts` — `cardSvg` (pure), `renderCardPng`, `renderCardClip`.
- **Modify** `src/finish.ts` — `insertChapterCards` (+ `ffprobeDuration` import).
- **Create** `src/music.ts` — `pickTrack` (pure).
- **Modify** `src/qa.ts` — expected duration includes cards.
- **Modify** `scripts/make-video.ts` — wire cards in before the wrap.
- **Modify** `package.json` (via `bun add @resvg/resvg-js`).
- **Create** `tests/chapters.test.ts`, `tests/cards.test.ts`, `tests/music.test.ts`; **modify** `tests/finish.test.ts`.

---

## Task 1: Chapters + card rendering

**Files:**
- Modify: `src/types.ts`
- Create: `src/chapters.ts`, `src/cards.ts`
- Test: `tests/chapters.test.ts`, `tests/cards.test.ts`

**Interfaces:**
- Produces: `Chapter { index: number; title: string; startChunkIndex: number }`; `deriveChapters(script: ScriptChunk[]): Chapter[]`; `chapterOffsetSec(startChunkIndex: number, vo: VoChunk[]): number`; `CARD_DURATION_SEC: number`; `cardSvg(opts: { number: number; title: string }): string`; `renderCardPng(svg: string, outPath: string): Promise<void>`; `renderCardClip(opts: { png: string; out: string; durationSec?: number; musicFile?: string; musicOffsetSec?: number }): Promise<string>`.

- [ ] **Step 1: Add the dependency**

Run: `bun add @resvg/resvg-js`
Expected: adds `@resvg/resvg-js` to `package.json` dependencies.

- [ ] **Step 2: Add the type**

In `src/types.ts`, add `chapter?` to `ScriptChunk` (alongside the existing `zoom?`):

```ts
export interface ScriptChunk {
  id: string; text: string; sourceStart: number; sourceEnd: number;
  zoom?: ZoomCue;
  chapter?: string;
}
```

- [ ] **Step 3: Write the failing tests for chapters**

Create `tests/chapters.test.ts`:

```ts
import { expect, test } from "bun:test";
import { deriveChapters, chapterOffsetSec } from "../src/chapters";
import type { ScriptChunk, VoChunk } from "../src/types";

const chunk = (id: string, chapter?: string): ScriptChunk =>
  ({ id, text: "x", sourceStart: 0, sourceEnd: 1, chapter });
const vo = (id: string, duration: number): VoChunk => ({ id, file: `vo/${id}.mp3`, duration });

test("deriveChapters: chunks with a chapter field become chapters, 1-based", () => {
  const chapters = deriveChapters([chunk("c1", "Intro"), chunk("c2"), chunk("c3", "How It Works")]);
  expect(chapters).toEqual([
    { index: 1, title: "Intro", startChunkIndex: 0 },
    { index: 2, title: "How It Works", startChunkIndex: 2 },
  ]);
});

test("deriveChapters: none → empty", () => {
  expect(deriveChapters([chunk("c1"), chunk("c2")])).toEqual([]);
});

test("chapterOffsetSec: sum of VO durations before the start chunk", () => {
  const v = [vo("c1", 4), vo("c2", 6), vo("c3", 5)];
  expect(chapterOffsetSec(0, v)).toBeCloseTo(0);
  expect(chapterOffsetSec(2, v)).toBeCloseTo(10);
});
```

- [ ] **Step 4: Run to verify it fails**

Run: `bun test tests/chapters.test.ts`
Expected: FAIL — cannot resolve `../src/chapters`.

- [ ] **Step 5: Implement `src/chapters.ts`**

```ts
import type { ScriptChunk, VoChunk } from "./types";

// Card timing lives here (not cards.ts) so light consumers (qa.ts) can import it
// without pulling in the resvg native module.
export const CARD_DURATION_SEC = 2.5;

export interface Chapter { index: number; title: string; startChunkIndex: number }

// Pure: chapters are chunks carrying a non-empty `chapter` field, in order (1-based index).
export function deriveChapters(script: ScriptChunk[]): Chapter[] {
  const chapters: Chapter[] = [];
  script.forEach((c, i) => {
    const title = c.chapter?.trim();
    if (title) chapters.push({ index: chapters.length + 1, title, startChunkIndex: i });
  });
  return chapters;
}

// Pure: a chapter's start offset on the body timeline = Σ VO durations of chunks before it.
// `vo` must be in the same order as `script`.
export function chapterOffsetSec(startChunkIndex: number, vo: VoChunk[]): number {
  return vo.slice(0, startChunkIndex).reduce((n, v) => n + v.duration, 0);
}
```

- [ ] **Step 6: Run to verify chapters pass**

Run: `bun test tests/chapters.test.ts`
Expected: PASS (3 tests).

- [ ] **Step 7: Write the failing tests for cards**

Create `tests/cards.test.ts`:

```ts
import { expect, test } from "bun:test";
import { cardSvg, renderCardPng } from "../src/cards";
import { FFPROBE } from "../src/ffmpeg";

test("cardSvg includes the chapter number and an XML-escaped title", () => {
  const svg = cardSvg({ number: 2, title: "Tools & <Tricks>" });
  expect(svg).toContain("CHAPTER 2");
  expect(svg).toContain("Tools &amp; &lt;Tricks&gt;");
  expect(svg).toMatch(/^<svg[\s\S]*<\/svg>$/);
});

test("renderCardPng writes a 1920x1080 PNG", async () => {
  const dir = `${import.meta.dir}/fixtures/cards`;
  await Bun.$`mkdir -p ${dir}`;
  const out = `${dir}/card.png`;
  await renderCardPng(cardSvg({ number: 1, title: "Introduction" }), out);
  const size = (await Bun.$`${FFPROBE} -v error -select_streams v:0 -show_entries stream=width,height -of csv=p=0:s=x ${out}`.text()).trim();
  expect(size).toBe("1920x1080");
});
```

- [ ] **Step 8: Run to verify it fails**

Run: `bun test tests/cards.test.ts`
Expected: FAIL — cannot resolve `../src/cards`.

- [ ] **Step 9: Implement `src/cards.ts`**

```ts
import { Resvg } from "@resvg/resvg-js";
import { FFMPEG } from "./ffmpeg";
import { CARD_DURATION_SEC } from "./chapters";

const CARD_BG = "#6B5FA8";
const CARD_FG = "#F5EFE3";
const CARD_FADE_SEC = 0.4;
const CARD_MUSIC_DB = -10;

const xmlEscape = (s: string) =>
  s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&apos;");

// Pure: a 1920x1080 branded title card SVG.
export function cardSvg(opts: { number: number; title: string }): string {
  const title = xmlEscape(opts.title);
  return `<svg xmlns="http://www.w3.org/2000/svg" width="1920" height="1080" viewBox="0 0 1920 1080">` +
    `<rect width="1920" height="1080" fill="${CARD_BG}"/>` +
    `<text x="960" y="470" fill="${CARD_FG}" font-family="Helvetica, Arial, sans-serif" font-size="44" letter-spacing="8" text-anchor="middle" opacity="0.85">CHAPTER ${opts.number}</text>` +
    `<rect x="810" y="508" width="300" height="3" fill="${CARD_FG}" opacity="0.6"/>` +
    `<text x="960" y="630" fill="${CARD_FG}" font-family="Helvetica, Arial, sans-serif" font-size="84" font-weight="bold" text-anchor="middle">${title}</text>` +
    `</svg>`;
}

// I/O: render an SVG string to a PNG file.
export async function renderCardPng(svg: string, outPath: string): Promise<void> {
  const resvg = new Resvg(svg, {
    fitTo: { mode: "width", value: 1920 },
    font: { loadSystemFonts: true, defaultFontFamily: "Helvetica" },
  });
  await Bun.write(outPath, resvg.render().asPng());
}

// I/O: a card clip — PNG held for durationSec at 1080p/30 with fades, plus an
// optional faded music bed (silent audio otherwise, so concat stays uniform).
export async function renderCardClip(opts: {
  png: string; out: string; durationSec?: number; musicFile?: string; musicOffsetSec?: number;
}): Promise<string> {
  const dur = opts.durationSec ?? CARD_DURATION_SEC;
  const outFade = (dur - CARD_FADE_SEC).toFixed(2);
  const vf = `scale=1920:1080,fade=t=in:st=0:d=${CARD_FADE_SEC},fade=t=out:st=${outFade}:d=${CARD_FADE_SEC},format=yuv420p`;
  if (opts.musicFile) {
    const af = `afade=t=in:st=0:d=${CARD_FADE_SEC},afade=t=out:st=${outFade}:d=${CARD_FADE_SEC},volume=${CARD_MUSIC_DB}dB`;
    await Bun.$`${FFMPEG} -y -loop 1 -t ${dur} -i ${opts.png} -ss ${opts.musicOffsetSec ?? 0} -t ${dur} -i ${opts.musicFile} \
      -vf ${vf} -af ${af} -r 30 -c:v libx264 -crf 18 -preset medium -c:a aac -b:a 160k -ar 48000 -ac 2 -shortest ${opts.out}`.quiet();
  } else {
    await Bun.$`${FFMPEG} -y -loop 1 -t ${dur} -i ${opts.png} -f lavfi -t ${dur} -i anullsrc=channel_layout=stereo:sample_rate=48000 \
      -vf ${vf} -r 30 -c:v libx264 -crf 18 -preset medium -c:a aac -b:a 160k -shortest ${opts.out}`.quiet();
  }
  return opts.out;
}
```

- [ ] **Step 10: Run to verify cards pass**

Run: `bun test tests/cards.test.ts`
Expected: PASS (2 tests). If the PNG test fails with a font error, the resvg font config needs a family present on the box — but `loadSystemFonts` + Helvetica works on macOS; report if not.

- [ ] **Step 11: Full suite + commit**

Run: `bun test` (all green), then:

```bash
git add package.json bun.lock src/types.ts src/chapters.ts src/cards.ts tests/chapters.test.ts tests/cards.test.ts
git commit -m "feat: chapter derivation + branded SVG card rendering"
```

---

## Task 2: Splice cards into the body

**Files:**
- Modify: `src/finish.ts`
- Test: `tests/finish.test.ts`

**Interfaces:**
- Consumes: `ffprobeDuration` from `src/ffprobe.ts`; existing `concatLine`/`runStage`/`FFMPEG` in `finish.ts`.
- Produces: `insertChapterCards(opts: { body: string; cards: { clip: string; atSec: number }[]; workDir: string; out: string }): Promise<string>`.

- [ ] **Step 1: Write the failing integration test**

In `tests/finish.test.ts`, add:

```ts
test("insertChapterCards splices a card into the body and extends duration", async () => {
  const dir = `${import.meta.dir}/fixtures/cards-insert`;
  await Bun.$`mkdir -p ${dir}`;
  // 6s body (color+audio) and a 2.5s "card" (color+audio).
  await Bun.$`${FFMPEG} -y -f lavfi -i color=c=blue:s=1920x1080:d=6 -f lavfi -i sine=frequency=440:duration=6 -pix_fmt yuv420p -r 30 -c:v libx264 -c:a aac -shortest ${dir}/body.mp4`.quiet();
  await Bun.$`${FFMPEG} -y -f lavfi -i color=c=purple:s=1920x1080:d=2.5 -f lavfi -i sine=frequency=330:duration=2.5 -pix_fmt yuv420p -r 30 -c:v libx264 -c:a aac -shortest ${dir}/card.mp4`.quiet();

  const out = await insertChapterCards({
    body: `${dir}/body.mp4`, cards: [{ clip: `${dir}/card.mp4`, atSec: 3 }], workDir: `${dir}/work`, out: `${dir}/out.mp4`,
  });
  const dur = parseFloat((await Bun.$`${FFPROBE} -v error -show_entries format=duration -of default=noprint_wrappers=1:nokey=1 ${out}`.text()).trim());
  expect(dur).toBeGreaterThan(8.0);  // 6 + 2.5 ≈ 8.5
  expect(dur).toBeLessThan(9.0);
});
```

(`FFMPEG`/`FFPROBE` are already imported in `tests/finish.test.ts`.)

- [ ] **Step 2: Run to verify it fails**

Run: `bun test tests/finish.test.ts`
Expected: FAIL — `insertChapterCards` is not exported.

- [ ] **Step 3: Implement `insertChapterCards`**

In `src/finish.ts`, add the import (top, with the others):

```ts
import { ffprobeDuration } from "./ffprobe";
```

Add the function (e.g. after `overlayLogo`):

```ts
// Splice chapter cards into the (already-captioned) body: cut the body at each
// card's atSec and concat card+piece+card+piece…. Captions are pre-burned, so
// cutting doesn't disturb them. Re-encodes for a clean, uniform concat.
export async function insertChapterCards(opts: {
  body: string; cards: { clip: string; atSec: number }[]; workDir: string; out: string;
}): Promise<string> {
  if (opts.cards.length === 0) { await Bun.$`cp ${opts.body} ${opts.out}`; return opts.out; }
  await Bun.$`mkdir -p ${opts.workDir}`;
  const bodyDur = await ffprobeDuration(opts.body);
  const cards = [...opts.cards].sort((a, b) => a.atSec - b.atSec);

  const cut = async (start: number, end: number, name: string): Promise<string> => {
    const p = `${opts.workDir}/${name}.mp4`;
    await runStage(`cut body ${name}`, () => Bun.$`${FFMPEG} -y -ss ${start.toFixed(3)} -t ${(end - start).toFixed(3)} -i ${opts.body} \
      -r 30 -pix_fmt yuv420p -c:v libx264 -crf 18 -preset medium -c:a aac -b:a 160k -ar 48000 -ac 2 ${p}`.quiet());
    return p;
  };

  const parts: string[] = [];
  if (cards[0]!.atSec > 0.05) parts.push(await cut(0, cards[0]!.atSec, "cardpre"));
  for (let k = 0; k < cards.length; k++) {
    parts.push(cards[k]!.clip);
    const start = cards[k]!.atSec;
    const end = k + 1 < cards.length ? cards[k + 1]!.atSec : bodyDur;
    if (end - start > 0.05) parts.push(await cut(start, end, `cardpiece_${k}`));
  }

  const listFile = `${opts.workDir}/cards.txt`;
  await Bun.write(listFile, parts.map(concatLine).join("\n"));
  await runStage("concat cards", () => Bun.$`${FFMPEG} -y -f concat -safe 0 -i ${listFile} \
    -r 30 -pix_fmt yuv420p -c:v libx264 -crf 18 -preset medium -c:a aac -b:a 160k -ar 48000 -ac 2 ${opts.out}`.quiet());
  return opts.out;
}
```

- [ ] **Step 4: Run to verify it passes**

Run: `bun test tests/finish.test.ts`
Expected: PASS — existing finish tests + the new insertion test.

- [ ] **Step 5: Full suite + commit**

Run: `bun test` (all green), then:

```bash
git add src/finish.ts tests/finish.test.ts
git commit -m "feat: insertChapterCards splices cards into the captioned body"
```

---

## Task 3: Music pick + make-video wiring + QA duration

**Files:**
- Create: `src/music.ts`
- Modify: `src/qa.ts`, `scripts/make-video.ts`
- Test: `tests/music.test.ts`

**Interfaces:**
- Consumes: `deriveChapters`/`chapterOffsetSec`/`CARD_DURATION_SEC` (Task 1); `cardSvg`/`renderCardPng`/`renderCardClip` (Task 1); `insertChapterCards` (Task 2).
- Produces: `pickTrack(slug: string, tracks: string[]): string | undefined`.

- [ ] **Step 1: Write the failing test for `pickTrack`**

Create `tests/music.test.ts`:

```ts
import { expect, test } from "bun:test";
import { pickTrack } from "../src/music";

const tracks = ["a.mp3", "b.mp3", "c.mp3"];

test("pickTrack is deterministic for a slug", () => {
  expect(pickTrack("sample", tracks)).toBe(pickTrack("sample", tracks));
});

test("pickTrack varies by slug (not all the same)", () => {
  const picks = new Set(["sample", "demo", "intro-x", "video42"].map((s) => pickTrack(s, tracks)));
  expect(picks.size).toBeGreaterThan(1);
});

test("pickTrack returns a member of the list, undefined when empty", () => {
  expect(tracks).toContain(pickTrack("sample", tracks)!);
  expect(pickTrack("sample", [])).toBeUndefined();
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `bun test tests/music.test.ts`
Expected: FAIL — cannot resolve `../src/music`.

- [ ] **Step 3: Implement `src/music.ts`**

```ts
// Pure: deterministically pick a track for a slug (stable across runs, varies by slug).
export function pickTrack(slug: string, tracks: string[]): string | undefined {
  if (tracks.length === 0) return undefined;
  let h = 0;
  for (let i = 0; i < slug.length; i++) h = (h * 31 + slug.charCodeAt(i)) >>> 0;
  return tracks[h % tracks.length];
}
```

- [ ] **Step 4: Run to verify it passes**

Run: `bun test tests/music.test.ts`
Expected: PASS (3 tests).

- [ ] **Step 5: Make QA account for card duration**

In `src/qa.ts`, add to the imports:

```ts
import { deriveChapters, CARD_DURATION_SEC } from "./chapters";
```

In `runQa`, after `expectedDurationSec` has been computed from VO + intro + outro (just before the `evaluateQa` call), add the cards:

```ts
  expectedDurationSec += deriveChapters(script).length * CARD_DURATION_SEC;
```

- [ ] **Step 6: Wire cards into make-video**

In `scripts/make-video.ts`, add imports:

```ts
import { deriveChapters, chapterOffsetSec } from "../src/chapters";
import { cardSvg, renderCardPng, renderCardClip } from "../src/cards";
import { insertChapterCards } from "../src/finish";
import { pickTrack } from "../src/music";
```

(extend the existing `../src/finish` import to include `insertChapterCards` rather than adding a duplicate import line).

After `assembleVideo` returns `body` and before the `wrapVideo` call, insert:

```ts
// Chapter cards: render a branded card per chapter and splice them into the body. --no-cards skips.
let bodyForWrap = body;
const chapters = process.argv.includes("--no-cards") ? [] : deriveChapters(script);
if (chapters.length) {
  // Deterministic body-music pick, persisted so reruns are stable.
  const musicJson = `${dir}/music.json`;
  let bodyTrack: string | undefined;
  if (await Bun.file(musicJson).exists()) {
    bodyTrack = ((await Bun.file(musicJson).json()) as { bodyTrack?: string }).bodyTrack;
  } else {
    const tracks = (await Array.fromAsync(new Bun.Glob("Body_*.mp3").scan({ cwd: "assets/music", absolute: true }))).sort();
    bodyTrack = pickTrack(slug, tracks);
    await Bun.write(musicJson, JSON.stringify({ bodyTrack: bodyTrack ?? null }, null, 2));
  }

  const cards: { clip: string; atSec: number }[] = [];
  for (const ch of chapters) {
    const png = `${dir}/work/card_${ch.index}.png`;
    await renderCardPng(cardSvg({ number: ch.index, title: ch.title }), png);
    const clip = `${dir}/work/card_${ch.index}.mp4`;
    await renderCardClip({ png, out: clip, musicFile: bodyTrack, musicOffsetSec: 0 });
    cards.push({ clip, atSec: chapterOffsetSec(ch.startChunkIndex, vo) });
  }
  console.log(`+ chapters: ${chapters.length} card(s)${bodyTrack ? ` (music: ${bodyTrack.split("/").pop()})` : " (no music)"}`);
  bodyForWrap = await insertChapterCards({ body, cards, workDir: `${dir}/work`, out: `${dir}/body-cards.mp4` });
}
```

Then change the `wrapVideo` call to use `bodyForWrap`:

```ts
const out = await wrapVideo({ body: bodyForWrap, intro, outro, workDir: `${dir}/work`, out: `${dir}/final.mp4` });
```

(The existing logo overlay step after `wrapVideo` is unchanged — it watermarks the whole final, cards included.)

- [ ] **Step 7: Type-check + full suite**

Run: `bunx tsc --noEmit` (no errors), then `bun test` (all green).

- [ ] **Step 8: Verify end-to-end on the sample**

Add `chapter` fields to a few chunks in `videos/sample/script.json` (e.g. `c01` → "Introduction", `c04` → "Why I Built This", `c08` → "How It Works", `c11` → "Get The Code"), then:

```bash
bun run make-video sample
```

Expected console: a `+ chapters: 4 card(s) (music: Body_*.mp3)` line; `done → videos/sample/final.mp4`. Then eyeball a card and confirm QA still passes:

```bash
/usr/local/opt/ffmpeg-full/bin/ffmpeg -y -ss 19.5 -i videos/sample/final.mp4 -frames:v 1 videos/sample/work/card_check.jpg -loglevel error && echo "wrote card_check.jpg"
bun run qa sample; echo "exit=$?"
```

Expected: the frame shows a purple card with "CHAPTER N" + the title (controller eyeballs placement/colors); `qa sample` passes all checks (the duration check now includes the cards) and exits 0. Report the card-frame path + qa output.

- [ ] **Step 9: Commit**

```bash
git add src/music.ts src/qa.ts scripts/make-video.ts tests/music.test.ts
git commit -m "feat: make-video renders + splices chapter cards with music; qa counts card duration"
```

---

## Self-Review

**Spec coverage:**
- Chapters from `script.json` (`chapter?`), auto-derived → Task 1 (`deriveChapters` + type). ✓
- Branded SVG card via resvg (no drawtext) → Task 1 (`cardSvg`/`renderCardPng`). ✓
- Card clip (2.5s, fades, faded Body_ music) → Task 1 (`renderCardClip`). ✓
- Insert at each chapter start; captions untouched (cut pre-captioned body) → Task 2 (`insertChapterCards`). ✓
- Deterministic music pick + `music.json` sidecar, offset 0 → Task 3 (`pickTrack` + wiring). ✓
- `--no-cards`, no-chapters no-op → Task 3 wiring. ✓
- runQa expected duration += cards → Task 3. ✓
- Constants in `chapters.ts` so qa avoids resvg → Tasks 1 & 3. ✓
- Card placement incl. chapter 1 + optional prefix → Task 2 (`cardpre`). ✓

**Placeholder scan:** none — full code + exact commands per step.

**Type consistency:** `Chapter`/`deriveChapters`/`chapterOffsetSec`/`CARD_DURATION_SEC` defined in Task 1 and consumed by Task 3 (`make-video`, `qa`); `cardSvg`/`renderCardPng`/`renderCardClip` signatures match their Task-3 calls; `insertChapterCards({body,cards,workDir,out})` defined in Task 2 and called identically in Task 3; `pickTrack(slug, tracks)` defined in Task 3 and used in the same task. `vo` passed to `chapterOffsetSec` is the in-order `VoChunk[]` make-video already builds. ✓
