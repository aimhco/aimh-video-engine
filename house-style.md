# AIMH Video House Style

Durable rules for future AIMH videos. Update this only with lessons that should apply across more than one video.

## Baseline Rules

- Keep narration grounded in what happened on screen.
- Preserve body footage as screen-only; use the real face only in intro/outro clips.
- Keep long-form captions off by default unless the video is intended for short-form reuse.

## Learned Rules

- **Script:** Spell standalone acronyms phonetically in script.json text (e.g. write "A-I-M-H", not "AIMH"). The ElevenLabs rewrite only auto-expands "aimh.co" -> "A-I-M-H dot co"; a bare acronym is read as a word. Reason: On this video "AIMH" risked being mispronounced as a word; spelling it A-I-M-H made the cloned voice say the letters. Source: aimh_video_engine, 2026-06-24.
- **Script:** Spell currency and prices as words in the script ("twenty-six dollars a month", not "$26"). Reason: Kept the TTS unambiguous for the $26 / $11 / $22 pricing lines; they read cleanly. Source: aimh_video_engine, 2026-06-24.
- **Chapters:** Give the chunk immediately before a chapter card a brief trailing pause (e.g. end on a full stop, or pad ~1s of silence onto its voiceover) so the card splice never clips its final word. Reason: The Roadmap card cut the word "afterwards" mid-sound because card insertion drifts ~0.65s early vs the concatenated audio (see issue #2). A trailing pause keeps the cut in silence until the engine fix lands. Source: aimh_video_engine, 2026-06-24.
