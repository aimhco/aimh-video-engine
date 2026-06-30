import { basename } from "node:path";
import { deriveChapters, chapterOffsetSec } from "./chapters";
import type { ScriptChunk, VoChunk } from "./types";

export type AdjustmentStatus = "applied" | "none" | "not_applicable";

export interface AdjustmentCount {
  status: AdjustmentStatus;
  count: number;
  reason?: string;
}

export interface AdjustmentsSummary {
  slug: string;
  generatedAt: string;
  voiceover: {
    chunks: number;
    synthesizedChunks: number;
    cachedChunks: number;
    totalDurationSec: number;
  };
  captions: { enabled: boolean; file?: string; cueCount?: number };
  chapters: {
    count: number;
    cards: { index: number; title: string; timestampSec: number; timestamp: string }[];
  };
  zooms: AdjustmentCount;
  highlights: AdjustmentCount;
  blurs: AdjustmentCount;
  music: { bodyTrack: string | null; outroTrack: string | null };
  logo: { enabled: boolean; file?: string };
  intro: { present: boolean; file?: string };
  outro: { present: boolean; file?: string };
  final: {
    file: string;
    durationSec: number;
    resolution: { width: number; height: number };
  };
}

export interface BuildAdjustmentsSummaryInput {
  slug: string;
  script: ScriptChunk[];
  vo: VoChunk[];
  captionsFile?: string;
  captionsCueCount: number;
  tellaProjectPresent: boolean;
  zoomCount: number;
  highlightCount: number;
  blurCount: number;
  bodyTrack?: string;
  outroTrack?: string;
  logoFile?: string;
  introFile?: string;
  outroFile?: string;
  finalFile: string;
  finalDurationSec: number;
  finalResolution: { width: number; height: number };
  generatedAt?: string;
}

export interface AdjustmentRow {
  item: string;
  status: string;
  detail: string;
}

const round2 = (n: number): number => Math.round(n * 100) / 100;

function fmtTimestamp(sec: number): string {
  const total = Math.max(0, Math.floor(sec));
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  const s = total % 60;
  return h > 0
    ? `${h}:${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`
    : `${m}:${String(s).padStart(2, "0")}`;
}

function mediaName(path?: string): string | null {
  return path ? basename(path) : null;
}

function appliedCount(count: number, tellaProjectPresent: boolean): AdjustmentCount {
  if (!tellaProjectPresent) return { status: "not_applicable", count: 0, reason: "none — no Tella project" };
  return count > 0 ? { status: "applied", count } : { status: "none", count: 0 };
}

export function buildAdjustmentsSummary(input: BuildAdjustmentsSummaryInput): AdjustmentsSummary {
  const chapters = deriveChapters(input.script);
  const cachedChunks = input.vo.filter((v) => v.cached).length;
  const synthesizedChunks = input.vo.length - cachedChunks;

  return {
    slug: input.slug,
    generatedAt: input.generatedAt ?? new Date().toISOString(),
    voiceover: {
      chunks: input.vo.length,
      synthesizedChunks,
      cachedChunks,
      totalDurationSec: round2(input.vo.reduce((n, v) => n + v.duration, 0)),
    },
    captions: input.captionsFile
      ? { enabled: true, file: input.captionsFile, cueCount: input.captionsCueCount }
      : { enabled: false },
    chapters: {
      count: chapters.length,
      cards: chapters.map((ch) => {
        const timestampSec = round2(chapterOffsetSec(ch.startChunkIndex, input.vo));
        return { index: ch.index, title: ch.title, timestampSec, timestamp: fmtTimestamp(timestampSec) };
      }),
    },
    zooms: appliedCount(input.zoomCount, input.tellaProjectPresent),
    highlights: appliedCount(input.highlightCount, input.tellaProjectPresent),
    blurs: appliedCount(input.blurCount, input.tellaProjectPresent),
    music: {
      bodyTrack: mediaName(input.bodyTrack),
      outroTrack: mediaName(input.outroTrack),
    },
    logo: input.logoFile ? { enabled: true, file: input.logoFile } : { enabled: false },
    intro: input.introFile ? { present: true, file: input.introFile } : { present: false },
    outro: input.outroFile ? { present: true, file: input.outroFile } : { present: false },
    final: {
      file: input.finalFile,
      durationSec: round2(input.finalDurationSec),
      resolution: input.finalResolution,
    },
  };
}

function countDetail(count: AdjustmentCount): string {
  return count.reason ?? String(count.count);
}

export function adjustmentRows(summary: AdjustmentsSummary): AdjustmentRow[] {
  const chapterDetail = summary.chapters.cards.length
    ? summary.chapters.cards.map((c) => `${c.timestamp} ${c.title}`).join("; ")
    : "none";

  return [
    {
      item: "voiceover",
      status: `${summary.voiceover.chunks} chunks`,
      detail: `${summary.voiceover.totalDurationSec.toFixed(2)}s total (${summary.voiceover.synthesizedChunks} synthesized, ${summary.voiceover.cachedChunks} cached)`,
    },
    {
      item: "captions",
      status: summary.captions.enabled ? "on" : "off",
      detail: summary.captions.enabled ? `${summary.captions.cueCount ?? 0} cues` : "not requested",
    },
    { item: "chapter cards", status: String(summary.chapters.count), detail: chapterDetail },
    { item: "zooms", status: summary.zooms.status, detail: countDetail(summary.zooms) },
    { item: "highlights", status: summary.highlights.status, detail: countDetail(summary.highlights) },
    { item: "blurs", status: summary.blurs.status, detail: countDetail(summary.blurs) },
    {
      item: "music",
      status: summary.music.bodyTrack || summary.music.outroTrack ? "on" : "off",
      detail: `body: ${summary.music.bodyTrack ?? "none"}; outro: ${summary.music.outroTrack ?? "none"}`,
    },
    { item: "logo", status: summary.logo.enabled ? "on" : "off", detail: summary.logo.file ?? "none" },
    { item: "intro/outro", status: `${summary.intro.present ? "intro" : "no intro"} / ${summary.outro.present ? "outro" : "no outro"}`, detail: "" },
    {
      item: "final",
      status: "ready",
      detail: `${summary.final.durationSec.toFixed(2)}s, ${summary.final.resolution.width}x${summary.final.resolution.height}`,
    },
  ];
}

