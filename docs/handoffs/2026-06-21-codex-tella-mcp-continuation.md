# 2026-06-21 Codex -> Next Codex Handoff

Paste this into the next Codex session:

```text
We are in /Users/dennywii/Documents/dev/aimh-video-engine on branch main.

Goal for this continuation: continue AIMH video-engine development with the Tella MCP server, starting with blur/highlights/layout application on the original Tella recording. Before doing anything, read this handoff plus README.md and .claude/skills/make-video/SKILL.md.

Session accomplishments already completed:
- Merged stage-4-chapter-cards into main with --no-ff: 6c22b21.
- Added chapter derivation/card rendering and card splice workflow:
  - 7756853 feat: chapter derivation + branded SVG card rendering
  - e8ea549 feat: insertChapterCards splices cards into the captioned body
  - 3da5e4f feat: make-video renders + splices chapter cards with music; qa counts card duration
- Fixed intro/outro audio handling:
  - 2f53ac8 fix: normalize intro and outro audio during wrap
  - 3ab95a9 feat: add music bed under spoken intro
- Made long-form captions opt-in:
  - e870ad9 feat: disable burned captions by default
  - bun run make-video <slug> now has no burned captions by default.
  - Use --captions or --with-captions only when explicitly requested, such as Shorts.
- Extended chapter/transition cards:
  - a5ca8e0 feat: extend chapter card duration to 3.5 seconds
  - CARD_DURATION_SEC is 3.5 in src/chapters.ts.
- Documented body layout conventions:
  - 34de84a docs: define screen-first Tella layout convention
  - Body recording convention: Tella base layout should be screen-only / fullscreen, screenFit letterbox when accepted, no camera bubble/presenter layout in the body.
  - Intro convention: face-only, real voice/lip-sync, currently webcam inside the blue grid frame.
  - Outro convention: intended fullscreen faceless branded end-card, but the code appends whatever outro.mp4 is supplied.
- Refreshed README and TTS pronunciation support:
  - d082c1e docs: refresh video pipeline readme
  - src/elevenlabs.ts now rewrites aimh.co -> A-I-M-H dot co only for ElevenLabs request text, so visible script/captions can keep aimh.co.
  - Optional ELEVENLABS_PRONUNCIATION_DICTIONARY_ID and ELEVENLABS_PRONUNCIATION_DICTIONARY_VERSION_ID are supported and passed as pronunciation_dictionary_locators when both are set.
  - Tests added in tests/elevenlabs.test.ts.
- Mirrored durable skill updates in /Users/dennywii/Documents/dev/Skills:
  - 1cbe1f3 docs: document captions as opt-in for long-form videos
  - 756deaf docs: define screen-first Tella layout convention
  - 150fd1a docs: document TTS-only aimh pronunciation

Verification already run:
- bunx tsc --noEmit passed.
- bun test passed: 87 pass, 0 fail.
- Generated sample video after changing videos/sample/script.json c11 to include AIMH.co and regenerating only c11 VO.
- Render command used: bun run make-video sample.
- Output video: videos/sample/final.mp4.
- QA command used: bun run qa sample.
- QA passed:
  - duration: final 129.71s vs expected 129.16s, delta 0.55s, tolerance 1.5s
  - resolution: 1920x1080
  - audio: mean -21.3 dB
  - captions check passed because videos/sample/captions.srt still exists, but make-video did not burn captions by default.
- Card clip durations verified with ffprobe:
  - videos/sample/work/card_1.mp4 3.500000
  - videos/sample/work/card_2.mp4 3.500000
  - videos/sample/work/card_3.mp4 3.500000
  - videos/sample/work/card_4.mp4 3.500000

Current local state/gotchas:
- main is ahead of origin by local commits; do not assume pushed.
- .env.example has an unrelated pre-existing local modification for YouTube placeholders. Do not stage or revert it unless asked.
- videos/ is ignored/generated. The sample test render modified ignored files:
  - videos/sample/script.json c11 now includes AIMH.co for pronunciation testing.
  - videos/sample/vo/c11.mp3 was regenerated.
  - previous c11 cache was moved to videos/sample/vo/backup/c11-before-aimh-co.mp3.
  - videos/sample/final.mp4 is the generated video to review.
- Existing videos/sample/captions.srt is stale from old runs. Since captions are now off by default, do not treat its existence as proof that the new final has burned captions.

Tella MCP setup/status:
- Tella MCP was registered globally with:
  codex mcp add tella -- npx mcp-remote https://api.tella.com/mcp
- codex mcp list showed:
  tella npx mcp-remote https://api.tella.com/mcp enabled Unsupported
- codex mcp login tella returned:
  Error: OAuth login is only supported for streamable HTTP servers.
- In the previous already-running Codex session, Tella tools did not appear via tool_search after registration. A fresh Codex/Claude Code session may be required for MCP tools to load and trigger OAuth via mcp-remote.
- Official Tella docs used:
  https://www.tella.com/docs/mcp-server
  https://www.tella.com/mcp

Next work with Tella MCP:
1. Confirm Tella tools are available in the fresh session. Use tool discovery first; if missing, inspect codex mcp list and the global MCP config.
2. Resolve the sample Tella project:
   - Read videos/sample/tella.json if present.
   - Otherwise use list_videos / list_clips and cache { videoId, clipId } in videos/<slug>/tella.json.
3. Apply layout convention on the original Tella clip before export:
   - list_layouts
   - update_layout on layoutId "base" with { kind: "screen-only", style: "fullscreen", screenFit: "letterbox" } when supported.
   - If Tella rejects screenFit, retry { kind: "screen-only", style: "fullscreen" }.
4. Implement blur/highlight workflow:
   - Read any secret-leak QA warnings and/or manual blur specs.
   - Use Tella blur/highlight MCP operations on the original recording timeline, not the re-timed final mp4.
   - Do not trim/cut in Tella; that breaks sourceStart/sourceEnd alignment and cached VO.
5. Re-apply zooms idempotently:
   - bun run plan-zooms <slug>
   - clear existing zooms first, then add manualZoom entries from videos/<slug>/zoom-plan.json.
6. Export from Tella, replace videos/<slug>/recording.mp4, then run:
   - bun run make-video <slug>
   - bun run qa <slug>
7. Keep long-form captions off unless the user explicitly asks for --captions.
8. If the user wants the sample video reviewed, point them to videos/sample/final.mp4 from the last render.

Important code/docs references:
- README.md documents current pipeline status and conventions.
- .claude/skills/make-video/SKILL.md is the durable workflow instruction.
- src/options.ts controls captions opt-in.
- src/chapters.ts controls CARD_DURATION_SEC.
- src/elevenlabs.ts controls aimh.co TTS rewrite and pronunciation_dictionary_locators.
- src/finish.ts controls wrapVideo, intro/outro audio normalization, intro music, chapter card insertion.
- src/qa.ts counts chapter card duration and skips captions when no captions.srt exists.

Do not work on YouTube publish yet unless the user explicitly restarts that topic.
```
