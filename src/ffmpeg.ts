// Resolve the ffmpeg/ffprobe binaries. Defaults to the ones on PATH; override
// via the FFMPEG / FFPROBE env vars (Bun auto-loads .env) — e.g. to point at a
// libass-enabled build like Homebrew's keg-only `ffmpeg-full`.
// `||` (not `??`) so an empty-string env var also falls back to the PATH default.
export const FFMPEG = process.env.FFMPEG || "ffmpeg";
export const FFPROBE = process.env.FFPROBE || "ffprobe";
// tesseract OCR binary (for the secret-leak scan); override via TESSERACT.
export const TESSERACT = process.env.TESSERACT || "tesseract";
