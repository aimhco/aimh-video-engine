import { expect, test } from "bun:test";
import {
  buildAuthUrl,
  buildRefreshTokenBody,
  buildResumableUploadInit,
  buildTokenExchangeBody,
  buildVideoResource,
  YOUTUBE_UPLOAD_SCOPE,
} from "../src/youtube";

test("buildAuthUrl requests upload scope, offline access, and PKCE", () => {
  const url = buildAuthUrl({
    clientId: "client_123",
    redirectUri: "http://127.0.0.1:49152/oauth2callback",
    state: "state_123",
    codeChallenge: "challenge_123",
  });

  expect(url.origin + url.pathname).toBe("https://accounts.google.com/o/oauth2/v2/auth");
  expect(url.searchParams.get("client_id")).toBe("client_123");
  expect(url.searchParams.get("redirect_uri")).toBe("http://127.0.0.1:49152/oauth2callback");
  expect(url.searchParams.get("response_type")).toBe("code");
  expect(url.searchParams.get("scope")).toBe(YOUTUBE_UPLOAD_SCOPE);
  expect(url.searchParams.get("access_type")).toBe("offline");
  expect(url.searchParams.get("prompt")).toBe("consent");
  expect(url.searchParams.get("code_challenge")).toBe("challenge_123");
  expect(url.searchParams.get("code_challenge_method")).toBe("S256");
  expect(url.searchParams.get("state")).toBe("state_123");
});

test("buildTokenExchangeBody includes PKCE verifier and optional client secret", () => {
  const body = buildTokenExchangeBody({
    clientId: "client_123",
    clientSecret: "secret_456",
    code: "code_789",
    codeVerifier: "verifier_abc",
    redirectUri: "http://127.0.0.1:49152/oauth2callback",
  });

  expect(Object.fromEntries(body)).toEqual({
    client_id: "client_123",
    client_secret: "secret_456",
    code: "code_789",
    code_verifier: "verifier_abc",
    grant_type: "authorization_code",
    redirect_uri: "http://127.0.0.1:49152/oauth2callback",
  });
});

test("buildRefreshTokenBody exchanges a refresh token for an access token", () => {
  const body = buildRefreshTokenBody({
    clientId: "client_123",
    refreshToken: "refresh_abc",
  });

  expect(Object.fromEntries(body)).toEqual({
    client_id: "client_123",
    grant_type: "refresh_token",
    refresh_token: "refresh_abc",
  });
});

test("buildVideoResource defaults to private and not made for kids", () => {
  expect(buildVideoResource({
    title: "AIMH Video Engine",
    description: "Build notes",
    tags: ["aimh", "video"],
  })).toEqual({
    snippet: {
      title: "AIMH Video Engine",
      description: "Build notes",
      tags: ["aimh", "video"],
      categoryId: "28",
    },
    status: {
      privacyStatus: "private",
      selfDeclaredMadeForKids: false,
    },
  });
});

test("buildResumableUploadInit prepares a private videos.insert request", () => {
  const init = buildResumableUploadInit({
    accessToken: "access_123",
    contentLength: 12345,
    metadata: {
      title: "Private upload",
      description: "Smoke test",
    },
  });

  expect(init.url.toString()).toBe(
    "https://www.googleapis.com/upload/youtube/v3/videos?uploadType=resumable&part=snippet%2Cstatus",
  );
  expect(init.method).toBe("POST");
  expect(init.headers.Authorization).toBe("Bearer access_123");
  expect(init.headers["Content-Type"]).toBe("application/json; charset=UTF-8");
  expect(init.headers["X-Upload-Content-Length"]).toBe("12345");
  expect(init.headers["X-Upload-Content-Type"]).toBe("video/mp4");
  expect(JSON.parse(init.body)).toMatchObject({
    status: { privacyStatus: "private" },
  });
});
