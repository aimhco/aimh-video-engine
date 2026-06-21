import { beforeAll, expect, test } from "bun:test";
import { buildSpeechRequestBody, prepareTextForSpeech, synthesizeChunk } from "../src/elevenlabs";
import { FFMPEG } from "../src/ffmpeg";

const dir = `${import.meta.dir}/fixtures/elevenlabs`;

beforeAll(async () => {
  await Bun.$`mkdir -p ${dir}`;
  await Bun.$`${FFMPEG} -y -f lavfi -i sine=frequency=440:duration=1 ${dir}/c1.mp3`.quiet();
});

test("returns cached:true without calling the API when the mp3 already exists", async () => {
  const v = await synthesizeChunk(
    { id: "c1", text: "irrelevant", sourceStart: 0, sourceEnd: 1 },
    dir,
  );
  expect(v.cached).toBe(true);
  expect(v.file).toBe(`${dir}/c1.mp3`);
  expect(v.duration).toBeGreaterThan(0);
});

test("prepareTextForSpeech rewrites aimh.co for reliable TTS pronunciation", () => {
  expect(prepareTextForSpeech("Visit aimh.co before AIMH.co ships.")).toBe(
    "Visit A-I-M-H dot co before A-I-M-H dot co ships.",
  );
});

test("buildSpeechRequestBody includes pronunciation dictionary locators when configured", () => {
  const body = buildSpeechRequestBody("Visit aimh.co", {
    ELEVENLABS_PRONUNCIATION_DICTIONARY_ID: "dict_123",
    ELEVENLABS_PRONUNCIATION_DICTIONARY_VERSION_ID: "ver_456",
  });

  expect(body).toMatchObject({
    text: "Visit A-I-M-H dot co",
    model_id: "eleven_multilingual_v2",
    pronunciation_dictionary_locators: [{ pronunciation_dictionary_id: "dict_123", version_id: "ver_456" }],
  });
});

test("buildSpeechRequestBody omits incomplete pronunciation dictionary config", () => {
  expect(buildSpeechRequestBody("aimh.co", { ELEVENLABS_PRONUNCIATION_DICTIONARY_ID: "dict_123" }))
    .not.toHaveProperty("pronunciation_dictionary_locators");
});
