export interface TranscriptWord { text: string; start: number; end: number }
export interface Transcript { duration: number; words: TranscriptWord[] }

export interface ScriptChunk { id: string; text: string; sourceStart: number; sourceEnd: number }
export interface VoChunk { id: string; file: string; duration: number }

export interface Segment {
  id: string;
  sourceStart: number;
  sourceUsedDuration: number;
  speedFactor: number;
  padDuration: number;
  targetDuration: number;
  voFile: string;
}
