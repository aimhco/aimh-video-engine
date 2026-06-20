import { FFPROBE } from "./ffmpeg";

export async function ffprobeDuration(path: string): Promise<number> {
  const proc = Bun.spawn([
    FFPROBE, "-v", "error", "-show_entries", "format=duration",
    "-of", "default=noprint_wrappers=1:nokey=1", path,
  ]);
  const out = await new Response(proc.stdout).text();
  const seconds = parseFloat(out.trim());
  if (!Number.isFinite(seconds)) throw new Error(`ffprobe: could not read duration of ${path}`);
  return seconds;
}
