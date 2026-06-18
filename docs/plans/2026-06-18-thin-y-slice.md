# Thin Y-Slice Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build the minimal end-to-end pipeline that turns one screen recording + its timed transcript into a finished video whose footage is re-timed to a clean, cloned-voice narration — validating the core "ramble → script → re-voice → re-sync" magic before any polish.

**Architecture:** A `bun`/TypeScript CLI plus a Claude-facing `make-video` skill. Claude does judgment (rewrite the messy transcript into a chunked script grounded in real timestamps). Deterministic TypeScript modules do the rest: synthesize per-chunk voiceover via ElevenLabs, compute a segment plan that sizes each recording segment to its voiceover chunk, and assemble the final video with FFmpeg. Every stage reads/writes files in `videos/<slug>/` so stages run independently.

**Tech Stack:** Bun (runtime + test runner), TypeScript, FFmpeg/ffprobe (CLI), ElevenLabs REST API (`eleven_multilingual_v2`).

## Global Constraints

- Package manager / runtime: **Bun** (`bun install`, `bun run`, `bun test`) — never npm.
- Language: **TypeScript**, strict mode.
- TTS provider: **ElevenLabs**, model id **`eleven_multilingual_v2`**, via REST `POST https://api.elevenlabs.io/v1/text-to-speech/{voice_id}`.
- Secrets via `.env` only: `ELEVENLABS_API_KEY`, `ELEVENLABS_VOICE_ID`. Never commit `.env` (already in `.gitignore`).
- Re-sync speed clamp: footage speed factor is clamped to **[0.5, 2.0]**; overflow is trimmed, underflow is freeze-padded.
- Content is sacred: the segment planner may trim only *idle tail* time or change speed — it never drops a chunk.
- All media artifacts live under `videos/<slug>/` (gitignored). Only source code and the skill are committed.
- Frequent commits: one commit per task minimum.

---

## Prerequisites (do once, before Task 1)

These are environmental and not code tasks. Confirm each before executing:

1. **Bun installed** — `bun --version` prints a version.
2. **FFmpeg installed** — `ffmpeg -version` and `ffprobe -version` both work (`brew install ffmpeg`).
3. **ElevenLabs account** with a **cloned voice**; note the `voice_id` and an API key.
4. **A sample input** placed at `videos/sample/recording.mp4` (a short screen recording, ~60–120s, where you rambled through something) and its timed transcript at `videos/sample/transcript.json` (exported from Tella). The transcript JSON shape this plan assumes:
   ```json
   { "duration": 92.4, "words": [ { "text": "okay", "start": 0.0, "end": 0.32 }, { "text": "so", "start": 0.34, "end": 0.5 } ] }
   ```

---

## File Structure

```
aimh-video-engine/
├── package.json                       # Task 1 — bun project + scripts
├── tsconfig.json                      # Task 1
├── .env.example                       # Task 1
├── src/
│   ├── types.ts                       # Task 2 — shared types
│   ├── transcript.ts                  # Task 2 — load/validate transcript.json
│   ├── align.ts                       # Task 3 — planSegments() (pure, the core re-sync logic)
│   ├── ffprobe.ts                     # Task 5 — ffprobeDuration() (no credentials)
│   ├── elevenlabs.ts                  # Task 4 — synthesizeChunk()
│   └── finish.ts                      # Task 5 — assembleVideo() (FFmpeg)
├── scripts/
│   └── make-video.ts                  # Task 6 — CLI entry for one video dir
├── tests/
│   ├── transcript.test.ts             # Task 2
│   ├── align.test.ts                  # Task 3
│   └── finish.test.ts                 # Task 5
└── .claude/skills/make-video/SKILL.md # Task 7 — Claude orchestrator playbook
```

---

### Task 1: Project scaffold

**Files:**
- Create: `package.json`, `tsconfig.json`, `.env.example`

**Interfaces:**
- Consumes: nothing.
- Produces: a runnable Bun + TypeScript project where `bun test` executes.

