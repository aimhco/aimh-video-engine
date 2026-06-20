# Logo Overlay Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Overlay `assets/logo.png` as a small top-right watermark over the whole final video, on by default.

**Architecture:** A dedicated `overlayLogo` step in `src/finish.ts` runs one ffmpeg pass (scale logo → add alpha at 0.85 → overlay top-right → re-encode video, copy audio). `make-video` runs it after `wrapVideo` (temp file + `mv`), when `assets/logo.png` exists and `--no-logo` isn't passed.

**Tech Stack:** Bun + TypeScript, `bun test`. FFmpeg `overlay`/`colorchannelmixer` via the configurable `FFMPEG` binary.

## Global Constraints

- Package manager: **bun** (never npm). `bun test` for tests, `bun run make-video <slug>` for the CLI.
- ffmpeg/ffprobe are invoked through `FFMPEG`/`FFPROBE` from `src/ffmpeg.ts` (default to PATH; overridable via `.env`). Never hardcode bare `ffmpeg`/`ffprobe`.
- Watermark: whole final video, **top-right**. Constants: `LOGO_WIDTH = 150` px, `LOGO_MARGIN = 24` px, `LOGO_OPACITY = 0.85`.
- The logo PNG is opaque (rgb24) — apply `format=rgba` before `colorchannelmixer=aa=` to set opacity.
- Audio is carried through with `-map 0:a -c:a copy` (no audio re-encode).
- On by default when `assets/logo.png` exists; `--no-logo` skips. Graceful no-op when the asset is absent.
- Match existing test style (`tests/finish.test.ts`): `import { expect, test } from "bun:test"`, tests generate their own media with ffmpeg, route ffmpeg/ffprobe through `FFMPEG`/`FFPROBE`.

---

## File Structure

- **Modify** `src/finish.ts` — add `LOGO_*` constants and the `overlayLogo` function.
- **Modify** `scripts/make-video.ts` — apply `overlayLogo` after `wrapVideo`.
- **Create** `tests/logo.test.ts` — integration test for `overlayLogo`.
- **Add** `assets/logo.png` — commit the brand asset (already on disk).

---

## Task 1: `overlayLogo` in finish.ts

**Files:**
- Modify: `src/finish.ts`
- Test: `tests/logo.test.ts`

**Interfaces:**
- Consumes: `FFMPEG` from `src/ffmpeg.ts`; the existing `runStage` helper in `finish.ts`.
- Produces: `overlayLogo(opts: { video: string; logo: string; out: string }): Promise<string>` — writes `out` (the `video` with `logo` watermarked top-right) and returns `out`.

- [ ] **Step 1: Write the failing integration test**

Create `tests/logo.test.ts`:

