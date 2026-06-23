import { expect, test } from "bun:test";
import {
  DEFAULT_HOUSE_STYLE,
  createRetroTemplate,
  hasPlaceholderRules,
  mergeHouseStyle,
  parseRetroInput,
} from "../src/retro";

test("createRetroTemplate creates a reviewable retro.json skeleton", () => {
  const template = JSON.parse(createRetroTemplate("sample"));

  expect(template.video).toBe("sample");
  expect(template.rules).toEqual([
    {
      category: "script",
      rule: "Replace this with one durable lesson to apply to future videos.",
      reason: "What happened in this video that makes this rule worth keeping?",
    },
  ]);
});

test("parseRetroInput validates rules and trims fields", () => {
  expect(parseRetroInput({
    video: " sample ",
    rules: [{ category: " audio ", rule: " Keep intro music quiet. ", reason: " Voice is primary. " }],
  })).toEqual({
    video: "sample",
    rules: [{ category: "audio", rule: "Keep intro music quiet.", reason: "Voice is primary." }],
  });
});

test("hasPlaceholderRules detects an unedited retro template", () => {
  const retro = parseRetroInput(JSON.parse(createRetroTemplate("sample")));

  expect(hasPlaceholderRules(retro)).toBe(true);
  expect(hasPlaceholderRules({
    video: "sample",
    rules: [{ category: "script", rule: "Keep the narration grounded in the transcript." }],
  })).toBe(false);
});

test("mergeHouseStyle appends approved rules under learned rules", () => {
  const result = mergeHouseStyle(DEFAULT_HOUSE_STYLE, {
    video: "sample",
    rules: [
      { category: "script", rule: "Keep claims grounded in the screen recording.", reason: "Avoid synthetic filler." },
      { category: "visuals", rule: "Highlight the active selected content, not nearby headings." },
    ],
  }, "2026-06-22");

  expect(result.added).toBe(2);
  expect(result.skipped).toBe(0);
  expect(result.content).toContain("## Learned Rules");
  expect(result.content).toContain("- **Script:** Keep claims grounded in the screen recording. Reason: Avoid synthetic filler. Source: sample, 2026-06-22.");
  expect(result.content).toContain("- **Visuals:** Highlight the active selected content, not nearby headings. Source: sample, 2026-06-22.");
});

test("mergeHouseStyle skips duplicate rules idempotently", () => {
  const once = mergeHouseStyle(DEFAULT_HOUSE_STYLE, {
    video: "sample",
    rules: [{ category: "script", rule: "Keep claims grounded in the screen recording." }],
  }, "2026-06-22");
  const twice = mergeHouseStyle(once.content, {
    video: "demo",
    rules: [{ category: "script", rule: "Keep claims grounded in the screen recording." }],
  }, "2026-06-23");

  expect(twice.added).toBe(0);
  expect(twice.skipped).toBe(1);
  expect(twice.content.match(/Keep claims grounded/g)?.length).toBe(1);
});