- [ ] **Step 1: Create `package.json`**

```json
{
  "name": "aimh-video-engine",
  "module": "scripts/make-video.ts",
  "type": "module",
  "private": true,
  "scripts": {
    "make-video": "bun run scripts/make-video.ts",
    "test": "bun test"
  },
  "devDependencies": {
    "@types/bun": "latest",
    "typescript": "^5"
  }
}
```

- [ ] **Step 2: Create `tsconfig.json`**

```json
{
  "compilerOptions": {
    "target": "ESNext",
    "module": "ESNext",
    "moduleResolution": "bundler",
    "types": ["bun-types"],
    "strict": true,
    "skipLibCheck": true,
    "noUncheckedIndexedAccess": true
  }
}
```

- [ ] **Step 3: Create `.env.example`**

```bash
ELEVENLABS_API_KEY=your_elevenlabs_api_key_here
ELEVENLABS_VOICE_ID=your_cloned_voice_id_here
```

- [ ] **Step 4: Install and verify the test runner**

Run: `bun install && bun test`
Expected: installs deps; `bun test` exits 0 with "0 tests" (no tests yet).

- [ ] **Step 5: Commit**

```bash
git add package.json tsconfig.json .env.example
git commit -m "chore: scaffold bun + typescript project"
```

---

### Task 2: Shared types + transcript loader

**Files:**
- Create: `src/types.ts`, `src/transcript.ts`
- Test: `tests/transcript.test.ts`

**Interfaces:**
- Consumes: nothing.
- Produces:
  - `interface TranscriptWord { text: string; start: number; end: number }`
  - `interface Transcript { duration: number; words: TranscriptWord[] }`
  - `interface ScriptChunk { id: string; text: string; sourceStart: number; sourceEnd: number }`
  - `interface VoChunk { id: string; file: string; duration: number }`
  - `interface Segment { id: string; sourceStart: number; sourceUsedDuration: number; speedFactor: number; padDuration: number; targetDuration: number; voFile: string }`
  - `function loadTranscript(path: string): Promise<Transcript>` — throws on malformed input.

- [ ] **Step 1: Write the failing test**

```ts
// tests/transcript.test.ts
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
```

- [ ] **Step 2: Run test to verify it fails**

Run: `bun test tests/transcript.test.ts`
Expected: FAIL — cannot find module `../src/transcript`.

- [ ] **Step 3: Write `src/types.ts`**

```ts
// src/types.ts
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
```

- [ ] **Step 4: Write `src/transcript.ts`**

```ts
// src/transcript.ts
import type { Transcript } from "./types";

export async function loadTranscript(path: string): Promise<Transcript> {
  const raw = await Bun.file(path).json();
  if (typeof raw.duration !== "number") throw new Error("transcript: missing numeric 'duration'");
  if (!Array.isArray(raw.words)) throw new Error("transcript: missing 'words' array");
  for (const w of raw.words) {
    if (typeof w.text !== "string" || typeof w.start !== "number" || typeof w.end !== "number") {
      throw new Error("transcript: each word needs text/start/end");
    }
  }
  return raw as Transcript;
}
```

- [ ] **Step 5: Run test to verify it passes**

Run: `bun test tests/transcript.test.ts`
Expected: PASS (2 tests).

- [ ] **Step 6: Commit**

```bash
git add src/types.ts src/transcript.ts tests/transcript.test.ts
git commit -m "feat: shared types + transcript loader"
```

---

### Task 3: Segment planner (the core re-sync logic)

**Files:**
- Create: `src/align.ts`
- Test: `tests/align.test.ts`

**Interfaces:**
- Consumes: `ScriptChunk`, `VoChunk`, `Segment` from `src/types.ts`.
- Produces: `function planSegments(script: ScriptChunk[], vo: VoChunk[]): Segment[]`. For each chunk it sizes the recording segment to the voiceover duration: choose a speed in [0.5, 2.0]; if footage is still too long, trim the idle tail; if still too short, freeze-pad. Output length per segment always equals the VO duration.

