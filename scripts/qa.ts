// scripts/qa.ts — deterministic QA checks on videos/<slug>/final.mp4.
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
