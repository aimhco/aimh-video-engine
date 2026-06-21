import { expect, test } from "bun:test";
import { cardSvg, renderCardPng } from "../src/cards";
import { FFPROBE } from "../src/ffmpeg";

test("cardSvg includes the chapter number and an XML-escaped title", () => {
  const svg = cardSvg({ number: 2, title: "Tools & <Tricks>" });
  expect(svg).toContain("CHAPTER 2");
  expect(svg).toContain("Tools &amp; &lt;Tricks&gt;");
  expect(svg).toMatch(/^<svg[\s\S]*<\/svg>$/);
});

test("renderCardPng writes a 1920x1080 PNG", async () => {
  const dir = `${import.meta.dir}/fixtures/cards`;
  await Bun.$`mkdir -p ${dir}`;
  const out = `${dir}/card.png`;
  await renderCardPng(cardSvg({ number: 1, title: "Introduction" }), out);
  const size = (await Bun.$`${FFPROBE} -v error -select_streams v:0 -show_entries stream=width,height -of csv=p=0:s=x ${out}`.text()).trim();
  expect(size).toBe("1920x1080");
});
