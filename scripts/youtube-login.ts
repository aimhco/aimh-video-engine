import { createServer } from "node:http";
import { randomUUID } from "node:crypto";
import {
  buildAuthUrl,
  codeChallengeS256,
  exchangeCodeForTokens,
  generateCodeVerifier,
} from "../src/youtube";

const clientId = process.env.YOUTUBE_CLIENT_ID;
const clientSecret = process.env.YOUTUBE_CLIENT_SECRET;
if (!clientId) throw new Error("YOUTUBE_CLIENT_ID must be set");
const requiredClientId = clientId;

type CallbackResult = { code: string; state: string } | { error: string; state?: string };

function addressPort(server: ReturnType<typeof createServer>): number {
  const address = server.address();
  if (!address || typeof address === "string") throw new Error("Could not determine OAuth callback port");
  return address.port;
}

async function main(): Promise<void> {
  const state = randomUUID();
  const codeVerifier = generateCodeVerifier();
  const challenge = codeChallengeS256(codeVerifier);

  const server = createServer();
  const ready = await new Promise<{ port: number; result: Promise<CallbackResult>; close: () => void }>((resolve, reject) => {
    const result = new Promise<CallbackResult>((done) => {
      server.on("request", (req, res) => {
        const url = new URL(req.url ?? "/", `http://${req.headers.host}`);
        if (url.pathname !== "/oauth2callback") {
          res.writeHead(404);
          res.end("Not found");
          return;
        }
        const returnedState = url.searchParams.get("state") ?? undefined;
        const error = url.searchParams.get("error") ?? undefined;
        const code = url.searchParams.get("code") ?? undefined;
        if (returnedState !== state) {
          res.writeHead(400, { "Content-Type": "text/plain" });
          res.end("OAuth state mismatch. Return to the terminal.");
          done({ error: "state mismatch", state: returnedState });
          return;
        }
        if (error || !code) {
          res.writeHead(400, { "Content-Type": "text/plain" });
          res.end("YouTube authorization failed. Return to the terminal.");
          done({ error: error ?? "missing code", state: returnedState });
          return;
        }
        res.writeHead(200, { "Content-Type": "text/plain" });
        res.end("YouTube authorization complete. You can close this tab and return to the terminal.");
        done({ code, state: returnedState });
      });
    });
    server.on("error", reject);
    server.listen(0, "127.0.0.1", () => resolve({
      port: addressPort(server),
      result,
      close: () => server.close(),
    }));
  });

  const redirectUri = `http://127.0.0.1:${ready.port}/oauth2callback`;
  const authUrl = buildAuthUrl({ clientId: requiredClientId, redirectUri, state, codeChallenge: challenge });

  console.log("Open this URL in your browser to authorize YouTube upload access:");
  console.log(authUrl.toString());
  console.log("\nWaiting for browser callback...");

  try {
    const callback = await ready.result;
    if ("error" in callback) throw new Error(`OAuth callback failed: ${callback.error}`);

    const tokens = await exchangeCodeForTokens({
      clientId: requiredClientId,
      clientSecret,
      code: callback.code,
      codeVerifier,
      redirectUri,
    });

    if (!tokens.refresh_token) {
      console.warn("No refresh token returned. Re-run after removing prior consent for this app, or keep using the current token if you already have one.");
    } else {
      console.log("\nAdd this to your local .env:");
      console.log(`YOUTUBE_REFRESH_TOKEN=${tokens.refresh_token}`);
    }
  } finally {
    ready.close();
  }
}

await main();