- [ ] **Step 1: Write the failing test**

```ts
// tests/align.test.ts
import { expect, test } from "bun:test";
import { planSegments } from "../src/align";
import type { ScriptChunk, VoChunk } from "../src/types";

const chunk = (id: string, start: number, end: number): ScriptChunk =>
  ({ id, text: "x", sourceStart: start, sourceEnd: end });
const vo = (id: string, duration: number): VoChunk =>
  ({ id, file: `vo/${id}.mp3`, duration });

test("equal lengths → speed 1, no trim, no pad", () => {
  const [s] = planSegments([chunk("c1", 0, 10)], [vo("c1", 10)]);
  expect(s!.speedFactor).toBeCloseTo(1.0);
  expect(s!.sourceUsedDuration).toBeCloseTo(10);
  expect(s!.padDuration).toBeCloseTo(0);
});

test("footage mildly longer → speed up, use all source", () => {
  const [s] = planSegments([chunk("c1", 0, 12)], [vo("c1", 10)]);
  expect(s!.speedFactor).toBeCloseTo(1.2);
  expect(s!.sourceUsedDuration).toBeCloseTo(12);
  expect(s!.padDuration).toBeCloseTo(0);
});

test("footage far longer → clamp to 2x and trim idle tail", () => {
  const [s] = planSegments([chunk("c1", 0, 30)], [vo("c1", 10)]);
  expect(s!.speedFactor).toBeCloseTo(2.0);
  expect(s!.sourceUsedDuration).toBeCloseTo(20); // 20s @2x = 10s
  expect(s!.padDuration).toBeCloseTo(0);
});

test("footage far shorter → clamp to 0.5x and freeze-pad", () => {
  const [s] = planSegments([chunk("c1", 0, 3)], [vo("c1", 10)]);
  expect(s!.speedFactor).toBeCloseTo(0.5);
  expect(s!.sourceUsedDuration).toBeCloseTo(3); // 3 / 0.5 = 6s
  expect(s!.padDuration).toBeCloseTo(4);        // + 4s freeze = 10s
});

test("throws when a chunk has no matching VO", () => {
  expect(() => planSegments([chunk("c1", 0, 5)], [])).toThrow("c1");
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `bun test tests/align.test.ts`
Expected: FAIL — cannot find module `../src/align`.

- [ ] **Step 3: Write `src/align.ts`**

```ts
// src/align.ts
import type { ScriptChunk, VoChunk, Segment } from "./types";

const MIN_SPEED = 0.5;
const MAX_SPEED = 2.0;

const clamp = (n: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, n));

