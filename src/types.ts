export interface TranscriptWord { text: string; start: number; end: number }
export interface Transcript { duration: number; words: TranscriptWord[] }

export interface ZoomCue { scale?: number; focusPct?: [number, number] }
export interface ScriptChunk {
  id: string; text: string; sourceStart: number; sourceEnd: number;
  zoom?: ZoomCue;
}
export interface VoChunk { id: string; file: string; duration: number; cached?: boolean }

export interface ZoomPlanEntry {
  chunkId: string;
  type: "manualZoom";
  startTimeMs: number;
  durationMs: number;
  scale: number;
  focusPoint: { xPct: number; yPct: number };
  estFinalSec?: number;
}
export interface ZoomPlan { zooms: ZoomPlanEntry[]; warnings: string[] }

export interface Segment {
  id: string;
  sourceStart: number;
  sourceUsedDuration: number;
  speedFactor: number;
  padDuration: number;
  targetDuration: number;
  voFile: string;
}
