# Secret-Leak Scan Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Fold a warn-only OCR+regex secret scan into `bun run qa <slug>` — flags likely on-screen secrets as advisory warnings without ever changing QA's pass/exit.

**Architecture:** Pure `scanTextForSecrets` (regex set) + I/O `scanSecretsInVideo` (ffmpeg frames → tesseract → scan → dedupe) in `src/secrets.ts`. `runQa` calls it and adds the findings to a new `QaReport.warnings`; `ok`/exit stay driven by the four deterministic checks only. CLI prints an advisory block and supports `--no-secrets`.

**Tech Stack:** Bun + TypeScript, `bun test`. ffmpeg via `FFMPEG`; tesseract via a new `TESSERACT` env (default PATH).

## Global Constraints

- Package manager: **bun** (never npm). `bun test`; `bun run qa <slug>`.
- ffmpeg/tesseract via `FFMPEG`/`TESSERACT` from `src/ffmpeg.ts` (default to PATH). Never bare.
- **Warn-only:** `QaReport.ok = checks.every(c => c.pass)` — secret findings go in `warnings` and NEVER affect `ok` or the exit code.
- Frames go under `videos/<slug>/work/secret-frames/` (PNG) — NOT `/tmp` (tesseract can't open `/tmp` on this machine).
- Sampling: 1 frame every 2s (`-vf fps=1/2`); `timeSec = (frameIndex − 1) * 2`. Dedupe findings by `(pattern, snippet)`, keep earliest `timeSec`.
- A scan error degrades to a single advisory warning ("secret scan could not run: …") — it must NOT fail `qa`.
- `key-assignment` regex requires `=`/`:` + a value (`\S{6,}`) so the bare word "password" doesn't match.
- Match existing test style (`tests/align.test.ts`): `import { expect, test } from "bun:test"`; integration tests generate their own media and route ffmpeg/tesseract through the configurable binaries.

## File Structure

- **Modify** `src/ffmpeg.ts` — add `TESSERACT`.
- **Create** `src/secrets.ts` — `SecretMatch`/`SecretFinding`, pure `scanTextForSecrets`, I/O `scanSecretsInVideo`.
- **Modify** `src/qa.ts` — add `warnings` to `QaReport`; `runQa` runs the scan (unless disabled).
- **Modify** `scripts/qa.ts` — `--no-secrets`, advisory warnings block.
- **Create** `tests/secrets.test.ts`; **modify** `tests/qa.test.ts`.

---

## Task 1: Pure secret detection

**Files:**
- Create: `src/secrets.ts` (pure parts only this task)
- Test: `tests/secrets.test.ts`

**Interfaces:**
- Produces:
  - `SecretMatch { pattern: string; snippet: string }`
  - `scanTextForSecrets(text: string): SecretMatch[]`

- [ ] **Step 1: Write the failing test**

Create `tests/secrets.test.ts`:

```ts
import { expect, test } from "bun:test";
import { scanTextForSecrets } from "../src/secrets";

const names = (text: string) => scanTextForSecrets(text).map((m) => m.pattern).sort();

test("key-assignment: matches KEY=value, not the bare word", () => {
  expect(names("API_KEY=abcdef123456")).toContain("key-assignment");
  expect(names("PASSWORD: hunter2pw")).toContain("key-assignment");
  expect(scanTextForSecrets("please enter your password to continue")).toEqual([]);
});

test("openai/stripe sk- key", () => {
  expect(names("token sk-ABCDEF0123456789xyz here")).toContain("openai-stripe-key");
  expect(scanTextForSecrets("sk-short")).toEqual([]);
});

test("aws access key", () => {
  expect(names("AKIAIOSFODNN7EXAMPLE")).toContain("aws-access-key");
  expect(scanTextForSecrets("AKIA123")).toEqual([]);
});

test("bearer token", () => {
  expect(names("Authorization: Bearer abcdef0123456789ABCDEF")).toContain("bearer-token");
});

test("private key block", () => {
  expect(names("-----BEGIN RSA PRIVATE KEY-----")).toContain("private-key-block");
});

test("github token", () => {
  expect(names("ghp_ABCDEFabcdef0123456789ABCDEF")).toContain("github-token");
});

test("slack token", () => {
  expect(names("xoxb-1234567890-abcdefghij")).toContain("slack-token");
});

test("clean text yields no matches", () => {
  expect(scanTextForSecrets("aimh-video-engine README — build videos automatically")).toEqual([]);
});

test("snippet is truncated", () => {
  const long = "API_KEY=" + "a".repeat(200);
  const [m] = scanTextForSecrets(long);
  expect(m!.snippet.length).toBeLessThanOrEqual(48);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `bun test tests/secrets.test.ts`
Expected: FAIL — cannot resolve module `../src/secrets`.

- [ ] **Step 3: Implement the pure detector**

Create `src/secrets.ts`:

```ts
export interface SecretMatch { pattern: string; snippet: string }
export interface SecretFinding { timeSec: number; pattern: string; snippet: string }

const SNIPPET_MAX = 48;

// Balanced set: flag obvious secrets, avoid generic high-entropy noise.
const PATTERNS: { name: string; re: RegExp }[] = [
  { name: "key-assignment", re: /\b(?:API[_-]?KEY|SECRET|ACCESS[_-]?KEY|AUTH[_-]?TOKEN|TOKEN|PASSWORD|PASSWD|PRIVATE[_-]?KEY)\s*[=:]\s*\S{6,}/gi },
  { name: "openai-stripe-key", re: /\bsk-[A-Za-z0-9]{16,}\b/g },
  { name: "aws-access-key", re: /\bAKIA[0-9A-Z]{16}\b/g },
  { name: "bearer-token", re: /\bBearer\s+[A-Za-z0-9._\-]{16,}/gi },
  { name: "private-key-block", re: /-----BEGIN [A-Z ]*PRIVATE KEY-----/g },
  { name: "github-token", re: /\bgh[pousr]_[A-Za-z0-9]{16,}\b/g },
  { name: "slack-token", re: /\bxox[baprs]-[A-Za-z0-9-]{10,}/g },
];

const truncate = (s: string) => (s.length > SNIPPET_MAX ? s.slice(0, SNIPPET_MAX - 1) + "…" : s);

// Pure: scan OCR'd text for likely secrets; one SecretMatch per regex hit.
export function scanTextForSecrets(text: string): SecretMatch[] {
  const matches: SecretMatch[] = [];
  for (const { name, re } of PATTERNS) {
    for (const m of text.matchAll(re)) {
      matches.push({ pattern: name, snippet: truncate(m[0]) });
    }
  }
  return matches;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `bun test tests/secrets.test.ts`
Expected: PASS (9 tests).

- [ ] **Step 5: Full suite + commit**

Run: `bun test` (expect all green), then:

```bash
git add src/secrets.ts tests/secrets.test.ts
git commit -m "feat: pure secret detection (balanced regex over OCR'd text)"
```

---

## Task 2: OCR scan + fold into qa + CLI

**Files:**
- Modify: `src/ffmpeg.ts`
- Modify: `src/secrets.ts` (append `scanSecretsInVideo`)
- Modify: `src/qa.ts`
- Modify: `scripts/qa.ts`
- Test: `tests/qa.test.ts`

**Interfaces:**
- Consumes: `scanTextForSecrets` (Task 1); `FFMPEG`/`TESSERACT`; `evaluateQa` + existing `runQa` machinery.
- Produces: `TESSERACT` const; `scanSecretsInVideo(videoPath, workDir): Promise<SecretFinding[]>`; `QaReport.warnings: string[]`; `runQa(dir, opts?: { scanSecrets?: boolean })`.

- [ ] **Step 1: Add the TESSERACT binary const**

In `src/ffmpeg.ts`, append:

```ts
export const TESSERACT = process.env.TESSERACT || "tesseract";
```

- [ ] **Step 2: Implement `scanSecretsInVideo`**

Append to `src/secrets.ts` (add imports at top):

```ts
import { FFMPEG, TESSERACT } from "./ffmpeg";

const SAMPLE_EVERY_SEC = 2;

// I/O: sample frames (1 / SAMPLE_EVERY_SEC) into <workDir>/secret-frames, OCR each,
// scan for secrets, dedupe by (pattern, snippet) keeping the earliest timestamp.
export async function scanSecretsInVideo(videoPath: string, workDir: string): Promise<SecretFinding[]> {
  const frameDir = `${workDir}/secret-frames`;
  await Bun.$`mkdir -p ${frameDir}`;
  await Bun.$`rm -f ${frameDir}/f_*.png`.nothrow();
  await Bun.$`${FFMPEG} -y -i ${videoPath} -vf fps=1/${SAMPLE_EVERY_SEC} ${frameDir}/f_%04d.png`.quiet();

  const seen = new Set<string>();
  const findings: SecretFinding[] = [];
  const glob = new Bun.Glob("f_*.png");
  const frames = (await Array.fromAsync(glob.scan({ cwd: frameDir }))).sort();
  for (const name of frames) {
    const idx = parseInt(name.replace(/\D/g, ""), 10); // f_0001.png -> 1
    const timeSec = (idx - 1) * SAMPLE_EVERY_SEC;
    const ocr = await Bun.$`${TESSERACT} ${frameDir}/${name} stdout`.quiet().nothrow();
    const text = ocr.stdout.toString();
    for (const m of scanTextForSecrets(text)) {
      const key = `${m.pattern}::${m.snippet}`;
      if (seen.has(key)) continue;
      seen.add(key);
      findings.push({ timeSec, pattern: m.pattern, snippet: m.snippet });
    }
  }
  return findings;
}
```

- [ ] **Step 3: Write the failing test (qa surfaces warnings, no false positive)**

In `tests/qa.test.ts`, extend the existing `runQa` integration test (or add one) to assert the warnings field. Add:

```ts
test("runQa scans for secrets and does not false-positive on clean frames", async () => {
  const dir = `${import.meta.dir}/fixtures/qa-secrets`;
  await Bun.$`mkdir -p ${dir}/vo`;
  await Bun.write(`${dir}/script.json`, JSON.stringify([{ id: "c1", text: "hello world", sourceStart: 0, sourceEnd: 2 }]));
  await Bun.$`${FFMPEG} -y -f lavfi -i sine=frequency=440:duration=2 ${dir}/vo/c1.mp3`.quiet();
  await Bun.$`${FFMPEG} -y -f lavfi -i color=c=blue:s=1920x1080:d=2 -f lavfi -i sine=frequency=440:duration=2 -pix_fmt yuv420p -c:v libx264 -c:a aac -shortest ${dir}/final.mp4`.quiet();
  await Bun.write(`${dir}/captions.srt`, "1\n00:00:00,000 --> 00:00:02,000\nhello world\n");

  const report = await runQa(dir); // secrets on by default
  expect(report.ok).toBe(true);
  expect(report.warnings).toEqual([]); // blue frames have no text → no secret warnings
});
```

(`FFMPEG` is already imported in `tests/qa.test.ts` from the existing runQa test; if not, add `import { FFMPEG } from "../src/ffmpeg";`.)

- [ ] **Step 4: Run test to verify it fails**

Run: `bun test tests/qa.test.ts`
Expected: FAIL — `report.warnings` is `undefined` (not yet on `QaReport`).

- [ ] **Step 5: Add `warnings` to QaReport + scan in runQa**

In `src/qa.ts`:

Change the `QaReport` interface to add `warnings`:

```ts
export interface QaReport { checks: QaCheck[]; warnings: string[]; ok: boolean }
```

`evaluateQa` returns `{ checks, ok }` (unchanged) — update its return type if it's annotated as `QaReport` so it now returns `Omit<QaReport, "warnings">` (or just `{ checks: QaCheck[]; ok: boolean }`). Keep its body unchanged.

Add imports at the top of `src/qa.ts`:

```ts
import { scanSecretsInVideo } from "./secrets";
```

In `runQa`, change the signature and final return. Replace the current `return evaluateQa({...})` tail with:

```ts
export async function runQa(dir: string, opts?: { scanSecrets?: boolean }): Promise<QaReport> {
  // ... existing input-gathering unchanged, producing the evaluateQa inputs ...
  const base = evaluateQa({
    finalDurationSec, expectedDurationSec, width, height, hasAudio,
    meanVolumeDb, captionsPresent, srtCueCount, expectedCueCount,
  });

  let warnings: string[] = [];
  if (opts?.scanSecrets !== false) {
    try {
      const findings = await scanSecretsInVideo(final, `${dir}/work`);
      warnings = findings.map(
        (f) => `possible secret at ${fmtTime(f.timeSec)} — ${f.pattern}: "${f.snippet}"`,
      );
    } catch (err) {
      warnings = [`secret scan could not run: ${(err as Error).message}`];
    }
  }

  return { checks: base.checks, ok: base.ok, warnings };
}

function fmtTime(sec: number): string {
  const m = Math.floor(sec / 60);
  const s = Math.floor(sec % 60);
  return `${m}:${String(s).padStart(2, "0")}`;
}
```

(Keep all the existing input-gathering code in `runQa` exactly as-is; only the construction-of-report tail and signature change. `final` is the already-computed `${dir}/final.mp4` path.)

- [ ] **Step 6: Run tests to verify they pass**

Run: `bun test tests/qa.test.ts`
Expected: PASS — existing checks tests + the new no-false-positive test (`warnings: []`).

- [ ] **Step 7: Update the CLI**

In `scripts/qa.ts`, parse the flag and print warnings. Replace the body with:

```ts
import { runQa } from "../src/qa";

const slug = process.argv[2];
if (!slug) throw new Error("usage: bun run qa <slug> [--no-secrets]");
const scanSecrets = !process.argv.includes("--no-secrets");

const report = await runQa(`videos/${slug}`, { scanSecrets });
console.table(
  report.checks.map((c) => ({ check: c.name, status: c.pass ? "✓" : "✗", detail: c.detail })),
);
if (report.warnings.length) {
  console.log("\n⚠ Non-blocking warnings (review — OCR can be wrong):");
  for (const w of report.warnings) console.log(`  - ${w}`);
}
console.log(report.ok ? "QA passed ✓" : "QA FAILED ✗");
process.exit(report.ok ? 0 : 1);
```

- [ ] **Step 8: Type-check + full suite**

Run: `bunx tsc --noEmit` (no errors), then `bun test` (all green).

- [ ] **Step 9: Verify on the real sample**

Run: `bun run qa sample`
Expected: the four checks `✓`, then either no warnings or advisory secret warnings (the sample shows a public README/Tella site — likely none); `QA passed ✓`, exit 0. Confirm `bun run qa sample --no-secrets` skips the OCR pass (faster, no warnings block). Report the output + that exit is 0 either way.

- [ ] **Step 10: Commit**

```bash
git add src/ffmpeg.ts src/secrets.ts src/qa.ts scripts/qa.ts tests/qa.test.ts
git commit -m "feat: warn-only secret scan folded into qa (OCR + regex, --no-secrets)"
```

---

## Self-Review

**Spec coverage:**
- Pure regex detector (balanced set; key-assignment needs value) → Task 1 + tests. ✓
- OCR frame scan, 1/2s, workdir frames, dedupe → Task 2 `scanSecretsInVideo`. ✓
- Folded into `qa`, warn-only (`ok` unchanged) → Task 2 (`QaReport.warnings`, `runQa`). ✓
- Scan error degrades to a warning (never fails qa) → Task 2 try/catch. ✓
- `--no-secrets` skip + advisory CLI block → Task 2 CLI. ✓
- `TESSERACT`/`FFMPEG` configurable → Tasks 1–2. ✓
- No false positive on clean frames → Task 2 integration test. ✓

**Placeholder scan:** none — full code/commands per step. (Task 2 Step 5 edits the existing `runQa`; its input-gathering body is explicitly left unchanged, only the tail/signature change.)

**Type consistency:** `SecretMatch`/`SecretFinding` defined in Task 1; `scanSecretsInVideo` (Task 2) returns `SecretFinding[]`; `QaReport.warnings` consumed by the CLI; `runQa(dir, opts?)` signature matches the CLI call. `evaluateQa` keeps returning `{ checks, ok }`. ✓
