import { FFMPEG, TESSERACT } from "./ffmpeg";

export interface SecretMatch { pattern: string; snippet: string }
export interface SecretFinding { timeSec: number; pattern: string; snippet: string }

const SNIPPET_MAX = 48;
const SAMPLE_EVERY_SEC = 2;

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

// I/O: sample frames (1 / SAMPLE_EVERY_SEC) into <workDir>/secret-frames, OCR each,
// scan for secrets, dedupe by (pattern, snippet) keeping the earliest timestamp.
export async function scanSecretsInVideo(videoPath: string, workDir: string): Promise<SecretFinding[]> {
  const frameDir = `${workDir}/secret-frames`;
  await Bun.$`rm -rf ${frameDir}`; // clean slate (avoids a no-match glob error)
  await Bun.$`mkdir -p ${frameDir}`;
  await Bun.$`${FFMPEG} -y -i ${videoPath} -vf fps=1/${SAMPLE_EVERY_SEC} ${frameDir}/f_%04d.png`.quiet();

  const seen = new Set<string>();
  const findings: SecretFinding[] = [];
  const glob = new Bun.Glob("f_*.png");
  const frames = (await Array.fromAsync(glob.scan({ cwd: frameDir }))).sort();
  for (const name of frames) {
    const idx = parseInt(name.replace(/\D/g, ""), 10); // f_0001.png -> 1
    const timeSec = (idx - 1) * SAMPLE_EVERY_SEC;
    const ocr = await Bun.$`${TESSERACT} ${frameDir}/${name} stdout`.quiet().nothrow();
    for (const m of scanTextForSecrets(ocr.stdout.toString())) {
      const key = `${m.pattern}::${m.snippet}`;
      if (seen.has(key)) continue;
      seen.add(key);
      findings.push({ timeSec, pattern: m.pattern, snippet: m.snippet });
    }
  }
  return findings;
}
