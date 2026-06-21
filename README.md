<!-- Improved compatibility of back to top link: See: https://github.com/othneildrew/Best-README-Template/pull/73 -->
<a id="readme-top"></a>

<!-- PROJECT SHIELDS -->
[![Status][status-shield]][status-url]
[![MIT License][license-shield]][license-url]
[![Stargazers][stars-shield]][stars-url]
[![Issues][issues-shield]][issues-url]

<!-- PROJECT LOGO / TITLE -->
<br />
<div align="center">
  <a href="https://github.com/aimhco/aimh-video-engine">
    <img src="assets/logo.svg" alt="aimh-video-engine logo" width="96" height="96">
  </a>

  <h2 align="center">aimh-video-engine</h2>

  <p align="center">
    <strong>Ramble at your screen. Get a finished YouTube video. Automatically.</strong>
    <br />
    A Claude Code pipeline that turns daily screen recordings + messy narration into a
    polished, narrated, captioned, branded video — and schedules it to YouTube.
    <br />
    <br />
    <a href="#how-it-works"><strong>See how it works »</strong></a>
    ·
    <a href="#design-decisions">Design Decisions</a>
    ·
    <a href="./plan.md">Roadmap (Stages 9–12)</a>
  </p>
</div>

<!-- STATUS BADGES -->
<div align="center">

[![Claude Code][claude-badge]][claude-url]
[![Tella][tella-badge]][tella-url]
[![ElevenLabs][eleven-badge]][eleven-url]
[![FFmpeg][ffmpeg-badge]][ffmpeg-url]

</div>

> **🟢 Status: Thin slice working.** The core pipeline runs end-to-end — a Tella screen recording + its `.srt` becomes a finished, re-voiced **1080p** video in your cloned voice, with footage re-timed to the narration (via the [`make-video`](.claude/skills/make-video/SKILL.md) skill). **Built:** `.srt` → clean chunked script → ElevenLabs voice → footage re-sync → FFmpeg assembly (H.264 `crf 18` + 160k AAC) → optional real-face intro + reusable outro wrap, plus **declarative per-chunk auto-zoom** via the Tella MCP (`plan-zooms` → steady `manualZoom`, applied on the original recording before re-timing) and **burned-in captions** generated from the script + voice timing. **Next:** Tella-MCP blur/layouts/chapter cards, music, word-level caption timing, and scheduled YouTube publishing. Future stages (9–12) live in [`plan.md`](./plan.md).

<!-- TABLE OF CONTENTS -->
<details>
  <summary>Table of Contents</summary>
  <ol>
    <li>
      <a href="#about-the-project">About The Project</a>
      <ul>
        <li><a href="#the-inspiration">The Inspiration</a></li>
        <li><a href="#the-twist-a-hybrid">The Twist: A Hybrid</a></li>
        <li><a href="#built-with">Built With</a></li>
      </ul>
    </li>
    <li><a href="#how-it-works">How It Works</a></li>
    <li>
      <a href="#design-decisions">Design Decisions</a>
      <ul>
        <li><a href="#the-decisions">The Decisions</a></li>
        <li><a href="#rejected-alternatives">Rejected Alternatives</a></li>
      </ul>
    </li>
    <li><a href="#cost">Cost</a></li>
    <li><a href="#the-pipeline-in-detail">The Pipeline In Detail</a></li>
    <li><a href="#error-handling--qa-gates">Error Handling & QA Gates</a></li>
    <li><a href="#build-sequence">Build Sequence</a></li>
    <li><a href="#repository-structure">Repository Structure</a></li>
    <li><a href="#getting-started">Getting Started</a></li>
    <li><a href="#usage">Usage</a></li>
    <li><a href="#roadmap">Roadmap</a></li>
    <li><a href="#contributing">Contributing</a></li>
    <li><a href="#license">License</a></li>
    <li><a href="#contact">Contact</a></li>
    <li><a href="#acknowledgments">Acknowledgments</a></li>
  </ol>