```ts
import { expect, test } from "bun:test";
import { overlayLogo } from "../src/finish";
import { FFMPEG, FFPROBE } from "../src/ffmpeg";

test("overlayLogo watermarks the video and preserves audio", async () => {
  const dir = `${import.meta.dir}/fixtures/logo`;
  await Bun.$`mkdir -p ${dir}`;
  // A 2s clip WITH audio, and a small opaque logo PNG.
  await Bun.$`${FFMPEG} -y -f lavfi -i color=c=blue:s=320x240:d=2 -f lavfi -i sine=frequency=440:duration=2 -pix_fmt yuv420p -c:a aac -shortest ${dir}/in.mp4`.quiet();
  await Bun.$`${FFMPEG} -y -f lavfi -i color=c=purple:s=64x64:d=1 -frames:v 1 ${dir}/logo.png`.quiet();

  const out = await overlayLogo({ video: `${dir}/in.mp4`, logo: `${dir}/logo.png`, out: `${dir}/out.mp4` });

  expect(out).toBe(`${dir}/out.mp4`);
  const streams = await Bun.$`${FFPROBE} -v error -show_entries stream=codec_type -of csv=p=0 ${out}`.text();
  expect(streams).toContain("video");
  expect(streams).toContain("audio");
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `bun test tests/logo.test.ts`
Expected: FAIL — `overlayLogo` is not exported by `../src/finish`.

- [ ] **Step 3: Implement `overlayLogo`**

In `src/finish.ts`, add the constants near `CAPTION_STYLE` (after the imports):

```ts
// Logo watermark: small, top-right, slightly transparent. Output is always 1080p,
// so a fixed pixel width is fine. The PNG is opaque, so add alpha before setting it.
const LOGO_WIDTH = 150;    // px (~8% of 1920)
const LOGO_MARGIN = 24;    // px from the top/right edges
const LOGO_OPACITY = 0.85;
```

Add the function (e.g. after `wrapVideo`):

```ts
// Overlay a logo as a top-right watermark over the whole video. Re-encodes video,
// copies audio. ffmpeg can't read+write the same path — caller passes a distinct out.
export async function overlayLogo(opts: { video: string; logo: string; out: string }): Promise<string> {
  const filter =
    `[1:v]scale=${LOGO_WIDTH}:-1,format=rgba,colorchannelmixer=aa=${LOGO_OPACITY}[lg];` +
    `[0:v][lg]overlay=W-w-${LOGO_MARGIN}:${LOGO_MARGIN}`;
  await runStage("overlay logo", () => Bun.$`${FFMPEG} -y -i ${opts.video} -i ${opts.logo} \
    -filter_complex ${filter} -map 0:a -c:a copy -c:v libx264 -crf 18 -preset medium -pix_fmt yuv420p ${opts.out}`.quiet());
  return opts.out;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `bun test tests/logo.test.ts`
Expected: PASS (1 test).

- [ ] **Step 5: Run the full suite**

Run: `bun test`
Expected: PASS — all suites green.

- [ ] **Step 6: Commit**

```bash
git add src/finish.ts tests/logo.test.ts
git commit -m "feat: overlayLogo — top-right watermark over the whole video"
```

---

## Task 2: Apply the watermark in make-video + commit the asset

**Files:**
- Modify: `scripts/make-video.ts`
- Add: `assets/logo.png`

**Interfaces:**
- Consumes: `overlayLogo` from `src/finish.ts` (Task 1).

- [ ] **Step 1: Import `overlayLogo`**

In `scripts/make-video.ts`, update the finish import:

```ts
import { assembleVideo, wrapVideo, overlayLogo } from "../src/finish";
```

- [ ] **Step 2: Apply after the wrap**

Replace the final two lines:

```ts
const out = await wrapVideo({ body, intro, outro, workDir: `${dir}/work`, out: `${dir}/final.mp4` });
console.log(`done → ${out}`);
```

with:

```ts
const out = await wrapVideo({ body, intro, outro, workDir: `${dir}/work`, out: `${dir}/final.mp4` });

// Branding: overlay the logo watermark over the whole final video. On by default; --no-logo skips.
const logoEnabled = !process.argv.includes("--no-logo");
const logo = logoEnabled && (await Bun.file("assets/logo.png").exists()) ? "assets/logo.png" : undefined;
if (logo) {
  const tmp = `${dir}/work/logo.mp4`;
  await overlayLogo({ video: out, logo, out: tmp });
  await Bun.$`mv ${tmp} ${out}`;
  console.log(`+ logo: ${logo}`);
}

console.log(`done → ${out}`);
```

- [ ] **Step 3: Type-check**

Run: `bunx tsc --noEmit`
Expected: no errors.

- [ ] **Step 4: Verify end-to-end on the real sample**

Run: `bun run make-video sample`
Expected console: the captions line, segment table, intro/outro lines, a `+ logo: assets/logo.png` line, and `done → videos/sample/final.mp4`.

Then sample a final frame for the controller to eyeball placement:

```bash
/usr/local/opt/ffmpeg-full/bin/ffmpeg -y -ss 8 -i videos/sample/final.mp4 -frames:v 1 /tmp/logo_check.jpg -loglevel error && echo "wrote /tmp/logo_check.jpg"
```

Expected: a watermark appears top-right at a reasonable size/opacity. (Controller eyeballs; tune `LOGO_WIDTH`/`LOGO_MARGIN`/`LOGO_OPACITY` only if clearly off.)

- [ ] **Step 5: Confirm `--no-logo` skips**

Run: `bun run make-video sample --no-logo 2>&1 | grep -c "+ logo:" || true`
Expected: prints `0`.

- [ ] **Step 6: Commit (code + asset)**

```bash
git add scripts/make-video.ts assets/logo.png
git commit -m "feat: make-video overlays the logo watermark by default (--no-logo to skip)"
```

---

## Self-Review

**Spec coverage:**
- Whole-final, top-right watermark via dedicated step → Task 1 `overlayLogo`. ✓
- Constants (150/24/0.85), opaque-PNG alpha handling, audio copy → Task 1. ✓
- Applied after wrap, temp+mv, default-on, `--no-logo`, graceful no-op → Task 2. ✓
- Asset committed → Task 2. ✓
- Routed through `FFMPEG` → Task 1 (impl + test) and Task 2 (verify cmds). ✓

**Placeholder scan:** none — every step has full code and exact commands.

**Type consistency:** `overlayLogo({ video, logo, out })` defined in Task 1 and called identically in Task 2; uses `FFMPEG`/`runStage` already present in `finish.ts`. ✓
