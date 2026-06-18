import { expect, test } from "bun:test";
import { loadTranscript } from "../src/transcript";

test("loadTranscript parses a valid transcript", async () => {
  const path = `${import.meta.dir}/fixtures/transcript.ok.json`;
  await Bun.write(path, JSON.stringify({
    duration: 2.0,
    words: [{ text: "hi", start: 0, end: 0.5 }],
  }));
  const t = await loadTranscript(path);
  expect(t.duration).toBe(2.0);
  expect(t.words[0]!.text).toBe("hi");
});

test("loadTranscript throws on missing words array", async () => {
  const path = `${import.meta.dir}/fixtures/transcript.bad.json`;
  await Bun.write(path, JSON.stringify({ duration: 2.0 }));
  expect(loadTranscript(path)).rejects.toThrow("words");
});
