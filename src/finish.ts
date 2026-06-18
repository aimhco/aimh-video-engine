import type { Segment } from "./types";

// Build one normalized video clip per segment (speed-adjusted, freeze-padded, muted).
async function renderSegment(recording: string, seg: Segment, workDir: string): Promise<string> {
  const clip = `${workDir}/${seg.id}.mp4`;
  // setpts divides PTS by speedFactor (speed up when >1); tpad clones the last frame for padDuration.
  const vf = `setpts=PTS/${seg.speedFactor},tpad=stop_mode=clone:stop_duration=${seg.padDuration.toFixed(3)}`;
  await Bun.$`ffmpeg -y -ss ${seg.sourceStart} -t ${seg.sourceUsedDuration} -i ${recording} \
    -an -vf ${vf} -r 30 -pix_fmt yuv420p -c:v libx264 ${clip}`.quiet();
  return clip;
}

export async function assembleVideo(opts: {
  recording: string; segments: Segment[]; workDir: string; out: string;
}): Promise<string> {
  await Bun.$`mkdir -p ${opts.workDir}`;

  // 1. Render each segment clip and concat VO files, in order.
  const clips: string[] = [];
  for (const seg of opts.segments) clips.push(await renderSegment(opts.recording, seg, opts.workDir));

  // 2. Concat video clips (concat demuxer needs a list file).
  const listFile = `${opts.workDir}/clips.txt`;
  await Bun.write(listFile, clips.map((c) => `file '${c}'`).join("\n"));
  const videoConcat = `${opts.workDir}/video.mp4`;
  await Bun.$`ffmpeg -y -f concat -safe 0 -i ${listFile} -c copy ${videoConcat}`.quiet();

  // 3. Concat VO audio (re-encode to be safe).
  const voList = `${opts.workDir}/vo.txt`;
  await Bun.write(voList, opts.segments.map((s) => `file '${s.voFile}'`).join("\n"));
  const audioConcat = `${opts.workDir}/audio.mp3`;
  await Bun.$`ffmpeg -y -f concat -safe 0 -i ${voList} -c copy ${audioConcat}`.quiet();

  // 4. Mux video + voiceover; end at the shorter stream.
  await Bun.$`ffmpeg -y -i ${videoConcat} -i ${audioConcat} -map 0:v:0 -map 1:a:0 \
    -c:v copy -c:a aac -shortest ${opts.out}`.quiet();
  return opts.out;
}
