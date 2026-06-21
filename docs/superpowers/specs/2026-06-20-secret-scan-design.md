# Design — Secret-leak scan (folded into `qa`, warn-only)

**Date:** 2026-06-20
**Status:** Approved, ready for implementation plan
**Roadmap slot:** Stage 6 (QA) — the README's secret-leak gate, implemented as a **non-blocking** OCR+regex scan inside the existing `bun run qa <slug>` command.

## Problem

A screen recording can accidentally show secrets — a catted `.env`, an API key in code, a token in a URL. We want a cheap, automatic safety net that flags likely leaks in the finished video. It must be **best-effort and advisory**: OCR misreads, so it must never block on a false positive.

## Goals

- Fold the scan into `bun run qa <slug>` (one easy command; no separate tool to remember).
- **Warn-only:** findings print as advisory warnings; they do **not** affect QA's `ok`/exit code (only the four deterministic checks gate).
- Cost ≈ zero: local OCR (tesseract) + regex, no model inference.
- Pure, unit-tested detection logic; thin I/O for frame extraction + OCR.

## Non-goals (this slice)

- Hard gate / blocking on secrets (explicitly warn-only).
- Auto-fix / blur loop; scanning the raw `recording.mp4`; dedupe via scene-detection; vision-model escalation; generic high-entropy detection (too noisy with OCR errors).

## Decisions (settled in brainstorming)

| Decision | Choice |
|----------|--------|
| Where | Folded into `bun run qa <slug>` (not a separate command) |
| Gating | **Warn-only** — never changes `ok`/exit code |
| Sampling | 1 frame every 2s from `final.mp4` |
| Detection | OCR (tesseract) + a balanced named regex set |
| Skip | `--no-secrets` skips the OCR pass for a fast checks-only run |

## Architecture

### `src/secrets.ts`

```ts
export interface SecretMatch { pattern: string; snippet: string }
export interface SecretFinding { timeSec: number; pattern: string; snippet: string }
```

**Pure (unit-tested):** `scanTextForSecrets(text: string): SecretMatch[]` — runs the named regex set; returns each match's pattern name + a truncated (~48-char) snippet. The set (balanced):

| name | regex (case-insensitive where sensible) |
|------|------|
| `key-assignment` | `\b(API[_-]?KEY\|SECRET\|ACCESS[_-]?KEY\|AUTH[_-]?TOKEN\|TOKEN\|PASSWORD\|PASSWD\|PRIVATE[_-]?KEY)\s*[=:]\s*\S{6,}` |
| `openai-stripe-key` | `\bsk-[A-Za-z0-9]{16,}\b` |
| `aws-access-key` | `\bAKIA[0-9A-Z]{16}\b` |
| `bearer-token` | `\bBearer\s+[A-Za-z0-9._\-]{16,}` |
| `private-key-block` | `-----BEGIN [A-Z ]*PRIVATE KEY-----` |
| `github-token` | `\bgh[pousr]_[A-Za-z0-9]{16,}\b` |
| `slack-token` | `\bxox[baprs]-[A-Za-z0-9-]{10,}` |

The `key-assignment` pattern requires an `=`/`:` and a value (`\S{6,}`), so the bare word "password" doesn't match but `PASSWORD=hunter2` does.

**I/O:** `scanSecretsInVideo(videoPath: string, workDir: string): Promise<SecretFinding[]>`:
1. `mkdir -p ${workDir}/secret-frames`.
2. `FFMPEG -i <video> -vf fps=1/2 ${workDir}/secret-frames/f_%04d.png` (PNG in the workdir — confirmed OCR-readable here; tesseract can't open `/tmp` on this machine, so frames must live under the slug workdir).
3. For each frame (sorted), `timeSec = (index − 1) * 2`; run `TESSERACT <frame> stdout`; `scanTextForSecrets` the output.
4. **Dedupe** by `(pattern, snippet)` keeping the earliest `timeSec` (a secret on screen for 10s shouldn't produce 5 identical warnings).

### `src/ffmpeg.ts`

Add `export const TESSERACT = process.env.TESSERACT || "tesseract";` (alongside `FFMPEG`/`FFPROBE`; default to PATH, overridable).

### `src/qa.ts`

- Extend `QaReport` to `{ checks: QaCheck[]; warnings: string[]; ok: boolean }`. **`ok` is unchanged** — still `checks.every(c => c.pass)`; warnings never affect it.
- `evaluateQa` stays pure and unchanged (returns `{ checks, ok }`).
- `runQa(dir: string, opts?: { scanSecrets?: boolean })`: compute the four checks via `evaluateQa`; if `opts.scanSecrets !== false`, call `scanSecretsInVideo(final, ${dir}/work)` and map findings to warning strings:
  `possible secret at M:SS — <pattern>: "<snippet>"`. Return `{ checks, ok, warnings }`.

### `scripts/qa.ts`

- Parse `--no-secrets` → `runQa(dir, { scanSecrets: !noSecrets })`.
- Print the checks table (as today). If `warnings.length`, print a clearly-separated advisory block:
  `⚠ Non-blocking warnings (review — OCR can be wrong):` then each warning.
- `process.exit(report.ok ? 0 : 1)` — **secrets never change the exit code.**

## Data flow

```
videos/<slug>/final.mp4
   │  runQa: evaluateQa (4 gating checks)  +  scanSecretsInVideo
   │     scanSecretsInVideo: ffmpeg fps=1/2 → work/secret-frames/*.png → tesseract → scanTextForSecrets → dedupe
   ▼
QaReport { checks, ok (checks only), warnings (secret findings) }
   │  scripts/qa.ts: table + advisory warnings; exit(ok ? 0 : 1)
   ▼
gated on checks; secrets shown as warnings
```

## Error handling & edge cases

- **No secrets found / clean frames:** `warnings: []`; nothing printed beyond the table.
- **OCR misread (false positive):** surfaces as a warning only — never blocks (the whole point).
- **`--no-secrets`:** skips frame extraction + OCR entirely (fast checks-only run).
- **tesseract/ffmpeg failure during scan:** since secrets are advisory, a scan error should degrade to a single warning ("secret scan could not run: <reason>") rather than failing `qa` — don't let an OCR hiccup block a valid video.
- **Frame dir:** lives under `videos/<slug>/work/` (gitignored); reused/overwritten each run.
- **Dedupe:** identical `(pattern, snippet)` collapses to one warning at the earliest timestamp.

## Testing

- **`tests/secrets.test.ts` (pure, primary):** for `scanTextForSecrets`, a positive **and** a near-miss negative per pattern — e.g. `PASSWORD=hunter2` matches `key-assignment` but "enter your password" does not; `sk-ABCDEF0123456789xyz` matches but `sk-short` does not; an `AKIA…16` matches; a clean sentence yields `[]`. Assert returned `pattern` names + that snippets are truncated.
- **`tests/qa.test.ts` (extend, integration):** `runQa` on the existing generated blue-frame fixture (no on-screen text) → `ok: true` **and `warnings: []`** (proves the OCR pipeline runs and does not false-positive on real frames). The existing checks-only assertions stay.
- **Manual:** `bun run qa sample` prints the four checks + (expected) no secret warnings on the current sample, exit 0. A true-positive end-to-end isn't fixtured because `drawtext` is unavailable on this machine; detection is fully covered by the pure tests.

## Future (out of scope)

- Auto-fix/blur loop; raw-recording scan; scene-detect sampling; vision-model escalation for flagged frames; redaction of snippets in output.
