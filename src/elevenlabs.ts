// src/elevenlabs.ts
import type { ScriptChunk, VoChunk } from "./types";
import { ffprobeDuration } from "./ffprobe";

// Synthesize one script chunk into an mp3 in your cloned voice, returning its measured duration.
export async function synthesizeChunk(chunk: ScriptChunk, outDir: string): Promise<VoChunk> {
  const file = `${outDir}/${chunk.id}.mp3`;
  // Idempotent: reuse an already-synthesized clip (delete the vo/ dir to force re-synthesis
  // after editing a chunk's text).
  if (await Bun.file(file).exists()) {
    return { id: chunk.id, file, duration: await ffprobeDuration(file), cached: true };
  }

  const apiKey = process.env.ELEVENLABS_API_KEY;
  const voiceId = process.env.ELEVENLABS_VOICE_ID;
  if (!apiKey || !voiceId) throw new Error("ELEVENLABS_API_KEY and ELEVENLABS_VOICE_ID must be set");

  const res = await fetch(`https://api.elevenlabs.io/v1/text-to-speech/${voiceId}`, {
    method: "POST",
    headers: { "xi-api-key": apiKey, "Content-Type": "application/json" },
    body: JSON.stringify({
      text: chunk.text,
      model_id: "eleven_multilingual_v2",
      voice_settings: { stability: 0.5, similarity_boost: 0.8 },
    }),
  });
  if (!res.ok) throw new Error(`ElevenLabs ${res.status}: ${await res.text()}`);

  await Bun.write(file, await res.arrayBuffer());
  const duration = await ffprobeDuration(file);
  return { id: chunk.id, file, duration, cached: false };
}