</details>

---

## About The Project

Making a single tutorial video by hand took **hours** — retakes, editing, fighting a timeline. The kind of work that makes you ship *one video every few months*, or none at all.

**aimh-video-engine** removes the part that hurts. You share your screen, ramble through what you're doing (mistakes and all), and the engine produces a finished video: a clean voiceover in your own cloned voice, tight pacing, auto-zooms, captions, chapter cards, music, your logo — scheduled to YouTube. The only on-camera moment is a short, freely-spoken intro showing your real face.

### The Inspiration

This was sparked by Nate Herk's video, *["Claude Fable 5 Made This Entire Video By Itself"](https://www.youtube.com/watch?v=ONmaDdOBGig)* — a single `/goal` prompt where Claude wrote a script, cloned a voice via **ElevenLabs**, rendered a **HeyGen** avatar, generated motion graphics as code, and stitched everything with **FFmpeg**, verifying frames as it went.

**The key realization:** that video was **100% synthetic** — no screen recording at all. A talking-head avatar *is* the whole frame. That format doesn't fit a developer build-log.

### The Twist: A Hybrid

aimh-video-engine is a **hybrid**: the **screen recording is the content**, and AI narration is the connective tissue. There is **no avatar** — for a screen-first video, an AI face in a corner is the worst-value spend, and a real webcam intro is more authentic. The result is a real tutorial, not a synthetic explainer.

> **Why automate at zero revenue?** This isn't about money. It (1) eliminates the work that otherwise stops videos from being made, and (2) is itself an open-source artifact + portfolio piece demonstrating agentic engineering. Both pay off regardless of channel growth.

### Built With

