# Roadmap — Future Stages (9–12)

This document covers the **deferred** stages of `aimh-video-engine` — the multi-platform and growth layer that sits on top of the core engine (Stages 1–8, see [`README.md`](./README.md)). None of these are built or required for the core "ramble → finished YouTube video" loop. They are designed for now so the architecture accommodates them without a rewrite.

## Current Core-Engine Status

- **Finish Stage 8 / C1 first:** done in practice for the current manual workflow. Intro music, chapter-card music, and deterministic manual-outro music are all implemented.
- **C5:** done. YouTube publishing supports private upload plus optional `publishAt` scheduling.
- **C3:** done. `bun run retro <slug>` creates a reviewable per-video retro file, and `bun run retro <slug> --apply` merges approved durable lessons into `house-style.md` idempotently.
- **Moved out of the core-engine closeout and into Stages 9–12:** `C2` generated spoken-outro engine wiring, and `C4` word-level captions after the new-mic re-record.

**Design principle that makes this possible:** every provider sits behind a clean interface. Each future stage is a module that consumes the core engine's `final.mp4` + metadata and is independently swappable.

---

## Status Legend

| Symbol | Meaning |
|--------|---------|
| 🔲 | Deferred — designed, not started |
| 🟡 | Under evaluation |
| 🟢 | In progress |
| ✅ | Done |

---

## Stage 9 — Shorts 🔲

**Goal:** Automatically generate 3–5 vertical short-form clips from each finished long video.

**Interface:** `final.mp4 → shorts/*.mp4` (vertical, captioned)

**Also deferred here:** optional generated spoken-outro wiring can land in this future-wave bucket rather than blocking the core manual-outro workflow.

**Candidate tools:**
- **OpusClip** — virality scoring, auto-captions, has an API, schedules to Shorts/TikTok/IG/etc.
- **Vizard** — long-to-short with auto captions + hashtags.
- **Tella** — can output vertical layouts + clips natively (avoids a new vendor).

**Open questions:**
- Let Claude pick the clip moments (from the transcript + a "virality" heuristic) vs. delegate to OpusClip's scoring?
- Keep shorts inside Tella to avoid another subscription, or accept OpusClip for better clip selection?

---

## Stage 10 — SEO Pack 🔲

**Goal:** Generate optimized metadata to maximize discovery.

**Interface:** `transcript.json + topic → metadata.json` (title variants, description, tags, chapters, hashtags)

**Approach:** Largely a **Claude step** — it can generate optimized titles/descriptions/tags/chapters from the transcript plus a quick trend search. Optional hard data from:
- **vidIQ / TubeBuddy** — keyword search volume + competition.

**Open questions:**
- Is LLM-generated SEO sufficient, or is real search-volume data (vidIQ) worth the extra subscription?
- A/B multiple title variants automatically via YouTube's test-and-compare?

---

## Stage 11 — Distribute 🔲

**Goal:** Cross-post and schedule the long video + shorts across platforms automatically.

**Interface:** `final.mp4 + shorts/ + metadata.json → posted/scheduled across platforms`

**Candidate tools:**
- **Blotato** — posts natively to 9+ platforms (YouTube, TikTok, IG, LinkedIn, X, Threads, FB, Reddit, Bluesky), has a **REST API + MCP** (drivable by Claude), $29/mo.
- **Postiz** — open-source, self-hostable, API/MCP — if owning the stack is preferred over paying.

**Open questions:**
- Which platforms are actually worth the effort for a developer audience (likely YouTube + X + LinkedIn first)?
- Schedule via Blotato's calendar, or keep YouTube on the Data API and only use Blotato for the rest?

---

## Stage 12 — Thumbnails 🔲

**Goal:** Generate on-brand, high-CTR thumbnails automatically.

**Interface:** `topic + key frame → thumbnail.png`

**Also deferred here:** word-level caption polish after the new-mic re-record, if that remains valuable once the core tool is in real use.

**Candidate approaches:**
- Templated (brand layout + a hero screenshot + text) rendered as code.
- An image model via **fal.ai** / **kie.ai** for backgrounds or stylized variants.

**Open questions:**
- Templated consistency vs. generated variety?
- A/B thumbnails (YouTube's native test) to learn what performs?

---

## Provider Future-Proofing (cross-cutting)

Kept behind clean interfaces so they can be swapped without touching other stages:

| Module | Today | Future options |
|--------|-------|----------------|
| TTS (voice) | ElevenLabs (Multilingual v2) | fal.ai (MiniMax, Chatterbox, Kokoro), OpenRouter TTS |
| LLM (script/QA) | Claude Code | OpenRouter gateway (multi-model) |
| B-roll / music generation | curated library | kie.ai / fal.ai generative models |

---

_Last updated: 2026-06-22. This plan is intentionally high-level; each stage gets its own detailed spec + implementation plan when it moves from 🔲 to 🟢._
