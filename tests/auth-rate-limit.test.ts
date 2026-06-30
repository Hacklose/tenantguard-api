import express from "express";
import request from "supertest";
import { describe, expect, it } from "vitest";
import {
  AUTH_RATE_LIMIT_ERROR,
  createAuthRateLimiter,
} from "../src/features/auth/auth.rate-limit.js";

function createRateLimitTestApp(options: {
  limit: number;
  skipSuccessfulRequests?: boolean;
}) {
  const testApp = express();

  testApp.post(
    "/auth-test",
    createAuthRateLimiter(options),
    (req, res) => {
      const successful = req.get("x-test-result") === "success";

      return res.status(successful ? 200 : 401).json({
        ok: successful,
      });
    },
  );

  return testApp;
}

describe("authentication rate limiting", () => {
  it("counts every registration-style request", async () => {
    const testApp = createRateLimitTestApp({
      limit: 2,
    });

    await request(testApp)
      .post("/auth-test")
      .set("x-test-result", "success")
      .expect(200);

    await request(testApp)
      .post("/auth-test")
      .set("x-test-result", "success")
      .expect(200);

    const response = await request(testApp)
      .post("/auth-test")
      .set("x-test-result", "success")
      .expect(429);

    expect(response.body).toEqual({
      error: AUTH_RATE_LIMIT_ERROR,
    });
  });

  it("does not count successful login-style requests", async () => {
    const testApp = createRateLimitTestApp({
      limit: 2,
      skipSuccessfulRequests: true,
    });

    await request(testApp)
      .post("/auth-test")
      .set("x-test-result", "success")
      .expect(200);

    await request(testApp)
      .post("/auth-test")
      .set("x-test-result", "success")
      .expect(200);

    await request(testApp)
      .post("/auth-test")
      .expect(401);

    await request(testApp)
      .post("/auth-test")
      .expect(401);

    const response = await request(testApp)
      .post("/auth-test")
      .expect(429);

    expect(response.body).toEqual({
      error: AUTH_RATE_LIMIT_ERROR,
    });
  });
});