export function planSegments(script: ScriptChunk[], vo: VoChunk[]): Segment[] {
  return script.map((c) => {
    const v = vo.find((x) => x.id === c.id);
    if (!v) throw new Error(`planSegments: no voiceover for chunk ${c.id}`);
    const sourceDuration = c.sourceEnd - c.sourceStart;
    if (sourceDuration <= 0) throw new Error(`planSegments: bad source range for ${c.id}`);

    const target = v.duration;
    const speedFactor = clamp(sourceDuration / target, MIN_SPEED, MAX_SPEED);
    const afterSpeed = sourceDuration / speedFactor;

    let sourceUsedDuration = sourceDuration;
    let padDuration = 0;
    if (afterSpeed > target) {
      sourceUsedDuration = target * speedFactor; // trim idle tail
    } else if (afterSpeed < target) {
      padDuration = target - afterSpeed;          // freeze-pad
    }

    return {
      id: c.id,
      sourceStart: c.sourceStart,
      sourceUsedDuration,
      speedFactor,
      padDuration,
      targetDuration: target,
      voFile: v.file,
    };
  });
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `bun test tests/align.test.ts`
Expected: PASS (5 tests).

- [ ] **Step 5: Commit**

```bash
git add src/align.ts tests/align.test.ts
git commit -m "feat: segment planner sizes footage to voiceover (re-sync core)"
```

---

### Task 4: ElevenLabs voiceover synthesis

**Files:**
- Create: `src/elevenlabs.ts`

**Interfaces:**
- Consumes: env `ELEVENLABS_API_KEY`, `ELEVENLABS_VOICE_ID`; `ScriptChunk`, `VoChunk`.
- Produces:
  - `function synthesizeChunk(chunk: ScriptChunk, outDir: string): Promise<VoChunk>` — writes `outDir/<id>.mp3`, returns its `VoChunk` with measured duration (uses `ffprobeDuration` from `src/ffprobe.ts`).

- [ ] **Step 1: Write `src/elevenlabs.ts`**

```ts
// src/elevenlabs.ts
import type { ScriptChunk, VoChunk } from "./types";
import { ffprobeDuration } from "./ffprobe";

export async function synthesizeChunk(chunk: ScriptChunk, outDir: string): Promise<VoChunk> {
  const apiKey = process.env.ELEVENLABS_API_KEY;
  const voiceId = process.env.ELEVENLABS_VOICE_ID;
  if (!apiKey || !voiceId) throw new Error("ELEVENLABS_API_KEY and ELEVENLABS_VOICE_ID must be set");

  const res = await fetch(`https://api.elevenlabs.io/v1/text-to-speech/${voiceId}`, {
    method: "POST",
    headers: { "xi-api-key": apiKey, "Content-Type": "application/json" },
    body: JSON.stringify({
      text: chunk.text,
      model_id: "eleven_multilingual_v2",
      voice_settings: { stability: 0.5, similarity_boost: 0.8 },
    }),
  });
  if (!res.ok) throw new Error(`ElevenLabs ${res.status}: ${await res.text()}`);

  const file = `${outDir}/${chunk.id}.mp3`;
  await Bun.write(file, await res.arrayBuffer());
  const duration = await ffprobeDuration(file);
  return { id: chunk.id, file, duration };
}
```

- [ ] **Step 2: Smoke-test against a real chunk (requires `.env`)**

Run:
```bash
bun -e 'import {synthesizeChunk} from "./src/elevenlabs"; \
await Bun.write("videos/sample/vo/.keep",""); \
console.log(await synthesizeChunk({id:"c1",text:"This is a test of my cloned voice.",sourceStart:0,sourceEnd:3}, "videos/sample/vo"))'
```
Expected: prints a `VoChunk` with a `duration` > 0 and creates `videos/sample/vo/c1.mp3`. Listen to it — it should sound like your voice.

- [ ] **Step 3: Commit**

```bash
git add src/elevenlabs.ts
git commit -m "feat: ElevenLabs chunk synthesis + ffprobe duration"
```

---

### Task 5: FFmpeg assembler

**Files:**
- Create: `src/ffprobe.ts`, `src/finish.ts`
- Test: `tests/finish.test.ts`

**Interfaces:**
- Consumes: `Segment[]` from `planSegments`; the recording path; an output path.
- Produces: `function assembleVideo(opts: { recording: string; segments: Segment[]; workDir: string; out: string }): Promise<string>` — cuts each segment from the recording, applies speed + freeze-pad, concatenates them, lays the concatenated voiceover as the audio track, writes `out`, returns `out`. Original recording audio is dropped.

- [ ] **Step 0: Create the ffprobe utility (no credentials needed)**

```ts
// src/ffprobe.ts
export async function ffprobeDuration(path: string): Promise<number> {
  const proc = Bun.spawn([
    "ffprobe", "-v", "error", "-show_entries", "format=duration",
    "-of", "default=noprint_wrappers=1:nokey=1", path,
  ]);
  const out = await new Response(proc.stdout).text();
  const seconds = parseFloat(out.trim());
  if (!Number.isFinite(seconds)) throw new Error(`ffprobe: could not read duration of ${path}`);
  return seconds;
}
```

- [ ] **Step 1: Write the failing test**

```ts
// tests/finish.test.ts
import { expect, test } from "bun:test";
import { assembleVideo } from "../src/finish";
import { ffprobeDuration } from "../src/ffprobe";
import type { Segment } from "../src/types";

