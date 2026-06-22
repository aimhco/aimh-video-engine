import { createHash, randomBytes } from "node:crypto";

export const YOUTUBE_UPLOAD_SCOPE = "https://www.googleapis.com/auth/youtube.upload";
const AUTH_URL = "https://accounts.google.com/o/oauth2/v2/auth";
const TOKEN_URL = "https://oauth2.googleapis.com/token";
const RESUMABLE_UPLOAD_URL = "https://www.googleapis.com/upload/youtube/v3/videos";

export interface YouTubeTokens {
  access_token: string;
  expires_in?: number;
  refresh_token?: string;
  scope?: string;
  token_type?: string;
}

export interface YouTubeMetadata {
  title: string;
  description: string;
  tags?: string[];
  categoryId?: string;
  privacyStatus?: "private";
  selfDeclaredMadeForKids?: boolean;
}

type FetchLike = typeof fetch;

function base64Url(buf: Uint8Array): string {
  return Buffer.from(buf).toString("base64")
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/g, "");
}

export function generateCodeVerifier(): string {
  return base64Url(randomBytes(64));
}

export function codeChallengeS256(verifier: string): string {
  return base64Url(createHash("sha256").update(verifier).digest());
}

export function buildAuthUrl(opts: {
  clientId: string;
  redirectUri: string;
  state: string;
  codeChallenge: string;
  scope?: string;
}): URL {
  const url = new URL(AUTH_URL);
  url.searchParams.set("client_id", opts.clientId);
  url.searchParams.set("redirect_uri", opts.redirectUri);
  url.searchParams.set("response_type", "code");
  url.searchParams.set("scope", opts.scope ?? YOUTUBE_UPLOAD_SCOPE);
  url.searchParams.set("access_type", "offline");
  url.searchParams.set("prompt", "consent");
  url.searchParams.set("code_challenge", opts.codeChallenge);
  url.searchParams.set("code_challenge_method", "S256");
  url.searchParams.set("state", opts.state);
  return url;
}

export function buildTokenExchangeBody(opts: {
  clientId: string;
  clientSecret?: string;
  code: string;
  codeVerifier: string;
  redirectUri: string;
}): URLSearchParams {
  const body = new URLSearchParams({
    client_id: opts.clientId,
    code: opts.code,
    code_verifier: opts.codeVerifier,
    grant_type: "authorization_code",
    redirect_uri: opts.redirectUri,
  });
  if (opts.clientSecret) body.set("client_secret", opts.clientSecret);
  return body;
}

export function buildRefreshTokenBody(opts: {
  clientId: string;
  clientSecret?: string;
  refreshToken: string;
}): URLSearchParams {
  const body = new URLSearchParams({
    client_id: opts.clientId,
    grant_type: "refresh_token",
    refresh_token: opts.refreshToken,
  });
  if (opts.clientSecret) body.set("client_secret", opts.clientSecret);
  return body;
}

async function postToken(body: URLSearchParams, fetchImpl: FetchLike): Promise<YouTubeTokens> {
  const res = await fetchImpl(TOKEN_URL, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body,
  });
  if (!res.ok) throw new Error(`YouTube OAuth ${res.status}: ${await res.text()}`);
  return await res.json() as YouTubeTokens;
}

export async function exchangeCodeForTokens(opts: {
  clientId: string;
  clientSecret?: string;
  code: string;
  codeVerifier: string;
  redirectUri: string;
  fetchImpl?: FetchLike;
}): Promise<YouTubeTokens> {
  return postToken(buildTokenExchangeBody(opts), opts.fetchImpl ?? fetch);
}

export async function refreshAccessToken(opts: {
  clientId: string;
  clientSecret?: string;
  refreshToken: string;
  fetchImpl?: FetchLike;
}): Promise<YouTubeTokens> {
  return postToken(buildRefreshTokenBody(opts), opts.fetchImpl ?? fetch);
}

export function buildVideoResource(meta: YouTubeMetadata): {
  snippet: { title: string; description: string; tags?: string[]; categoryId: string };
  status: { privacyStatus: "private"; selfDeclaredMadeForKids: boolean };
} {
  if (meta.privacyStatus && meta.privacyStatus !== "private") {
    throw new Error("Only private YouTube uploads are supported in this slice");
  }
  const snippet: { title: string; description: string; tags?: string[]; categoryId: string } = {
    title: meta.title,
    description: meta.description,
    categoryId: meta.categoryId ?? "28",
  };
  if (meta.tags?.length) snippet.tags = meta.tags;
  return {
    snippet,
    status: {
      privacyStatus: "private",
      selfDeclaredMadeForKids: meta.selfDeclaredMadeForKids ?? false,
    },
  };
}

export function buildResumableUploadInit(opts: {
  accessToken: string;
  contentLength: number;
  metadata: YouTubeMetadata;
}): {
  url: URL;
  method: "POST";
  headers: Record<string, string>;
  body: string;
} {
  const url = new URL(RESUMABLE_UPLOAD_URL);
  url.searchParams.set("uploadType", "resumable");
  url.searchParams.set("part", "snippet,status");
  return {
    url,
    method: "POST",
    headers: {
      Authorization: `Bearer ${opts.accessToken}`,
      "Content-Type": "application/json; charset=UTF-8",
      "X-Upload-Content-Length": String(opts.contentLength),
      "X-Upload-Content-Type": "video/mp4",
    },
    body: JSON.stringify(buildVideoResource(opts.metadata)),
  };
}

export async function uploadVideoResumable(opts: {
  file: string;
  metadata: YouTubeMetadata;
  accessToken: string;
  fetchImpl?: FetchLike;
}): Promise<{ id: string; url: string }> {
  const fetchImpl = opts.fetchImpl ?? fetch;
  const video = Bun.file(opts.file);
  const init = buildResumableUploadInit({
    accessToken: opts.accessToken,
    contentLength: video.size,
    metadata: opts.metadata,
  });

  const initRes = await fetchImpl(init.url, {
    method: init.method,
    headers: init.headers,
    body: init.body,
  });
  if (!initRes.ok) throw new Error(`YouTube upload init ${initRes.status}: ${await initRes.text()}`);

  const uploadUrl = initRes.headers.get("location");
  if (!uploadUrl) throw new Error("YouTube upload init did not return a Location header");

  const uploadRes = await fetchImpl(uploadUrl, {
    method: "PUT",
    headers: {
      Authorization: `Bearer ${opts.accessToken}`,
      "Content-Type": "video/mp4",
      "Content-Length": String(video.size),
    },
    body: video,
  });
  if (!uploadRes.ok) throw new Error(`YouTube upload ${uploadRes.status}: ${await uploadRes.text()}`);

  const uploaded = await uploadRes.json() as { id?: string };
  if (!uploaded.id) throw new Error("YouTube upload response did not include a video id");
  return { id: uploaded.id, url: `https://youtu.be/${uploaded.id}` };
}
