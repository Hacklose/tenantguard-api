import { describe, expect, it } from "vitest";
import {
  SESSION_COOKIE_NAME,
  SESSION_LIFETIME_MS,
  createSessionToken,
  getSessionExpiresAt,
  hashSessionToken,
} from "../src/features/auth/session.js";

describe("session utilities", () => {
  it("creates a URL-safe session token", () => {
    const token = createSessionToken();

    expect(token).toMatch(/^[A-Za-z0-9_-]+$/);
    expect(token.length).toBeGreaterThan(30);
  });

  it("creates different session tokens", () => {
    expect(createSessionToken()).not.toBe(createSessionToken());
  });

  it("hashes a token with SHA-256 hex output", () => {
    const hash = hashSessionToken("example-session-token");

    expect(hash).toMatch(/^[a-f0-9]{64}$/);
    expect(hash).toBe(
      "a25f92029ce6395795693e61e343b9057828af74ac72eaaff61c2e875bf4d5d6",
    );
  });

  it("sets expiry exactly seven days ahead", () => {
    const now = new Date("2026-06-30T12:00:00.000Z");
    const expiresAt = getSessionExpiresAt(now);

    expect(expiresAt.getTime() - now.getTime()).toBe(
      SESSION_LIFETIME_MS,
    );
  });

  it("uses the expected cookie name", () => {
    expect(SESSION_COOKIE_NAME).toBe("tg_session");
  });
});

