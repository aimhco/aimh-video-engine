// src/finish.ts
import { resolve } from "node:path";
import type { Segment } from "./types";

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
    throw new Error(`assembleVideo: ffmpeg failed during ${stage}: ${(err as Error).message}`);
  }
}

// Build one normalized video clip per segment (speed-adjusted, freeze-padded, muted).
async function renderSegment(recording: string, seg: Segment, workDir: string): Promise<string> {
  const clip = `${workDir}/${seg.id}.mp4`;
  const vf = `setpts=PTS/${seg.speedFactor},tpad=stop_mode=clone:stop_duration=${seg.padDuration.toFixed(3)}`;
  await runStage(`render segment ${seg.id}`, () => Bun.$`ffmpeg -y -ss ${seg.sourceStart} -t ${seg.sourceUsedDuration} -i ${recording} \
    -an -vf ${vf} -r 30 -pix_fmt yuv420p -c:v libx264 -crf 18 -preset medium ${clip}`.quiet());
  return clip;
}

export async function assembleVideo(opts: {
  recording: string; segments: Segment[]; workDir: string; out: string;
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
  await runStage("concat video", () => Bun.$`ffmpeg -y -f concat -safe 0 -i ${listFile} \
    -vf tpad=stop_mode=clone:stop_duration=0.5 -fps_mode cfr -r 30 -pix_fmt yuv420p -c:v libx264 -crf 18 -preset medium ${videoConcat}`.quiet());

  // 3. Concat VO audio.
  const voList = `${opts.workDir}/vo.txt`;
  await Bun.write(voList, opts.segments.map((s) => concatLine(s.voFile)).join("\n"));
  const audioConcat = `${opts.workDir}/audio.mp3`;
  await runStage("concat audio", () => Bun.$`ffmpeg -y -f concat -safe 0 -i ${voList} -c copy ${audioConcat}`.quiet());

  // 4. Mux video + voiceover; end at the shorter stream.
  await runStage("mux", () => Bun.$`ffmpeg -y -i ${videoConcat} -i ${audioConcat} -map 0:v:0 -map 1:a:0 \
    -c:v copy -c:a aac -b:a 160k -shortest ${opts.out}`.quiet());
  return opts.out;
}
