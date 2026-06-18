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
  await expect(loadTranscript(path)).rejects.toThrow("words");
});

test("loadTranscript throws a wrapped error on invalid JSON", async () => {
  const path = `${import.meta.dir}/fixtures/transcript.invalid.json`;
  await Bun.write(path, "{ not valid json");
  await expect(loadTranscript(path)).rejects.toThrow("transcript:");
});

test("loadTranscript throws a wrapped error on a missing file", async () => {
  await expect(loadTranscript(`${import.meta.dir}/fixtures/does-not-exist.json`)).rejects.toThrow("transcript:");
});
