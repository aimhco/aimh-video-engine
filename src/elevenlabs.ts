// src/elevenlabs.ts
import type { ScriptChunk, VoChunk } from "./types";
import { ffprobeDuration } from "./ffprobe";

type Env = Record<string, string | undefined>;

interface SpeechRequestBody {
  text: string;
  model_id: "eleven_multilingual_v2";
  voice_settings: { stability: number; similarity_boost: number };
  pronunciation_dictionary_locators?: Array<{
    pronunciation_dictionary_id: string;
    version_id: string;
  }>;
}

export function prepareTextForSpeech(text: string): string {
  return text.replace(/\baimh\.co\b/gi, "A-I-M-H dot co");
}

export function buildSpeechRequestBody(text: string, env: Env = process.env): SpeechRequestBody {
  const body: SpeechRequestBody = {
    text: prepareTextForSpeech(text),
    model_id: "eleven_multilingual_v2",
    voice_settings: { stability: 0.5, similarity_boost: 0.8 },
  };

  const dictionaryId = env.ELEVENLABS_PRONUNCIATION_DICTIONARY_ID;
  const versionId = env.ELEVENLABS_PRONUNCIATION_DICTIONARY_VERSION_ID;
  if (dictionaryId && versionId) {
    body.pronunciation_dictionary_locators = [
      { pronunciation_dictionary_id: dictionaryId, version_id: versionId },
    ];
  }

  return body;
}

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
    body: JSON.stringify(buildSpeechRequestBody(chunk.text)),
  });
  if (!res.ok) throw new Error(`ElevenLabs ${res.status}: ${await res.text()}`);

  await Bun.write(file, await res.arrayBuffer());
  const duration = await ffprobeDuration(file);
  return { id: chunk.id, file, duration, cached: false };
}
