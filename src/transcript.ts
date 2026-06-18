// src/transcript.ts
import type { Transcript } from "./types";

export async function loadTranscript(path: string): Promise<Transcript> {
  let raw: unknown;
  try {
    raw = await Bun.file(path).json();
  } catch (err) {
    throw new Error(`transcript: could not read or parse ${path}: ${(err as Error).message}`);
  }
  if (typeof raw !== "object" || raw === null) throw new Error("transcript: not an object");
  const obj = raw as Record<string, unknown>;
  if (typeof obj.duration !== "number") throw new Error("transcript: missing numeric 'duration'");
  if (!Array.isArray(obj.words)) throw new Error("transcript: missing 'words' array");
  for (const w of obj.words) {
    if (typeof w !== "object" || w === null) throw new Error("transcript: each word must be an object");
    const word = w as Record<string, unknown>;
    if (typeof word.text !== "string" || typeof word.start !== "number" || typeof word.end !== "number") {
      throw new Error("transcript: each word needs text/start/end");
    }
  }
  return raw as Transcript;
}
