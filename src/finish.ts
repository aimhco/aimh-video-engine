// src/finish.ts
import { resolve } from "node:path";
import type { Segment } from "./types";
import { FFMPEG } from "./ffmpeg";
import { ffprobeDuration, ffprobeHasAudio } from "./ffprobe";

// Clean subtitle-bar style for burned-in captions (libass force_style).
const CAPTION_STYLE =
  "FontName=Arial,FontSize=18,PrimaryColour=&H00FFFFFF,BorderStyle=3,BackColour=&H80000000,Outline=1,Shadow=0,Alignment=2,MarginV=40";

// Logo watermark: small, top-right, slightly transparent. Output is always 1080p,
// so a fixed pixel width is fine. The PNG is opaque, so add alpha before setting it.
const LOGO_WIDTH = 150;    // px (~8% of 1920)
const LOGO_MARGIN = 24;    // px from the top/right edges
const LOGO_OPACITY = 0.85;
const EXTERNAL_AUDIO_FILTER = "loudnorm=I=-18:TP=-2:LRA=11";
const INTRO_MUSIC_DB = -24;
const INTRO_MUSIC_FADE_SEC = 1.0;

// A `subtitles` filter clause for the given srt path, escaped for the filtergraph.
function subtitlesClause(captionsFile: string): string {
  const p = captionsFile.replace(/\\/g, "\\\\").replace(/:/g, "\\:").replace(/'/g, "\\'");
  return `,subtitles='${p}':force_style='${CAPTION_STYLE}'`;
}

// A concat-demuxer list line: an ABSOLUTE path (list entries otherwise resolve relative to the
// list file's own directory, not the cwd) with single quotes escaped (' -> '\'').
function concatLine(path: string): string {
  return `file '${resolve(path).replace(/'/g, "'\\''")}'`;
}

// Run an FFmpeg stage, adding context to any failure.
async function runStage(stage: string, build: () => Promise<unknown>): Promise<void> {
  try {
    await build();
  } catch (err) {
    throw new Error(`ffmpeg failed during ${stage}: ${(err as Error).message}`);
  }
}

// Build one normalized video clip per segment (speed-adjusted, freeze-padded, muted).
async function renderSegment(recording: string, seg: Segment, workDir: string): Promise<string> {
  const clip = `${workDir}/${seg.id}.mp4`;
  const vf = `setpts=PTS/${seg.speedFactor},tpad=stop_mode=clone:stop_duration=${seg.padDuration.toFixed(3)}`;
  await runStage(`render segment ${seg.id}`, () => Bun.$`${FFMPEG} -y -ss ${seg.sourceStart} -t ${seg.sourceUsedDuration} -i ${recording} \
    -an -vf ${vf} -r 30 -pix_fmt yuv420p -c:v libx264 -crf 18 -preset medium ${clip}`.quiet());
  return clip;
}

export async function assembleVideo(opts: {
  recording: string; segments: Segment[]; workDir: string; out: string; captionsFile?: string;
}): Promise<string> {
  if (opts.segments.length === 0) throw new Error("assembleVideo: no segments provided");
  await Bun.$`mkdir -p ${opts.workDir}`;

  // 1. Render each segment clip, in order.
  const clips: string[] = [];
  for (const seg of opts.segments) clips.push(await renderSegment(opts.recording, seg, opts.workDir));

  // 2. Concat video clips (concat demuxer needs a list file).
  const listFile = `${opts.workDir}/clips.txt`;
  await Bun.write(listFile, clips.map(concatLine).join("\n"));
  // Re-encode the concatenation (robust against per-segment timebase/setpts differences) into a
  // clean CFR 30fps stream, and freeze-pad the tail by 0.5s so the video is always >= the voiceover
  // length — that way the -shortest mux clips the (padded) video tail, never the narration audio.
  const videoConcat = `${opts.workDir}/video.mp4`;
  const vf = `tpad=stop_mode=clone:stop_duration=0.5${opts.captionsFile ? subtitlesClause(opts.captionsFile) : ""}`;
  await runStage("concat video", () => Bun.$`${FFMPEG} -y -f concat -safe 0 -i ${listFile} \
    -vf ${vf} -fps_mode cfr -r 30 -pix_fmt yuv420p -c:v libx264 -crf 18 -preset medium ${videoConcat}`.quiet());

  // 3. Concat VO audio.
  const voList = `${opts.workDir}/vo.txt`;
  await Bun.write(voList, opts.segments.map((s) => concatLine(s.voFile)).join("\n"));
  const audioConcat = `${opts.workDir}/audio.mp3`;
  await runStage("concat audio", () => Bun.$`${FFMPEG} -y -f concat -safe 0 -i ${voList} -c copy ${audioConcat}`.quiet());

  // 4. Mux video + voiceover; end at the shorter stream.
  await runStage("mux", () => Bun.$`${FFMPEG} -y -i ${videoConcat} -i ${audioConcat} -map 0:v:0 -map 1:a:0 \
    -c:v copy -c:a aac -b:a 160k -shortest ${opts.out}`.quiet());
  return opts.out;
}

// Wrap the body with an optional real-face intro and a reusable faceless outro. Each part keeps its
// own audio (intro/outro are NOT re-voiced). Parts are normalized to 1080p/30fps (letterboxed if
// needed) so they concatenate cleanly. With no intro and no outro this is a no-op copy.
export async function wrapVideo(opts: {
  body: string; intro?: string; outro?: string; workDir: string; out: string;
}): Promise<string> {
  const parts = [
    opts.intro ? { file: opts.intro, normalizeAudio: true } : undefined,
    { file: opts.body, normalizeAudio: false },
    opts.outro ? { file: opts.outro, normalizeAudio: true } : undefined,
  ].filter((p): p is { file: string; normalizeAudio: boolean } => Boolean(p));
  if (parts.length === 1) {
    await Bun.$`cp ${opts.body} ${opts.out}`;
    return opts.out;
  }
  await Bun.$`mkdir -p ${opts.workDir}`;
  // Build the normalize filter as a single interpolated value so Bun's shell doesn't parse the
  // parentheses in the pad-centering expression as a subshell.
  const vf =
    "scale=1920:1080:force_original_aspect_ratio=decrease,pad=1920:1080:(ow-iw)/2:(oh-ih)/2:color=black,setsar=1,fps=30";
  const normed: string[] = [];
  let i = 0;
  for (const part of parts) {
    const n = `${opts.workDir}/wrap_${i}.mp4`;
    if (part.normalizeAudio && await ffprobeHasAudio(part.file)) {
      await runStage(`normalize part ${i}`, () => Bun.$`${FFMPEG} -y -i ${part.file} \
        -vf ${vf} -af ${EXTERNAL_AUDIO_FILTER} -c:v libx264 -crf 18 -preset medium -pix_fmt yuv420p -c:a aac -b:a 160k -ar 48000 -ac 2 ${n}`.quiet());
    } else {
      await runStage(`normalize part ${i}`, () => Bun.$`${FFMPEG} -y -i ${part.file} \
        -vf ${vf} -c:v libx264 -crf 18 -preset medium -pix_fmt yuv420p -c:a aac -b:a 160k -ar 48000 -ac 2 ${n}`.quiet());
    }
    normed.push(n);
    i++;
  }
  const listFile = `${opts.workDir}/wrap.txt`;
  await Bun.write(listFile, normed.map(concatLine).join("\n"));
  await runStage("concat wrap", () => Bun.$`${FFMPEG} -y -f concat -safe 0 -i ${listFile} -c copy ${opts.out}`.quiet());
  return opts.out;
}

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

// Mix a quiet music bed under an existing clip, keeping the original video stream.
// Used for spoken intros where the voice remains primary and music sits underneath.
export async function mixMusicUnderVideo(opts: {
  video: string; musicFile: string; out: string; volumeDb?: number; fadeSec?: number; musicOffsetSec?: number;
}): Promise<string> {
  const dur = await ffprobeDuration(opts.video);
  const fade = opts.fadeSec ?? INTRO_MUSIC_FADE_SEC;
  const outFade = Math.max(0, dur - fade).toFixed(2);
  const music = `afade=t=in:st=0:d=${fade},afade=t=out:st=${outFade}:d=${fade},volume=${opts.volumeDb ?? INTRO_MUSIC_DB}dB`;
  if (await ffprobeHasAudio(opts.video)) {
    const filter = `[1:a]${music}[music];[0:a][music]amix=inputs=2:duration=first:dropout_transition=0:normalize=0,aresample=48000[a]`;
    await runStage("mix intro music", () => Bun.$`${FFMPEG} -y -i ${opts.video} -stream_loop -1 -ss ${opts.musicOffsetSec ?? 0} -t ${dur} -i ${opts.musicFile} \
      -filter_complex ${filter} -map 0:v:0 -map "[a]" -c:v copy -c:a aac -b:a 160k -ar 48000 -ac 2 -shortest ${opts.out}`.quiet());
  } else {
    const filter = `[1:a]${music},aresample=48000[a]`;
    await runStage("mix intro music", () => Bun.$`${FFMPEG} -y -i ${opts.video} -stream_loop -1 -ss ${opts.musicOffsetSec ?? 0} -t ${dur} -i ${opts.musicFile} \
      -filter_complex ${filter} -map 0:v:0 -map "[a]" -c:v copy -c:a aac -b:a 160k -ar 48000 -ac 2 -shortest ${opts.out}`.quiet());
  }
  return opts.out;
}

// Splice chapter cards into the already-captioned body. Captions are burned in
// before this step, so cutting the body here does not shift caption timing.
export async function insertChapterCards(opts: {
  body: string; cards: { clip: string; atSec: number }[]; workDir: string; out: string;
}): Promise<string> {
  if (opts.cards.length === 0) {
    await Bun.$`cp ${opts.body} ${opts.out}`;
    return opts.out;
  }
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
