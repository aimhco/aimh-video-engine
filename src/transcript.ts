import type { Transcript } from "./types";

export async function loadTranscript(path: string): Promise<Transcript> {
  const raw = await Bun.file(path).json();
  if (typeof raw.duration !== "number") throw new Error("transcript: missing numeric 'duration'");
  if (!Array.isArray(raw.words)) throw new Error("transcript: missing 'words' array");
  for (const w of raw.words) {
    if (typeof w.text !== "string" || typeof w.start !== "number" || typeof w.end !== "number") {
      throw new Error("transcript: each word needs text/start/end");
    }
  }
  return raw as Transcript;
}
