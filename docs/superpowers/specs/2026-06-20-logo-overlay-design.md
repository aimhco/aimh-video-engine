# Design — Logo overlay watermark (Stage 5 branding)

**Date:** 2026-06-20
**Status:** Approved, ready for implementation plan
**Roadmap slot:** Stage 5 (Mux/Assemble) — the "branded" piece of the /goal. Music is a separate later slice (needs curated tracks).

## Problem

The final video has no branding. The /goal calls for a "branded" video. We have a logo (`assets/logo.png`); we want it as a persistent corner watermark on the finished video.

## Goals

- Overlay `assets/logo.png` as a small **top-right** watermark over the **whole final video** (intro + body + outro) — standard channel-watermark behavior.
- Graceful no-op when the asset is absent (like intro/outro).
- Keep it a self-contained, testable step; don't entangle it with the body/caption re-encode.
- On by default; easy to skip.

## Non-goals (this slice)

- Music bed (separate Stage-5 slice; blocked on curated royalty-free tracks).
- A transparent-background logo / animated logo / logo on chapter cards. The current asset is an opaque square; we apply opacity in-filter and place it small. Easy to swap the file later.
- Per-video logo overrides, timed/animated reveal, configurable position via CLI.

## Decisions (settled in brainstorming)

| Decision | Choice | Why |
|----------|--------|-----|
| Coverage | **Whole final video**, as a dedicated step after `wrapVideo` | Standard watermark (present throughout); cleanest code (one self-contained function); intro/outro get branded too. |
| Position | **Top-right** | Captions live bottom-center — top-right never clashes. |
| Size / opacity | width **150px** (~8% of 1920), **24px** margin, **0.85** opacity | Small, unobtrusive; opacity softens the opaque purple background. |
| Asset | `assets/logo.png` (committed; `assets/` is tracked) | README convention; swap the file later (e.g. a transparent version). |
| Toggle | On by default when the asset exists; `--no-logo` skips | "Branded" is in the goal; still skippable. |

## Architecture

### `src/finish.ts` — new `overlayLogo` step

```ts
export async function overlayLogo(opts: {
  video: string; logo: string; out: string;
}): Promise<string>;
```

Runs one ffmpeg pass: main video + logo image → logo scaled, alpha-applied, overlaid top-right; video re-encoded (libx264 crf 18), **audio copied** through.

Constants (near the top of `finish.ts`, beside `CAPTION_STYLE`):
```ts
const LOGO_WIDTH = 150;    // px (~8% of 1920); output is always 1080p
const LOGO_MARGIN = 24;    // px from the top/right edges
const LOGO_OPACITY = 0.85;
```

ffmpeg (built as a single interpolated `filter_complex` string, like the existing `vf` strings):
```
[1:v]scale=150:-1,format=rgba,colorchannelmixer=aa=0.85[lg];[0:v][lg]overlay=W-w-24:24
```
- `scale=150:-1` sizes the logo to 150px wide, aspect-preserved.
- `format=rgba,colorchannelmixer=aa=0.85` adds an alpha channel (the PNG is opaque rgb24) and sets 85% opacity.
- `overlay=W-w-24:24` places it top-right with a 24px margin (`W`/`w` = main/overlay width).

Command shape (using the configurable `FFMPEG`):
```
ffmpeg -y -i <video> -i <logo> -filter_complex "<above>" -map 0:a -c:a copy \
  -c:v libx264 -crf 18 -preset medium -pix_fmt yuv420p <out>
```
Wrapped in the existing `runStage` error helper. `-map 0:a` carries the muxed audio through; `-c:a copy` avoids re-encoding it.

### `scripts/make-video.ts` — apply after the wrap

`wrapVideo` keeps writing `final.mp4`. Then, if logo is enabled and `assets/logo.png` exists, overlay into a temp and move it back over `final.mp4` (ffmpeg can't read+write the same path):

```ts
const out = await wrapVideo({ body, intro, outro, workDir: `${dir}/work`, out: `${dir}/final.mp4` });
const logoEnabled = !process.argv.includes("--no-logo");
const logo = logoEnabled && (await Bun.file("assets/logo.png").exists()) ? "assets/logo.png" : undefined;
if (logo) {
  const tmp = `${dir}/work/logo.mp4`;
  await overlayLogo({ video: out, logo, out: tmp });
  await Bun.$`mv ${tmp} ${out}`;
  console.log(`+ logo: ${logo}`);
}
```

## Data flow

```
final.mp4 (from wrapVideo: intro + captioned body + outro)
   │  overlayLogo (if assets/logo.png present, !--no-logo)
   │    ffmpeg: scale+alpha logo → overlay top-right → re-encode video, copy audio
   ▼  (temp → mv over final.mp4)
final.mp4 (now watermarked throughout)
```

## Error handling & edge cases

- **No asset / `--no-logo`:** step skipped; `final.mp4` is the un-watermarked wrap output.
- **Read/write same path:** avoided via temp file + `mv`.
- **Opaque PNG:** handled by `format=rgba` before `colorchannelmixer` (can't set alpha on rgb24 directly).
- **Audio passthrough:** `-c:a copy` preserves the muxed AAC; `-map 0:a` maps it (final always has audio).
- **ffmpeg failure:** surfaced via `runStage("overlay logo", …)`.
- **Quality:** one extra libx264 crf-18 pass over the final — minor, acceptable.

## Testing

- **`tests/logo.test.ts` (integration):** generate a short clip *with audio* (lavfi color + sine) and a small logo PNG (lavfi color → single frame), call `overlayLogo`, assert the output has both video and audio streams (ffprobe). Generates its own media (repo convention); routes ffmpeg/ffprobe through `FFMPEG`/`FFPROBE`.
- **Manual:** run `make-video sample`, eyeball a final frame to confirm the watermark sits top-right at a reasonable size/opacity.

## Future (out of scope)

- Music bed (next Stage-5 slice).
- Transparent/animated logo, logo on chapter cards, configurable position/size, per-video overrides.
