import { Resvg } from "@resvg/resvg-js";
import { FFMPEG } from "./ffmpeg";
import { CARD_DURATION_SEC } from "./chapters";

const CARD_BG = "#6B5FA8";
const CARD_FG = "#F5EFE3";
const CARD_FADE_SEC = 0.4;
const CARD_MUSIC_DB = -10;

const xmlEscape = (s: string) =>
  s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&apos;");

// Pure: a 1920x1080 branded title card SVG.
export function cardSvg(opts: { number: number; title: string }): string {
  const title = xmlEscape(opts.title);
  return `<svg xmlns="http://www.w3.org/2000/svg" width="1920" height="1080" viewBox="0 0 1920 1080">` +
    `<rect width="1920" height="1080" fill="${CARD_BG}"/>` +
    `<text x="960" y="470" fill="${CARD_FG}" font-family="Helvetica, Arial, sans-serif" font-size="44" letter-spacing="8" text-anchor="middle" opacity="0.85">CHAPTER ${opts.number}</text>` +
    `<rect x="810" y="508" width="300" height="3" fill="${CARD_FG}" opacity="0.6"/>` +
    `<text x="960" y="630" fill="${CARD_FG}" font-family="Helvetica, Arial, sans-serif" font-size="84" font-weight="bold" text-anchor="middle">${title}</text>` +
    `</svg>`;
}

// I/O: render an SVG string to a PNG file.
export async function renderCardPng(svg: string, outPath: string): Promise<void> {
  const resvg = new Resvg(svg, {
    fitTo: { mode: "width", value: 1920 },
    font: { loadSystemFonts: true, defaultFontFamily: "Helvetica" },
  });
  await Bun.write(outPath, resvg.render().asPng());
}

// I/O: a card clip — PNG held for durationSec at 1080p/30 with fades, plus an
// optional faded music bed (silent audio otherwise, so concat stays uniform).
export async function renderCardClip(opts: {
  png: string; out: string; durationSec?: number; musicFile?: string; musicOffsetSec?: number;
}): Promise<string> {
  const dur = opts.durationSec ?? CARD_DURATION_SEC;
  const outFade = (dur - CARD_FADE_SEC).toFixed(2);
  const vf = `scale=1920:1080,fade=t=in:st=0:d=${CARD_FADE_SEC},fade=t=out:st=${outFade}:d=${CARD_FADE_SEC},format=yuv420p`;
  if (opts.musicFile) {
    const af = `afade=t=in:st=0:d=${CARD_FADE_SEC},afade=t=out:st=${outFade}:d=${CARD_FADE_SEC},volume=${CARD_MUSIC_DB}dB`;
    await Bun.$`${FFMPEG} -y -loop 1 -t ${dur} -i ${opts.png} -ss ${opts.musicOffsetSec ?? 0} -t ${dur} -i ${opts.musicFile} \
      -vf ${vf} -af ${af} -r 30 -c:v libx264 -crf 18 -preset medium -c:a aac -b:a 160k -ar 48000 -ac 2 -shortest ${opts.out}`.quiet();
  } else {
    await Bun.$`${FFMPEG} -y -loop 1 -t ${dur} -i ${opts.png} -f lavfi -t ${dur} -i anullsrc=channel_layout=stereo:sample_rate=48000 \
      -vf ${vf} -r 30 -c:v libx264 -crf 18 -preset medium -c:a aac -b:a 160k -shortest ${opts.out}`.quiet();
  }
  return opts.out;
}
