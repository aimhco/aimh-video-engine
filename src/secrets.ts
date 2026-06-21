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
