import { expect, test } from "bun:test";
import { captionsEnabledFromArgs } from "../src/options";

test("captions are off by default for long-form renders", () => {
  expect(captionsEnabledFromArgs(["bun", "run", "make-video", "sample"])).toBe(false);
});

test("captions can be explicitly enabled for short-form renders", () => {
  expect(captionsEnabledFromArgs(["bun", "run", "make-video", "sample", "--captions"])).toBe(true);
  expect(captionsEnabledFromArgs(["bun", "run", "make-video", "sample", "--with-captions"])).toBe(true);
});

test("legacy --no-captions remains accepted", () => {
  expect(captionsEnabledFromArgs(["bun", "run", "make-video", "sample", "--no-captions"])).toBe(false);
});
