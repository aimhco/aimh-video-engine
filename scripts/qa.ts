// scripts/qa.ts — deterministic QA checks on videos/<slug>/final.mp4.
import { runQa } from "../src/qa";

const slug = process.argv[2];
if (!slug) throw new Error("usage: bun run qa <slug>");

const report = await runQa(`videos/${slug}`);
console.table(
  report.checks.map((c) => ({ check: c.name, status: c.pass ? "✓" : "✗", detail: c.detail })),
);
console.log(report.ok ? "QA passed ✓" : "QA FAILED ✗");
process.exit(report.ok ? 0 : 1);
