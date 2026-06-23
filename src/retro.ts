export interface RetroRule {
  category: string;
  rule: string;
  reason?: string;
}

export interface RetroInput {
  video?: string;
  rules: RetroRule[];
}

export const DEFAULT_HOUSE_STYLE = `# AIMH Video House Style

Durable rules for future AIMH videos. Update this only with lessons that should apply across more than one video.

## Baseline Rules

- Keep narration grounded in what happened on screen.
- Preserve body footage as screen-only; use the real face only in intro/outro clips.
- Keep long-form captions off by default unless the video is intended for short-form reuse.

## Learned Rules
`;

export function createRetroTemplate(slug: string): string {
  return JSON.stringify({
    video: slug,
    rules: [
      {
        category: "script",
        rule: "Replace this with one durable lesson to apply to future videos.",
        reason: "What happened in this video that makes this rule worth keeping?",
      },
    ],
  }, null, 2) + "\n";
}

function requireString(value: unknown, field: string): string {
  if (typeof value !== "string" || value.trim() === "") {
    throw new Error(`retro.${field} must be a non-empty string`);
  }
  return value.trim();
}

export function parseRetroInput(raw: unknown): RetroInput {
  if (!raw || typeof raw !== "object") throw new Error("retro input must be an object");
  const obj = raw as { video?: unknown; rules?: unknown };
  if (!Array.isArray(obj.rules)) throw new Error("retro.rules must be an array");
  const rules = obj.rules.map((rule, index) => {
    if (!rule || typeof rule !== "object") throw new Error(`retro.rules[${index}] must be an object`);
    const r = rule as { category?: unknown; rule?: unknown; reason?: unknown };
    const parsed: RetroRule = {
      category: requireString(r.category, `rules[${index}].category`),
      rule: requireString(r.rule, `rules[${index}].rule`),
    };
    if (typeof r.reason === "string" && r.reason.trim() !== "") parsed.reason = r.reason.trim();
    return parsed;
  });
  return {
    ...(typeof obj.video === "string" && obj.video.trim() !== "" ? { video: obj.video.trim() } : {}),
    rules,
  };
}

function titleCase(value: string): string {
  return value.trim().replace(/\s+/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
}

function trimTerminalPunctuation(value: string): string {
  return value.trim().replace(/[.!?]+$/g, "");
}

function normalizeForDuplicate(rule: RetroRule): string {
  return `${rule.category.trim().toLowerCase()}::${trimTerminalPunctuation(rule.rule).replace(/\s+/g, " ").toLowerCase()}`;
}

function formatRule(rule: RetroRule, video: string | undefined, date: string): string {
  const text = trimTerminalPunctuation(rule.rule);
  const reason = rule.reason ? ` Reason: ${trimTerminalPunctuation(rule.reason)}.` : "";
  const sourceParts = [video, date].filter(Boolean).join(", ");
  return `- **${titleCase(rule.category)}:** ${text}.${reason} Source: ${sourceParts}.`;
}

export function mergeHouseStyle(existing: string | undefined, retro: RetroInput, date: string): {
  content: string;
  added: number;
  skipped: number;
} {
  const base = (existing && existing.trim() !== "" ? existing.trimEnd() : DEFAULT_HOUSE_STYLE.trimEnd());
  const withSection = base.includes("## Learned Rules") ? base : `${base}\n\n## Learned Rules`;
  const seen = new Set<string>();
  const learnedRulePattern = /^- \*\*(.+?):\*\* (.+?)(?: Reason: .+?)?\. Source: .+?\.$/gm;
  for (const match of withSection.matchAll(learnedRulePattern)) {
    seen.add(normalizeForDuplicate({ category: match[1] ?? "", rule: match[2] ?? "" }));
  }

  const lines: string[] = [];
  let skipped = 0;
  for (const rule of retro.rules) {
    const key = normalizeForDuplicate(rule);
    if (seen.has(key)) {
      skipped++;
      continue;
    }
    seen.add(key);
    lines.push(formatRule(rule, retro.video, date));
  }

  const suffix = lines.length ? `\n\n${lines.join("\n")}` : "";
  return { content: `${withSection}${suffix}\n`, added: lines.length, skipped };
}