| Tool | Role |
|------|------|
| [Claude Code](https://claude.com/claude-code) | Orchestrator + scriptwriter + QA (the brain) |
| [Tella](https://www.tella.com/) (+ [MCP](https://www.tella.com/docs/mcp-server)) | Screen recording, visual editing, the automation surface |
| [ElevenLabs](https://elevenlabs.io/) | Your cloned voice (Multilingual v2 default) |
| [FFmpeg](https://ffmpeg.org/) | Voiceover mux, music bed, logo overlay, burned captions |
| [YouTube Data API](https://developers.google.com/youtube/v3) | Scheduled publishing (`private` + `publishAt`) |
| CleanShotX | Optional quick screen grabs |

<p align="right">(<a href="#readme-top">back to top</a>)</p>

---

## How It Works

Eight stages. Two human review checkpoints (✋), one human recording step (🎬), everything else automated.

```
 INPUTS: Tella recordings (screen + rough scratch narration) · house-style.md
         · curated music library · logo.png · reusable outro asset

 1. INGEST        Pull today's clips + timed transcripts from Tella (MCP).
        │
 2. SCRIPT        Claude rewrites the messy transcript → clean, chunked
        │         narration, grounded strictly in the transcript.   ✋ you edit
 3. VOICE         ElevenLabs → one VO clip per chunk in your cloned voice
        │         (durations drive the visual timing).
 4. VISUAL EDIT   Tella MCP: auto-zoom (declarative manualZoom cues) ·
   (Tella MCP)    blur secrets · highlights · transitions · animated chapter
        │         cards · screen-only layout.   (zoom built; rest planned)
 5. ASSEMBLE+MUX  Tella export (4K, muted) → FFmpeg: lay VO · music bed ·
   (Tella+ffmpeg) logo overlay · burn captions from script · prepend 🎬 real-face
        │         intro · append faceless reusable outro.
 6. QA            Claude renders frames + checks: durations align, captions
        │         match, secrets blurred, audio levels sane → auto-fix.  ✋ you watch
 7. PUBLISH       YouTube Data API: title + description (auto chapters),
        │         privacyStatus=private + publishAt → scheduled, auto-public.
 8. RETRO         Claude proposes updates to house-style.md so the same
   (self-improve)  mistakes aren't repeated. Next video starts smarter.
```

**The core insight — voice is the spine.** Because there is no face in the body, footage is sized to the voice (not the reverse). *Content is sacred; only idle/dead time is trimmed or sped up.* If footage is all-essential, Claude lengthens the narration instead of cutting. Action timing comes from your **live narration timestamps** ("now I click Deploy") in the timed transcript, plus Tella's cursor/click data. Tolerance is loose — no lip-sync — so "the click is on screen while you talk about it" is enough.

<p align="right">(<a href="#readme-top">back to top</a>)</p>

---

## Design Decisions

Every major fork, with the reasoning. This is the project's decision record.

### The Decisions

| # | Decision | Why |
|---|----------|-----|
| 1 | **No HeyGen avatar** | For a screen-first / PiP format, a corner avatar is the worst-value spend. Tella records a real webcam face for free, which is more authentic for a small technical channel. Saved ~$29/mo + ~$18/video. |
| 2 | **Faceless body** | You cannot have a real talking face *and* a rewritten voice — lips won't match. So the body shows the screen only; the cleaned voiceover plays over it. |
| 3 | **Voiceover from a rewritten script ("Y-path")** | The whole point is to *ramble freely* while recording, then let Claude rewrite and a cloned voice deliver it. Cleaning your raw audio ("X-path") was **rejected** — for this creator the hard part is *performing*, not editing. |
| 4 | **Real-face intro, faceless reusable outro** | A fresh ~15s intro (real face, real voice, today's clothes = internally consistent) gives a human moment with natural lip-sync. The outro is a faceless branded end-card — no face means no clothing mismatch, so it's reusable forever. |
| 5 | **Tella as the engine (not DIY CleanShotX + FFmpeg)** | Tella's MCP is the automation surface *and* the auto-polish (zoom, layouts, blur, captions). Dropping it to save $19 would forfeit both. CleanShotX kept for quick grabs only. |
| 6 | **Claude orchestrates and writes the script (not ChatGPT)** | Claude is already the harness with the tools; routing the script to ChatGPT adds a key + cost + a copy-paste seam for no gain. Transcription is free from Tella. |
| 7 | **ElevenLabs for voice (Multilingual v2)** | Replaces HeyGen's voice role — *not* an added subscription. v2 for consistent narration; Eleven v3 optional for more expression. |
| 8 | **FFmpeg for audio + branding** | Tella's MCP can't replace audio or add music, so FFmpeg muxes the VO, mixes a music bed (intro/outro/cards, dry under body, from a curated royalty-free library), overlays the logo, and burns captions from the script. |
| 9 | **Animated chapter cards generated as code** | Tella has no native title-card creation. Claude renders branded animated cards → MP4 → inserts as clips. Replaces the manual Google Slides → PNG step; timestamps also auto-fill YouTube description chapters. |
| 10 | **YouTube Data API for publishing (not Tella upload)** | FFmpeg holds the final cut, so we upload that. The Data API is also the only route to *scheduled* publishing (`private` + `publishAt`) — giving YouTube hours to index. |
| 11 | **Self-improving loop** | `house-style.md` is read every run and updated by a post-video retro, so corrections become permanent rules. This is what makes it an engine, not a one-off. |
| 12 | **Secret-leak QA gate: balanced** | Flags obvious keys/`.env`/tokens before publish without paranoid-blocking anything key-shaped. |

### Rejected Alternatives

- **HeyGen avatar (any usage)** — uncanny and low-value in a screen-first format; cost scales with avatar minutes.
- **X-path (clean real recorded audio)** — doesn't reduce the creator's actual pain (performing), only engineering risk. Knowingly traded engineering risk for the freedom to ramble.
- **CleanShotX + FFmpeg only** — free, but throws away the MCP automation surface and the auto-polish; false economy.
- **ChatGPT for transcribe/script** — Tella transcribes for free; Claude scripts natively. ChatGPT only as an optional manual paste step.
- **fal.ai / OpenRouter / kie.ai for voice (now)** — kept as future cost/flexibility options behind the pluggable TTS interface; none beats a professional clone of *your* voice today.

<p align="right">(<a href="#readme-top">back to top</a>)</p>

---

## Cost

| Item | Role | Cost |
|------|------|------|
| **Tella Pro** | Record + edit engine + MCP | **$19/mo** ($12 annual) |
| **ElevenLabs Creator** | Cloned voice | **$22/mo** (or Starter $5 to validate) |
| Claude Code | Orchestrator + scriptwriter | already owned |
| FFmpeg / CleanShotX | Audio/branding / capture | free |
| YouTube Data API | Publishing | free |
| HeyGen | — cut — | $0 |
| **Fixed total** | | **~$41/mo** |
| **Per ~4.5-min video** | within plan limits | **~$0** (~20+ videos/mo before overage) |

For reference, the original avatar-based concept was **~$70/mo + ~$18/video**.

<p align="right">(<a href="#readme-top">back to top</a>)</p>

---

## The Pipeline In Detail

| Stage | Owner | Input → Output |
|-------|-------|----------------|
| 1. Ingest | `make-video` skill (Tella MCP) | Tella clips → `transcript.json` |
| 2. Script | Claude ✋ | `transcript.json` → `script.md` (chunked) |
| 3. Voice | `scripts/elevenlabs.ts` | `script.md` → `vo/*.mp3` + `durations.json` |
| 4. Visual edit | `scripts/plan-zooms.ts` + Claude (Tella MCP) | `script.json` zoom cues → `zoom-plan.json` → zoomed `recording.mp4` (zoom built; blur/layouts/cards planned) |
| 5. Mux | `scripts/finish.ts` (FFmpeg) | visuals + VO + music + logo + captions + intro + outro → `final.mp4` |
| 6. QA | Claude ✋ | `final.mp4` → checks pass / fixes |
| 7. Publish | `scripts/publish.ts` (YouTube API) | `final.mp4` + `metadata.json` → scheduled video |
| 8. Retro | Claude | corrections → `house-style.md` diff |

**Guiding principle: Claude does judgment, scripts do determinism.** The LLM handles taste (script, zoom placement, music choice, QA). Small `bun`-run TypeScript scripts handle the mechanical work (API calls, FFmpeg, upload) so they're reliable, testable, and re-runnable without spending tokens. Every stage reads/writes **files** in `videos/<slug>/`, so any stage re-runs independently.

<p align="right">(<a href="#readme-top">back to top</a>)</p>

---

## Error Handling & QA Gates

Every stage validates its own outputs before the next starts, and every stage is **idempotent + resumable** — a failed run resumes from the broken stage and never re-spends ElevenLabs/YouTube quota.

**Hard gates (blocking):**
- 🔒 **Cost** — script must pass your ✋ review *before* any ElevenLabs spend.
- 🔒 **Secret-leak (balanced)** — Stage 6 scans rendered frames for visible keys/`.env`/tokens; if found and unblurred, loops back to `add_blur` before publish.
- 🔒 **Safe publish** — always upload `private` + `publishAt`; verify success; auto-goes-public on schedule.

**Graceful degradation:** ElevenLabs down → pause; Tella export fails → FFmpeg from raw clips; card render fails → simple text-card fallback. A `--dry-run` flag runs Stages 1–6 and stops before publish.

<p align="right">(<a href="#readme-top">back to top</a>)</p>

---

## Build Sequence

To de-risk the two unproven assumptions (rambling → a good script; footage↔voice re-sync feeling natural), build in this order:

1. **Thin end-to-end Y slice** — one short recording through *every* stage with minimal polish. Validates the core magic before investing in polish.
2. **Polish** — animated chapter cards, music, blur, highlights, layouts.
3. **Self-improving loop** — `house-style.md` + the retro stage.
4. **Future stages 9–12** — see [`plan.md`](./plan.md).

<p align="right">(<a href="#readme-top">back to top</a>)</p>

---

## Repository Structure

```
aimh-video-engine/
├── .claude/skills/make-video/SKILL.md   # the make-video orchestrator skill
├── src/
│   ├── types.ts          # shared types
│   ├── transcript.ts     # transcript loader/validator
│   ├── align.ts          # planSegments() — sizes footage to voice (the re-sync core)
│   ├── ffprobe.ts        # ffprobeDuration()
│   ├── elevenlabs.ts     # synthesizeChunk() — cloned-voice VO (cached)
│   └── finish.ts         # assembleVideo() — FFmpeg cut/speed/pad/concat/mux
├── scripts/make-video.ts # CLI: script.json + recording.mp4 -> final.mp4
├── tests/                # bun tests (align, transcript, finish)
├── videos/<slug>/        # per-video working dir (gitignored): recording.mp4 · *.srt · script.json · vo/ · final.mp4
├── docs/plans/           # implementation plans
├── plan.md               # future stages 9–12
└── README.md
```

<p align="right">(<a href="#readme-top">back to top</a>)</p>

---

## Getting Started

> The core (thin-slice) pipeline is implemented and runs today, plus the intro/outro wrap and **per-chunk auto-zoom** (Stage 4). Remaining polish stages (blur/layouts/chapter cards, music, captions, publish) are in progress.

### Prerequisites

- [Bun](https://bun.sh/) (JavaScript/TypeScript runtime)
- [FFmpeg](https://ffmpeg.org/download.html) **with libass** (needed to burn captions). `brew install ffmpeg` usually includes it — check with `ffmpeg -version | grep libass`. If yours doesn't (e.g. a minimal build), install the fuller `ffmpeg-full` formula and point `FFMPEG`/`FFPROBE` at it (see Environment Variables).
- [Claude Code](https://claude.com/claude-code)
- A [Tella](https://www.tella.com/) account (Pro) with the MCP connected
- An [ElevenLabs](https://elevenlabs.io/) account (Creator) with a cloned voice
- A Google Cloud project with the YouTube Data API enabled (OAuth)

### Environment Variables

| Variable | Description |
|----------|-------------|
| `ELEVENLABS_API_KEY` | ElevenLabs API key |
| `ELEVENLABS_VOICE_ID` | Your cloned voice id |
| `YOUTUBE_CLIENT_ID` / `YOUTUBE_CLIENT_SECRET` | YouTube Data API OAuth |
| `YOUTUBE_REFRESH_TOKEN` | Long-lived YouTube auth token |
| `FFMPEG` / `FFPROBE` | Optional. Paths to the ffmpeg/ffprobe binaries; default to those on `PATH`. Set these to a libass-enabled build (e.g. `/usr/local/opt/ffmpeg-full/bin/ffmpeg`) if your default ffmpeg lacks libass. |

<p align="right">(<a href="#readme-top">back to top</a>)</p>

---

## Usage

**Working today (thin slice):**

1. Record your screen in Tella while rambling through what you're doing (and add zoom/blur in Tella if you like).
2. Export the recording (`.mp4`) and its subtitles (`.srt`) into `videos/<slug>/` (as `recording.mp4` + the `.srt`).
3. In Claude Code, invoke the **`make-video`** skill — Claude reads the `.srt`, writes a clean chunked `script.json`, and (after your ✋ approval) runs `bun run make-video <slug>`.
4. The engine synthesizes your cloned voice, re-times the footage to it, burns in captions from the script, optionally wraps a real-face `intro.mp4` + reusable `outro.mp4` (if present in `videos/<slug>/`), and writes `videos/<slug>/final.mp4` (1080p H.264 `crf 18`). It also overlays your `assets/logo.png` as a top-right watermark. Run `bun run qa <slug>` to validate the output (duration, 1080p, audio, captions; exits nonzero on failure), then review it (✋). (Add per-chunk `zoom` cues to `script.json` and run `bun run plan-zooms <slug>` to apply auto-zoom in Tella first; `--no-captions` skips captions, `--no-logo` skips the watermark.)

**Planned:** Tella-MCP blur/layouts/chapter cards, music, word-level caption timing, and scheduled YouTube publishing.

<p align="right">(<a href="#readme-top">back to top</a>)</p>

---

## Roadmap

Core engine: Stages 1–8 (above). Deferred future stages live in **[`plan.md`](./plan.md)**:

- **Stage 9 — Shorts:** auto-generate vertical clips from the final video.
- **Stage 10 — SEO pack:** optimized titles, descriptions, tags, chapters.
- **Stage 11 — Distribute:** cross-post + schedule across platforms.
- **Stage 12 — Thumbnails:** automated, on-brand thumbnail generation.

See the [open issues](https://github.com/aimhco/aimh-video-engine/issues) for a full list of proposed features and known issues.

<p align="right">(<a href="#readme-top">back to top</a>)</p>

---

## Contributing

Contributions are what make the open source community such an amazing place to learn, inspire, and create. Any contributions you make are **greatly appreciated**.

1. Fork the Project
2. Create your Feature Branch (`git checkout -b feature/AmazingFeature`)
3. Commit your Changes (`git commit -m 'Add some AmazingFeature'`)
4. Push to the Branch (`git push origin feature/AmazingFeature`)
5. Open a Pull Request

<p align="right">(<a href="#readme-top">back to top</a>)</p>

---

## License

Distributed under the MIT License. See `LICENSE` for more information.

<p align="right">(<a href="#readme-top">back to top</a>)</p>

---

## Contact

Denny — denny@aimh.co

Website: https://www.aimh.co

Project Link: [https://github.com/aimhco/aimh-video-engine](https://github.com/aimhco/aimh-video-engine)

<p align="right">(<a href="#readme-top">back to top</a>)</p>

---

## Acknowledgments

- [Nate Herk](https://www.youtube.com/watch?v=ONmaDdOBGig) — the inspiration
- [Tella](https://www.tella.com/) — screen recording + MCP
- [ElevenLabs](https://elevenlabs.io/) — voice cloning
- [FFmpeg](https://ffmpeg.org/) — the swiss-army knife
- [Best-README-Template](https://github.com/othneildrew/Best-README-Template) — README structure
- [Shields.io](https://shields.io/) — README badges

<p align="right">(<a href="#readme-top">back to top</a>)</p>

<!-- MARKDOWN LINKS & IMAGES -->
[status-shield]: https://img.shields.io/badge/status-thin%20slice%20working-brightgreen?style=for-the-badge
[status-url]: #about-the-project
[license-shield]: https://img.shields.io/github/license/aimhco/aimh-video-engine.svg?style=for-the-badge
[license-url]: https://github.com/aimhco/aimh-video-engine/blob/main/LICENSE
[stars-shield]: https://img.shields.io/github/stars/aimhco/aimh-video-engine.svg?style=for-the-badge
[stars-url]: https://github.com/aimhco/aimh-video-engine/stargazers
[issues-shield]: https://img.shields.io/github/issues/aimhco/aimh-video-engine.svg?style=for-the-badge
[issues-url]: https://github.com/aimhco/aimh-video-engine/issues
[claude-badge]: https://img.shields.io/badge/Claude_Code-D97757?style=for-the-badge&logo=anthropic&logoColor=white
[claude-url]: https://claude.com/claude-code
[tella-badge]: https://img.shields.io/badge/Tella-000000?style=for-the-badge&logoColor=white
[tella-url]: https://www.tella.com/
[eleven-badge]: https://img.shields.io/badge/ElevenLabs-000000?style=for-the-badge&logoColor=white
[eleven-url]: https://elevenlabs.io/
[ffmpeg-badge]: https://img.shields.io/badge/FFmpeg-007808?style=for-the-badge&logo=ffmpeg&logoColor=white
[ffmpeg-url]: https://ffmpeg.org/
