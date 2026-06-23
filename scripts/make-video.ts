// scripts/make-video.ts — thin Y-slice CLI: script.json + recording.mp4 -> final.mp4
import { synthesizeChunk } from "../src/elevenlabs";
import { planSegments } from "../src/align";
import { assembleVideo, wrapVideo, overlayLogo, insertChapterCards, mixMusicUnderVideo } from "../src/finish";
import { planCaptions, toSrt } from "../src/captions";
import { deriveChapters, chapterOffsetSec } from "../src/chapters";
import { cardSvg, renderCardPng, renderCardClip } from "../src/cards";
import { resolveMusicSelection } from "../src/music";
import { captionsEnabledFromArgs } from "../src/options";
import type { ScriptChunk, VoChunk } from "../src/types";

const slug = process.argv[2];
if (!slug) throw new Error("usage: bun run make-video <slug>");
const dir = `videos/${slug}`;

const script = (await Bun.file(`${dir}/script.json`).json()) as ScriptChunk[];
if (!script.length) throw new Error(`${dir}/script.json is empty`);

await Bun.$`mkdir -p ${dir}/vo`;
const vo: VoChunk[] = [];
for (const chunk of script) {
  const v = await synthesizeChunk(chunk, `${dir}/vo`);
  console.log(
    v.cached
      ? `voiceover ${chunk.id} (cached)`
      : `synthesized ${chunk.id} (${chunk.text.length} chars)`,
  );
  vo.push(v);
}

// Captions: opt-in for short-form renders. Long-form YouTube videos stay clean by default.
const captionsEnabled = captionsEnabledFromArgs(process.argv);
let captionsFile: string | undefined;
if (captionsEnabled) {
  const cues = planCaptions(script, vo);
  if (cues.length) {
    captionsFile = `${dir}/captions.srt`;
    await Bun.write(captionsFile, toSrt(cues));
    console.log(`+ captions: ${cues.length} cues → ${captionsFile}`);
  }
}

const segments = planSegments(script, vo);
console.table(
  segments.map((s) => ({
    id: s.id,
    src: `${s.sourceStart.toFixed(1)}-${(s.sourceStart + s.sourceUsedDuration).toFixed(1)}`,
    speed: s.speedFactor.toFixed(2),
    pad: s.padDuration.toFixed(2),
    target: s.targetDuration.toFixed(2),
  })),
);

const body = await assembleVideo({
  recording: `${dir}/recording.mp4`,
  segments,
  workDir: `${dir}/work`,
  out: `${dir}/body.mp4`,
  captionsFile,
});

// Optional: wrap with a per-video real-face intro and a reusable faceless outro (each keeps its own audio).
const intro = (await Bun.file(`${dir}/intro.mp4`).exists()) ? `${dir}/intro.mp4` : undefined;
const outro = (await Bun.file(`${dir}/outro.mp4`).exists())
  ? `${dir}/outro.mp4`
  : (await Bun.file(`assets/outro.mp4`).exists())
    ? `assets/outro.mp4`
    : undefined;

// Chapter cards: render a branded card per chapter and splice them into the body. --no-cards skips.
let bodyForWrap = body;
const chapters = process.argv.includes("--no-cards") ? [] : deriveChapters(script);
let bodyTrack: string | undefined;
let outroTrack: string | undefined;
if (chapters.length || intro || outro) {
  const musicJson = `${dir}/music.json`;
  const current = (await Bun.file(musicJson).exists())
    ? (await Bun.file(musicJson).json()) as { bodyTrack?: string | null; outroTrack?: string | null }
    : {};
  const bodyTracks = (await Array.fromAsync(new Bun.Glob("Body_*.mp3").scan({ cwd: "assets/music", absolute: true }))).sort();
  const outroTracks = (await Array.fromAsync(new Bun.Glob("Outro_*.mp3").scan({ cwd: "assets/music", absolute: true }))).sort();
  const selection = resolveMusicSelection(slug, current, bodyTracks, outroTracks);
  bodyTrack = selection.bodyTrack;
  outroTrack = selection.outroTrack;
  if (selection.changed || !(await Bun.file(musicJson).exists())) {
    await Bun.write(musicJson, JSON.stringify(selection.persisted, null, 2));
  }
}

if (chapters.length) {
  const cards: { clip: string; atSec: number }[] = [];
  for (const ch of chapters) {
    const png = `${dir}/work/card_${ch.index}.png`;
    await renderCardPng(cardSvg({ number: ch.index, title: ch.title }), png);
    const clip = `${dir}/work/card_${ch.index}.mp4`;
    await renderCardClip({ png, out: clip, musicFile: bodyTrack, musicOffsetSec: 0 });
    cards.push({ clip, atSec: chapterOffsetSec(ch.startChunkIndex, vo) });
  }
  console.log(`+ chapters: ${chapters.length} card(s)${bodyTrack ? ` (music: ${bodyTrack.split("/").pop()})` : " (no music)"}`);
  bodyForWrap = await insertChapterCards({ body, cards, workDir: `${dir}/work`, out: `${dir}/body-cards.mp4` });
}

let introForWrap = intro;
if (intro && bodyTrack) {
  introForWrap = await mixMusicUnderVideo({
    video: intro,
    musicFile: bodyTrack,
    out: `${dir}/work/intro-music.mp4`,
    musicOffsetSec: 0,
  });
  console.log(`+ intro music: ${bodyTrack.split("/").pop()}`);
}
if (intro) console.log(`+ intro: ${intro}`);
let outroForWrap = outro;
if (outro && outroTrack) {
  outroForWrap = await mixMusicUnderVideo({
    video: outro,
    musicFile: outroTrack,
    out: `${dir}/work/outro-music.mp4`,
    musicOffsetSec: 0,
  });
  console.log(`+ outro music: ${outroTrack.split("/").pop()}`);
}
if (outro) console.log(`+ outro: ${outro}`);

const out = await wrapVideo({ body: bodyForWrap, intro: introForWrap, outro: outroForWrap, workDir: `${dir}/work`, out: `${dir}/final.mp4` });

// Branding: overlay the logo watermark over the whole final video. On by default; --no-logo skips.
const logoEnabled = !process.argv.includes("--no-logo");
const logo = logoEnabled && (await Bun.file("assets/logo.png").exists()) ? "assets/logo.png" : undefined;
if (logo) {
  const tmp = `${dir}/work/logo.mp4`;
  await overlayLogo({ video: out, logo, out: tmp });
  await Bun.$`mv ${tmp} ${out}`;
  console.log(`+ logo: ${logo}`);
}

console.log(`done → ${out}`);
