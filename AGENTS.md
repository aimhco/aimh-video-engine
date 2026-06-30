# AGENTS.md

## Project Basics

- Use Bun for this TypeScript project: `bun install`, `bun test`, and `bun run <script>`.
- Keep generated video artifacts under `videos/<slug>/`; that directory is gitignored and should stay local.
- Do not commit `.env`, rendered media, or per-video private inputs.

## Video Workflow In Codex

- Codex can run this repo locally from the Codex app, CLI, or IDE extension. Use the integrated terminal for `bun` commands and FFmpeg verification.
- The canonical make-video skill lives at `/Users/dennywii/Documents/dev/Skills/make-video/SKILL.md` and in `github.com/aimhco/skills`. The repo-scoped `.agents/skills/make-video/SKILL.md` is a Codex-discoverable mirror; keep it aligned when changing the workflow.
- Invoke the skill with `$make-video` or ask to make/run a video for a slug.
- The legacy Claude Code skill remains at `.claude/skills/make-video/SKILL.md`; keep the two playbooks aligned when changing the video workflow.

## Required Local Capabilities

- ElevenLabs is used through environment variables, not a Codex connector: set `ELEVENLABS_API_KEY` and `ELEVENLABS_VOICE_ID` in `.env`.
- Tella visual edits require an authenticated Tella MCP/app connector and `videos/<slug>/tella.json` with the project IDs. Without a Tella project, flat `recording.mp4` renders still work, but zoom/highlight/blur overlays are reported as not applicable.
- Captions require an FFmpeg build with the `subtitles`/libass filter. If the default `ffmpeg` lacks it, set `FFMPEG` and `FFPROBE` in `.env` to a libass-enabled build.

## Verification

- Run `bun test` before committing changes.
- For render workflow changes, also run the most relevant targeted tests, usually `bun test tests/finish.test.ts tests/adjustments.test.ts`.
