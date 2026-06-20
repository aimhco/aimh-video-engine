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

export async function ffprobeVideoSize(path: string): Promise<{ width: number; height: number }> {
  const proc = Bun.spawn([
    FFPROBE, "-v", "error", "-select_streams", "v:0",
    "-show_entries", "stream=width,height", "-of", "csv=p=0:s=x", path,
  ]);
  const out = (await new Response(proc.stdout).text()).trim(); // e.g. "1920x1080"
  const [w, h] = out.split("x").map((n) => parseInt(n, 10));
  if (!Number.isFinite(w) || !Number.isFinite(h)) throw new Error(`ffprobe: could not read size of ${path}`);
  return { width: w!, height: h! };
}

export async function ffprobeHasAudio(path: string): Promise<boolean> {
  const proc = Bun.spawn([
    FFPROBE, "-v", "error", "-select_streams", "a",
    "-show_entries", "stream=codec_type", "-of", "csv=p=0", path,
  ]);
  const out = (await new Response(proc.stdout).text()).trim();
  return out.length > 0;
}
