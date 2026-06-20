// Resolve the ffmpeg/ffprobe binaries. Defaults to the ones on PATH; override
// via the FFMPEG / FFPROBE env vars (Bun auto-loads .env) — e.g. to point at a
// libass-enabled build like Homebrew's keg-only `ffmpeg-full`.
export const FFMPEG = process.env.FFMPEG ?? "ffmpeg";
export const FFPROBE = process.env.FFPROBE ?? "ffprobe";
