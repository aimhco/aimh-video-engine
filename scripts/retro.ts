import {
  createRetroTemplate,
  DEFAULT_HOUSE_STYLE,
  hasPlaceholderRules,
  mergeHouseStyle,
  parseRetroInput,
} from "../src/retro";

const slug = process.argv[2];
if (!slug) throw new Error("usage: bun run retro <slug> [--apply]");

const apply = process.argv.includes("--apply");
const dir = `videos/${slug}`;
const retroFile = `${dir}/retro.json`;
const houseStyleFile = "house-style.md";

await Bun.$`mkdir -p ${dir}`;

if (!(await Bun.file(retroFile).exists())) {
  await Bun.write(retroFile, createRetroTemplate(slug));
  console.log(`created ${retroFile}`);
  console.log("edit the rules, then run with --apply to update house-style.md");
  process.exit(0);
}

const retro = parseRetroInput(await Bun.file(retroFile).json());
console.log(`retro: ${retroFile}`);
console.log(`rules: ${retro.rules.length}`);

if (!apply) {
  for (const rule of retro.rules) {
    console.log(`- ${rule.category}: ${rule.rule}`);
  }
  console.log("review only - pass --apply to update house-style.md");
  process.exit(0);
}

if (hasPlaceholderRules(retro)) {
  throw new Error(`${retroFile} still contains the template placeholder. Replace it with durable lessons before --apply.`);
}

const existing = (await Bun.file(houseStyleFile).exists())
  ? await Bun.file(houseStyleFile).text()
  : DEFAULT_HOUSE_STYLE;
const today = new Date().toISOString().slice(0, 10);
const result = mergeHouseStyle(existing, retro, today);
await Bun.write(houseStyleFile, result.content);
console.log(`updated ${houseStyleFile}: added ${result.added}, skipped ${result.skipped}`);
