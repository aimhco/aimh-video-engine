import { expect, test } from "bun:test";
import { scanTextForSecrets } from "../src/secrets";

const names = (text: string) => scanTextForSecrets(text).map((m) => m.pattern).sort();

test("key-assignment: matches KEY=value, not the bare word", () => {
  expect(names("API_KEY=abcdef123456")).toContain("key-assignment");
  expect(names("PASSWORD: hunter2pw")).toContain("key-assignment");
  expect(scanTextForSecrets("please enter your password to continue")).toEqual([]);
});

test("openai/stripe sk- key", () => {
  expect(names("token sk-ABCDEF0123456789xyz here")).toContain("openai-stripe-key");
  expect(scanTextForSecrets("sk-short")).toEqual([]);
});

test("aws access key", () => {
  expect(names("AKIAIOSFODNN7EXAMPLE")).toContain("aws-access-key");
  expect(scanTextForSecrets("AKIA123")).toEqual([]);
});

test("bearer token", () => {
  expect(names("Authorization: Bearer abcdef0123456789ABCDEF")).toContain("bearer-token");
});

test("private key block", () => {
  expect(names("-----BEGIN RSA PRIVATE KEY-----")).toContain("private-key-block");
});

test("github token", () => {
  expect(names("ghp_ABCDEFabcdef0123456789ABCDEF")).toContain("github-token");
});

test("slack token", () => {
  expect(names("xoxb-1234567890-abcdefghij")).toContain("slack-token");
});

test("clean text yields no matches", () => {
  expect(scanTextForSecrets("aimh-video-engine README — build videos automatically")).toEqual([]);
});

test("snippet is truncated", () => {
  const long = "API_KEY=" + "a".repeat(200);
  const [m] = scanTextForSecrets(long);
  expect(m!.snippet.length).toBeLessThanOrEqual(48);
});
