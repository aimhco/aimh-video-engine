# Codex Handoff — Core Engine Docs + Retro Review

Date: 2026-06-23

## User Intent

The user wants the AIMH video engine to feel like one agent-run workflow, not a bag of commands. The practical interaction should be:

1. User asks Claude Code CLI / Codex CLI to make a video for `<slug>`.
2. Agent reads `house-style.md`, the recording inputs, and the Tella context.
3. Agent writes/updates `script.json`, asks for the script approval checkpoint, then runs the render pipeline.
4. Agent runs QA and asks the user to review the finished video.
5. User gives corrections in plain language: ElevenLabs pronunciation, Tella visual/layout/export issues, zoom/highlight/blur placement, intro/outro/music balance, etc.
6. Agent makes targeted fixes, re-renders, re-runs QA, and repeats until approved.
7. Agent uploads or schedules to YouTube.
8. At session end, user says `run retro for <slug>`.
9. Agent writes durable lessons into `videos/<slug>/retro.json`.
10. User reviews the rules.
11. Agent runs `bun run retro <slug> --apply` to merge approved rules into `house-style.md`.

The user specifically asked to document this and avoid implying they should memorize many separate commands.

## Changes To Review

Docs/implementation changes from Codex:

- `README.md`
  - Changed status to core engine ready.
  - Reframed Usage around the agent-run workflow.
  - Added the explicit retro sequence requested by the user.
  - Clarified the direct CLI retro commands and placeholder guard.
  - Fixed stale wording around thin slice, reusable outro, and script output.

- `plan.md`
  - Added the operator principle: commands are internal implementation details the agent runs unless the user asks otherwise.

- `.claude/skills/make-video/SKILL.md`
  - Added an operator contract: the user can ask for "make video `<slug>`"; the agent owns lower-level commands and review-loop reruns.
  - Already reads `house-style.md` before scripting and runs the retro loop after review/publish.

- `src/retro.ts`, `scripts/retro.ts`, `tests/retro.test.ts`
  - C3 implementation was committed in `4e2d183`, and this follow-up adds a guard so `bun run retro <slug> --apply` refuses to apply the untouched placeholder template.
  - Review the guard carefully when resuming this work.

## Review Checklist

Use a code-review stance first. Look for bugs, confusing docs, missing tests, and contradictions.

Specific things to verify:

- `README.md` no longer has duplicate `[status-shield]` definitions.
- README "How It Works", "Pipeline In Detail", "Usage", "Post-Video Retro", and "Roadmap" all agree.
- `plan.md` agrees that Stages 1-8 are complete for real use, and C2/C4 remain deferred to Stages 9-12.
- `bun run retro sample --apply` fails when `videos/sample/retro.json` still contains the placeholder template.
- A non-placeholder retro file applies once and skips duplicates on a second apply. Use a temporary slug under `videos/` so artifacts stay ignored.
- The user-facing story is clear: the user asks the agent to make the video; the agent runs `make-video`, QA, Tella MCP steps, publish, and retro as needed.

## Verification Commands

Run these before committing or when verifying the latest commit:

```bash
bun test tests/retro.test.ts
bunx tsc --noEmit
bun test
bun run retro sample
bun run retro sample --apply
```

Expected:

- `tests/retro.test.ts` passes.
- Typecheck passes.
- Full test suite passes.
- `bun run retro sample` reviews or creates the local template.
- `bun run retro sample --apply` should fail if the sample template still contains the placeholder. That failure is expected and confirms the guard.

Codex already ran these checks after the current edits:

- `rg -n "^\\[status-shield\\]" README.md` returned exactly one status badge definition.
- `bun test tests/retro.test.ts` passed 5/5.
- `bunx tsc --noEmit` passed.
- `bun test` passed 107/107.
- `bun run retro sample` reviewed the existing sample template.
- `bun run retro sample --apply` failed as expected because `videos/sample/retro.json` still contains the template placeholder.

Optional stronger smoke:

1. Create a temporary ignored slug under `videos/retro-smoke/`.
2. Add a `retro.json` with one real rule.
3. Run `bun run retro retro-smoke --apply`.
4. Confirm `house-style.md` gets exactly one new learned rule.
5. Run the same command again.
6. Confirm the second run reports skipped duplicate and does not duplicate the rule.
7. Revert the temporary `house-style.md` smoke rule before committing unless the user explicitly wants it kept.

## Commit Guidance

If this handoff is resumed before the final commit, commit the current documentation and placeholder-guard changes.

Suggested commit message:

```bash
git commit -m "docs: clarify agent-run workflow and retro review"
```

Do not push unless the user asks.

## Notes

- The repo was clean after commit `4e2d183 feat: add post-video retro loop`.
- This handoff was written before the final commit; check `git log -1` and `git status --short` before deciding whether anything remains to commit.
- `videos/` artifacts are ignored; do not attempt to commit generated sample retro files.
