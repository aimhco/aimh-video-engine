import { normalizePublishAt, refreshAccessToken, uploadVideoResumable, type YouTubeMetadata } from "../src/youtube";

const slug = process.argv[2];
if (!slug) throw new Error("usage: bun run publish <slug> --yes");

const confirmed = process.argv.includes("--yes");
const dryRun = process.argv.includes("--dry-run") || !confirmed;
const dir = `videos/${slug}`;
const final = `${dir}/final.mp4`;
const metadataFile = `${dir}/metadata.json`;

if (!(await Bun.file(final).exists())) throw new Error(`${final} does not exist`);
if (!(await Bun.file(metadataFile).exists())) {
  throw new Error(`${metadataFile} does not exist. Create title/description/tags before publishing.`);
}

const metadata = (await Bun.file(metadataFile).json()) as YouTubeMetadata;
if (metadata.privacyStatus && metadata.privacyStatus !== "private") {
  throw new Error("Only private YouTube uploads are supported in this slice");
}
const normalizedPublishAt = metadata.publishAt ? normalizePublishAt(metadata.publishAt) : undefined;

console.log(`video: ${final}`);
console.log(`metadata: ${metadataFile}`);
console.log(`title: ${metadata.title}`);
console.log("privacy: private");
if (normalizedPublishAt) console.log(`publishAt: ${normalizedPublishAt}`);

if (dryRun) {
  console.log("dry run only — pass --yes to upload");
  process.exit(0);
}

const clientId = process.env.YOUTUBE_CLIENT_ID;
const clientSecret = process.env.YOUTUBE_CLIENT_SECRET;
const refreshToken = process.env.YOUTUBE_REFRESH_TOKEN;
if (!clientId || !refreshToken) throw new Error("YOUTUBE_CLIENT_ID and YOUTUBE_REFRESH_TOKEN must be set");

const tokens = await refreshAccessToken({ clientId, clientSecret, refreshToken });
const uploaded = await uploadVideoResumable({
  file: final,
  metadata: { ...metadata, privacyStatus: "private", ...(normalizedPublishAt ? { publishAt: normalizedPublishAt } : {}) },
  accessToken: tokens.access_token,
});

console.log(`uploaded: ${uploaded.url}`);