// Generates a 6s test recording + two 2s tone VO files with ffmpeg, then assembles.
test("assembleVideo produces a file whose duration matches the sum of targets", async () => {
  const dir = `${import.meta.dir}/fixtures/finish`;
  await Bun.$`mkdir -p ${dir}/vo`;
  await Bun.$`ffmpeg -y -f lavfi -i color=c=blue:s=320x240:d=6 -pix_fmt yuv420p ${dir}/recording.mp4`.quiet();
  await Bun.$`ffmpeg -y -f lavfi -i sine=frequency=440:duration=2 ${dir}/vo/c1.mp3`.quiet();
  await Bun.$`ffmpeg -y -f lavfi -i sine=frequency=660:duration=2 ${dir}/vo/c2.mp3`.quiet();

  const segments: Segment[] = [
    { id: "c1", sourceStart: 0, sourceUsedDuration: 3, speedFactor: 1.5, padDuration: 0, targetDuration: 2, voFile: `${dir}/vo/c1.mp3` },
    { id: "c2", sourceStart: 3, sourceUsedDuration: 1, speedFactor: 0.5, padDuration: 0, targetDuration: 2, voFile: `${dir}/vo/c2.mp3` },
  ];

  const out = await assembleVideo({ recording: `${dir}/recording.mp4`, segments, workDir: `${dir}/work`, out: `${dir}/final.mp4` });
  const dur = await ffprobeDuration(out);
  expect(dur).toBeGreaterThan(3.5);
  expect(dur).toBeLessThan(4.5); // ~4s total (2 + 2)
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `bun test tests/finish.test.ts`
Expected: FAIL — cannot find module `../src/finish`.

- [ ] **Step 3: Write `src/finish.ts`**

```ts
// src/finish.ts
import type { Segment } from "./types";

// Build one normalized video clip per segment (speed-adjusted, freeze-padded, muted).
async function renderSegment(recording: string, seg: Segment, workDir: string): Promise<string> {
  const clip = `${workDir}/${seg.id}.mp4`;
  // setpts divides PTS by speedFactor (speed up when >1); tpad clones the last frame for padDuration.
  const vf = `setpts=PTS/${seg.speedFactor},tpad=stop_mode=clone:stop_duration=${seg.padDuration.toFixed(3)}`;
  await Bun.$`ffmpeg -y -ss ${seg.sourceStart} -t ${seg.sourceUsedDuration} -i ${recording} \
    -an -vf ${vf} -r 30 -pix_fmt yuv420p -c:v libx264 ${clip}`.quiet();
  return clip;
}

export async function assembleVideo(opts: {
  recording: string; segments: Segment[]; workDir: string; out: string;
}): Promise<string> {
  await Bun.$`mkdir -p ${opts.workDir}`;

  // 1. Render each segment clip and concat VO files, in order.
  const clips: string[] = [];
  for (const seg of opts.segments) clips.push(await renderSegment(opts.recording, seg, opts.workDir));

  // 2. Concat video clips (concat demuxer needs a list file).
  const listFile = `${opts.workDir}/clips.txt`;
  await Bun.write(listFile, clips.map((c) => `file '${c}'`).join("\n"));
  const videoConcat = `${opts.workDir}/video.mp4`;
  await Bun.$`ffmpeg -y -f concat -safe 0 -i ${listFile} -c copy ${videoConcat}`.quiet();

  // 3. Concat VO audio (re-encode to be safe).
  const voList = `${opts.workDir}/vo.txt`;
  await Bun.write(voList, opts.segments.map((s) => `file '${s.voFile}'`).join("\n"));
  const audioConcat = `${opts.workDir}/audio.mp3`;
  await Bun.$`ffmpeg -y -f concat -safe 0 -i ${voList} -c copy ${audioConcat}`.quiet();

  // 4. Mux video + voiceover; end at the shorter stream.
  await Bun.$`ffmpeg -y -i ${videoConcat} -i ${audioConcat} -map 0:v:0 -map 1:a:0 \
    -c:v copy -c:a aac -shortest ${opts.out}`.quiet();
  return opts.out;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `bun test tests/finish.test.ts`
Expected: PASS (1 test). (First run is slow — it shells out to FFmpeg.)

- [ ] **Step 5: Commit**

```bash
git add src/ffprobe.ts src/finish.ts tests/finish.test.ts
git commit -m "feat: ffprobe util + ffmpeg assembler (speed/pad segments, lay voiceover)"
```

---

### Task 6: CLI orchestrator

**Files:**
- Create: `scripts/make-video.ts`

**Interfaces:**
- Consumes: `loadTranscript`, `synthesizeChunk`, `planSegments`, `assembleVideo`. Reads `videos/<slug>/script.json` (an array of `ScriptChunk`, authored by Claude in Task 7) and `videos/<slug>/recording.mp4`.
- Produces: a CLI: `bun run make-video <slug>` → writes `videos/<slug>/final.mp4`.

- [ ] **Step 1: Write `scripts/make-video.ts`**

```ts
// scripts/make-video.ts
import { synthesizeChunk } from "../src/elevenlabs";
import { planSegments } from "../src/align";
import { assembleVideo } from "../src/finish";
import type { ScriptChunk, VoChunk } from "../src/types";

const slug = process.argv[2];
if (!slug) throw new Error("usage: bun run make-video <slug>");
const dir = `videos/${slug}`;

const script = (await Bun.file(`${dir}/script.json`).json()) as ScriptChunk[];
if (!script.length) throw new Error(`${dir}/script.json is empty`);

await Bun.$`mkdir -p ${dir}/vo`;
const vo: VoChunk[] = [];
for (const chunk of script) {
  console.log(`synthesizing ${chunk.id}…`);
  vo.push(await synthesizeChunk(chunk, `${dir}/vo`));
}

const segments = planSegments(script, vo);
console.table(segments.map((s) => ({ id: s.id, speed: s.speedFactor.toFixed(2), pad: s.padDuration.toFixed(2), target: s.targetDuration.toFixed(2) })));

const out = await assembleVideo({ recording: `${dir}/recording.mp4`, segments, workDir: `${dir}/work`, out: `${dir}/final.mp4` });
console.log(`done → ${out}`);
```

- [ ] **Step 2: Verify it runs end-to-end on the sample (requires `.env` + Task 7's script.json)**

Run: `bun run make-video sample`
Expected: synthesizes each chunk, prints the segment table, writes `videos/sample/final.mp4`. Open it — the narration should be your clean cloned voice and the screen footage should track what's being described.

- [ ] **Step 3: Commit**

```bash
git add scripts/make-video.ts
git commit -m "feat: make-video CLI ties the thin slice together"
```

---

### Task 7: The `make-video` skill (Claude orchestrator)

**Files:**
- Create: `.claude/skills/make-video/SKILL.md`

**Interfaces:**
- Consumes: `videos/<slug>/transcript.json` + `videos/<slug>/recording.mp4`.
- Produces: `videos/<slug>/script.json` (array of `ScriptChunk`), then invokes the CLI from Task 6.

- [ ] **Step 1: Write `.claude/skills/make-video/SKILL.md`**

````markdown
---
name: make-video
description: Turn a screen recording + timed transcript into a finished, re-voiced video. Use when the user says "make a video" from a recording in videos/<slug>/.
---

# make-video (thin Y-slice)

Given `videos/<slug>/recording.mp4` and `videos/<slug>/transcript.json`, produce `videos/<slug>/final.mp4`.

## Steps

1. **Read the transcript** at `videos/<slug>/transcript.json` (shape: `{duration, words:[{text,start,end}]}`).

2. **Write a chunked script.** Rewrite the rambling transcript into clean narration, broken into chunks. Each chunk maps to a contiguous time range of the recording. Rules:
   - **Ground every chunk in the transcript** — never narrate a step that isn't in the words/timestamps.
   - Keep `sourceStart`/`sourceEnd` aligned to where that content actually happens (use the word timestamps).
   - Aim for chunk narration whose spoken length is *close* to its footage length (the planner tolerates a 0.5×–2× mismatch, beyond which it trims idle tail or freeze-pads).
   - Save the result to `videos/<slug>/script.json` as an array of `{id, text, sourceStart, sourceEnd}` with ids `c01`, `c02`, …

3. **Show the script to the user for approval (✋ checkpoint).** Do not proceed until approved — this is before any ElevenLabs spend.

4. **Run the pipeline:** `bun run make-video <slug>`.

5. **Review `videos/<slug>/final.mp4`** with the user (✋ checkpoint): does the footage track the narration? If a segment feels rushed or padded, adjust that chunk's text length or `sourceStart`/`sourceEnd` in `script.json` and re-run.

## Notes
- This thin slice has no Tella editing, music, captions, or publish yet — those are later plans.
- The user's `.env` must contain `ELEVENLABS_API_KEY` and `ELEVENLABS_VOICE_ID`.
````

- [ ] **Step 2: Manual validation**

In a Claude Code session: place a real `recording.mp4` + `transcript.json` in `videos/sample/`, invoke the skill, approve the script, and confirm `final.mp4` is produced and watchable.

- [ ] **Step 3: Commit**

```bash
git add .claude/skills/make-video/SKILL.md
git commit -m "feat: make-video skill (thin Y-slice orchestrator)"
```

---

## Self-Review

**1. Spec coverage (thin-slice scope):**
- Ramble → script (grounded in transcript): Task 7 ✅
- Cloned-voice VO per chunk: Task 4 ✅
- Footage re-sized to voice (the core risk): Task 3 (logic) + Task 5 (render) ✅
- End-to-end one-command run: Task 6 ✅
- Human checkpoints (script approval before spend; draft review): Task 7 ✅
- Deferred by design (documented, not gaps): Tella MCP visual editing, chapter cards, music, blur, captions, YouTube publish, retro loop → later plans / `plan.md`.

**2. Placeholder scan:** No "TBD"/"handle edge cases" — every code step has real code; every run step has an exact command + expected result. ✅

**3. Type consistency:** `Segment` fields (`sourceUsedDuration`, `speedFactor`, `padDuration`, `targetDuration`, `voFile`) are defined in Task 2 and used identically in Tasks 3, 5, 6. `synthesizeChunk`/`planSegments`/`assembleVideo` signatures match across the producing and consuming tasks. ✅

**4. Known follow-ups (next plan):** replace the manual `transcript.json`/`recording.mp4` drop with Tella-MCP ingest; add the real-face intro + faceless outro concat; add captions burned from `script.json`.

---

## Task 5→6 Blockers (from final whole-branch review, 2026-06-18)

Fix before Task 6 wires real recordings into `assembleVideo` (these don't affect the synthetic-fixture tests but surface on real footage):

1. **`-c copy` concat fragility** — segment clips are concat-demuxed with `-c copy`, which requires identical codec params. Real recordings (variable fps/timebase) can cause non-monotonic DTS or A/V drift at joins. Fix: normalize per clip (`-vsync cfr`, pinned profile/level/timebase) or use the `concat` filter with re-encode.
2. **`-shortest` may truncate narration** — video and audio are concatenated independently; rounding can make the video end a few ms short, and `-shortest` then clips the *audio* (narration), violating content-is-sacred. Fix: guarantee video ≥ audio (pad with `tpad`/`apad`) before muxing.

Deferred Minors (non-blocking): hardcoded `-r 30`; no `workDir` cleanup; strict float-equality branches in `align.ts` (≤7e-15s, absorbed by `toFixed(3)`); placeholder `tests/setup.test.ts`.
